import type { Mark, Rect } from "@/lib/types"

type Spot = {
  page: number
  rects: Rect[]
  range?: { start: number; end: number } | null
}

function overlapArea(a: Rect, b: Rect) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

function area(rects: Rect[]) {
  return rects.reduce((sum, r) => sum + r.w * r.h, 0)
}

/** True when two stamps cover mostly the same text (at least 40% of the smaller one). */
export function isSameText(a: Spot, b: Spot) {
  // articles: compare character ranges
  if (a.range && b.range) {
    const shared =
      Math.min(a.range.end, b.range.end) -
      Math.max(a.range.start, b.range.start)
    const smaller = Math.min(
      a.range.end - a.range.start,
      b.range.end - b.range.start
    )
    return smaller > 0 && shared / smaller >= 0.4
  }
  if (a.range || b.range) return false
  if (a.page !== b.page) return false
  let shared = 0
  for (const ra of a.rects)
    for (const rb of b.rects) shared += overlapArea(ra, rb)
  const smaller = Math.min(area(a.rects), area(b.rects))
  return smaller > 0 && shared / smaller >= 0.4
}

/** Pairs where seat a and seat b stamped the same text. Each stamp is used at most once. */
export function findTwins(marks: Mark[]): [Mark, Mark][] {
  const fromA = marks.filter((m) => m.seat === "a")
  const fromB = marks.filter((m) => m.seat === "b")
  const used = new Set<string>()
  const pairs: [Mark, Mark][] = []
  for (const a of fromA) {
    const b = fromB.find((m) => !used.has(m.id) && isSameText(a, m))
    if (b) {
      used.add(b.id)
      pairs.push([a, b])
    }
  }
  return pairs.sort(
    (p, q) =>
      p[0].page - q[0].page || (p[0].rects[0]?.y ?? 0) - (q[0].rects[0]?.y ?? 0)
  )
}
