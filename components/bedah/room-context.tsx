"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import type { RealtimeChannel } from "@supabase/supabase-js"

import { toast } from "@/components/ui/toast"
import { browserClient } from "@/lib/supabase/browser"
import { otherSeat, type ChatMessage, type Seat } from "@/lib/types"

export type PresenceInfo = {
  seat: Seat
  edition: number | null
  page: number | null
  /** "percent" while reading an article (its position is the % read) */
  unit?: "page" | "percent"
}

export type ComeHere = { from: Seat; edition: number; page: number }

type Events = {
  /** Data changed on the server: the other phone should refresh. */
  changed: Record<string, never>
  /** "Sini dong": come to my page. */
  come: ComeHere
  /** A new chat message (already saved on the server). */
  chat: { edition: number; message: ChatMessage }
  /** The sender finished reading this edition. */
  done: { from: Seat; edition: number }
}

type RoomContextValue = {
  roomId: string
  secret: string
  seat: Seat
  other: Seat
  names: Record<Seat, string>
  currentEdition: number | null
  /** You finished reading the current edition (or it's revealed): talk time is open. */
  talkUnlocked: boolean
  /** The other person, if they are online right now. */
  otherPresence: PresenceInfo | null
  setLocation: (
    edition: number | null,
    page: number | null,
    unit?: "page" | "percent"
  ) => void
  send: <E extends keyof Events>(event: E, payload: Events[E]) => void
  /** Call after any successful write so the other phone refreshes. */
  notifyChanged: () => void
  onCome: (handler: (msg: ComeHere) => void) => () => void
  onChat: (handler: (msg: Events["chat"]) => void) => () => void
}

const RoomContext = React.createContext<RoomContextValue | null>(null)

export function useRoom() {
  const ctx = React.useContext(RoomContext)
  if (!ctx) throw new Error("useRoom must be used inside <RoomProvider>")
  return ctx
}

