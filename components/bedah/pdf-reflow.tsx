"use client"

import * as React from "react"
import type { PDFDocumentLoadingTask } from "pdfjs-dist"

import {
  mergeRects,
  toContent,
  type PdfViewerHandle,
  type TextSelection,
} from "@/components/bedah/pdf-viewer"
import { Skeleton } from "@/components/ui/skeleton"
import { loadPdfjs } from "@/lib/pdf"
import {
  buildBlocks,
  pageLines,
  repeatedLines,
  type PageText,
  type RawItem,
} from "@/lib/pdf-text"
import { seatBg, seatHighlight, seatText } from "@/lib/seat-style"
import { REACTION_LABEL, type Mark, type Rect, type Seat } from "@/lib/types"
import { cn } from "@/lib/utils"

type Props = {
  url: string
  /** 1 and up: larger text */
  textSize: number
  marks: Mark[]
  initialPage: number
  partner: { seat: Seat; name: string; page: number | null } | null
  onPageChange: (page: number) => void
  onSelect: (selection: TextSelection | null) => void
  onMarkTag: (
    mark: Mark,
    anchor: { x: number; top: number; bottom: number }
  ) => void
  overlay?: React.ReactNode
}

/** Does a run (a piece of text) fall inside one of a stamp's highlight bars? */
function covers(bars: Rect[], run: Rect) {
  const mid = run.y + run.h / 2
  return bars.some((bar) => {
    if (mid < bar.y - 0.002 || mid > bar.y + bar.h + 0.002) return false
    const overlap =
      Math.min(bar.x + bar.w, run.x + run.w) - Math.max(bar.x, run.x)
    return overlap > run.w * 0.4
  })
}

/**
 * Reading mode for PDFs: the text pulled out of the paper and set as plain
 * paragraphs, sized for a phone. Same contract as PdfViewer, so stamping works
 * here too (a selection maps back to its spot on the real page).
 */
