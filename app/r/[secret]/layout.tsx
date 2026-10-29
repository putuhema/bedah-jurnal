import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { RoomProvider } from "@/components/bedah/room-context"
import { RoomShell } from "@/components/bedah/floating-nav"
import { SeatPicker } from "@/components/bedah/seat-picker"
import { getCurrentEdition, getProgress, getRoom, getSeat } from "@/lib/room"

export async function generateMetadata({
  params,
}: LayoutProps<"/r/[secret]">): Promise<Metadata> {
  const { secret } = await params
  // installing from here opens this room
  return {
    manifest: `/r/${secret}/manifest.webmanifest`,
    robots: { index: false, follow: false },
  }
}

export default async function RoomLayout({
  children,
  params,
}: LayoutProps<"/r/[secret]">) {
  const { secret } = await params
  const room = await getRoom(secret)
  if (!room) notFound()

  const seat = await getSeat(room)
  if (!seat) return <SeatPicker secret={secret} names={room.names} />

  const current = await getCurrentEdition(room.id)
  const progress = current ? await getProgress(current.id) : null
  // the "Ngobrol" tab appears once you're done reading (or the stamps are open)
  const talkUnlocked = Boolean(
    current && (current.revealedAt || progress?.[seat].doneAt)
  )

  return (
    <RoomProvider
      roomId={room.id}
      secret={secret}
      seat={seat}
      names={room.names}
      currentEdition={current?.number ?? null}
      talkUnlocked={talkUnlocked}
    >
      {/* one screen-tall frame: pages scroll inside it, the reader manages its own scrolling */}
      <RoomShell>{children}</RoomShell>
    </RoomProvider>
  )
}
