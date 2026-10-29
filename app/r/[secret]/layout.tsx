import { notFound } from "next/navigation"

import { RoomProvider } from "@/components/bedah/room-context"
import { BottomTabs } from "@/components/bedah/bits"
import { SeatPicker } from "@/components/bedah/seat-picker"
import { getCurrentEdition, getRoom, getSeat } from "@/lib/room"

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

  return (
    <RoomProvider
      roomId={room.id}
      secret={secret}
      seat={seat}
      names={room.names}
      currentEdition={current?.number ?? null}
    >
      {/* one screen-tall frame: pages scroll inside it, the reader manages its own scrolling */}
      <div className="flex h-dvh flex-col">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {children}
        </div>
        <BottomTabs />
      </div>
    </RoomProvider>
  )
}
