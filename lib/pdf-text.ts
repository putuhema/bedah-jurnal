import type { Rect } from "@/lib/types"

/**
 * Turns the text of PDF pages into paragraphs and headings for reading mode.
 * Every run keeps its spot on the page, so a selection in reading mode can be
 * stamped on the real paper.
 */

/** A piece of text as the PDF placed it. */
export type Run = {
  text: string
  /** where it sits on the page, as fractions of the page size */
  rect: Rect
  /** what goes before it when shown in a paragraph: a space, or nothing (same word) */
  join: "" | " "
}

export type Block = { kind: "heading" | "text"; runs: number[] }

export type PageText = { page: number; runs: Run[]; blocks: Block[] }

/** The bits of a pdf.js text item we use. */
export type RawItem = {
  str: string
  transform: number[]
  width: number
  height: number
}

type Line = {
  runs: number[]
  baseline: number
  left: number
  right: number
  size: number
  top: number
  text: string
}

/** One page's text items → runs grouped into lines (page units: 1 = page width/height). */
export function pageLines(
  items: RawItem[],
  pageWidth: number,
  pageHeight: number,
  toViewport: (x: number, y: number) => number[]
): { runs: Run[]; lines: Line[] } {
  const runs: Run[] = []
  const lines: Line[] = []
  let line: Line | null = null
  let lastRight = 0

  for (const item of items) {
    const [a, b, c, d, e, f] = item.transform
    // rotated text is a margin label ("Author Manuscript"), not part of the article
    if (Math.abs(b) > 0.01 || Math.abs(c) > 0.01 || a <= 0) continue
    const text = item.str.replace(/\s+/g, " ")
    if (!text.trim()) continue
    const size = Math.abs(d) || item.height || 10
    const [x1, base] = toViewport(e, f)
    const [x2] = toViewport(e + item.width, f)
    const left = Math.min(x1, x2)
    const right = Math.max(x1, x2)

    // superscripts (footnote marks, "∗") sit a little higher but belong to the line
    const sameLine =
      line !== null &&
      Math.abs(base - line.baseline) < Math.max(size, line.size) * 0.6 &&
      left > lastRight - size * 2
    if (!sameLine) {
      line = {
        runs: [],
        baseline: base,
        left,
        right,
        size,
        top: base - size,
        text: "",
      }
      lines.push(line)
    }
    const current = line!
    // inside a line, a space only where the PDF left a visible gap
    const join: "" | " " =
      current.runs.length === 0
        ? " "
        : left - lastRight > size * 0.15 ||
            /\s$/.test(runs[current.runs.at(-1)!].text) ||
            /^\s/.test(text)
          ? " "
          : ""
    runs.push({
      text: current.runs.length === 0 ? text.trimStart() : text,
      rect: {
        x: left / pageWidth,
        y: (base - size) / pageHeight,
        w: (right - left) / pageWidth,
        h: (size * 1.2) / pageHeight,
      },
      join,
    })
    current.runs.push(runs.length - 1)
    current.left = Math.min(current.left, left)
    current.right = Math.max(current.right, right)
    current.size = Math.max(current.size, size)
    current.text += (join && current.text ? " " : "") + text.trim()
    lastRight = right
  }
  return { runs, lines }
}

