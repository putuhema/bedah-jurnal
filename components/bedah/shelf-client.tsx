"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { BellIcon, UserRoundIcon } from "lucide-react"

import { leaveSeat } from "@/app/actions"
import { useRoom } from "@/components/bedah/room-context"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { toast } from "@/components/ui/toast"
import { useHotkey } from "@/hooks/use-hotkey"

/** Main call to action on the shelf; "M" opens it. */
export function PrimaryLink({
  href,
  label,
  hint = "M",
}: {
  href: string
  label: string
  hint?: string
}) {
  const router = useRouter()
  const { setLocation } = useRoom()
  useHotkey(hint, () => router.push(href))

  React.useEffect(() => setLocation(null, null), [setLocation])

  return (
    <Button
      render={<Link href={href} />}
      nativeButton={false}
      className="flex-1"
    >
      {label} <Kbd>{hint}</Kbd>
    </Button>
  )
}

function noopSubscribe() {
  return () => {}
}

export function RoomFooter() {
  const { secret, names, seat } = useRoom()
  const browserPermission = React.useSyncExternalStore(
    noopSubscribe,
    () =>
      typeof Notification === "undefined"
        ? "unsupported"
        : Notification.permission,
    () => "unsupported" as const
  )
  const [asked, setAsked] = React.useState<NotificationPermission | null>(null)
  const permission = asked ?? browserPermission

  async function enableNotifications() {
    const result = await Notification.requestPermission()
    setAsked(result)
    if (result === "granted")
      toast.add({
        title: "Notifikasi nyala",
        description: "Kamu dikabari waktu dia selesai baca.",
      })
  }

  async function switchPerson() {
    const result = await leaveSeat(secret)
    if (!result.ok) toast.add({ title: result.error, type: "error" })
  }

  return (
    <footer className="mt-auto flex flex-wrap items-center gap-2 border-t border-rail px-4 py-4 text-xs text-muted-foreground">
      <span>Masuk sebagai {names[seat]}.</span>
      <Button variant="ghost" size="xs" onClick={switchPerson}>
        <UserRoundIcon data-icon="inline-start" />
        Ganti orang
      </Button>
      {permission === "default" && (
        <Button variant="ghost" size="xs" onClick={enableNotifications}>
          <BellIcon data-icon="inline-start" />
          Nyalakan notifikasi
        </Button>
      )}
    </footer>
  )
}
