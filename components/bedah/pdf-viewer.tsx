"use client"

import * as React from "react"
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
} from "pdfjs-dist"

import { seatBg, seatHighlight, seatText } from "@/lib/seat-style"
import { Skeleton } from "@/components/ui/skeleton"
import { findTwins } from "@/lib/overlap"
import { loadPdfjs } from "@/lib/pdf"
import {
  REACTION_LABEL,
  type AiNote,
  type Mark,
  type Rect,
  type Seat,
  type TextRange,
} from "@/lib/types"
import { cn } from "@/lib/utils"

export type TextSelection = {
  page: number
  quote: string
  rects: Rect[]
  /** Articles: the selection as character offsets in the article text (rects is empty). */
  range?: TextRange
  /** Last selected line, in the scroll area's content coordinates, for placing the stamp card. */
  anchor: { x: number; top: number; bottom: number }
}

export type PdfViewerHandle = {
  scrollToPage: (page: number, behavior?: ScrollBehavior) => void
  /** Plain text of a page (empty string if it can't be read). */
  getPageText: (page: number) => Promise<string>
  /** Zoom so the text column fills the screen (the empty margins go off to the sides). */
  fitToText?: () => Promise<void>
}

type Props = {
  /** Changes when the document changes; the signed URL may change on every refresh. */
  docKey: string
  url: string
  pageCount: number
  /** 1 = fit the screen width; larger values scroll sideways. */
  zoom: number
  /** Pinching the paper with two fingers asks for a new zoom (1 to MAX_ZOOM). */
  onZoomChange?: (zoom: number) => void
  /** Reading mode: warm paper, a touch more contrast. */
  reading?: boolean
  marks: Mark[]
  initialPage: number
  partner: { seat: Seat; name: string; page: number | null } | null
  onPageChange: (page: number) => void
  onSelect: (selection: TextSelection | null) => void
  onMarkTag: (
    mark: Mark,
    anchor: { x: number; top: number; bottom: number }
  ) => void
  /** Rendered inside the scroll area (absolute positioning scrolls with the pages). */
  overlay?: React.ReactNode
  /** Sentences with saved AI answers but no stamp: a small "✦ AI" tag opens them. */
  aiSpots?: AiSpot[]
  onAiTag?: (
    notes: AiNote[],
    anchor: { x: number; top: number; bottom: number }
  ) => void
  /** Called with the real page count once the PDF is open. */
  onPageCount?: (pages: number) => void
  /** Scroll to these stamps and outline them (talk time follows the current card). */
  focus?: { page: number; y: number; ids: string[] } | null
}

export type AiSpot = {
  id: string
  page: number
  rects: Rect[]
  range?: TextRange | null
  notes: AiNote[]
}

/** Widest a page gets at 1×, so desktop pages stay a readable size. */
const MAX_FIT_WIDTH = 880
export const MAX_ZOOM = 4
/** Pixels per page canvas. Phones refuse (or crash on) bigger canvases. */
const MAX_CANVAS_PIXELS = 10_000_000

/** "1×", "1.5×", 2.35 → "2.4×" */
export function formatZoom(zoom: number) {
  return `${Math.round(zoom * 10) / 10}×`
}

/** The zoom button: 1× → 1.5× → 2× → back to 1× (from any pinched value). */
export function nextZoomLevel(zoom: number) {
  return [1.5, 2].find((level) => level > zoom + 0.01) ?? 1
}

/** Merge per-span rectangles on the same line into one, so a sentence becomes a few bars. */
function mergeRects(rects: Rect[]): Rect[] {
  const sorted = [...rects].sort((p, q) => p.y - q.y || p.x - q.x)
  const out: Rect[] = []
  for (const r of sorted) {
    const last = out.at(-1)
    if (
      last &&
      Math.abs(last.y - r.y) < r.h * 0.5 &&
      r.x <= last.x + last.w + 0.02
    ) {
      const right = Math.max(last.x + last.w, r.x + r.w)
      const bottom = Math.max(last.y + last.h, r.y + r.h)
      last.x = Math.min(last.x, r.x)
      last.y = Math.min(last.y, r.y)
      last.w = right - last.x
      last.h = bottom - last.y
    } else {
      out.push({ ...r })
    }
  }
  return out.slice(0, 60)
}