export function RoomProvider({
  roomId,
  secret,
  seat,
  names,
  currentEdition,
  talkUnlocked,
  children,
}: {
  roomId: string
  secret: string
  seat: Seat
  names: Record<Seat, string>
  currentEdition: number | null
  talkUnlocked: boolean
  children: React.ReactNode
}) {
  const router = useRouter()
  const channelRef = React.useRef<RealtimeChannel | null>(null)
  const locationRef = React.useRef<{
    edition: number | null
    page: number | null
    unit?: "page" | "percent"
  }>({
    edition: null,
    page: null,
  })
  const comeHandlers = React.useRef(new Set<(msg: ComeHere) => void>())
  const chatHandlers = React.useRef(new Set<(msg: Events["chat"]) => void>())
  const [otherPresence, setOtherPresence] = React.useState<PresenceInfo | null>(
    null
  )
  const other = otherSeat(seat)

  const refreshTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  )
  const refreshSoon = React.useCallback(() => {
    clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => router.refresh(), 120)
  }, [router])

  // read through refs so a refresh (new `names` object) doesn't rebuild the channel
  const namesRef = React.useRef(names)
  const routerRef = React.useRef(router)
  React.useEffect(() => {
    namesRef.current = names
    routerRef.current = router
  })

  React.useEffect(() => {
    let channel: RealtimeChannel
    try {
      channel = browserClient().channel(`room:${roomId}`, {
        config: { presence: { key: seat }, broadcast: { self: false } },
      })
    } catch (error) {
      console.warn("[realtime] disabled:", error)
      return
    }
    channelRef.current = channel

    // toast when the other person shows up; a quick reconnect (phone locked for a
    // moment, flaky signal) doesn't count as arriving again
    let wasOnline = false
    let leftAt = 0
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<PresenceInfo>()
        const latest = state[other]?.at(-1)
        const online = Boolean(latest)
        if (online && !wasOnline && Date.now() - leftAt > 30_000) {
          toast.add({
            title: `${namesRef.current[other]} lagi di sini`,
            description: "Dia juga lagi buka Bedah Jurnal.",
          })
        }
        if (!online && wasOnline) leftAt = Date.now()
        wasOnline = online
        setOtherPresence(
          latest
            ? {
                seat: other,
                edition: latest.edition ?? null,
                page: latest.page ?? null,
                unit: latest.unit ?? "page",
              }
            : null
        )
      })
      .on("broadcast", { event: "changed" }, () => refreshSoon())
      .on("broadcast", { event: "come" }, ({ payload }) => {
        const msg = payload as ComeHere
        if (comeHandlers.current.size > 0) {
          comeHandlers.current.forEach((handler) => handler(msg))
        } else {
          toast.add({
            title: `${namesRef.current[msg.from]} manggil kamu`,
            description: `Edisi ${msg.edition}, hal ${msg.page}`,
            actionProps: {
              children: "Ke sana",
              onClick: () =>
                routerRef.current.push(
                  `/r/${secret}/e/${msg.edition}?hal=${msg.page}`
                ),
            },
          })
        }
      })
      .on("broadcast", { event: "chat" }, ({ payload }) => {
        const msg = payload as Events["chat"]
        if (chatHandlers.current.size > 0) {
          chatHandlers.current.forEach((handler) => handler(msg))
        } else {
          toast.add({
            title: `${namesRef.current[msg.message.seat]}: ${msg.message.body.slice(0, 80)}`,
            description: `Obrolan edisi ${msg.edition}`,
            actionProps: {
              children: "Buka",
              onClick: () =>
                routerRef.current.push(
                  `/r/${secret}/e/${msg.edition}?obrolan=1`
                ),
            },
          })
        }
      })
      .on("broadcast", { event: "done" }, ({ payload }) => {
        const msg = payload as Events["done"]
        const title = `${namesRef.current[msg.from]} selesai baca`
        toast.add({
          title,
          description: `Edisi ${msg.edition}. Cap dibuka kalau kamu juga selesai.`,
        })
        if (
          typeof Notification !== "undefined" &&
          Notification.permission === "granted" &&
          document.hidden
        ) {
          new Notification(title, { body: "Bedah Jurnal: siap ngobrol?" })
        }
        refreshSoon()
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void channel.track({ seat, ...locationRef.current })
        }
      })

    return () => {
      channelRef.current = null
      void channel.unsubscribe()
    }
  }, [roomId, seat, other, secret, refreshSoon])

  const setLocation = React.useCallback(
    (
      edition: number | null,
      page: number | null,
      unit: "page" | "percent" = "page"
    ) => {
      const prev = locationRef.current
      if (prev.edition === edition && prev.page === page && prev.unit === unit)
        return
      locationRef.current = { edition, page, unit }
      void channelRef.current?.track({ seat, edition, page, unit })
    },
    [seat]
  )

  const send = React.useCallback(
    <E extends keyof Events>(event: E, payload: Events[E]) => {
      void channelRef.current?.send({ type: "broadcast", event, payload })
    },
    []
  )

  const notifyChanged = React.useCallback(() => send("changed", {}), [send])

  const onCome = React.useCallback((handler: (msg: ComeHere) => void) => {
    comeHandlers.current.add(handler)
    return () => {
      comeHandlers.current.delete(handler)
    }
  }, [])

  const onChat = React.useCallback((handler: (msg: Events["chat"]) => void) => {
    chatHandlers.current.add(handler)
    return () => {
      chatHandlers.current.delete(handler)
    }
  }, [])

  const value = React.useMemo<RoomContextValue>(
    () => ({
      roomId,
      secret,
      seat,
      other,
      names,
      currentEdition,
      talkUnlocked,
      otherPresence,
      setLocation,
      send,
      notifyChanged,
      onCome,
      onChat,
    }),
    [
      roomId,
      secret,
      seat,
      other,
      names,
      currentEdition,
      talkUnlocked,
      otherPresence,
      setLocation,
      send,
      notifyChanged,
      onCome,
      onChat,
    ]
  )

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>
}
