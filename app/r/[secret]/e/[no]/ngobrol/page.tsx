import Link from "next/link"
import { notFound } from "next/navigation"

import { TopBar } from "@/components/bedah/bits"
import { TalkTime } from "@/components/bedah/talk-time"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  getEditionByNumber,
  getArticleHtml,
  getLearnings,
  getMarks,
  getPdfUrl,
  getRoom,
  getSeat,
} from "@/lib/room"
import { buildDeck } from "@/lib/talk"

export default async function TalkPage({
  params,
}: PageProps<"/r/[secret]/e/[no]/ngobrol">) {
  const { secret, no } = await params
  const room = await getRoom(secret)
  if (!room) notFound()
  const seat = await getSeat(room)
  if (!seat) notFound()
  const edition = await getEditionByNumber(room.id, Number(no))
  if (!edition) notFound()

  if (!edition.revealedAt) {
    return (
      <>
        <TopBar>
          <span className="text-xs text-muted-foreground">
            waktunya ngobrol · edisi {edition.number}
          </span>
        </TopBar>
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyTitle className="font-serif text-2xl font-light text-primary italic">
              Belum waktunya
            </EmptyTitle>
            <EmptyDescription>
              Kartu ngobrol muncul setelah kalian berdua selesai baca dan buka
              cap bareng.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              render={<Link href={`/r/${secret}/e/${edition.number}`} />}
              nativeButton={false}
            >
              Ke ruang baca
            </Button>
          </EmptyContent>
        </Empty>
      </>
    )
  }

  const [{ marks }, learnings, pdfUrl, articleHtml] = await Promise.all([
    getMarks(edition, seat),
    getLearnings([edition.id]),
    getPdfUrl(edition),
    edition.kind === "article" ? getArticleHtml(edition) : Promise.resolve(""),
  ])

  return (
    <TalkTime
      edition={edition}
      deck={buildDeck(marks, edition.pickedBy)}
      marks={marks}
      pdfUrl={pdfUrl}
      articleHtml={articleHtml}
      learnings={learnings[edition.id] ?? []}
    />
  )
}
