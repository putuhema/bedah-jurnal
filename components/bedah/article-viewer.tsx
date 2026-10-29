"use client"

import * as React from "react"
import { ExternalLinkIcon } from "lucide-react"

import type {
  AiSpot,
  PdfViewerHandle,
  TextSelection,
} from "@/components/bedah/pdf-viewer"
import {
  REACTION_LABEL,
  type AiNote,
  type Mark,
  type Seat,
  type TextRange,
} from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * Reads a saved web article. Same contract as PdfViewer, but a stamp's position is a
 * character range in the article text (works at any screen width), and "page" is the
 * percentage read (1–100).
 */
type Props = {
  html: string
  title: string
  source: string | null
  sourceUrl: string | null
  /** 1 and up: shown as larger text */
  zoom: number
  /** Pinching with two fingers asks for a new zoom. */
  onZoomChange?: (zoom: number) => void
  marks: Mark[]
  initialPage: number
  partner: { seat: Seat; name: string; page: number | null } | null
  onPageChange: (percent: number) => void
  onSelect: (selection: TextSelection | null) => void
  onMarkTag: (
    mark: Mark,
    anchor: { x: number; top: number; bottom: number }
  ) => void
  aiSpots?: AiSpot[]
  onAiTag?: (
    notes: AiNote[],
    anchor: { x: number; top: number; bottom: number }
  ) => void
  focus?: { ids: string[] } | null
  overlay?: React.ReactNode
}

export type ArticleViewerHandle = PdfViewerHandle & {
  /** Article text around a range, for AI context. */
  getTextAround: (range: TextRange, chars: number) => string
}

/** 1× → 1, 1.5× → 1.2, 2× → 1.4, … */
const fontScale = (zoom: number) => 1 + (zoom - 1) * 0.4
const MAX_ARTICLE_ZOOM = 3

/* ---------- text <-> offsets (stamp tags are skipped, they aren't article text) ---------- */

function textNodes(root: HTMLElement): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest("[data-bj-tag]")
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  })
  const out: Text[] = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n as Text)
  return out
}

function offsetOf(root: HTMLElement, node: Node, offset: number): number {
  const upTo = document.createRange()
  upTo.setStart(root, 0)
  upTo.setEnd(node, offset)
  let total = 0
  for (const t of textNodes(root)) {
    if (!upTo.intersectsNode(t)) continue
    total +=
      t === upTo.endContainer
        ? upTo.endOffset
        : t === upTo.startContainer
          ? 0
          : t.length
    if (t === upTo.endContainer) break
  }
  return total
}

function textOf(root: HTMLElement) {
  return textNodes(root)
    .map((t) => t.data)
    .join("")
}

/** Wraps [start, end) in elements made by `make`, one per text node it crosses. */
function wrapRange(
  root: HTMLElement,
  range: TextRange,
  make: () => HTMLElement
): HTMLElement[] {
  const wrapped: HTMLElement[] = []
  let pos = 0
  for (const node of textNodes(root)) {
    const from = pos
    const to = pos + node.length
    pos = to
    if (to <= range.start || from >= range.end) continue
    const a = Math.max(range.start, from) - from
    const b = Math.min(range.end, to) - from
    let target = node
    if (b < target.length) target.splitText(b)
    if (a > 0) target = target.splitText(a)
    const el = make()
    target.parentNode!.insertBefore(el, target)
    el.appendChild(target)
    wrapped.push(el)
  }
  return wrapped
}

/** Removes everything a previous decoration pass added. */
function undecorate(root: HTMLElement) {
  root.querySelectorAll("[data-bj-tag]").forEach((el) => el.remove())
  root.querySelectorAll("[data-bj-wrap]").forEach((el) => {
    const parent = el.parentNode!
    while (el.firstChild) parent.insertBefore(el.firstChild, el)
    parent.removeChild(el)
  })
  root.normalize()
}

function toContent(area: HTMLElement, rect: DOMRect) {
  const box = area.getBoundingClientRect()
  return {
    x: (rect.left + rect.right) / 2 - box.left + area.scrollLeft,
    top: rect.top - box.top + area.scrollTop,
    bottom: rect.bottom - box.top + area.scrollTop,
  }
}

