import type { Edition, Rect, TextRange } from "@/lib/types"

/** Validates highlight rectangles sent by the browser (fractions of the page, max 60). */
export function parseRects(value: unknown): Rect[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 60) {
    throw new Error("Pilihan teks tidak valid.")
  }
  return value.map((r) => {
    const rect = r as Record<string, unknown>
    const n = (k: string) => {
      const v = Number(rect[k])
      if (!Number.isFinite(v) || v < -0.01 || v > 1.01)
        throw new Error("Pilihan teks tidak valid.")
      return Math.round(v * 10000) / 10000
    }
    return { x: n("x"), y: n("y"), w: n("w"), h: n("h") }
  })
}

/** Validates an article text range (character offsets). */
export function parseRange(value: unknown): TextRange {
  const v = value as Record<string, unknown> | null
  const start = Math.floor(Number(v?.start))
  const end = Math.floor(Number(v?.end))
  if (!(start >= 0 && end > start && end - start <= 5000 && end <= 5_000_000)) {
    throw new Error("Pilihan teks tidak valid.")
  }
  return { start, end }
}

/**
 * The position columns for a selection: rectangles for PDFs, a text range for
 * articles (stored as start/end offsets, with an empty rects list).
 */
export function parseSpot(edition: Edition, rects: unknown, range: unknown) {
  if (edition.kind === "article") {
    const r = parseRange(range)
    return { rects: [] as Rect[], start_offset: r.start, end_offset: r.end }
  }
  return { rects: parseRects(rects), start_offset: null, end_offset: null }
}
