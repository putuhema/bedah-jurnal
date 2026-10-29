import "server-only"

import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import { Readability } from "@mozilla/readability"
import { parseHTML } from "linkedom"
import sanitizeHtml from "sanitize-html"

import { PDF_MAX_BYTES } from "@/lib/limits"

/** Something the person can act on, shown as-is (Bahasa). */
export class ImportError extends Error {}

export type Imported =
  | {
      kind: "pdf"
      bytes: Uint8Array
      title: string | null
      site: string
      sourceUrl: string
    }
  | {
      kind: "article"
      title: string
      byline: string | null
      site: string
      html: string
      text: string
      sourceUrl: string
    }

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
const HTML_MAX_BYTES = 5 * 1024 * 1024
const TIMEOUT_MS = 15_000

/* ---------- fetching only public addresses ---------- */

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number)
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    )
  }
  const v6 = ip.toLowerCase()
  if (v6.startsWith("::ffff:")) return isPrivateIp(v6.slice(7))
  return (
    v6 === "::1" ||
    v6 === "::" ||
    v6.startsWith("fc") ||
    v6.startsWith("fd") ||
    v6.startsWith("fe80")
  )
}

/** Blocks links to the server's own network (localhost, LAN, cloud metadata). */
async function assertPublic(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ImportError("Link harus diawali http:// atau https://")
  }
  // tests serve fixtures from localhost; never set this in production
  if (process.env.ALLOW_PRIVATE_URLS === "1") return
  const host = url.hostname.replace(/^\[|\]$/g, "")
  const addresses = isIP(host)
    ? [host]
    : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address)
  if (addresses.length === 0)
    throw new ImportError("Alamat link-nya nggak ketemu.")
  if (addresses.some(isPrivateIp))
    throw new ImportError("Link ini nggak bisa dipakai.")
}

async function fetchLimited(
  start: URL,
  maxBytes: number,
  accept: string,
  /** peek: stop as soon as the body is known to be a PDF (for checking a link only) */
  options: { timeoutMs?: number; peek?: boolean } = {}
) {
  let url = start
  for (let hop = 0; hop < 6; hop++) {
    await assertPublic(url)
    let res: Response
    try {
      res = await fetch(url, {
        redirect: "manual",
        headers: {
          "user-agent": USER_AGENT,
          accept,
          "accept-language": "en,id;q=0.8",
        },
        signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
      })
    } catch {
      throw new ImportError("Situsnya nggak bisa dihubungi. Coba lagi nanti.")
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url)
      continue
    }
    if (res.status === 401 || res.status === 403 || res.status === 429) {
      throw new ImportError(
        "Situs ini menolak diunduh otomatis. Buka link-nya, unduh PDF-nya, lalu upload manual."
      )
    }
    if (!res.ok || !res.body)
      throw new ImportError(`Situsnya membalas error (${res.status}).`)

    const declared = Number(res.headers.get("content-length") ?? 0)
    if (declared > maxBytes)
      throw new ImportError("File-nya terlalu besar (maksimal 50 MB).")
    const chunks: Uint8Array[] = []
    let size = 0
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        await reader.cancel()
        throw new ImportError("File-nya terlalu besar (maksimal 50 MB).")
      }
      chunks.push(value)
      if (options.peek && size >= 5) {
        const head =
          chunks.length === 1
            ? chunks[0]
            : new Uint8Array(chunks.flatMap((c) => [...c]))
        if (String.fromCharCode(...head.subarray(0, 5)) === "%PDF-") {
          await reader.cancel()
          break
        }
      }
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const c of chunks) {
      bytes.set(c, offset)
      offset += c.byteLength
    }
    return { bytes, contentType: res.headers.get("content-type") ?? "", url }
  }
  throw new ImportError("Link-nya kebanyakan dialihkan.")
}

function isPdf(bytes: Uint8Array, contentType: string) {
  const magic = String.fromCharCode(...bytes.subarray(0, 5))
  return magic === "%PDF-" || contentType.includes("application/pdf")
}

/** "Purr - Wikipedia" → "Purr": drops a trailing site name after " - ", " | " or " — ". */
function withoutSiteSuffix(title: string, url: URL, site: string | null) {
  const parts = title.split(/\s+[|\-–—]\s+/)
  if (parts.length < 2) return title
  const last = parts.at(-1)!.toLowerCase().replace(/\s+/g, "")
  const host = url.hostname.toLowerCase()
  const isSite =
    last.length > 0 &&
    (host.includes(last) ||
      (site && site.toLowerCase().replace(/\s+/g, "") === last))
  return isSite ? parts.slice(0, -1).join(" - ").trim() : title
}

function siteName(url: URL) {
  return url.hostname.replace(/^www\./, "")
}

/* ---------- articles: main content, cleaned ---------- */

