import type { Edition } from "@/lib/types"

/** "hal 3/14" for a PDF, "37%" for an article (whose "page" is the % read). */
export function positionLabel(
  edition: Pick<Edition, "kind" | "pageCount">,
  page: number,
  withTotal = true
) {
  if (edition.kind === "article") return `${page}%`
  return withTotal ? `hal ${page}/${edition.pageCount}` : `hal ${page}`
}

/** "hal 3" for a PDF spot; nothing for an article (its stamps have no pages). */
export function spotLabel(edition: Pick<Edition, "kind">, page: number) {
  return edition.kind === "article" ? "" : `hal ${page}`
}
