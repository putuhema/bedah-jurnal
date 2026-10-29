"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  SparklesIcon,
  ZoomInIcon,
} from "lucide-react"

import { advanceTalk, archiveEdition, saveLearning } from "@/app/actions"
import { Presence, TopBar } from "@/components/bedah/bits"
import { ArticleViewer } from "@/components/bedah/article-viewer"
import {
  formatZoom,
  nextZoomLevel,
  PdfViewer,
} from "@/components/bedah/pdf-viewer"
import { spotLabel } from "@/lib/position"
import { useRoom } from "@/components/bedah/room-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Kbd } from "@/components/ui/kbd"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { useHotkey } from "@/hooks/use-hotkey"
import {
  seatBorder,
  seatBorderLeft,
  seatBorderRight,
  seatHighlight,
  seatText,
} from "@/lib/seat-style"
import {
  AI_KIND_LABEL,
  REACTION_LABEL,
  SEATS,
  type Edition,
  type Learning,
  type Mark,
  type Seat,
  type TalkCard,
} from "@/lib/types"
import { cn } from "@/lib/utils"

export function TalkTime({
  edition,
  deck,
  marks,
  pdfUrl,
  articleHtml,
  learnings,
}: {
  edition: Edition
  deck: TalkCard[]
  /** All stamps (revealed), drawn on the paper. */
  marks: Mark[]
  pdfUrl: string
  /** set when edition.kind is "article" */
  articleHtml: string
  learnings: Learning[]
}) {
  const { secret, seat, names, setLocation, notifyChanged } = useRoom()
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [zoom, setZoom] = React.useState(1)
  // phones: the card panel can fold down to one line so the paper gets the screen
  const [folded, setFolded] = React.useState(false)
  // archived recap: the stamp you tapped in "Semua cap"
  const [picked, setPicked] = React.useState<Mark | null>(null)

  React.useEffect(
    () => setLocation(edition.number, null),
    [edition.number, setLocation]
  )

  const archived = Boolean(edition.archivedAt)
  const talking = !archived && !edition.talkDoneAt && deck.length > 0
  const index = Math.min(edition.talkIndex, Math.max(0, deck.length - 1))
  const card = deck[index]
  // a shared "Sama!" card belongs to both of you
  const mine = Boolean(card && (card.twin || card.mark.seat === seat))

  // the paper follows the card being discussed
  const focusMark = talking ? card?.mark : picked
  const where = (page: number) => {
    const label = spotLabel(edition, page)
    return label ? ` · ${label}` : ""
  }
  const focus = focusMark
    ? {
        page: focusMark.page,
        y: focusMark.rects[0]?.y ?? 0,
        ids: [focusMark.id, ...(talking && card?.twin ? [card.twin.id] : [])],
      }
    : null

  async function next() {
    if (!card || !mine || busy) return
    setBusy(true)
    const result = await advanceTalk(secret, edition.id, edition.talkIndex)
    setBusy(false)
    if (!result.ok) return toast.add({ title: result.error, type: "error" })
    notifyChanged()
  }

  useHotkey("arrowright", () => void next(), talking && mine)
  useHotkey("enter", () => void next(), talking && mine)
  useHotkey("z", () => setZoom(nextZoomLevel))

  const summary =
    talking && card
      ? `${card.twin ? "Sama!" : `Giliran ${names[card.mark.seat]}`} · ${String(index + 1).padStart(2, "0")}/${String(deck.length).padStart(2, "0")}`
      : "Kita belajar hari ini"

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar>
        <span className="text-xs whitespace-nowrap text-muted-foreground">
          <span className="hidden sm:inline">waktunya </span>ngobrol · edisi{" "}
          {edition.number}
        </span>
        <span className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setZoom(nextZoomLevel)}
          aria-label="Perbesar halaman"
        >
          <ZoomInIcon data-icon="inline-start" />
          {formatZoom(zoom)}
        </Button>
        <Presence />
      </TopBar>

      <div className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
        {edition.kind === "article" ? (
          <ArticleViewer
            html={articleHtml}
            title={edition.title}
            source={edition.source}
            sourceUrl={edition.sourceUrl}
            zoom={zoom}
            onZoomChange={setZoom}
            marks={marks}
            initialPage={1}
            partner={null}
            focus={focus}
            onPageChange={noop}
            onSelect={noop}
            onMarkTag={noop}
          />
        ) : (
          <PdfViewer
            docKey={edition.id}
            url={pdfUrl}
            pageCount={edition.pageCount}
            zoom={zoom}
            onZoomChange={setZoom}
            marks={marks}
            initialPage={focusMark?.page ?? 1}
            partner={null}
            focus={focus}
            onPageChange={noop}
            onSelect={noop}
            onMarkTag={noop}
          />
        )}

        <aside
          aria-label="Kartu ngobrol"
          className={cn(
            "z-20 flex min-h-0 shrink-0 flex-col border-t border-rail bg-card shadow-[0_-8px_24px_rgb(0_0_0/0.06)]",
            "lg:w-[420px] lg:border-t-0 lg:border-l lg:shadow-none",
            folded ? "max-lg:max-h-none" : "max-h-[62%] lg:max-h-none"
          )}
        >
          {/* phones: tap to fold the card away and read the paper */}
          <button
            type="button"
            onClick={() => setFolded((f) => !f)}
            className="flex shrink-0 items-center justify-between gap-2 border-b border-rail px-4 py-2 text-xs text-muted-foreground lg:hidden"
            aria-expanded={!folded}
          >
            <span className="truncate">{summary}</span>
            <span className="flex items-center gap-1">
              {folded ? "buka kartu" : "lihat paper"}
              {folded ? (
                <ChevronUpIcon className="size-4" />
              ) : (
                <ChevronDownIcon className="size-4" />
              )}
            </span>
          </button>

          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4",
              folded && "max-lg:hidden"
            )}
          >
            {talking && card ? (
              <>
                {card.twin ? (
                  <h1 className="font-serif text-3xl leading-none font-light text-primary italic">
                    Sama!
                  </h1>
                ) : (
                  <h1
                    className={cn(
                      "font-serif text-3xl leading-none font-light italic",
                      seatText[card.mark.seat]
                    )}
                  >
                    Giliran {names[card.mark.seat]}
                  </h1>
                )}

                <Card
                  className={cn(
                    "gap-0 border-l-2 py-0",
                    seatBorderLeft[card.mark.seat],
                    card.twin &&
                      cn("border-r-2", seatBorderRight[card.twin.seat])
                  )}
                >
                  <CardHeader className="flex flex-row justify-between border-b py-2 text-[11px] text-muted-foreground">
                    {card.twin ? (
                      <span>
                        kalian berdua ·{" "}
                        {[card.mark, card.twin].map((m) => (
                          <span
                            key={m.id}
                            className={cn("mr-1", seatText[m.seat])}
                          >
                            [{REACTION_LABEL[m.reaction]}]
                          </span>
                        ))}
                        {where(card.mark.page)}
                      </span>
                    ) : (
                      <span>
                        temuan {names[card.mark.seat]} ·{" "}
                        <span className={seatText[card.mark.seat]}>
                          [{REACTION_LABEL[card.mark.reaction]}]
                        </span>{" "}
                        {where(card.mark.page)}
                      </span>
                    )}
                    <span>
                      {String(index + 1).padStart(2, "0")} /{" "}
                      {String(deck.length).padStart(2, "0")}
                    </span>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3 py-4">
                    <blockquote className="font-serif text-[14px] text-ink italic">
                      <span
                        className={cn(
                          "border-b-2 box-decoration-clone px-0.5",
                          seatHighlight[card.mark.seat]
                        )}
                      >
                        {card.mark.quote}
                      </span>
                    </blockquote>
                    {[card.mark, card.twin].map(
                      (m) =>
                        m?.note && (
                          <p key={`note-${m.id}`} className="text-xs">
                            <span className={seatText[m.seat]}>
                              {names[m.seat]}:
                            </span>{" "}
                            {m.note}
                          </p>
                        )
                    )}
                    {[card.mark, card.twin].map(
                      (m) =>
                        m?.ai && (
                          <details
                            key={`ai-${m.id}`}
                            className="group rounded-md bg-secondary/70 px-2 py-1.5 text-xs"
                          >
                            <summary className="cursor-pointer list-none text-muted-foreground">
                              <SparklesIcon className="mr-1 inline size-3" />
                              <span className={seatText[m.seat]}>
                                {names[m.seat]}
                              </span>{" "}
                              tanya AI: {AI_KIND_LABEL[m.ai.kind]}{" "}
                              <span className="group-open:hidden">· lihat</span>
                            </summary>
                            <p className="mt-1.5 leading-relaxed whitespace-pre-wrap text-foreground">
                              {m.ai.answer}
                            </p>
                          </details>
                        )
                    )}
                    <p className="font-serif text-[20px] leading-snug text-foreground">
                      {card.prompt}
                    </p>
                  </CardContent>
                </Card>

                <div
                  className="flex justify-center gap-2.5"
                  aria-label={`kartu ${index + 1} dari ${deck.length}`}
                >
                  {deck.map((c, i) => (
                    <i
                      key={c.mark.id}
                      className={cn(
                        "size-[7px] rotate-45 border",
                        i < index
                          ? "border-ink bg-ink"
                          : i === index
                            ? "border-foreground"
                            : "border-rail"
                      )}
                    />
                  ))}
                </div>

                {mine ? (
                  <Button onClick={next} disabled={busy}>
                    {busy ? <Spinner data-icon="inline-start" /> : null}
                    {index === deck.length - 1
                      ? "Beres ngobrol"
                      : "Udah dibahas"}
                    <Kbd>
                      <ArrowRightIcon />
                    </Kbd>
                  </Button>
                ) : (
                  <Button variant="outline" disabled>
                    Dengerin {names[card.mark.seat]} dulu
                  </Button>
                )}
                <p className="text-center text-xs text-muted-foreground">
                  {mine
                    ? card.twin
                      ? "kartu bareng: siapa aja boleh lanjut"
                      : "kartu kamu: kamu cerita, kamu yang lanjut"
                    : `kartu ${names[card.mark.seat]}: cuma dia yang bisa lanjut`}
                </p>
              </>
            ) : (
              <Learnings
                edition={edition}
                learnings={learnings}
                deckEmpty={deck.length === 0}
                onArchived={() => router.push(`/r/${secret}`)}
              />
            )}

            {archived && deck.length > 0 && (
              <section className="flex flex-col gap-1 border-t border-rail pt-5">
                <h2 className="pb-2 font-serif text-[17px] text-foreground">
                  Semua cap
                </h2>
                {deck
                  .flatMap(({ mark, twin }) => (twin ? [mark, twin] : [mark]))
                  .map((mark) => (
                    <button
                      key={mark.id}
                      type="button"
                      onClick={() => setPicked(mark)}
                      className={cn(
                        "rounded-md px-1 py-1.5 text-left font-serif text-[14px] italic transition-colors hover:bg-secondary",
                        picked?.id === mark.id && "bg-secondary"
                      )}
                    >
                      <span
                        className={cn(
                          "border-b-2 box-decoration-clone px-0.5",
                          seatHighlight[mark.seat]
                        )}
                      >
                        {mark.quote}
                      </span>{" "}
                      <span
                        className={cn(
                          "font-mono text-[11px] not-italic",
                          seatText[mark.seat]
                        )}
                      >
                        [{REACTION_LABEL[mark.reaction]}]{where(mark.page)}
                      </span>
                    </button>
                  ))}
              </section>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

function noop() {}

function Learnings({
  edition,
  learnings,
  deckEmpty,
  onArchived,
}: {
  edition: Edition
  learnings: Learning[]
  deckEmpty: boolean
  onArchived: () => void
}) {
  const { secret, seat, names, notifyChanged } = useRoom()
  const archived = Boolean(edition.archivedAt)
  const saved = Object.fromEntries(
    learnings.map((l) => [l.seat, l.body])
  ) as Partial<Record<Seat, string>>
  const [draft, setDraft] = React.useState(saved[seat] ?? "")
  const [saving, setSaving] = React.useState<"save" | "archive" | null>(null)
  const bothWrote = Boolean(saved.a && saved.b)

  async function save() {
    setSaving("save")
    const result = await saveLearning(secret, edition.id, draft)
    setSaving(null)
    if (!result.ok) return toast.add({ title: result.error, type: "error" })
    notifyChanged()
  }

  async function archive() {
    setSaving("archive")
    const result = await archiveEdition(secret, edition.id)
    setSaving(null)
    if (!result.ok) return toast.add({ title: result.error, type: "error" })
    notifyChanged()
    onArchived()
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground">
          edisi {edition.number} · {archived ? "arsip" : "halaman terakhir"}
        </p>
        <h1 className="font-serif text-4xl leading-tight font-light text-primary italic">
          Kita belajar hari ini
        </h1>
        {deckEmpty && !archived && (
          <p className="text-xs text-muted-foreground">
            Nggak ada cap minggu ini. Langsung tulis aja.
          </p>
        )}
      </div>

      {SEATS.map((s) =>
        s === seat && !archived ? (
          <Field key={s} className={cn("border-l-2 pl-3", seatBorder[s])}>
            <FieldLabel htmlFor="learning" className={seatText[s]}>
              {names[s]}
            </FieldLabel>
            <Textarea
              id="learning"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Satu kalimat yang kamu bawa pulang…"
              maxLength={280}
              className="font-serif text-base"
            />
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={save}
                disabled={
                  saving !== null || !draft.trim() || draft.trim() === saved[s]
                }
              >
                {saving === "save" && <Spinner data-icon="inline-start" />}
                {saved[s] ? "Simpan ulang" : "Simpan"}
              </Button>
            </div>
          </Field>
        ) : (
          <div
            key={s}
            className={cn("flex flex-col gap-1 border-l-2 pl-3", seatBorder[s])}
          >
            <span className={cn("text-xs", seatText[s])}>{names[s]}</span>
            <p
              className={cn(
                "font-serif text-base",
                saved[s] ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {saved[s] ?? `${names[s]} belum nulis…`}
            </p>
          </div>
        )
      )}

      {archived ? (
        <Button
          variant="outline"
          render={<Link href={`/r/${secret}`} />}
          nativeButton={false}
        >
          Kembali ke rak
        </Button>
      ) : (
        <>
          <Button onClick={archive} disabled={!bothWrote || saving !== null}>
            {saving === "archive" && <Spinner data-icon="inline-start" />}
            Simpan ke arsip
          </Button>
          {!bothWrote && (
            <p className="text-center text-xs text-muted-foreground">
              Arsip bisa disimpan setelah kalian berdua nulis satu kalimat.
            </p>
          )}
        </>
      )}
    </div>
  )
}