function cleanArticleHtml(html: string, base: URL) {
  const absolute = (value: string | undefined) => {
    if (!value) return undefined
    try {
      const u = new URL(value, base)
      return u.protocol === "http:" || u.protocol === "https:"
        ? u.toString()
        : undefined
    } catch {
      return undefined
    }
  }
  return sanitizeHtml(html, {
    allowedTags: [
      "p",
      "h2",
      "h3",
      "h4",
      "ul",
      "ol",
      "li",
      "blockquote",
      "em",
      "strong",
      "b",
      "i",
      "a",
      "figure",
      "figcaption",
      "img",
      "br",
      "sup",
      "sub",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "pre",
      "code",
      "hr",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt", "loading"],
    },
    allowedSchemes: ["http", "https"],
    transformTags: {
      h1: "h2",
      h5: "h4",
      h6: "h4",
      a: (_tag, attribs) => ({
        tagName: "a",
        attribs: {
          href: absolute(attribs.href) ?? "#",
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
      img: (_tag, attribs) => ({
        tagName: "img",
        attribs: {
          src: absolute(attribs.src) ?? "",
          alt: attribs.alt ?? "",
          loading: "lazy",
        },
      }),
    },
    exclusiveFilter: (frame) =>
      (frame.tag === "img" && !frame.attribs.src) ||
      (frame.tag === "p" && !frame.text.trim() && !frame.mediaChildren.length),
  } as sanitizeHtml.IOptions)
}

/* ---------- checking a link without saving it ---------- */

/**
 * Whether a link can be imported, and as what. Used by "Pilihkan" so every
 * suggestion actually opens (many publishers block automated downloads).
 */
export async function probeUrl(raw: string): Promise<"pdf" | "article" | null> {
  try {
    const res = await fetchLimited(
      new URL(raw),
      HTML_MAX_BYTES,
      "application/pdf,text/html;q=0.9,*/*;q=0.5",
      { timeoutMs: 8_000, peek: true }
    )
    if (isPdf(res.bytes, res.contentType)) return "pdf"
    if (!res.contentType.includes("html")) return null
    const { document } = parseHTML(new TextDecoder().decode(res.bytes))
    const article = new Readability(document as unknown as Document).parse()
    const length = article?.textContent?.replace(/\s+/g, " ").trim().length ?? 0
    return length >= 400 ? "article" : null
  } catch {
    return null
  }
}

/* ---------- entry point ---------- */

export async function importUrl(raw: string): Promise<Imported> {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new ImportError("Itu bukan link yang valid.")
  }

  const first = await fetchLimited(
    url,
    PDF_MAX_BYTES,
    "application/pdf,text/html;q=0.9,*/*;q=0.5"
  )
  if (isPdf(first.bytes, first.contentType)) {
    return {
      kind: "pdf",
      bytes: first.bytes,
      title: null,
      site: siteName(first.url),
      sourceUrl: first.url.toString(),
    }
  }
  if (!first.contentType.includes("html")) {
    throw new ImportError("Link ini bukan PDF atau halaman artikel.")
  }
  if (first.bytes.byteLength > HTML_MAX_BYTES)
    throw new ImportError("Halamannya terlalu besar.")

  const html = new TextDecoder().decode(first.bytes)
  const { document } = parseHTML(html)
  const meta = (name: string) =>
    document
      .querySelector(`meta[name="${name}"], meta[property="${name}"]`)
      ?.getAttribute("content")
      ?.trim() || null

  // journal pages usually point at their PDF; prefer the real paper when it downloads
  const pdfLink = meta("citation_pdf_url")
  if (pdfLink) {
    try {
      const pdf = await fetchLimited(
        new URL(pdfLink, first.url),
        PDF_MAX_BYTES,
        "application/pdf"
      )
      if (isPdf(pdf.bytes, pdf.contentType)) {
        return {
          kind: "pdf",
          bytes: pdf.bytes,
          title: meta("citation_title"),
          site: meta("citation_journal_title") ?? siteName(first.url),
          sourceUrl: first.url.toString(),
        }
      }
    } catch {
      // the PDF is blocked; fall back to reading the page as an article
    }
  }

  const article = new Readability(document as unknown as Document).parse()
  const text = article?.textContent?.replace(/\s+/g, " ").trim() ?? ""
  if (!article?.content || text.length < 400) {
    throw new ImportError(
      "Nggak nemu isi artikel di halaman ini. Coba link lain, atau upload PDF-nya."
    )
  }
  const clean = cleanArticleHtml(article.content, first.url)
  const { document: cleaned } = parseHTML(
    `<!doctype html><html><body>${clean}</body></html>`
  )

  return {
    kind: "article",
    title: withoutSiteSuffix(
      meta("citation_title") ??
        meta("og:title") ??
        article.title ??
        siteName(first.url),
      first.url,
      meta("og:site_name") ?? article.siteName ?? null
    ).slice(0, 160),
    byline: article.byline?.trim() || null,
    site:
      meta("citation_journal_title") ??
      article.siteName ??
      meta("og:site_name") ??
      siteName(first.url),
    html: clean,
    text: cleaned.body.textContent?.replace(/\s+/g, " ").trim() ?? text,
    sourceUrl: first.url.toString(),
  }
}
