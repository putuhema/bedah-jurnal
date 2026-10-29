"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeftIcon,
  CheckIcon,
  MessageCircleIcon,
  SparklesIcon,
  Trash2Icon,
  ZoomInIcon,
} from "lucide-react"

import {
  addMark,
  deleteAiNote,
  setPageCount,
  deleteMark,
  markDone,
  reveal,
  saveProgress,
  sendMessage,
} from "@/app/actions"
import { Presence, TopBar } from "@/components/bedah/bits"
import {
  ArticleViewer,
  type ArticleViewerHandle,
} from "@/components/bedah/article-viewer"
import { ChatPanel } from "@/components/bedah/chat-panel"
import {
  PdfViewer,
  type PdfViewerHandle,
  type TextSelection,
} from "@/components/bedah/pdf-viewer"
import { useRoom } from "@/components/bedah/room-context"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { useHotkey } from "@/hooks/use-hotkey"
import { seatText } from "@/lib/seat-style"
import {
  REACTIONS,
  REACTION_LABEL,
  AI_KINDS,
  AI_KIND_LABEL,
  type AiKind,
  type AiNote,
  type ChatMessage,
  type Edition,
  type Mark,
  type Progress,
  type Reaction,
  type Seat,
} from "@/lib/types"
import { cn } from "@/lib/utils"
import { findTwins, isSameText } from "@/lib/overlap"
import { positionLabel, spotLabel } from "@/lib/position"

type Anchor = { x: number; top: number; bottom: number }

type Floating =
  | { kind: "select"; selection: TextSelection }
  | { kind: "mark"; mark: Mark; anchor: Anchor }
  | { kind: "ai"; notes: AiNote[]; anchor: Anchor }
  | null

