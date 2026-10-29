"use client"

import * as React from "react"
import Link from "next/link"
import { BookOpenIcon, SearchIcon, SparklesIcon } from "lucide-react"

import { useRoom } from "@/components/bedah/room-context"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { seatText } from "@/lib/seat-style"
import type { KamusEntry } from "@/lib/types"
import { cn } from "@/lib/utils"

/** "Kamus kita": everything that puzzled you, and what it turned out to mean. */
export function KamusList({ entries }: { entries: KamusEntry[] }) {
  const { secret, names, setLocation } = useRoom()
  const [query, setQuery] = React.useState("")
  const [sort, setSort] = React.useState<"new" | "az">("new")

  React.useEffect(() => setLocation(null, null), [setLocation])

  const shown = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? entries.filter((e) =>
          [
            e.quote,
            e.meaning ?? "",
            e.editionTitle,
            ...e.notes.map((n) => n.text),
          ]
            .join(" ")
            .toLowerCase()
            .includes(q)
        )
      : entries
    return sort === "az"
      ? [...filtered].sort((a, b) => a.quote.localeCompare(b.quote, "id"))
      : filtered
  }, [entries, query, sort])

  if (entries.length === 0) {
    return (
      <Empty className="flex-1">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BookOpenIcon />
          </EmptyMedia>
          <EmptyTitle className="font-serif text-2xl font-light text-primary italic">
            Kamus masih kosong
          </EmptyTitle>
          <EmptyDescription>
            Cap kalimat yang bikin bingung dengan{" "}
            <span className="font-mono">[hah?]</span>, atau tanya AI{" "}
            <span className="font-mono">artinya apa?</span>. Semuanya terkumpul
            di sini.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-5">
      <div className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground">
          {entries.length} hal yang pernah bikin bingung
        </p>
        <h1 className="font-serif text-4xl leading-tight font-light text-primary italic">
          Kamus kita
        </h1>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari kata atau arti…"
            className="pl-8"
            aria-label="Cari di kamus"
          />
        </div>
        <div className="flex text-xs">
          {(["new", "az"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSort(s)}
              className={cn(
                "-mb-px border-b px-2 py-1 transition-colors",
                sort === s
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {s === "new" ? "terbaru" : "A–Z"}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 && (
        <p className="py-8 text-center text-xs text-muted-foreground">
          Nggak ada yang cocok.
        </p>
      )}

      <ul className="flex flex-col" data-slot="kamus">
        {shown.map((entry) => (
          <li
            key={entry.id}
            className="flex flex-col gap-2 border-b border-rail py-4 last:border-b-0"
          >
            <p className="font-serif text-[17px] leading-snug text-foreground">
              {entry.quote}
            </p>
            {entry.meaning ? (
              <details className="group text-[13px] leading-relaxed">
                <summary className="cursor-pointer list-none">
                  <span className="line-clamp-3 group-open:line-clamp-none">
                    <SparklesIcon className="mr-1 inline size-3 text-muted-foreground" />
                    {entry.meaning}
                  </span>
                  <span className="text-[11px] text-muted-foreground group-open:hidden">
                    selengkapnya
                  </span>
                </summary>
              </details>
            ) : (
              <p className="text-xs text-muted-foreground">
                Belum ada artinya. Tanya AI waktu baca, atau bahas pas ngobrol.
              </p>
            )}
            {entry.notes.map((n, i) => (
              <p key={i} className="text-xs">
                <span className={seatText[n.seat]}>{names[n.seat]}:</span>{" "}
                {n.text}
              </p>
            ))}
            <p className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
              {entry.seats.map((s) => (
                <span key={s} className={seatText[s]}>
                  {names[s]}
                </span>
              ))}
              <span>·</span>
              <Link
                href={`/r/${secret}/e/${entry.editionNumber}${entry.editionKind === "pdf" ? `?hal=${entry.page}` : ""}`}
                className="underline-offset-4 hover:text-foreground hover:underline"
              >
                No.{entry.editionNumber} {entry.editionTitle}
                {entry.editionKind === "pdf" ? ` · hal ${entry.page}` : ""}
              </Link>
            </p>
          </li>
        ))}
      </ul>
    </main>
  )
}