/** Header/footer lines that repeat on many pages ("Author Manuscript", running titles, page numbers). */
export function repeatedLines(
  pages: { lines: Line[]; height: number }[]
): Set<string> {
  const counts = new Map<string, number>()
  for (const { lines, height } of pages) {
    const seen = new Set<string>()
    for (const l of lines) {
      if (l.top / height > 0.12 && l.baseline / height < 0.9) continue
      const key = normalizeRepeat(l.text)
      if (key && !seen.has(key)) {
        seen.add(key)
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
  }
  const min = Math.max(3, Math.ceil(pages.length * 0.3))
  return new Set([...counts].filter(([, n]) => n >= min).map(([k]) => k))
}

function normalizeRepeat(text: string) {
  return text.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim()
}

/** Lines → paragraphs and headings. */
export function buildBlocks(
  runs: Run[],
  lines: Line[],
  pageHeight: number,
  repeated: Set<string>
): Block[] {
  const kept = lines.filter((l) => {
    const edge = l.top / pageHeight < 0.12 || l.baseline / pageHeight > 0.9
    if (edge && repeated.has(normalizeRepeat(l.text))) return false
    // a lone page number at the top or bottom
    if (edge && /^(page\s*)?\d{1,4}$/i.test(l.text.trim())) return false
    return true
  })
  if (kept.length === 0) return []

  // the body text size: the size most characters are set in
  const bySize = new Map<number, number>()
  for (const l of kept) {
    const key = Math.round(l.size * 2) / 2
    bySize.set(key, (bySize.get(key) ?? 0) + l.text.length)
  }
  const body = [...bySize].sort((p, q) => q[1] - p[1])[0][0]
  // usual distance between lines of body text
  const gaps: number[] = []
  for (let i = 1; i < kept.length; i++) {
    const g = kept[i].baseline - kept[i - 1].baseline
    if (g > 0 && Math.abs(kept[i].size - body) < 0.6) gaps.push(g)
  }
  gaps.sort((p, q) => p - q)
  const lineGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : body * 1.3

  const isHeading = (l: Line) =>
    l.text.length < 120 &&
    (l.size > body * 1.15 ||
      (/[A-Za-z]{3}/.test(l.text) &&
        l.text === l.text.toUpperCase() &&
        l.text.length < 70) ||
      (/^\d+(\.\d+)*\.?\s+[A-Z]/.test(l.text) && l.text.length < 70))

  const blocks: Block[] = []
  let current: Block | null = null
  let prev: Line | null = null
  let blockLeft = 0
  let blockRight = 0

  for (const l of kept) {
    const heading = isHeading(l)
    let start = current === null || heading || current.kind === "heading"
    if (!start && prev) {
      const gap = l.baseline - prev.baseline
      const endsSentence = /[.?!:]["”’)]?$/.test(prev.text)
      const shortLast = prev.right < blockRight - body * 2.5
      const indented = l.left > blockLeft + body * 1.2
      if (
        gap > lineGap * 1.5 ||
        gap < -lineGap * 0.5 || // jumped up: next column
        Math.abs(l.size - prev.size) > body * 0.25 ||
        (endsSentence && shortLast) ||
        (endsSentence && indented)
      )
        start = true
    }
    // a heading followed by its own second line stays one heading
    if (
      heading &&
      current?.kind === "heading" &&
      prev &&
      l.baseline - prev.baseline < lineGap * 1.6
    )
      start = false

    if (start) {
      current = { kind: heading ? "heading" : "text", runs: [] }
      blocks.push(current)
      blockLeft = l.left
      blockRight = l.right
    } else {
      blockLeft = Math.min(blockLeft, l.left)
      blockRight = Math.max(blockRight, l.right)
    }
    // joining lines: drop a line-end hyphen inside a word ("effec-" + "tive")
    const first = l.runs[0]
    const lastOfPrev = current!.runs.at(-1)
    if (lastOfPrev !== undefined) {
      const before = runs[lastOfPrev]
      if (
        /[a-z]-$/.test(before.text) &&
        /^[a-z]/.test(runs[first].text) &&
        // "English-" + "to-German" is a real hyphen
        !/^[a-z]+-/.test(runs[first].text)
      ) {
        before.text = before.text.slice(0, -1)
        runs[first].join = ""
      } else {
        runs[first].join = " "
      }
    }
    current!.runs.push(...l.runs)
    prev = l
  }
  // a "heading" that runs on for several lines is really a (bigger) paragraph
  for (const block of blocks) {
    const length = block.runs.reduce((n, i) => n + runs[i].text.length, 0)
    if (block.kind === "heading" && length > 140) block.kind = "text"
  }
  return blocks
}
