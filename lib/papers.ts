import "server-only"

import { probeUrl } from "@/lib/importer"

/** One open-access paper suggestion from OpenAlex (https://openalex.org, free, no key). */
export type PaperSuggestion = {
  id: string
  title: string
  year: number | null
  venue: string | null
  abstract: string | null
  citedBy: number
  /** a link that was checked to open: the PDF, or else the readable article page */
  url: string
  kind: "pdf" | "article"
}

type OpenAlexWork = {
  id: string
  title: string | null
  publication_year: number | null
  cited_by_count: number
  abstract_inverted_index: Record<string, number[]> | null
  best_oa_location: {
    pdf_url: string | null
    landing_page_url: string | null
    source: { display_name: string | null } | null
  } | null
}

function abstractFrom(index: Record<string, number[]> | null) {
  if (!index) return null
  const words: string[] = []
  for (const [word, positions] of Object.entries(index)) {
    for (const p of positions) words[p] = word
  }
  const text = words.filter(Boolean).join(" ").replace(/\s+/g, " ").trim()
  return text
    ? text.length > 420
      ? `${text.slice(0, 420).trimEnd()}…`
      : text
    : null
}

/**
 * Open-access articles/reviews with an abstract, best match first.
 * `page` gives a different batch for "acak lagi".
 */
export async function searchPapers(
  query: string,
  page = 1
): Promise<PaperSuggestion[]> {
  const base = process.env.OPENALEX_URL ?? "https://api.openalex.org"
  const params = new URLSearchParams({
    search: query,
    filter: "is_oa:true,has_abstract:true,type:article|review",
    per_page: "25",
    page: String(Math.max(1, Math.min(20, page))),
    select:
      "id,title,publication_year,cited_by_count,abstract_inverted_index,best_oa_location",
  })
  if (process.env.OPENALEX_EMAIL)
    params.set("mailto", process.env.OPENALEX_EMAIL)

  const res = await fetch(`${base}/works?${params}`, {
    signal: AbortSignal.timeout(15_000),
    headers: { accept: "application/json" },
  })
  if (!res.ok) throw new Error(`OpenAlex ${res.status}`)
  const data = (await res.json()) as { results: OpenAlexWork[] }

  // check the most relevant ones in parallel and keep only those that actually open
  const candidates = data.results.filter((w) => w.title).slice(0, 14)
  const checked = await Promise.all(
    candidates.map(async (w): Promise<PaperSuggestion | null> => {
      const loc = w.best_oa_location
      for (const url of [loc?.pdf_url, loc?.landing_page_url]) {
        if (!url) continue
        const kind = await probeUrl(url)
        if (kind) {
          return {
            id: w.id,
            title: w.title!,
            year: w.publication_year,
            venue: loc?.source?.display_name ?? null,
            abstract: abstractFrom(w.abstract_inverted_index),
            citedBy: w.cited_by_count,
            url,
            kind,
          }
        }
      }
      return null
    })
  )
  return checked.filter((p): p is PaperSuggestion => p !== null).slice(0, 6)
}
