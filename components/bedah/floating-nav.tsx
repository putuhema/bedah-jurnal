"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  MotionConfig,
  type Transition,
} from "motion/react"
import {
  BookAIcon,
  BookOpenTextIcon,
  LibraryBigIcon,
  MessagesSquareIcon,
  type LucideIcon,
} from "lucide-react"

import { useRoom } from "@/components/bedah/room-context"
import { useReadingMode } from "@/hooks/use-reading-mode"
import { cn } from "@/lib/utils"

type TabId = "rak" | "ruang" | "ngobrol" | "kamus"
type Tab = { id: TabId; label: string; href: string | null; icon: LucideIcon }

const spring: Transition = { type: "spring", stiffness: 520, damping: 40 }

/** Frosted glass, shared by the header, the nav and the reader's floating buttons. */
export const glass =
  "border border-white/70 bg-white/60 shadow-[0_10px_30px_rgb(0_0_0/0.12),inset_0_1px_0_rgb(255_255_255/0.8)] backdrop-blur-xl backdrop-saturate-150"

export function activeTab(pathname: string): TabId {
  if (pathname.endsWith("/kamus")) return "kamus"
  if (pathname.endsWith("/ngobrol")) return "ngobrol"
  if (pathname.includes("/e/")) return "ruang"
  return "rak"
}

/** The floating bottom nav. It slides away in reading mode. */
export function FloatingNav() {
  const { secret, currentEdition, talkUnlocked } = useRoom()
  const pathname = usePathname()
  const reading = useReadingMode()
  const base = `/r/${secret}`
  const active = activeTab(pathname)

  const tabs: Tab[] = [
    { id: "rak", label: "Rak", href: base, icon: LibraryBigIcon },
    {
      id: "ruang",
      label: "Ruang",
      href: currentEdition ? `${base}/e/${currentEdition}` : null,
      icon: BookOpenTextIcon,
    },
    // talk time only shows up once you've finished reading
    ...(talkUnlocked || active === "ngobrol"
      ? [
          {
            id: "ngobrol" as const,
            label: "Ngobrol",
            href: currentEdition ? `${base}/e/${currentEdition}/ngobrol` : null,
            icon: MessagesSquareIcon,
          },
        ]
      : []),
    { id: "kamus", label: "Kamus", href: `${base}/kamus`, icon: BookAIcon },
  ]

  return (
    <MotionConfig reducedMotion="user" transition={spring}>
      <motion.div
        initial={false}
        animate={reading ? { y: 120, opacity: 0 } : { y: 0, opacity: 1 }}
        // slid off-screen in reading mode; inert so it can't be tabbed to
        inert={reading}
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+12px)]"
      >
        <LayoutGroup>
          <motion.nav
            layout
            aria-label="Navigasi"
            style={{ borderRadius: 999 }}
            className={cn("pointer-events-auto flex items-center p-1", glass)}
          >
            <AnimatePresence initial={false}>
              {tabs.map((tab) => (
                <NavItem key={tab.id} tab={tab} active={active === tab.id} />
              ))}
            </AnimatePresence>
          </motion.nav>
        </LayoutGroup>
      </motion.div>
    </MotionConfig>
  )
}

function NavItem({ tab, active }: { tab: Tab; active: boolean }) {
  const Icon = tab.icon
  const body = (
    <>
      {active && (
        <motion.span
          layoutId="nav-active"
          className="absolute inset-0 rounded-full bg-foreground/[0.07] shadow-[inset_0_1px_0_rgb(255_255_255/0.6)]"
        />
      )}
      <Icon className="relative size-5" strokeWidth={active ? 2.2 : 1.8} />
      <span className="relative text-[10.5px] leading-none">{tab.label}</span>
    </>
  )
  const className = cn(
    "relative flex h-12 w-[68px] flex-col items-center justify-center gap-1 rounded-full transition-colors",
    active ? "text-foreground" : "text-muted-foreground",
    !tab.href && "opacity-40"
  )

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, width: 0 }}
      animate={{ opacity: 1, width: "auto" }}
      exit={{ opacity: 0, width: 0 }}
      className="overflow-hidden"
    >
      {tab.href ? (
        <motion.div whileTap={{ scale: 0.92 }}>
          <Link
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(className, "hover:text-foreground")}
          >
            {body}
          </Link>
        </motion.div>
      ) : (
        <span className={className} aria-disabled="true">
          {body}
        </span>
      )}
    </motion.div>
  )
}

/**
 * The room frame. The header and nav float over the page; `--top-space` and
 * `--nav-space` say how much room they take, so content can start and end clear of them.
 */
export function RoomShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const reading = useReadingMode()
  // the reader scrolls inside its own area and pads itself
  const ownScroll = activeTab(pathname) === "ruang"
  return (
    <div
      className="flex h-dvh flex-col"
      style={
        {
          "--top-space": `calc(env(safe-area-inset-top) + ${reading ? 56 : 68}px)`,
          "--nav-space": `calc(env(safe-area-inset-bottom) + ${reading ? 12 : 76}px)`,
        } as React.CSSProperties
      }
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {!ownScroll && <div aria-hidden className="h-(--top-space) shrink-0" />}
        {children}
        {!ownScroll && <div aria-hidden className="h-(--nav-space) shrink-0" />}
      </div>
      <FloatingNav />
    </div>
  )
}