export const PdfViewer = React.forwardRef<PdfViewerHandle, Props>(
  function PdfViewer(
    {
      docKey,
      url,
      pageCount,
      zoom,
      onZoomChange,
      reading = false,
      marks,
      initialPage,
      partner,
      onPageChange,
      onSelect,
      onMarkTag,
      overlay,
      focus,
      aiSpots,
      onAiTag,
      onPageCount,
    },
    ref
  ) {
    const contentRef = React.useRef<HTMLDivElement>(null)
    // the reader's own scroll area (both directions), so zoomed pages can be panned
    const wrapRef = React.useRef<HTMLDivElement | null>(null)
    const [scrollEl, setScrollEl] = React.useState<HTMLDivElement | null>(null)
    const setWrap = React.useCallback((el: HTMLDivElement | null) => {
      wrapRef.current = el
      setScrollEl(el)
    }, [])
    const urlRef = React.useRef(url)
    const [doc, setDoc] = React.useState<PDFDocumentProxy | null>(null)
    const docRef = React.useRef<PDFDocumentProxy | null>(null)
    const pageCountRef = React.useRef(onPageCount)
    React.useEffect(() => {
      pageCountRef.current = onPageCount
    })
    const [aspect, setAspect] = React.useState(1.294) // A4 until we know
    const [width, setWidth] = React.useState(0)
    const [error, setError] = React.useState<string | null>(null)

    // load the document once per edition
    React.useEffect(() => {
      let cancelled = false
      let task: PDFDocumentLoadingTask | null = null
      loadPdfjs()
        .then((pdfjs) => {
          task = pdfjs.getDocument({ url: urlRef.current })
          return task.promise
        })
        .then(async (pdf) => {
          docRef.current = pdf
          const first = await pdf.getPage(1)
          const vp = first.getViewport({ scale: 1 })
          if (cancelled) return
          pageCountRef.current?.(pdf.numPages)
          setAspect(vp.height / vp.width)
          setDoc(pdf)
        })
        .catch((e) => {
          console.error(e)
          if (!cancelled) setError("PDF gagal dibuka. Coba muat ulang.")
        })
      return () => {
        cancelled = true
        void (task as PDFDocumentLoadingTask | null)?.destroy()
      }
    }, [docKey])

    // track available width
    React.useEffect(() => {
      const el = wrapRef.current
      if (!el) return
      const observer = new ResizeObserver(([entry]) => {
        const next = Math.floor(entry.contentRect.width)
        setWidth((prev) => (Math.abs(prev - next) > 4 ? next : prev))
      })
      observer.observe(el)
      return () => observer.disconnect()
    }, [])

    // pinch with two fingers: scale the pages with CSS while the fingers move,
    // then re-render them sharp at the new zoom, keeping the spot under your fingers
    const zoomRef = React.useRef(zoom)
    const zoomChange = React.useRef(onZoomChange)
    React.useEffect(() => {
      zoomRef.current = zoom
      zoomChange.current = onZoomChange
    })
    const pinchAnchor = React.useRef<{
      page: number
      relX: number
      relY: number
      fx: number
      fy: number
    } | null>(null)
    React.useEffect(() => {
      const area = scrollEl
      const content = contentRef.current
      if (!area || !content) return
      let start: {
        dist: number
        zoom: number
        page: number
        relX: number
        relY: number
        fx: number
        fy: number
      } | null = null
      let next = 1

      const distance = (t: TouchList) =>
        Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)

      function onStart(event: TouchEvent) {
        if (event.touches.length !== 2 || !zoomChange.current) return
        const [t1, t2] = [event.touches[0], event.touches[1]]
        const cx = (t1.clientX + t2.clientX) / 2
        const cy = (t1.clientY + t2.clientY) / 2
        const box = area!.getBoundingClientRect()
        const pages = Array.from(
          area!.querySelectorAll<HTMLElement>("[data-page]")
        )
        // the page under the fingers (or the nearest one, in a gap)
        let target = pages[0]
        let best = Infinity
        for (const el of pages) {
          const r = el.getBoundingClientRect()
          const d = cy < r.top ? r.top - cy : cy > r.bottom ? cy - r.bottom : 0
          if (d < best) {
            best = d
            target = el
          }
          if (d === 0) break
        }
        if (!target) return
        const pageBox = target.getBoundingClientRect()
        const contentBox = content!.getBoundingClientRect()
        start = {
          dist: distance(event.touches),
          zoom: zoomRef.current,
          page: Number(target.dataset.page),
          relX: (cx - pageBox.left) / pageBox.width,
          relY: (cy - pageBox.top) / pageBox.height,
          fx: cx - box.left,
          fy: cy - box.top,
        }
        next = start.zoom
        content!.style.transformOrigin = `${cx - contentBox.left}px ${cy - contentBox.top}px`
        content!.style.willChange = "transform"
      }

      function onMove(event: TouchEvent) {
        if (!start || event.touches.length !== 2) return
        event.preventDefault()
        next = Math.min(
          MAX_ZOOM,
          Math.max(1, (start.zoom * distance(event.touches)) / start.dist)
        )
        content!.style.transform = `scale(${next / start.zoom})`
      }

      function onEnd(event: TouchEvent) {
        if (!start || event.touches.length >= 2) return
        const done = start
        start = null
        content!.style.transform = ""
        content!.style.transformOrigin = ""
        content!.style.willChange = ""
        const rounded = Math.round(next * 20) / 20
        if (Math.abs(rounded - done.zoom) < 0.05) return
        pinchAnchor.current = done
        zoomChange.current?.(rounded)
      }

      // Safari's own page zoom
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
    }, [scrollEl])

    // which page is in view
    const pageChange = React.useRef(onPageChange)
    React.useEffect(() => {
      pageChange.current = onPageChange
    })
    const currentPage = React.useRef(initialPage)
    React.useEffect(() => {
      let frame = 0
      let last = 0
      const area = wrapRef.current
      if (!area) return
      function check() {
        frame = 0
        const box = area!.getBoundingClientRect()
        const line = box.top + area!.clientHeight * 0.35
        const pages = area!.querySelectorAll<HTMLElement>("[data-page]")
        for (const el of pages) {
          const page = el.getBoundingClientRect()
          if (page.top <= line && page.bottom > line) {
            const n = Number(el.dataset.page)
            if (n !== last) {
              last = n
              currentPage.current = n
              pageChange.current(n)
            }
            break
          }
        }
      }
      function onScroll() {
        if (!frame) frame = requestAnimationFrame(check)
      }
      area.addEventListener("scroll", onScroll, { passive: true })
      check()
      return () => {
        area.removeEventListener("scroll", onScroll)
        cancelAnimationFrame(frame)
      }
    }, [doc, scrollEl])

    React.useImperativeHandle(ref, () => ({
      async getPageText(page: number) {
        const pdf = docRef.current
        if (!pdf || page < 1 || page > pdf.numPages) return ""
        try {
          const content = await (await pdf.getPage(page)).getTextContent()
          return content.items
            .map((item) =>
              "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : ""
            )
            .join("")
            .replace(/[ \t]+/g, " ")
            .trim()
        } catch {
          return ""
        }
      },
      async fitToText() {
        const pdf = docRef.current
        const area = wrapRef.current
        if (!pdf || !area || !width) return
        const now = currentPage.current
        // sample the pages around you; percentiles ignore stray page numbers in the margin
        const lefts: number[] = []
        const rights: number[] = []
        const pages = [now - 1, now, now + 1].filter(
          (n) => n >= 1 && n <= pdf.numPages
        )
        for (const n of pages) {
          const page = await pdf.getPage(n)
          const viewport = page.getViewport({ scale: 1 })
          const content = await page.getTextContent()
          for (const item of content.items) {
            if (!("str" in item) || !item.str.trim() || item.width <= 0)
              continue
            const [x, y] = [item.transform[4], item.transform[5]]
            const [a] = viewport.convertToViewportPoint(x, y)
            const [b] = viewport.convertToViewportPoint(x + item.width, y)
            lefts.push(Math.min(a, b) / viewport.width)
            rights.push(Math.max(a, b) / viewport.width)
          }
        }
        if (lefts.length < 5) return
        const left = Math.max(0, percentile(lefts, 0.02))
        const right = Math.min(1, percentile(rights, 0.98))
        if (right - left < 0.2) return

        const base = Math.min(width, MAX_FIT_WIDTH)
        const margin = 12
        // phones: the text fills the width; big screens: a comfortable column
        const target = Math.min(area.clientWidth - margin * 2, 820)
        const fit = Math.min(
          MAX_ZOOM,
          Math.max(1, target / ((right - left) * base))
        )
        const pageEl = area.querySelector<HTMLElement>(`[data-page="${now}"]`)
        const relY = pageEl
          ? Math.max(
              0,
              (area.scrollTop - pageEl.offsetTop) / pageEl.offsetHeight
            )
          : 0
        const anchor = {
          page: now,
          relX: left - margin / (base * fit),
          relY,
          fx: 0,
          // keep the top of the view clear of the floating page label
          fy:
            pageEl && relY === 0
              ? parseFloat(getComputedStyle(area).paddingTop)
              : 0,
        }
        const nextWidth = Math.floor((base * Math.round(fit * 20)) / 20)
        if (nextWidth === Math.floor(base * zoomRef.current)) {
          placeAnchor(area, anchor)
        } else {
          pinchAnchor.current = anchor
          zoomChange.current?.(Math.round(fit * 20) / 20)
        }
      },
      scrollToPage(page: number, behavior: ScrollBehavior = "smooth") {
        wrapRef.current
          ?.querySelector(`[data-page="${page}"]`)
          ?.scrollIntoView({ behavior, block: "start", inline: "nearest" })
      },
    }))

    // follow the focused stamp: scroll so it sits in the upper part of the view
    const focusKey = focus
      ? `${focus.page}:${focus.y}:${focus.ids.join(",")}`
      : ""
    const focusIds = React.useMemo(
      () => new Set(focusKey ? focusKey.split(":")[2].split(",") : []),
      [focusKey]
    )
    React.useEffect(() => {
      const area = wrapRef.current
      if (!focus || !area || !width) return
      const frame = requestAnimationFrame(() => {
        const page = area.querySelector<HTMLElement>(
          `[data-page="${focus.page}"]`
        )
        if (!page) return
        const top =
          page.offsetTop +
          focus.y * page.offsetHeight -
          area.clientHeight * 0.25
        area.scrollTo({ top: Math.max(0, top), behavior: "smooth" })
      })
      return () => cancelAnimationFrame(frame)
      // re-run only when the focused stamp (or the layout width) changes
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focusKey, width, zoom])

    // jump to the starting page once the document is ready,
    // unless you already started scrolling or tapping while it loaded
    const jumped = React.useRef(false)
    React.useEffect(() => {
      const area = scrollEl
      if (!area) return
      const skip = () => {
        jumped.current = true
      }
      const events = ["pointerdown", "wheel", "touchstart", "keydown"] as const
      events.forEach((e) => area.addEventListener(e, skip, { passive: true }))
      return () => events.forEach((e) => area.removeEventListener(e, skip))
    }, [scrollEl])
    React.useEffect(() => {
      if (!doc || !width || jumped.current) return
      jumped.current = true
      if (initialPage > 1) {
        requestAnimationFrame(() =>
          wrapRef.current
            ?.querySelector(`[data-page="${initialPage}"]`)
            ?.scrollIntoView({ block: "start" })
        )
      }
    }, [doc, width, initialPage])

    // text selection → stamp picker
    const selectRef = React.useRef(onSelect)
    React.useEffect(() => {
      selectRef.current = onSelect
    })
    React.useEffect(() => {
      let timer: ReturnType<typeof setTimeout> | undefined
      function read() {
        const selection = window.getSelection()
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
          selectRef.current(null)
          return
        }
        const range = selection.getRangeAt(0)
        const start = (
          range.startContainer.parentElement ?? null
        )?.closest<HTMLElement>("[data-page]")
        const end = (
          range.endContainer.parentElement ?? null
        )?.closest<HTMLElement>("[data-page]")
        if (!start || start !== end || !wrapRef.current?.contains(start)) {
          selectRef.current(null)
          return
        }
        const box = start.getBoundingClientRect()
        const raw = Array.from(range.getClientRects())
          .filter((r) => r.width > 1 && r.height > 1)
          .map((r) => ({
            x: (r.left - box.left) / box.width,
            y: (r.top - box.top) / box.height,
            w: r.width / box.width,
            h: r.height / box.height,
          }))
          .filter(
            (r) =>
              r.x >= -0.01 &&
              r.y >= -0.01 &&
              r.x + r.w <= 1.01 &&
              r.y + r.h <= 1.01
          )
        const quote = selection.toString().replace(/\s+/g, " ").trim()
        if (raw.length === 0 || quote.length < 2) {
          selectRef.current(null)
          return
        }
        // the visually last line of the selection (rect order isn't guaranteed,
        // and whole elements inside the range add their own big boxes)
        const lines = Array.from(range.getClientRects()).filter(
          (r) => r.width > 1 && r.height > 1 && r.height < 80
        )
        const lastLine = lines.reduce((best, r) =>
          r.bottom > best.bottom + 2 ||
          (Math.abs(r.bottom - best.bottom) <= 2 && r.right > best.right)
            ? r
            : best
        )
        selectRef.current({
          page: Number(start.dataset.page),
          quote,
          rects: mergeRects(raw),
          anchor: toContent(wrapRef.current!, lastLine),
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

    // when you both stamped the same sentence, the second tag goes below the first
    const stackedTags = React.useMemo(
      () => new Set(findTwins(marks).map(([, second]) => second.id)),
      [marks]
    )

    const marksByPage = React.useMemo(() => {
      const map = new Map<number, Mark[]>()
      for (const m of marks) map.set(m.page, [...(map.get(m.page) ?? []), m])
      return map
    }, [marks])

    const aiSpotsByPage = React.useMemo(() => {
      const map = new Map<number, AiSpot[]>()
      for (const spot of aiSpots ?? [])
        map.set(spot.page, [...(map.get(spot.page) ?? []), spot])
      return map
    }, [aiSpots])

    const aiTagClick = React.useCallback(
      (notes: AiNote[], rect: DOMRect) => {
        if (wrapRef.current) onAiTag?.(notes, toContent(wrapRef.current, rect))
      },
      [onAiTag]
    )

    const tagClick = React.useCallback(
      (mark: Mark, rect: DOMRect) => {
        if (wrapRef.current) onMarkTag(mark, toContent(wrapRef.current, rect))
      },
      [onMarkTag]
    )

    const pageWidth = Math.floor(Math.min(width, MAX_FIT_WIDTH) * zoom)

    // after a zoom change, put the spot you were looking at back in place
    React.useLayoutEffect(() => {
      const anchor = pinchAnchor.current
      if (!anchor || !wrapRef.current) return
      pinchAnchor.current = null
      placeAnchor(wrapRef.current, anchor)
    }, [pageWidth])

    if (error) {
      return (
        <p className="px-4 py-16 text-center text-muted-foreground">{error}</p>
      )
    }

    return (
      <div
        ref={setWrap}
        data-slot="reader-scroll"
        data-reading={reading || undefined}
        className={cn(
          "relative min-h-0 min-w-0 flex-1 touch-pan-x touch-pan-y overflow-auto overscroll-contain px-0 pt-[calc(var(--top-space,0px)+0.75rem)] pb-[calc(var(--nav-space,0px)+1rem)] transition-colors duration-300 sm:px-4",
          // reading mode: warm paper and slightly darker ink
          reading && "bg-[#e9e1d0]"
        )}
      >
        <div ref={contentRef} className="mx-auto flex w-max flex-col gap-3">
          {width > 0 &&
            Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
              <PdfPage
                key={n}
                doc={doc}
                number={n}
                width={pageWidth}
                aspect={aspect}
                marks={marksByPage.get(n) ?? []}
                partner={partner && partner.page === n ? partner : null}
                root={scrollEl}
                stackedTags={stackedTags}
                focusIds={focusIds}
                onMarkTag={tagClick}
                aiSpots={aiSpotsByPage.get(n) ?? []}
                onAiTag={aiTagClick}
              />
            ))}
        </div>
        {overlay}
      </div>
    )
  }
)

function percentile(values: number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
}

/** Scroll so a spot on a page (fractions of its size) sits at (fx, fy) in the reader. */
function placeAnchor(
  area: HTMLElement,
  anchor: { page: number; relX: number; relY: number; fx: number; fy: number }
) {
  const page = area.querySelector<HTMLElement>(`[data-page="${anchor.page}"]`)
  if (!page) return
  area.scrollLeft = page.offsetLeft + anchor.relX * page.offsetWidth - anchor.fx
  area.scrollTop = page.offsetTop + anchor.relY * page.offsetHeight - anchor.fy
}

/** A rect in viewport coordinates → position inside the scroll area's content. */
function toContent(area: HTMLElement, rect: DOMRect) {
  const box = area.getBoundingClientRect()
  const left = rect.left - box.left + area.scrollLeft
  const right = rect.right - box.left + area.scrollLeft
  return {
    x: (left + right) / 2,
    top: rect.top - box.top + area.scrollTop,
    bottom: rect.bottom - box.top + area.scrollTop,
  }
}

function PdfPage({
  doc,
  number,
  width,
  aspect,
  marks,
  partner,
  root,
  stackedTags,
  focusIds,
  onMarkTag,
  aiSpots,
  onAiTag,
}: {
  doc: PDFDocumentProxy | null
  number: number
  width: number
  aspect: number
  marks: Mark[]
  partner: { seat: Seat; name: string } | null
  root: HTMLElement | null
  stackedTags: Set<string>
  focusIds: Set<string>
  aiSpots: AiSpot[]
  onAiTag: (notes: AiNote[], rect: DOMRect) => void
  onMarkTag: (mark: Mark, rect: DOMRect) => void
}) {
  const boxRef = React.useRef<HTMLDivElement>(null)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const textRef = React.useRef<HTMLDivElement>(null)
  const [visible, setVisible] = React.useState(false)
  // real height once rendered at this width; an estimate from the first page until then
  const [measured, setMeasured] = React.useState<{
    width: number
    height: number
  } | null>(null)
  const height =
    measured?.width === width ? measured.height : Math.round(width * aspect)
  const [rendered, setRendered] = React.useState(false)

  React.useEffect(() => {
    const el = boxRef.current
    if (!el || !root) return
    // render pages a bit before they scroll into the reader's view
    // pages far outside the view give their canvas back, so long papers stay light
    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry.isIntersecting)
        if (entry.isIntersecting) return
        const canvas = canvasRef.current
        if (canvas && canvas.width > 0) {
          canvas.width = 0
          canvas.height = 0
          textRef.current?.replaceChildren()
          setRendered(false)
        }
      },
      { root, rootMargin: "1500px 600px" }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [root])

  React.useEffect(() => {
    if (!doc || !visible) return
    let cancelled = false
    let task: RenderTask | null = null
    let textLayer: { cancel: () => void } | null = null

    ;(async () => {
      const pdfjs = await import("pdfjs-dist")
      const page = await doc.getPage(number)
      if (cancelled) return
      const scale = width / page.getViewport({ scale: 1 }).width
      const viewport = page.getViewport({ scale })
      setMeasured({ width, height: Math.round(viewport.height) })

      const canvas = canvasRef.current
      const box = boxRef.current
      const text = textRef.current
      if (!canvas || !box || !text) return

      // sharp on high-density screens, but within what a phone can hold
      const dpr = Math.min(
        window.devicePixelRatio || 1,
        3,
        Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height))
      )
      // draw off-screen first: the old picture stays (stretched) until the new one is ready
      const scratch = document.createElement("canvas")
      scratch.width = Math.floor(viewport.width * dpr)
      scratch.height = Math.floor(viewport.height * dpr)
      task = page.render({
        canvas: scratch,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      })
      await task.promise
      if (cancelled) return
      canvas.width = scratch.width
      canvas.height = scratch.height
      canvas.getContext("2d")?.drawImage(scratch, 0, 0)
      scratch.width = 0
      scratch.height = 0
      box.style.setProperty("--total-scale-factor", String(scale))
      box.style.setProperty("--scale-factor", String(scale))

      text.replaceChildren()
      const layer = new pdfjs.TextLayer({
        textContentSource: page.streamTextContent(),
        container: text,
        viewport,
      })
      textLayer = layer
      await layer.render()
      if (!cancelled) setRendered(true)
    })().catch((e) => {
      if (!cancelled && e?.name !== "RenderingCancelledException")
        console.error(e)
    })

    return () => {
      cancelled = true
      task?.cancel()
      textLayer?.cancel()
    }
  }, [doc, visible, number, width])

  return (
    <div
      ref={boxRef}
      data-page={number}
      className="relative scroll-mt-[calc(var(--top-space,0px)+0.5rem)] overflow-hidden bg-white shadow-[0_0_0_1px_var(--border)]"
      style={{ width, height }}
    >
      {!rendered && <Skeleton className="absolute inset-0 rounded-none" />}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 size-full select-none"
      />

      {/* highlights sit under the transparent text layer so text stays selectable */}
      <div className="pointer-events-none absolute inset-0 z-[1]">
        {marks.flatMap((m) =>
          m.rects.map((r, i) => (
            <span
              key={`${m.id}-${i}`}
              className={cn(
                "absolute border-b-2 mix-blend-multiply",
                seatHighlight[m.seat],
                focusIds.has(m.id) &&
                  "outline-2 outline-offset-2 outline-foreground/70 outline-dashed"
              )}
              data-focused={focusIds.has(m.id) || undefined}
              style={{
                left: `${r.x * 100}%`,
                top: `${r.y * 100}%`,
                width: `${r.w * 100}%`,
                height: `${r.h * 100}%`,
              }}
            />
          ))
        )}
      </div>

      <div ref={textRef} className="textLayer" />

      {/* stamp tags, clickable, above the text layer */}
      {marks.map((m) => {
        const last = m.rects.at(-1)
        if (!last) return null
        return (
          <button
            key={m.id}
            type="button"
            onClick={(e) =>
              onMarkTag(m, e.currentTarget.getBoundingClientRect())
            }
            className={cn(
              "absolute z-[3] -translate-x-full rounded-sm bg-card/90 px-1 font-mono text-[10px] leading-4 ring-1 ring-border",
              seatText[m.seat],
              stackedTags.has(m.id) ? "translate-y-[18px]" : "translate-y-0.5"
            )}
            style={{
              left: `${Math.min(1, last.x + last.w) * 100}%`,
              top: `${(last.y + last.h) * 100}%`,
            }}
          >
            [{REACTION_LABEL[m.reaction]}]
          </button>
        )
      })}

      {/* saved AI answers without a stamp: a dotted underline and a "✦ AI" tag */}
      {aiSpots.map((spot) => {
        const last = spot.rects.at(-1)
        if (!last) return null
        return (
          <React.Fragment key={spot.id}>
            {spot.rects.map((r, i) => (
              <span
                key={i}
                className="pointer-events-none absolute z-[1] border-b border-dotted border-muted-foreground/70"
                style={{
                  left: `${r.x * 100}%`,
                  top: `${r.y * 100}%`,
                  width: `${r.w * 100}%`,
                  height: `${r.h * 100}%`,
                }}
              />
            ))}
            <button
              type="button"
              data-slot="ai-tag"
              onClick={(e) =>
                onAiTag(spot.notes, e.currentTarget.getBoundingClientRect())
              }
              className="absolute z-[3] -translate-x-full translate-y-0.5 rounded-sm bg-card/90 px-1 font-mono text-[10px] leading-4 text-muted-foreground ring-1 ring-border hover:text-foreground"
              style={{
                left: `${Math.min(1, last.x + last.w) * 100}%`,
                top: `${(last.y + last.h) * 100}%`,
              }}
            >
              ✦ AI{spot.notes.length > 1 ? ` ×${spot.notes.length}` : ""}
            </button>
          </React.Fragment>
        )
      })}

      {partner && (
        <span
          className={cn(
            "pointer-events-none absolute top-2 -left-px z-[3] flex items-center gap-1 rounded-r-sm bg-card py-0.5 pr-1.5 pl-1 text-[10px] ring-1 ring-border",
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

      <span className="pointer-events-none absolute right-2 bottom-1.5 z-[3] text-[10px] text-muted-foreground">
        {number}
      </span>
    </div>
  )
}
