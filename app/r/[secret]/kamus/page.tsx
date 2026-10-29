import { notFound } from "next/navigation"

import { Logo, Presence, TopBar } from "@/components/bedah/bits"
import { KamusList } from "@/components/bedah/kamus-list"
import { getKamus, getRoom, getSeat } from "@/lib/room"

export default async function KamusPage({
  params,
}: PageProps<"/r/[secret]/kamus">) {
  const { secret } = await params
  const room = await getRoom(secret)
  if (!room) notFound()
  const seat = await getSeat(room)
  if (!seat) notFound()

  const entries = await getKamus(room, seat)

  return (
    <>
      <TopBar>
        <Logo />
        <span className="flex-1" />
        <Presence />
      </TopBar>
      <KamusList entries={entries} />
    </>
  )
}
