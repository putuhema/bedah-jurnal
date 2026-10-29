"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { BellIcon, RefreshCwIcon, UserRoundIcon } from "lucide-react"

import { cancelEdition, leaveSeat } from "@/app/actions"
import { useRoom } from "@/components/bedah/room-context"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Spinner } from "@/components/ui/spinner"
import { Kbd } from "@/components/ui/kbd"
import { toast } from "@/components/ui/toast"
import { useHotkey } from "@/hooks/use-hotkey"
import { seatBg, seatText } from "@/lib/seat-style"
import { cn } from "@/lib/utils"

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

/** You, in the header: who you're signed in as, switching person, notifications. */
export function AccountMenu() {
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
    <Popover>
      <PopoverTrigger
        aria-label={`Masuk sebagai ${names[seat]}`}
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-full text-xs font-medium text-white uppercase",
          seatBg[seat]
        )}
      >
        {names[seat].slice(0, 1)}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 gap-1 p-1.5">
        <p className="px-2 py-1.5 text-xs text-muted-foreground">
          Masuk sebagai <span className={seatText[seat]}>{names[seat]}</span>
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="justify-start"
          onClick={switchPerson}
        >
          <UserRoundIcon data-icon="inline-start" />
          Ganti orang
        </Button>
        {permission === "default" && (
          <Button
            variant="ghost"
            size="sm"
            className="justify-start"
            onClick={enableNotifications}
          >
            <BellIcon data-icon="inline-start" />
            Nyalakan notifikasi
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** Not feeling this week's reading? Drop it (for both of you) and pick another. */
export function ChangeEditionButton({
  editionId,
  number,
}: {
  editionId: string
  number: number
}) {
  const router = useRouter()
  const { secret, names, other, notifyChanged } = useRoom()
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  async function drop() {
    setBusy(true)
    const result = await cancelEdition(secret, editionId)
    setBusy(false)
    if (!result.ok) return toast.add({ title: result.error, type: "error" })
    setOpen(false)
    notifyChanged()
    router.push(`/r/${secret}?tambah=1`)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>
        <RefreshCwIcon data-icon="inline-start" />
        Ganti bacaan
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <p className="text-xs text-muted-foreground">edisi {number}</p>
          <DialogTitle>Ganti bacaan ini?</DialogTitle>
          <DialogDescription>
            Edisi ini dihapus buat kamu dan {names[other]}, termasuk semua cap,
            catatan, dan obrolannya. Habis itu kamu bisa pilih bacaan baru.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Batal</DialogClose>
          <Button variant="destructive" onClick={drop} disabled={busy}>
            {busy && <Spinner data-icon="inline-start" />}
            Hapus &amp; pilih lagi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
