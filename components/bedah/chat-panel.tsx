"use client"

import * as React from "react"
import { ArrowUpIcon, MessageCircleIcon, XIcon } from "lucide-react"

import { useRoom } from "@/components/bedah/room-context"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Message, MessageContent, MessageFooter } from "@/components/ui/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { seatText } from "@/lib/seat-style"
import type { ChatMessage } from "@/lib/types"
import { cn } from "@/lib/utils"

/** Tallest the message box grows before it scrolls (px, about 8 lines). */
const MAX_INPUT_HEIGHT = 176

const timeFormat = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
})

/**
 * Chat between the two readers for one edition.
 * On wide screens it sits beside the PDF; on phones it slides over the right side.
 */
export function ChatPanel({
  messages,
  onSend,
  onJump,
  onClose,
  pageLabel = (page) => `hal ${page}`,
}: {
  pageLabel?: (page: number) => string
  messages: ChatMessage[]
  onSend: (body: string) => Promise<boolean>
  onJump: (page: number) => void
  onClose: () => void
}) {
  const { seat, names } = useRoom()
  const [draft, setDraft] = React.useState("")
  const [sending, setSending] = React.useState(false)
  const inputRef = React.useRef<HTMLTextAreaElement>(null)

  React.useEffect(() => {
    inputRef.current?.focus({ preventScroll: true })
  }, [])

  // grow the box with the text (up to ~8 lines, then it scrolls), shrink after sending.
  // Done in JS because CSS field-sizing isn't supported in Safari/Firefox.
  React.useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = "auto"
    const full = el.scrollHeight + (el.offsetHeight - el.clientHeight)
    el.style.height = `${Math.min(full, MAX_INPUT_HEIGHT)}px`
    el.style.overflowY = full > MAX_INPUT_HEIGHT ? "auto" : "hidden"
  }, [draft])

  async function submit(event?: React.FormEvent) {
    event?.preventDefault()
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    const sent = await onSend(body)
    setSending(false)
    if (sent) setDraft("")
    inputRef.current?.focus({ preventScroll: true })
  }

  return (
    <aside
      aria-label="Obrolan"
      className="absolute inset-y-0 right-0 z-30 flex w-[min(360px,92%)] flex-col border-l border-rail bg-card shadow-[-8px_0_24px_rgb(0_0_0/0.06)] lg:static lg:w-80 lg:shadow-none"
    >
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-rail px-3">
        <MessageCircleIcon className="size-4 text-muted-foreground" />
        <span className="font-serif text-[15px] text-foreground">Obrolan</span>
        <span className="flex-1" />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Tutup obrolan"
        >
          <XIcon />
        </Button>
      </div>

      <div className="min-h-0 flex-1">
        {messages.length === 0 ? (
          <Empty className="h-full">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessageCircleIcon />
              </EmptyMedia>
              <EmptyTitle className="font-serif font-normal">
                Belum ada obrolan
              </EmptyTitle>
              <EmptyDescription className="text-xs">
                Tanya apa aja soal jurnal ini. Halamanmu ikut terkirim, jadi dia
                bisa langsung loncat ke sana.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <MessageScrollerProvider autoScroll>
            <MessageScroller>
              <MessageScrollerViewport>
                <MessageScrollerContent className="gap-3 px-3 py-4">
                  {messages.map((message) => {
                    const mine = message.seat === seat
                    return (
                      <MessageScrollerItem
                        key={message.id}
                        messageId={message.id}
                        scrollAnchor={mine}
                      >
                        <Message align={mine ? "end" : "start"}>
                          <MessageContent className="gap-1">
                            <Bubble
                              align={mine ? "end" : "start"}
                              variant={
                                message.seat === "a" ? "reader-a" : "reader-b"
                              }
                            >
                              <BubbleContent className="whitespace-pre-wrap">
                                {message.body}
                              </BubbleContent>
                            </Bubble>
                            <MessageFooter className="gap-1.5 px-1 text-[11px] font-normal">
                              <span className={seatText[message.seat]}>
                                {names[message.seat]}
                              </span>
                              <span>
                                ·{" "}
                                {timeFormat.format(new Date(message.createdAt))}
                              </span>
                              {message.page && (
                                <Button
                                  variant="link"
                                  size="xs"
                                  className="h-auto px-0 text-[11px] font-normal"
                                  onClick={() => onJump(message.page!)}
                                >
                                  · {pageLabel(message.page)}
                                </Button>
                              )}
                            </MessageFooter>
                          </MessageContent>
                        </Message>
                      </MessageScrollerItem>
                    )
                  })}
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton />
            </MessageScroller>
          </MessageScrollerProvider>
        )}
      </div>

      <form
        onSubmit={submit}
        className="flex shrink-0 items-end gap-2 border-t border-rail p-2 pb-[calc(var(--nav-space,0px)+0.5rem)]"
      >
        <Textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault()
              void submit()
            }
          }}
          placeholder="Tulis pesan…"
          maxLength={1000}
          rows={1}
          className="[field-sizing:fixed] min-h-9 resize-none py-2 text-sm"
          aria-label="Pesan"
        />
        <Button
          type="submit"
          size="icon"
          disabled={!draft.trim() || sending}
          aria-label="Kirim"
          className={cn("shrink-0", sending && "opacity-70")}
        >
          {sending ? <Spinner /> : <ArrowUpIcon />}
        </Button>
      </form>
    </aside>
  )
}