export function ReadingRoom({
  edition,
  pdfUrl,
  marks,
  hiddenCount,
  twinCount,
  aiEnabled,
  progress,
  initialPage,
  messages,
  aiNotes,
  articleHtml,
  initialChatOpen,
}: {
  edition: Edition
  pdfUrl: string
  marks: Mark[]
  hiddenCount: number
  twinCount: number
  aiEnabled: boolean
  progress: Record<Seat, Progress>
  initialPage: number
  messages: ChatMessage[]
  /** Saved "Tanya AI" answers (yours; both of yours after the reveal), newest first. */
  aiNotes: AiNote[]
  /** set when edition.kind is "article" */
  articleHtml: string
  initialChatOpen: boolean
}) {
  const router = useRouter()
  const {
    secret,
    seat,
    other,
    names,
    otherPresence,
    setLocation,
    send,
    notifyChanged,
    onCome,
    onChat,
  } = useRoom()
  // PdfViewer or ArticleViewer (the article one also has getTextAround)
  const viewer = React.useRef<
    PdfViewerHandle & Partial<Pick<ArticleViewerHandle, "getTextAround">>
  >(null)
  const isArticle = edition.kind === "article"
  const pageFormat = (p: number) => positionLabel(edition, p, false)
  const [page, setPage] = React.useState(initialPage)
  const [floating, setFloating] = React.useState<Floating>(null)
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState<string | null>(null)
  const [revealOpen, setRevealOpen] = React.useState(false)
  const [zoom, setZoom] = React.useState(1)
  const pageRef = React.useRef(page)
  React.useEffect(() => {
    pageRef.current = page
  })

  function cycleZoom() {
    const levels = [1, 1.5, 2]
    setZoom((z) => levels[(levels.indexOf(z) + 1) % levels.length])
    // stay on the same page once the new size has rendered
    const keep = pageRef.current
    requestAnimationFrame(() =>
      requestAnimationFrame(() => viewer.current?.scrollToPage(keep, "instant"))
    )
  }

  const revealed = Boolean(edition.revealedAt)
  const meDone = Boolean(progress[seat].doneAt)
  const otherDone = Boolean(progress[other].doneAt)
  const bothDone = meDone && otherDone
  const myCount = marks.filter((m) => m.seat === seat).length
  const otherCount = revealed ? marks.length - myCount : hiddenCount
  const talkHref = `/r/${secret}/e/${edition.number}/ngobrol`

  // presence: tell the other phone where I am
  React.useEffect(() => {
    setLocation(edition.number, page, isArticle ? "percent" : "page")
  }, [edition.number, page, isArticle, setLocation])

  // save reading position, at most every ~1.5s
  React.useEffect(() => {
    if (meDone) return
    const timer = setTimeout(
      () => void saveProgress(secret, edition.id, page),
      1500
    )
    return () => clearTimeout(timer)
  }, [page, meDone, secret, edition.id])

  // "Sini dong" from the other person
  React.useEffect(
    () =>
      onCome((msg) => {
        if (msg.edition !== edition.number) return
        toast.add({
          title: `${names[msg.from]} manggil kamu`,
          description: `Ke halaman ${msg.page}`,
          actionProps: {
            children: "Ke sana",
            onClick: () => viewer.current?.scrollToPage(msg.page),
          },
        })
      }),
    [onCome, edition.number, names]
  )

  /* ---------- chat ---------- */
  const [chatOpen, setChatOpen] = React.useState(initialChatOpen)
  const [unread, setUnread] = React.useState(0)
  // messages that arrived (or were sent) since the server last rendered this page
  const [liveMessages, setLiveMessages] = React.useState<ChatMessage[]>([])
  const chatOpenRef = React.useRef(chatOpen)
  React.useEffect(() => {
    chatOpenRef.current = chatOpen
  })

  const allMessages = React.useMemo(() => {
    const byId = new Map<string, ChatMessage>()
    for (const m of [...messages, ...liveMessages]) byId.set(m.id, m)
    return [...byId.values()].sort((p, q) =>
      p.createdAt.localeCompare(q.createdAt)
    )
  }, [messages, liveMessages])

  React.useEffect(
    () =>
      onChat((msg) => {
        if (msg.edition !== edition.number) return
        setLiveMessages((prev) => [...prev, msg.message])
        if (!chatOpenRef.current) {
          setUnread((n) => n + 1)
          toast.add({
            title: `${names[msg.message.seat]}: ${msg.message.body.slice(0, 80)}`,
            actionProps: { children: "Buka", onClick: () => toggleChat(true) },
          })
        }
      }),
    [onChat, edition.number, names]
  )

  function toggleChat(open = !chatOpenRef.current) {
    setChatOpen(open)
    if (open) setUnread(0)
  }

  async function sendChat(body: string) {
    const result = await sendMessage(secret, edition.id, body, page)
    if (!result.ok) {
      toast.add({ title: result.error, type: "error" })
      return false
    }
    setLiveMessages((prev) => [...prev, result.data])
    send("chat", { edition: edition.number, message: result.data })
    return true
  }

  function jumpTo(target: number) {
    viewer.current?.scrollToPage(target)
    // on phones the panel covers the page; get out of the way
    if (window.innerWidth < 1024) setChatOpen(false)
  }

  /* ---------- saved AI answers on sentences without a stamp → "✦ AI" tags ---------- */
  const aiSpots = React.useMemo(() => {
    const spots: {
      id: string
      page: number
      rects: AiNote["rects"]
      range: AiNote["range"]
      notes: AiNote[]
    }[] = []
    for (const note of aiNotes) {
      if (marks.some((m) => isSameText(m, note))) continue // shown in the stamp instead
      const spot = spots.find((s) => isSameText(s, note))
      if (spot) spot.notes.push(note)
      else
        spots.push({
          id: note.id,
          page: note.page,
          rects: note.rects,
          range: note.range,
          notes: [note],
        })
    }
    return spots
  }, [aiNotes, marks])

  /* ---------- "Sama!": sentences you both stamped ---------- */
  const twins = React.useMemo(
    () => (revealed ? findTwins(marks) : []),
    [revealed, marks]
  )
  // shown once per edition per phone; remembered in localStorage when closed
  const seenKey = `bj-sama-${edition.id}-${seat}`
  const seenBefore = React.useSyncExternalStore(
    noopSubscribe,
    () => localStorage.getItem(seenKey) === "1",
    () => true
  )
  const [twinsDismissed, setTwinsDismissed] = React.useState(false)
  const twinsOpen = twins.length > 0 && !seenBefore && !twinsDismissed
  function setTwinsOpen(open: boolean) {
    if (open) return
    localStorage.setItem(seenKey, "1")
    setTwinsDismissed(true)
  }

  // open the reveal dialog once both are done
  const autoOpened = React.useRef(false)
  React.useEffect(() => {
    if (bothDone && !revealed && !autoOpened.current) {
      autoOpened.current = true
      setRevealOpen(true)
    }
  }, [bothDone, revealed])

  const cardRef = React.useRef<HTMLDivElement>(null)

  const onSelect = React.useCallback(
    (selection: TextSelection | null) => {
      // after the reveal, selecting text is only for asking AI
      if (revealed && !aiEnabled) return
      // tapping the note box clears the text selection; that must not close the card
      if (!selection && cardRef.current?.contains(document.activeElement))
        return
      setFloating((prev) =>
        selection
          ? { kind: "select", selection }
          : prev?.kind === "select"
            ? null
            : prev
      )
    },
    [revealed, aiEnabled]
  )

  const selecting = floating?.kind === "select"
  React.useEffect(() => {
    if (!selecting) return
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (cardRef.current?.contains(target)) return
      // a new selection on the page replaces the card by itself
      if (target instanceof Element && target.closest(".textLayer")) return
      setFloating(null)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setFloating(null)
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [selecting])

  /* ---------- Tanya AI ---------- */
  type AiState = {
    forQuote: string
    kind: AiKind
    answer: string
    status: "loading" | "done" | "error"
  }
  const [ai, setAi] = React.useState<AiState | null>(null)
  const aiAbort = React.useRef<AbortController | null>(null)
  const currentAi =
    floating?.kind === "select" && ai?.forQuote === floating.selection.quote
      ? ai
      : null
  // answers asked earlier about this same sentence (saved like notes)
  const selectionNotes =
    floating?.kind === "select"
      ? aiNotes.filter((n) => isSameText(n, floating.selection))
      : []
  // once the finished answer comes back from the server, show the saved copy only
  const liveAi =
    currentAi &&
    !(
      currentAi.status === "done" &&
      selectionNotes.some((n) => n.answer.trim() === currentAi.answer.trim())
    )
      ? currentAi
      : null
  // the answer a new stamp takes: the one just asked, else your newest saved one
  const latestOwnAnswer =
    currentAi?.status === "done"
      ? { kind: currentAi.kind, answer: currentAi.answer }
      : (() => {
          const own = selectionNotes.find((n) => n.seat === seat)
          return own ? { kind: own.kind, answer: own.answer } : null
        })()

  // a PDF fetched from a link doesn't know its page count until it's opened
  async function fixPageCount(pages: number) {
    if (edition.kind !== "pdf" || pages === edition.pageCount) return
    await setPageCount(secret, edition.id, pages)
  }

  async function removeAiNote(note: AiNote) {
    const result = await deleteAiNote(secret, edition.id, note.id)
    if (!result.ok) return toast.add({ title: result.error, type: "error" })
    setFloating((prev) => {
      if (prev?.kind !== "ai") return prev
      const notes = prev.notes.filter((n) => n.id !== note.id)
      return notes.length ? { ...prev, notes } : null
    })
    if (revealed) notifyChanged()
  }

  async function askAi(kind: AiKind) {
    if (floating?.kind !== "select") return
    const { quote, page: onPage, rects, range } = floating.selection
    aiAbort.current?.abort()
    const controller = new AbortController()
    aiAbort.current = controller
    const update = (patch: Partial<AiState>) =>
      setAi((prev) =>
        prev && prev.forQuote === quote ? { ...prev, ...patch } : prev
      )
    setAi({ forQuote: quote, kind, answer: "", status: "loading" })

    // the text around the sentence, so the answer is grounded in the paper
    let context: string
    if (range && viewer.current?.getTextAround) {
      context = viewer.current.getTextAround(range, 10000)
    } else {
      const [before, current, after] = await Promise.all(
        [onPage - 1, onPage, onPage + 1].map(
          (n) => viewer.current?.getPageText(n) ?? Promise.resolve("")
        )
      )
      context = [
        before.slice(-2000),
        current.slice(0, 8000),
        after.slice(0, 2000),
      ]
        .filter(Boolean)
        .join("\n\n")
    }

    try {
      const res = await fetch(`/r/${secret}/ask`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          editionId: edition.id,
          kind,
          quote,
          context,
          page: onPage,
          rects,
          range,
        }),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) {
        update({
          status: "error",
          answer: (await res.text()) || "AI gagal menjawab.",
        })
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let text = ""
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        text += decoder.decode(value, { stream: true })
        update({ answer: text })
      }
      update({ status: "done" })
      // the server saved it as a note; load it so it survives closing the card
      router.refresh()
      if (revealed) notifyChanged()
    } catch {
      if (!controller.signal.aborted) {
        update({ status: "error", answer: "AI gagal menjawab. Coba lagi." })
      }
    }
  }

  async function stamp(reaction: Reaction) {
    if (floating?.kind !== "select") return
    const { selection } = floating
    setBusy(reaction)
    const result = await addMark(secret, edition.id, {
      page: selection.page,
      quote: selection.quote,
      rects: selection.rects,
      range: selection.range ?? null,
      reaction,
      note,
      // the AI answer (if any) is saved on the stamp and stays hidden with it
      ai: latestOwnAnswer,
    })
    setBusy(null)
    if (!result.ok) return toast.add({ title: result.error, type: "error" })
    window.getSelection()?.removeAllRanges()
    setFloating(null)
    setNote("")
    setAi(null)
    notifyChanged()
    toast.add({
      title: `Dicap [${REACTION_LABEL[reaction]}]`,
      description: `${names[other]} belum bisa lihat.`,
    })
  }

  async function removeMark(mark: Mark) {
    setBusy("delete")
    const result = await deleteMark(secret, edition.id, mark.id)
    setBusy(null)
    if (!result.ok) return toast.add({ title: result.error, type: "error" })
    setFloating(null)
    notifyChanged()
  }

  function comeHere() {
    if (!otherPresence) {
      toast.add({
        title: `${names[other]} lagi offline`,
        description: "Panggilan cuma sampai kalau dia lagi buka aplikasi.",
      })
      return
    }
    send("come", { from: seat, edition: edition.number, page })
    toast.add({ title: `${names[other]} diajak ke halaman ${page}` })
  }

  async function finish() {
    setBusy("done")
    const result = await markDone(secret, edition.id)
    setBusy(null)
    if (!result.ok) return toast.add({ title: result.error, type: "error" })
    send("done", { from: seat, edition: edition.number })
    notifyChanged()
    if (!result.data.bothDone) {
      toast.add({
        title: "Sip, kamu selesai",
        description: `Cap dibuka begitu ${names[other]} juga selesai.`,
      })
    }
  }

  async function openTogether() {
    setBusy("reveal")
    const result = await reveal(secret, edition.id)
    setBusy(null)
    if (!result.ok) return toast.add({ title: result.error, type: "error" })
    setRevealOpen(false)
    notifyChanged()
  }

  useHotkey("z", cycleZoom)
  useHotkey("c", () => toggleChat())
  useHotkey("j", comeHere, !revealed)
  useHotkey("d", () => void finish(), !meDone)
  useHotkey("b", () => setRevealOpen(true), bothDone && !revealed)
  useHotkey("n", () => router.push(talkHref), revealed)

  const floatingCard = floating && (
    <FloatingCard
      ref={cardRef}
      anchor={
        floating.kind === "select" ? floating.selection.anchor : floating.anchor
      }
    >
      {floating.kind === "select" ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground">
              {revealed ? "tanya AI soal kalimat ini" : "cap kalimat ini"}
            </p>
            <Button variant="ghost" size="xs" onClick={() => setFloating(null)}>
              Batal
            </Button>
          </div>
          {liveAi && <AiAnswer state={liveAi} />}
          {selectionNotes.map((n) => (
            <AiAnswer
              key={n.id}
              state={{
                kind: n.kind,
                answer: n.answer,
                status: "done",
              }}
              who={
                n.seat !== seat
                  ? { name: names[n.seat], seat: n.seat }
                  : undefined
              }
              onDelete={n.seat === seat ? () => removeAiNote(n) : undefined}
            />
          ))}
          {!revealed && (
            <>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="catatan (opsional)"
                maxLength={400}
                className="h-8 text-xs"
              />
              <div className="flex flex-wrap gap-1">
                {REACTIONS.map((reaction) => (
                  <Button
                    key={reaction}
                    variant="ghost"
                    size="sm"
                    className={cn("font-mono", seatText[seat])}
                    disabled={busy !== null}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => stamp(reaction)}
                  >
                    {busy === reaction ? (
                      <Spinner />
                    ) : (
                      `[${REACTION_LABEL[reaction]}]`
                    )}
                  </Button>
                ))}
              </div>
              {latestOwnAnswer && (
                <p className="text-[11px] text-muted-foreground">
                  Jawaban AI terbaru ikut tersimpan di cap ini.
                </p>
              )}
            </>
          )}
          {aiEnabled && (
            <div className="flex flex-wrap items-center gap-1 border-t border-rail pt-2">
              <SparklesIcon className="size-3.5 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">
                tanya AI:
              </span>
              {AI_KINDS.map((kind) => (
                <Button
                  key={kind}
                  variant={currentAi?.kind === kind ? "secondary" : "ghost"}
                  size="xs"
                  disabled={currentAi?.status === "loading"}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => askAi(kind)}
                >
                  {AI_KIND_LABEL[kind]}
                </Button>
              ))}
            </div>
          )}
        </div>
      ) : floating.kind === "ai" ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground">
              AI soal kalimat ini
              {isArticle ? "" : ` · hal ${floating.notes[0].page}`}
            </p>
            <Button variant="ghost" size="xs" onClick={() => setFloating(null)}>
              Tutup
            </Button>
          </div>
          <p className="line-clamp-3 font-serif text-[13.5px] text-foreground italic">
            “{floating.notes[0].quote}”
          </p>
          {floating.notes.map((n) => (
            <AiAnswer
              key={n.id}
              state={{
                kind: n.kind,
                answer: n.answer,
                status: "done",
              }}
              who={
                n.seat !== seat
                  ? { name: names[n.seat], seat: n.seat }
                  : undefined
              }
              onDelete={n.seat === seat ? () => removeAiNote(n) : undefined}
            />
          ))}
        </div>
      ) : (
        <MarkDetails
          where={spotLabel(edition, floating.mark.page)}
          extraNotes={aiNotes.filter(
            (n) =>
              isSameText(n, floating.mark) &&
              n.answer.trim() !== floating.mark.ai?.answer.trim()
          )}
          names={names}
          mark={floating.mark}
          name={names[floating.mark.seat]}
          canDelete={floating.mark.seat === seat && !revealed}
          deleting={busy === "delete"}
          onDelete={() => removeMark(floating.mark)}
          onClose={() => setFloating(null)}
        />
      )}
    </FloatingCard>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar>
        <Button
          variant="ghost"
          size="icon-sm"
          render={<Link href={`/r/${secret}`} aria-label="Kembali ke rak" />}
          nativeButton={false}
        >
          <ArrowLeftIcon />
        </Button>
        <span className="text-xs whitespace-nowrap text-muted-foreground">
          <span className="hidden sm:inline">edisi {edition.number} · </span>
          {positionLabel(edition, page)}
        </span>
        <span className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={cycleZoom}
          aria-label="Perbesar halaman"
        >
          <ZoomInIcon data-icon="inline-start" />
          {zoom}×
        </Button>
        <Button
          variant={chatOpen ? "secondary" : "ghost"}
          size="sm"
          onClick={() => toggleChat()}
          aria-label="Obrolan"
          aria-pressed={chatOpen}
          className="relative"
        >
          <MessageCircleIcon />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-primary text-[10px] text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
        <Presence />
      </TopBar>

      <div className="border-b border-rail px-4 py-2 text-xs text-muted-foreground">
        {revealed ? (
          <>
            cap terbuka · <span className={seatText[seat]}>{names[seat]}</span>{" "}
            &amp; <span className={seatText[other]}>{names[other]}</span>
          </>
        ) : otherCount > 0 ? (
          `${otherCount} cap ${names[other]} tersembunyi sampai kalian berdua selesai`
        ) : (
          "pilih kalimat untuk kasih cap"
        )}
      </div>

      <div className="relative flex min-h-0 flex-1">
        {isArticle ? (
          <ArticleViewer
            ref={viewer as React.Ref<ArticleViewerHandle>}
            html={articleHtml}
            title={edition.title}
            source={edition.source}
            sourceUrl={edition.sourceUrl}
            zoom={zoom}
            marks={marks}
            initialPage={initialPage}
            partner={
              otherPresence?.edition === edition.number
                ? { seat: other, name: names[other], page: otherPresence.page }
                : null
            }
            onPageChange={setPage}
            onSelect={onSelect}
            onMarkTag={(mark, anchor) =>
              setFloating({ kind: "mark", mark, anchor })
            }
            aiSpots={aiSpots}
            onAiTag={(notes, anchor) =>
              setFloating({ kind: "ai", notes, anchor })
            }
            overlay={floatingCard}
          />
        ) : (
          <PdfViewer
            ref={viewer}
            docKey={edition.id}
            url={pdfUrl}
            pageCount={edition.pageCount}
            zoom={zoom}
            marks={marks}
            initialPage={initialPage}
            partner={
              otherPresence?.edition === edition.number
                ? { seat: other, name: names[other], page: otherPresence.page }
                : null
            }
            onPageChange={setPage}
            onSelect={onSelect}
            onPageCount={fixPageCount}
            onMarkTag={(mark, anchor) =>
              setFloating({ kind: "mark", mark, anchor })
            }
            aiSpots={aiSpots}
            onAiTag={(notes, anchor) =>
              setFloating({ kind: "ai", notes, anchor })
            }
            overlay={floatingCard}
          />
        )}
        {chatOpen && (
          <ChatPanel
            messages={allMessages}
            onSend={sendChat}
            onJump={jumpTo}
            onClose={() => toggleChat(false)}
            pageLabel={pageFormat}
          />
        )}
      </div>

      <div className="z-20 flex shrink-0 gap-2 border-t border-rail bg-card px-4 py-2.5">
        {!revealed && (
          <Button variant="outline" className="flex-1" onClick={comeHere}>
            Sini dong <Kbd>J</Kbd>
          </Button>
        )}
        {revealed ? (
          <Button
            className="flex-1"
            render={<Link href={talkHref} />}
            nativeButton={false}
          >
            Ngobrol <Kbd>N</Kbd>
          </Button>
        ) : bothDone ? (
          <Button className="flex-1" onClick={() => setRevealOpen(true)}>
            Buka bareng <Kbd>B</Kbd>
          </Button>
        ) : meDone ? (
          <Button variant="outline" className="flex-1" disabled>
            <CheckIcon data-icon="inline-start" />
            Nunggu {names[other]}
          </Button>
        ) : (
          <Button
            className="flex-1"
            onClick={finish}
            disabled={busy === "done"}
          >
            {busy === "done" && <Spinner data-icon="inline-start" />}
            Aku selesai <Kbd>D</Kbd>
          </Button>
        )}
      </div>

      {/* closes by itself on both phones once the stamps are revealed */}
      <Dialog open={revealOpen && !revealed} onOpenChange={setRevealOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <p className="text-xs text-muted-foreground">
              edisi {edition.number}
            </p>
            <DialogTitle>Kalian berdua selesai.</DialogTitle>
            <DialogDescription>
              {names[other]} kasih {otherCount} cap, kamu kasih {myCount}. Buka
              bareng sekarang?
            </DialogDescription>
            {twinCount > 0 && (
              <p className="text-xs text-reader-b">
                Psst: ada {twinCount} kalimat yang kalian cap sama.
              </p>
            )}
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Nanti
            </DialogClose>
            <Button onClick={openTogether} disabled={busy === "reveal"}>
              {busy === "reveal" && <Spinner data-icon="inline-start" />}
              Buka bareng <Kbd>B</Kbd>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={twinsOpen} onOpenChange={setTwinsOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <p className="text-xs text-muted-foreground">
              edisi {edition.number}
            </p>
            <DialogTitle>Sama!</DialogTitle>
            <DialogDescription>
              Kalian berdua cap {twins.length} kalimat yang sama.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex max-h-64 flex-col gap-3 overflow-y-auto">
            {twins.map(([a, b]) => (
              <li key={a.id} className="flex flex-col gap-1">
                <p className="font-serif text-[14px] text-foreground italic">
                  <span className="bg-highlight-a box-decoration-clone">
                    <span className="bg-highlight-b box-decoration-clone">
                      {a.quote.length > b.quote.length ? b.quote : a.quote}
                    </span>
                  </span>
                </p>
                <p className="font-mono text-[11px]">
                  <span className="text-reader-a">
                    {names.a} [{REACTION_LABEL[a.reaction]}]
                  </span>{" "}
                  ·{" "}
                  <span className="text-reader-b">
                    {names.b} [{REACTION_LABEL[b.reaction]}]
                  </span>{" "}
                  {!isArticle && (
                    <>
                      ·{" "}
                      <span className="text-muted-foreground">
                        hal {a.page}
                      </span>
                    </>
                  )}
                </p>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setTwinsOpen(false)
                if (twins[0]) viewer.current?.scrollToPage(twins[0][0].page)
              }}
            >
              Lihat di halaman
            </Button>
            <Button render={<Link href={talkHref} />} nativeButton={false}>
              Ngobrol <Kbd>N</Kbd>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function noopSubscribe() {
  return () => {}
}

/**
 * A small card attached to the page right under the selected text.
 * It lives inside the reader's scroll area, so it scrolls together with the sentence.
 */
function FloatingCard({
  ref,
  anchor,
  children,
}: {
  ref: React.RefObject<HTMLDivElement | null>
  anchor: Anchor
  children: React.ReactNode
}) {
  const [style, setStyle] = React.useState<React.CSSProperties>({
    visibility: "hidden",
  })

  React.useLayoutEffect(() => {
    const el = ref.current
    const area = el?.offsetParent as HTMLElement | null
    if (!el || !area) return
    const w = el.offsetWidth
    const left = Math.max(
      area.scrollLeft + 8,
      Math.min(area.scrollLeft + area.clientWidth - w - 8, anchor.x - w / 2)
    )
    setStyle({ left, top: anchor.bottom + 8 })
  }, [ref, anchor])

  // if the card ends up below the visible part of the reader, scroll it into view
  React.useEffect(() => {
    const el = ref.current
    const area = el?.offsetParent as HTMLElement | null
    if (!el || !area || style.visibility === "hidden") return
    const overflow =
      el.offsetTop + el.offsetHeight + 8 - (area.scrollTop + area.clientHeight)
    if (overflow > 0) area.scrollBy({ top: overflow, behavior: "smooth" })
  }, [ref, style])

  return (
    <div
      ref={ref}
      style={style}
      data-slot="stamp-card"
      className="absolute z-20 w-[min(320px,calc(100%-16px))] rounded-lg bg-popover p-2.5 text-sm shadow-[0_8px_24px_rgb(0_0_0/0.08)] ring-1 ring-border"
    >
      {children}
    </div>
  )
}

function MarkDetails({
  where,
  mark,
  extraNotes,
  names,
  name,
  canDelete,
  deleting,
  onDelete,
  onClose,
}: {
  /** "hal 3", or "" in an article */
  where: string
  mark: Mark
  extraNotes: AiNote[]
  names: Record<Seat, string>
  name: string
  canDelete: boolean
  deleting: boolean
  onDelete: () => void
  onClose: () => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] text-muted-foreground">
        cap <span className={seatText[mark.seat]}>{name}</span> · [
        {REACTION_LABEL[mark.reaction]}]{where ? ` · ${where}` : ""}
      </p>
      <p className="line-clamp-4 font-serif text-[13.5px] text-foreground italic">
        “{mark.quote}”
      </p>
      {mark.note && <p className="text-xs">{mark.note}</p>}
      {mark.ai && (
        <AiAnswer
          state={{ kind: mark.ai.kind, answer: mark.ai.answer, status: "done" }}
        />
      )}
      {extraNotes.map((n) => (
        <AiAnswer
          key={n.id}
          state={{ kind: n.kind, answer: n.answer, status: "done" }}
          who={
            n.seat !== mark.seat
              ? { name: names[n.seat], seat: n.seat }
              : undefined
          }
        />
      ))}
      <div className="flex justify-end gap-1">
        {canDelete && (
          <Button
            variant="destructive"
            size="sm"
            onClick={onDelete}
            disabled={deleting}
          >
            {deleting ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Trash2Icon data-icon="inline-start" />
            )}
            Hapus
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onClose}>
          Tutup
        </Button>
      </div>
    </div>
  )
}

/** An AI answer box: label, then the (possibly still streaming) text. */
function AiAnswer({
  state,
  who,
  onDelete,
}: {
  state: { kind: AiKind; answer: string; status: "loading" | "done" | "error" }
  /** set when someone else asked it */
  who?: { name: string; seat: Seat }
  onDelete?: () => void
}) {
  return (
    <div
      data-slot="ai-answer"
      className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-md bg-secondary/70 p-2"
    >
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <SparklesIcon className="size-3" />
        AI · {AI_KIND_LABEL[state.kind]}
        {who && (
          <span className={seatText[who.seat]}> · ditanya {who.name}</span>
        )}
        {state.status === "loading" && <Spinner className="size-3" />}
        {onDelete && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onDelete}
            className="ml-auto rounded-sm px-1 hover:bg-background hover:text-destructive"
            aria-label="Hapus jawaban AI"
          >
            <Trash2Icon className="size-3" />
          </button>
        )}
      </p>
      <p
        className={cn(
          "text-[12.5px] leading-relaxed whitespace-pre-wrap",
          state.status === "error" ? "text-destructive" : "text-foreground"
        )}
      >
        {state.answer || (state.status === "loading" ? "Mikir sebentar…" : "")}
      </p>
    </div>
  )
}