export const ArticleViewer = React.forwardRef<ArticleViewerHandle, Props>(
  function ArticleViewer(
    {
      html,
      title,
      source,
      sourceUrl,
      zoom,
      onZoomChange,
      marks,
      initialPage,
      partner,
      onPageChange,
      onSelect,
      onMarkTag,
      aiSpots,
      onAiTag,
      focus,
      overlay,
    },
    ref
  ) {
    const areaRef = React.useRef<HTMLDivElement>(null)
    const contentRef = React.useRef<HTMLDivElement>(null)
    const articleRef = React.useRef<HTMLElement>(null)

    // pinch with two fingers: preview with CSS scale, then set the new text size
    // and keep the same place in the article
    const zoomRef = React.useRef(zoom)
    const zoomChange = React.useRef(onZoomChange)
    React.useEffect(() => {
      zoomRef.current = zoom
      zoomChange.current = onZoomChange
    })
    const keepRatio = React.useRef<number | null>(null)
    React.useEffect(() => {
      const area = areaRef.current
      const article = articleRef.current
      if (!area || !article) return
      let start: { dist: number; zoom: number } | null = null
      let next = 1
      const distance = (t: TouchList) =>
        Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
      function onStart(event: TouchEvent) {
        if (event.touches.length !== 2 || !zoomChange.current) return
        const box = article!.getBoundingClientRect()
        const cx = (event.touches[0].clientX + event.touches[1].clientX) / 2
        const cy = (event.touches[0].clientY + event.touches[1].clientY) / 2
        start = { dist: distance(event.touches), zoom: zoomRef.current }
        next = start.zoom
        article!.style.transformOrigin = `${cx - box.left}px ${cy - box.top}px`
      }
      function onMove(event: TouchEvent) {
        if (!start || event.touches.length !== 2) return
        event.preventDefault()
        next = Math.min(
          MAX_ARTICLE_ZOOM,
          Math.max(1, (start.zoom * distance(event.touches)) / start.dist)
        )
        article!.style.transform = `scale(${fontScale(next) / fontScale(start.zoom)})`
      }
      function onEnd(event: TouchEvent) {
        if (!start || event.touches.length >= 2) return
        const done = start
        start = null
        article!.style.transform = ""
        article!.style.transformOrigin = ""
        const rounded = Math.round(next * 20) / 20
        if (Math.abs(rounded - done.zoom) < 0.05) return
        const max = area!.scrollHeight - area!.clientHeight
        keepRatio.current = max > 0 ? area!.scrollTop / max : 0
        zoomChange.current?.(rounded)
      }
      const stopGesture = (event: Event) => event.preventDefault()
      area.addEventListener("touchstart", onStart, { passive: true })
      area.addEventListener("touchmove", onMove, { passive: false })
      area.addEventListener("touchend", onEnd)
      area.addEventListener("touchcancel", onEnd)
      area.addEventListener("gesturestart", stopGesture)
      return () => {
        area.removeEventListener("touchstart", onStart)
        area.removeEventListener("touchmove", onMove)
        area.removeEventListener("touchend", onEnd)
        area.removeEventListener("touchcancel", onEnd)
        area.removeEventListener("gesturestart", stopGesture)
      }
    }, [])
    React.useLayoutEffect(() => {
      const ratio = keepRatio.current
      const area = areaRef.current
      if (ratio == null || !area) return
      keepRatio.current = null
      area.scrollTop = ratio * (area.scrollHeight - area.clientHeight)
    }, [zoom])

    // the article HTML is set once; React never re-renders inside it, so we can decorate it
    const body = React.useMemo(() => ({ __html: html }), [html])

    const percentNow = React.useCallback(() => {
      const area = areaRef.current
      if (!area) return 1
      const max = area.scrollHeight - area.clientHeight
      return max <= 0
        ? 100
        : Math.max(1, Math.min(100, Math.round((area.scrollTop / max) * 100)))
    }, [])

    const scrollToPercent = React.useCallback(
      (pct: number, behavior: ScrollBehavior = "smooth") => {
        const area = areaRef.current
        if (!area) return
        area.scrollTo({
          top: ((pct - 1) / 99) * (area.scrollHeight - area.clientHeight),
          behavior,
        })
      },
      []
    )

    React.useImperativeHandle(ref, () => ({
      scrollToPage: (pct, behavior) => scrollToPercent(pct, behavior),
      getPageText: async (page) =>
        page === 1 && contentRef.current ? textOf(contentRef.current) : "",
      getTextAround: (range, chars) => {
        const text = contentRef.current ? textOf(contentRef.current) : ""
        const half = Math.floor(chars / 2)
        return text.slice(
          Math.max(0, range.start - half),
          Math.min(text.length, range.end + half)
        )
      },
    }))

    // start where you left off (unless you already started scrolling)
    const touched = React.useRef(false)
    React.useEffect(() => {
      const area = areaRef.current
      if (!area) return
      const mark = () => {
        touched.current = true
      }
      const events = ["pointerdown", "wheel", "touchstart", "keydown"] as const
      events.forEach((e) => area.addEventListener(e, mark, { passive: true }))
      const frame = requestAnimationFrame(() => {
        if (!touched.current && initialPage > 1)
          scrollToPercent(initialPage, "instant")
      })
      return () => {
        cancelAnimationFrame(frame)
        events.forEach((e) => area.removeEventListener(e, mark))
      }
      // only on first load
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // reading progress as %
    const pageChange = React.useRef(onPageChange)
    React.useEffect(() => {
      pageChange.current = onPageChange
    })
    React.useEffect(() => {
      const area = areaRef.current
      if (!area) return
      let frame = 0
      let last = 0
      const check = () => {
        frame = 0
        const pct = percentNow()
        if (pct !== last) {
          last = pct
          pageChange.current(pct)
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
    }, [percentNow])

    // draw stamps, AI spots and the focus outline into the article text
    const focusKey = focus?.ids.join(",") ?? ""
    React.useLayoutEffect(() => {
      const root = contentRef.current
      if (!root) return
      undecorate(root)
      const focusIds = new Set(focusKey ? focusKey.split(",") : [])

      const tag = (
        label: string,
        id: string,
        kind: "mark" | "ai",
        className: string
      ) => {
        const button = document.createElement("button")
        button.type = "button"
        button.dataset.bjTag = kind
        button.dataset.id = id
        if (kind === "ai") button.dataset.slot = "ai-tag"
        button.className = className
        button.textContent = label
        return button
      }

      for (const spot of aiSpots ?? []) {
        const range = spot.notes[0]?.range
        if (!range) continue
        const parts = wrapRange(root, range, () => {
          const el = document.createElement("span")
          el.dataset.bjWrap = "ai"
          el.className = "bj-ai"
          return el
        })
        const last = parts.at(-1)
        last?.after(
          tag(
            `✦ AI${spot.notes.length > 1 ? ` ×${spot.notes.length}` : ""}`,
            spot.id,
            "ai",
            "bj-tag bj-tag-ai"
          )
        )
      }

      for (const m of marks) {
        if (!m.range) continue
        const parts = wrapRange(root, m.range, () => {
          const el = document.createElement("mark")
          el.dataset.bjWrap = "mark"
          el.dataset.markId = m.id
          el.className = cn(
            `bj-hl bj-hl-${m.seat}`,
            focusIds.has(m.id) && "bj-focus"
          )
          return el
        })
        if (focusIds.has(m.id))
          parts.forEach((p) => p.setAttribute("data-focused", ""))
        parts
          .at(-1)
          ?.after(
            tag(
              `[${REACTION_LABEL[m.reaction]}]`,
              m.id,
              "mark",
              `bj-tag bj-tag-${m.seat}`
            )
          )
      }
    }, [body, marks, aiSpots, focusKey])

    // talk time: bring the focused stamp into view
    React.useEffect(() => {
      const area = areaRef.current
      if (!focusKey || !area) return
      const frame = requestAnimationFrame(() => {
        const el = area.querySelector<HTMLElement>(
          `[data-mark-id="${focusKey.split(",")[0]}"]`
        )
        if (!el) return
        const top =
          toContent(area, el.getBoundingClientRect()).top -
          area.clientHeight * 0.25
        area.scrollTo({ top: Math.max(0, top), behavior: "smooth" })
      })
      return () => cancelAnimationFrame(frame)
    }, [focusKey, zoom])

    // tag clicks
    function onClick(event: React.MouseEvent) {
      const button = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-bj-tag]"
      )
      const area = areaRef.current
      if (!button || !area) return
      const anchor = toContent(area, button.getBoundingClientRect())
      if (button.dataset.bjTag === "mark") {
        const mark = marks.find((m) => m.id === button.dataset.id)
        if (mark) onMarkTag(mark, anchor)
      } else {
        const spot = aiSpots?.find((s) => s.id === button.dataset.id)
        if (spot) onAiTag?.(spot.notes, anchor)
      }
    }

    // text selection → stamp picker
    const selectRef = React.useRef(onSelect)
    React.useEffect(() => {
      selectRef.current = onSelect
    })
    React.useEffect(() => {
      let timer: ReturnType<typeof setTimeout> | undefined
      function read() {
        const root = contentRef.current
        const area = areaRef.current
        const selection = window.getSelection()
        if (
          !root ||
          !area ||
          !selection ||
          selection.isCollapsed ||
          selection.rangeCount === 0
        ) {
          selectRef.current(null)
          return
        }
        const range = selection.getRangeAt(0)
        if (
          !root.contains(range.startContainer) ||
          !root.contains(range.endContainer)
        ) {
          selectRef.current(null)
          return
        }
        const start = offsetOf(root, range.startContainer, range.startOffset)
        const end = offsetOf(root, range.endContainer, range.endOffset)
        const quote = textOf(root).slice(start, end).replace(/\s+/g, " ").trim()
        if (end - start < 2 || quote.length < 2) {
          selectRef.current(null)
          return
        }
        const lines = Array.from(range.getClientRects()).filter(
          (r) => r.width > 1 && r.height > 1 && r.height < 80
        )
        if (lines.length === 0) return
        const lastLine = lines.reduce((best, r) =>
          r.bottom > best.bottom + 2 ||
          (Math.abs(r.bottom - best.bottom) <= 2 && r.right > best.right)
            ? r
            : best
        )
        selectRef.current({
          page: 1,
          quote: quote.slice(0, 1200),
          rects: [],
          range: { start, end: Math.min(end, start + 5000) },
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

    const scale = fontScale(zoom)

    return (
      <div
        ref={areaRef}
        data-slot="reader-scroll"
        className="relative min-h-0 min-w-0 flex-1 touch-pan-x touch-pan-y overflow-y-auto overscroll-contain pb-(--nav-space)"
      >
        <article
          ref={articleRef}
          className="relative mx-auto w-full px-5 py-8 sm:px-8"
          style={{ maxWidth: `${Math.round(680 * scale)}px` }}
        >
          <header className="mb-6 flex flex-col gap-2 border-b border-rail pb-5">
            <p className="text-xs text-muted-foreground">
              artikel{source ? ` · ${source}` : ""}
            </p>
            <h1 className="font-serif text-[28px] leading-tight font-light text-primary italic">
              {title}
            </h1>
            {sourceUrl && (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-fit items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                <ExternalLinkIcon className="size-3" /> buka sumber asli
              </a>
            )}
          </header>
          <div
            ref={contentRef}
            onClick={onClick}
            className="bj-article"
            style={{ fontSize: `${17 * scale}px` }}
            dangerouslySetInnerHTML={body}
          />
          {partner?.page && (
            <span
              className={cn(
                "pointer-events-none absolute -right-1 z-[3] flex -translate-y-1/2 items-center gap-1 rounded-l-sm bg-card py-0.5 pr-1 pl-1.5 text-[10px] ring-1 ring-border sm:right-1",
                partner.seat === "a" ? "text-reader-a" : "text-reader-b"
              )}
              style={{ top: `${partner.page}%` }}
            >
              <span
                className={cn(
                  "size-1.5 animate-pulse rounded-full",
                  partner.seat === "a" ? "bg-reader-a" : "bg-reader-b"
                )}
              />
              {partner.name}
            </span>
          )}
        </article>
        {overlay}
      </div>
    )
  }
)
