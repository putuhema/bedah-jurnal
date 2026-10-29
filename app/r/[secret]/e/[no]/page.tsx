import { notFound, redirect } from "next/navigation"

import { ReadingRoom } from "@/components/bedah/reading-room"
import { aiEnabled } from "@/lib/ai"
import {
  getEditionByNumber,
  getAiNotes,
  getArticleHtml,
  getMarks,
  getMessages,
  getPdfUrl,
  getProgress,
  getRoom,
  getSeat,
} from "@/lib/room"

export default async function ReadingPage({
  params,
  searchParams,
}: PageProps<"/r/[secret]/e/[no]">) {
  const { secret, no } = await params
  const { hal, obrolan } = await searchParams
  const room = await getRoom(secret)
  if (!room) notFound()
  const seat = await getSeat(room)
  if (!seat) notFound()

  const edition = await getEditionByNumber(room.id, Number(no))
  // e.g. it was just swapped for another reading
  if (!edition) redirect(`/r/${secret}`)

  const [
    pdfUrl,
    { marks, hiddenCount, twinCount },
    progress,
    messages,
    aiNotes,
    articleHtml,
  ] = await Promise.all([
    getPdfUrl(edition),
    getMarks(edition, seat),
    getProgress(edition.id),
    getMessages(edition.id),
    getAiNotes(edition, seat),
    edition.kind === "article" ? getArticleHtml(edition) : Promise.resolve(""),
  ])

  const requested = Number(Array.isArray(hal) ? hal[0] : hal)
  const initialPage =
    requested >= 1 && requested <= edition.pageCount
      ? Math.floor(requested)
      : progress[seat].doneAt
        ? 1
        : progress[seat].page

  return (
    <ReadingRoom
      edition={edition}
      pdfUrl={pdfUrl}
      marks={marks}
      hiddenCount={hiddenCount}
      twinCount={twinCount}
      aiEnabled={aiEnabled()}
      progress={progress}
      initialPage={initialPage}
      messages={messages}
      aiNotes={aiNotes}
      articleHtml={articleHtml}
      initialChatOpen={obrolan === "1"}
    />
  )
}
