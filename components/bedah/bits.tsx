"use client"

import { cn } from "@/lib/utils"

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
    <Badge variant="outline" className="gap-1.5 font-normal">
      <span
        className={cn(
          "size-1.5 rounded-full",
          online ? cn(seatBg[other], "animate-pulse") : "bg-muted-foreground/40"
        )}
      />
      {names[other]}
      <span className="text-muted-foreground">
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

export function TopBar({ children }: { children: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 flex h-13 items-center gap-2 border-b border-rail bg-card px-4">
      {children}
    </header>
  )
}

/** Dark slate cover with one white outline glyph and corner squares (from the flavor's image prompts). */
export function Cover({
  number,
  className,
}: {
  number: number
  className?: string
}) {
  const glyphs = [
    <path
      key="w"
      d="M2 20 C 10 4, 18 36, 26 20 S 42 4, 50 20 S 60 32, 62 20"
    />,
    <g key="t">
      <path d="M32 2 62 38H2Z" />
      <path d="M32 16 48 34H16Z" />
    </g>,
    <g key="c">
      <circle cx="18" cy="20" r="10" />
      <circle cx="46" cy="20" r="10" />
      <path d="M28 20h8" />
    </g>,
    <g key="b">
      <path d="M22 6 10 20l12 14" />
      <path d="M42 6l12 14-12 14" />
      <path d="M36 4 28 36" />
    </g>,
    <g key="s">
      <rect x="20" y="4" width="24" height="32" rx="1" />
      <path d="M32 10v20M28 10h8M28 30h8" />
    </g>,
  ]
  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-lg bg-shot",
        className
      )}
    >
      <svg
        width="64"
        height="40"
        viewBox="0 0 64 40"
        fill="none"
        stroke="white"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        {glyphs[number % glyphs.length]}
      </svg>
      <i className="absolute top-2 left-2 size-1.5 bg-chart-1" />
      <i className="absolute top-2 right-2 size-1.5 bg-chart-3" />
      <i className="absolute right-2 bottom-2 size-1.5 bg-chart-5" />
      <span className="absolute bottom-1.5 left-2.5 text-[11px] text-white/60">
        No.{number}
      </span>
    </div>
  )
}
