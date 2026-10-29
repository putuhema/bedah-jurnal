"use client"

import { cn } from "@/lib/utils"

import { glass } from "@/components/bedah/floating-nav"
import { useRoom } from "@/components/bedah/room-context"
import { Badge } from "@/components/ui/badge"
import { seatBg } from "@/lib/seat-style"

export function Logo() {
  return (
    <span className="flex items-center gap-2 text-[15px] font-medium text-foreground">
      <svg
        width="18"
        height="18"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
      >
        <rect
          x="1"
          y="1"
          width="18"
          height="18"
          rx="2"
          className="stroke-primary"
          strokeWidth="1.4"
        />
        <path
          d="M10 4.5 15.5 10 10 15.5 4.5 10Z"
          className="stroke-primary"
          strokeWidth="1.4"
        />
      </svg>
      Bedah Jurnal
    </span>
  )
}

/** "S · hal 3" (or "S · 37%" in an article) when the other person is online, "S · offline" otherwise. The unit travels with their presence. */
export function Presence() {
  const { other, names, otherPresence } = useRoom()
  const online = Boolean(otherPresence)
  return (
    <Badge
      variant="outline"
      className="h-8 gap-1.5 rounded-full px-2.5 font-normal"
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          online ? cn(seatBg[other], "animate-pulse") : "bg-muted-foreground/40"
        )}
      />
      <span className="max-w-20 truncate">{names[other]}</span>
      <span className="text-muted-foreground max-sm:hidden">
        ·{" "}
        {online
          ? otherPresence?.page
            ? otherPresence.unit === "percent"
              ? `${otherPresence.page}%`
              : `hal ${otherPresence.page}`
            : "online"
          : "offline"}
      </span>
    </Badge>
  )
}

/**
 * The header: a floating glass bar, like the bottom nav. Pages scroll under it
 * (the room frame keeps `--top-space` clear at the top).
 */
export function TopBar({
  children,
  hidden = false,
}: {
  children: React.ReactNode
  /** slide it away (reading mode) */
  hidden?: boolean
}) {
  return (
    <header
      inert={hidden}
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-30 px-3 pt-[calc(env(safe-area-inset-top)+8px)] transition-[translate,opacity] duration-300 ease-out",
        hidden && "-translate-y-[120%] opacity-0"
      )}
    >
      <div
        className={cn(
          "pointer-events-auto mx-auto flex h-12 max-w-3xl items-center gap-1.5 rounded-full pr-1.5 pl-3",
          glass
        )}
      >
        {children}
      </div>
    </header>
  )
}
