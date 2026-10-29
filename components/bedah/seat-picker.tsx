"use client"

import * as React from "react"

import { chooseSeat } from "@/app/actions"
import { Logo } from "@/components/bedah/bits"
import { seatText } from "@/lib/seat-style"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"
import { SEATS, type Seat } from "@/lib/types"

export function SeatPicker({
  secret,
  names,
}: {
  secret: string
  names: Record<Seat, string>
}) {
  const [pending, setPending] = React.useState<Seat | null>(null)

  async function pick(seat: Seat) {
    setPending(seat)
    const result = await chooseSeat(secret, seat)
    if (!result.ok) {
      toast.add({ title: result.error, type: "error" })
      setPending(null)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-6">
      <Logo />
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">ruang baca berdua</p>
        <h1 className="font-serif text-4xl leading-tight font-light text-primary italic">
          Kamu siapa?
        </h1>
        <p>HP ini akan ingat pilihanmu. Bagikan link ruang ini cuma ke dia.</p>
      </div>
      <div className="flex flex-col gap-2">
        {SEATS.map((seat) => (
          <Button
            key={seat}
            variant="outline"
            size="lg"
            className="h-12 justify-between text-base"
            disabled={pending !== null}
            onClick={() => pick(seat)}
          >
            <span className={cn("font-serif", seatText[seat])}>
              {names[seat]}
            </span>
            {pending === seat ? (
              <Spinner data-icon="inline-end" />
            ) : (
              <span className="text-xs text-muted-foreground">aku →</span>
            )}
          </Button>
        ))}
      </div>
    </main>
  )
}