export const PdfReflow = React.forwardRef<PdfViewerHandle, Props>(
  function PdfReflow(
    {
      url,
      textSize,
      marks,
      initialPage,
      partner,
      onPageChange,
      onSelect,
      onMarkTag,
      overlay,
    },
    ref
  ) {
    const areaRef = React.useRef<HTMLDivElement>(null)
    const urlRef = React.useRef(url)
    const [pages, setPages] = React.useState<PageText[] | null>(null)
    const [progress, setProgress] = React.useState({ done: 0, total: 0 })
    const [error, setError] = React.useState<string | null>(null)

    // pull the text out of every page (fast: no drawing)
    React.useEffect(() => {
      let cancelled = false
      let task: PDFDocumentLoadingTask | null = null
      ;(async () => {
        const pdfjs = await loadPdfjs()
        task = pdfjs.getDocument({ url: urlRef.current })
        const pdf = await task.promise
        const raw: {
          page: number
          height: number
          parts: ReturnType<typeof pageLines>
        }[] = []
        for (let n = 1; n <= pdf.numPages; n++) {
          if (cancelled) return
          const page = await pdf.getPage(n)
          const viewport = page.getViewport({ scale: 1 })
          const content = await page.getTextContent()
          const items = content.items.filter(
            (item): item is typeof item & RawItem => "str" in item
          )
          raw.push({
            page: n,
            height: viewport.height,
            parts: pageLines(items, viewport.width, viewport.height, (x, y) =>
              viewport.convertToViewportPoint(x, y)
            ),
          })
          setProgress({ done: n, total: pdf.numPages })
        }
        const repeated = repeatedLines(
          raw.map((p) => ({ lines: p.parts.lines, height: p.height }))
        )
        if (cancelled) return
        setPages(
          raw.map((p) => ({
            page: p.page,
            runs: p.parts.runs,
            blocks: buildBlocks(
              p.parts.runs,
              p.parts.lines,
              p.height,
              repeated
            ),
          }))
        )
      })().catch((e) => {
        console.error(e)
        if (!cancelled) setError("Teks paper ini nggak bisa diambil.")
      })
      return () => {
        cancelled = true
        void (task as PDFDocumentLoadingTask | null)?.destroy()
      }
    }, [])

    // start where you were reading
    const started = React.useRef(false)
    React.useEffect(() => {
      if (!pages || started.current) return
      started.current = true
      if (initialPage > 1)
        areaRef.current
          ?.querySelector(`[data-page="${initialPage}"]`)
          ?.scrollIntoView({ block: "start" })
    }, [pages, initialPage])

    // which page is in view
    const pageChange = React.useRef(onPageChange)
    React.useEffect(() => {
      pageChange.current = onPageChange
    })
    React.useEffect(() => {
      const area = areaRef.current
      if (!area || !pages) return
      let frame = 0
      let last = 0
      function check() {
        frame = 0
        const line =
          area!.getBoundingClientRect().top + area!.clientHeight * 0.35
        for (const el of area!.querySelectorAll<HTMLElement>("[data-page]")) {
          const box = el.getBoundingClientRect()
          if (box.top <= line && box.bottom > line) {
            const n = Number(el.dataset.page)
            if (n !== last) {
              last = n
              pageChange.current(n)
            }
            break
          }
        }
      }
      const onScroll = () => {
        if (!frame) frame = requestAnimationFrame(check)
      }
      area.addEventListener("scroll", onScroll, { passive: true })
      check()
      return () => {
        area.removeEventListener("scroll", onScroll)
        cancelAnimationFrame(frame)
      }
    }, [pages])

    const pagesRef = React.useRef(pages)
    React.useEffect(() => {
      pagesRef.current = pages
    })

    React.useImperativeHandle(ref, () => ({
      async getPageText(page: number) {
        const found = pagesRef.current?.find((p) => p.page === page)
        if (!found) return ""
        return found.blocks
          .map((b) =>
            b.runs.map((i) => found.runs[i].join + found.runs[i].text).join("")
          )
          .join("\n\n")
          .trim()
      },
      scrollToPage(page: number, behavior: ScrollBehavior = "smooth") {
        areaRef.current
          ?.querySelector(`[data-page="${page}"]`)
          ?.scrollIntoView({ behavior, block: "start" })
      },
    }))

    // a selection → the stamp card, with highlight bars on the real page
    const selectRef = React.useRef(onSelect)
    React.useEffect(() => {
      selectRef.current = onSelect
    })
    React.useEffect(() => {
      let timer: ReturnType<typeof setTimeout> | undefined
      function read() {
        const area = areaRef.current
        const selection = window.getSelection()
        if (
          !area ||
          !selection ||
          selection.isCollapsed ||
          selection.rangeCount === 0
        ) {
          selectRef.current(null)
          return
        }
        const range = selection.getRangeAt(0)
        const section = (node: Node) =>
          (node instanceof Element
            ? node
            : node.parentElement
          )?.closest<HTMLElement>("[data-page]")
        const start = section(range.startContainer)
        if (
          !start ||
          start !== section(range.endContainer) ||
          !area.contains(start)
        ) {
          selectRef.current(null)
          return
        }
        const page = pagesRef.current?.find(
          (p) => p.page === Number(start.dataset.page)
        )
        if (!page) return
        const bars: Rect[] = []
        for (const span of start.querySelectorAll<HTMLElement>("[data-run]")) {
          if (!range.intersectsNode(span)) continue
          const run = page.runs[Number(span.dataset.run)]
          const length = span.textContent?.length || 1
          let from = 0
          let to = length
          if (span.contains(range.startContainer)) from = range.startOffset
          if (span.contains(range.endContainer)) to = range.endOffset
          if (to <= from) continue
          bars.push({
            x: run.rect.x + (run.rect.w * from) / length,
            y: run.rect.y,
            w: (run.rect.w * (to - from)) / length,
            h: run.rect.h,
          })
        }
        const quote = selection.toString().replace(/\s+/g, " ").trim()
        const lines = Array.from(range.getClientRects()).filter(
          (r) => r.width > 1 && r.height > 1 && r.height < 80
        )
        if (bars.length === 0 || quote.length < 2 || lines.length === 0) {
          selectRef.current(null)
          return
        }
        const lastLine = lines.reduce((best, r) =>
          r.bottom > best.bottom + 2 ||
          (Math.abs(r.bottom - best.bottom) <= 2 && r.right > best.right)
            ? r
            : best
        )
        selectRef.current({
          page: page.page,
          quote,
          rects: mergeRects(bars),
          anchor: toContent(area, lastLine),
        })
      }
      function onChange() {
        clearTimeout(timer)
        timer = setTimeout(read, 250)
      }
      document.addEventListener("selectionchange", onChange)
      return () => {
        document.removeEventListener("selectionchange", onChange)
        clearTimeout(timer)
      }
    }, [])

    // stamps: which runs they cover, and where their tag goes (after the last one)
    const marked = React.useMemo(() => {
      const byRun = new Map<string, Mark>()
      const tagAfter = new Map<string, Mark[]>()
      for (const page of pages ?? []) {
        const onPage = marks.filter((m) => m.page === page.page)
        for (const mark of onPage) {
          let last: number | null = null
          page.runs.forEach((run, i) => {
            if (!covers(mark.rects, run.rect)) return
            byRun.set(`${page.page}:${i}`, mark)
            last = i
          })
          if (last !== null) {
            const key = `${page.page}:${last}`
            tagAfter.set(key, [...(tagAfter.get(key) ?? []), mark])
          }
        }
      }
      return { byRun, tagAfter }
    }, [pages, marks])

    const tagClick = (mark: Mark, el: HTMLElement) => {
      if (areaRef.current)
        onMarkTag(mark, toContent(areaRef.current, el.getBoundingClientRect()))
    }

    return (
      <div
        ref={areaRef}
        data-slot="reader-scroll"
        data-reflow
        className="relative min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain bg-card pt-(--top-space) pb-(--nav-space)"
      >
        <article
          className="mx-auto w-full max-w-[40rem] px-5 pb-10 font-serif text-foreground sm:px-8"
          style={{ fontSize: `${18 * textSize}px`, lineHeight: 1.7 }}
        >
          {error ? (
            <p className="py-16 text-center font-mono text-sm text-muted-foreground">
              {error}
            </p>
          ) : !pages ? (
            <div className="flex flex-col gap-3 py-6">
              <p className="font-mono text-xs text-muted-foreground">
                Menyiapkan teks
                {progress.total
                  ? ` · ${progress.done}/${progress.total} hal`
                  : "…"}
              </p>
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton
                  key={i}
                  className={cn("h-4", i % 4 === 3 ? "w-2/3" : "w-full")}
                />
              ))}
            </div>
          ) : (
            pages.map((page) => (
              <section
                key={page.page}
                data-page={page.page}
                className="scroll-mt-(--top-space)"
              >
                <div className="flex items-center gap-2 py-4 font-mono text-[11px] text-muted-foreground">
                  <span>hal {page.page}</span>
                  <span className="h-px flex-1 bg-rail" />
                  {partner?.page === page.page && (
                    <span
                      className={cn(
                        "flex items-center gap-1",
                        seatText[partner.seat]
                      )}
                    >
                      <span
                        className={cn(
                          "size-1.5 animate-pulse rounded-full",
                          seatBg[partner.seat]
                        )}
                      />
                      {partner.name} di sini
                    </span>
                  )}
                </div>
                {page.blocks.map((block, b) => {
                  const Tag = block.kind === "heading" ? "h3" : "p"
                  return (
                    <Tag
                      key={b}
                      className={
                        block.kind === "heading"
                          ? "mt-6 mb-2 text-[1.15em] leading-snug font-normal text-primary"
                          : "mb-[0.9em] text-pretty"
                      }
                    >
                      {block.runs.map((i, n) => {
                        const run = page.runs[i]
                        const key = `${page.page}:${i}`
                        const mark = marked.byRun.get(key)
                        const tags = marked.tagAfter.get(key)
                        return (
                          <React.Fragment key={i}>
                            {n > 0 && run.join}
                            <span
                              data-run={i}
                              className={cn(
                                mark &&
                                  cn(
                                    "border-b-2 box-decoration-clone",
                                    seatHighlight[mark.seat]
                                  )
                              )}
                            >
                              {run.text}
                            </span>
                            {tags?.map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                onClick={(e) => tagClick(m, e.currentTarget)}
                                className={cn(
                                  "mx-1 rounded-sm bg-card px-1 align-[0.1em] font-mono text-[11px] leading-4 ring-1 ring-border select-none",
                                  seatText[m.seat]
                                )}
                              >
                                [{REACTION_LABEL[m.reaction]}]
                              </button>
                            ))}
                          </React.Fragment>
                        )
                      })}
                    </Tag>
                  )
                })}
                {page.blocks.length === 0 && (
                  <p className="font-mono text-xs text-muted-foreground">
                    (halaman ini cuma gambar atau tabel; lihat di mode biasa)
                  </p>
                )}
              </section>
            ))
          )}
        </article>
        {overlay}
      </div>
    )
  }
)
