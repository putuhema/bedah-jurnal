import { notFound } from "next/navigation"
import Link from "next/link"

import { AddEditionDialog } from "@/components/bedah/add-edition-dialog"
import { Cover, Logo, Presence, TopBar } from "@/components/bedah/bits"
import { seatBg, seatText } from "@/lib/seat-style"
import {
  ChangeEditionButton,
  PrimaryLink,
  RoomFooter,
} from "@/components/bedah/shelf-client"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Separator } from "@/components/ui/separator"
import {
  getCurrentEdition,
  getEditions,
  getLearnings,
  getMarkCounts,
  getNextPicker,
  getProgress,
  getRoom,
  getSeat,
} from "@/lib/room"
import { otherSeat, SEATS } from "@/lib/types"
import { cn } from "@/lib/utils"

const dateFormat = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
})

export default async function ShelfPage({
  params,
  searchParams,
}: PageProps<"/r/[secret]">) {
  const { secret } = await params
  const { tambah } = await searchParams
  const room = await getRoom(secret)
  if (!room) notFound()
  const seat = await getSeat(room)
  if (!seat) notFound()
  const other = otherSeat(seat)

  const [editions, current, nextPicker] = await Promise.all([
    getEditions(room.id),
    getCurrentEdition(room.id),
    getNextPicker(room.id),
  ])
  const archived = editions.filter((e) => e.archivedAt)
  const [progress, counts, learnings] = await Promise.all([
    current ? getProgress(current.id) : null,
    current ? getMarkCounts(current.id) : null,
    getLearnings(archived.map((e) => e.id)),
  ])

  const base = `/r/${secret}`
  const nextNumber = (editions[0]?.number ?? 0) + 1

  return (
    <>
      <TopBar>
        <Logo />
        <span className="flex-1" />
        <Presence />
      </TopBar>

      {current &&
        progress &&
        progress[other].doneAt &&
        !progress[seat].doneAt && (
          <Link
            href={`${base}/e/${current.number}`}
            className="border-b border-rail bg-news px-4 py-2 text-center font-serif text-[13.5px] text-foreground"
          >
            <span className="text-primary">Edisi {current.number}:</span>{" "}
            {room.names[other]} sudah selesai baca →
          </Link>
        )}

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col">
        {current && progress && counts ? (
          <section className="flex flex-col gap-3 px-4 pt-5 pb-6">
            <Cover number={current.number} className="h-30" />
            <p className="text-xs text-muted-foreground">
              edisi minggu ini · pilihan {room.names[current.pickedBy]}
            </p>
            <h1 className="font-serif text-[30px] leading-[1.08] font-light tracking-tight text-primary italic">
              {current.title}
            </h1>
            <p className="text-xs text-muted-foreground">
              {[
                current.source,
                current.kind === "article"
                  ? "artikel"
                  : `${current.pageCount} hal`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>

            <div className="flex flex-col gap-2 pt-1">
              {SEATS.map((s) => {
                const p = progress[s]
                const pct = p.doneAt
                  ? 100
                  : Math.round(
                      (Math.max(0, p.page - 1) / current.pageCount) * 100
                    )
                return (
                  <div
                    key={s}
                    className="grid grid-cols-[64px_1fr_56px] items-center gap-3 text-xs"
                  >
                    <span className={cn("truncate", seatText[s])}>
                      {room.names[s]}
                    </span>
                    <div className="h-1 overflow-hidden rounded-full bg-accent">
                      <div
                        className={cn("h-full", seatBg[s])}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-right text-muted-foreground">
                      {p.doneAt
                        ? "selesai"
                        : current.kind === "article"
                          ? `${p.page}%`
                          : `${p.page}/${current.pageCount}`}
                    </span>
                  </div>
                )
              })}
            </div>

            <p className="py-2 text-xs text-muted-foreground">
              {current.revealedAt
                ? "Cap sudah dibuka. Waktunya ngobrol."
                : counts[other] > 0
                  ? `${"[ · ] ".repeat(Math.min(counts[other], 6))} ${counts[other]} cap ${room.names[other]}, masih rahasia`
                  : `${room.names[other]} belum kasih cap.`}
            </p>

            <div className="flex gap-2">
              {current.revealedAt ? (
                <PrimaryLink
                  href={`${base}/e/${current.number}/ngobrol`}
                  label="Ngobrol"
                />
              ) : (
                <PrimaryLink
                  href={`${base}/e/${current.number}`}
                  label={progress[seat].page > 1 ? "Lanjut baca" : "Mulai baca"}
                />
              )}
            </div>
            {!current.revealedAt && (
              <div className="flex justify-center">
                <ChangeEditionButton
                  editionId={current.id}
                  number={current.number}
                />
              </div>
            )}
          </section>
        ) : (
          <Empty className="px-4 py-12">
            <EmptyHeader>
              <EmptyTitle className="font-serif text-2xl font-light text-primary italic">
                {editions.length === 0
                  ? "Rak masih kosong"
                  : "Siap edisi berikutnya"}
              </EmptyTitle>
              <EmptyDescription>
                Giliran{" "}
                <span className={seatText[nextPicker]}>
                  {room.names[nextPicker]}
                </span>{" "}
                milih jurnal.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <AddEditionDialog
                nextNumber={nextNumber}
                defaultOpen={tambah === "1"}
              />
            </EmptyContent>
          </Empty>
        )}

        {archived.length > 0 && (
          <section className="border-t border-rail">
            <div className="flex items-baseline justify-between px-4 pt-5 pb-1">
              <h2 className="font-serif text-[17px] text-foreground">
                Edisi lama
              </h2>
              <span className="text-xs text-muted-foreground">
                {archived.length} bareng
              </span>
            </div>
            <ul className="flex flex-col px-4 pb-4">
              {archived.map((edition, i) => {
                const lines = learnings[edition.id] ?? []
                return (
                  <li key={edition.id}>
                    {i > 0 && <Separator />}
                    <Link
                      href={`${base}/e/${edition.number}/ngobrol`}
                      className="grid grid-cols-[48px_1fr_auto] items-baseline gap-3 py-3 transition-colors hover:bg-foreground/[0.025]"
                    >
                      <span className="text-xs text-muted-foreground">
                        No.{edition.number}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="font-serif text-[15.5px] leading-snug text-foreground">
                          {edition.title}
                        </span>
                        {lines[0] && (
                          <span className="truncate text-[11px] text-muted-foreground">
                            “{lines[0].body}”
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {dateFormat.format(
                          new Date(edition.archivedAt ?? edition.createdAt)
                        )}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </main>
      <RoomFooter />
    </>
  )
}
