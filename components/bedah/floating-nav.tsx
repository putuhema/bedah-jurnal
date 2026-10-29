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
  ChevronDownIcon,
  LibraryBigIcon,
  MessagesSquareIcon,
  type LucideIcon,
} from "lucide-react"

import { useRoom } from "@/components/bedah/room-context"
import { useNavCollapsed } from "@/hooks/use-nav-collapsed"
import { cn } from "@/lib/utils"

type TabId = "rak" | "ruang" | "ngobrol" | "kamus"
type Tab = { id: TabId; label: string; href: string | null; icon: LucideIcon }

const spring: Transition = { type: "spring", stiffness: 520, damping: 40 }

/** Frosted glass, shared by the nav and the reader's floating buttons. */
export const glass =
  "border border-white/70 bg-white/60 shadow-[0_10px_30px_rgb(0_0_0/0.12),inset_0_1px_0_rgb(255_255_255/0.8)] backdrop-blur-xl backdrop-saturate-150"

export function activeTab(pathname: string): TabId {
  if (pathname.endsWith("/kamus")) return "kamus"
  if (pathname.endsWith("/ngobrol")) return "ngobrol"
  if (pathname.includes("/e/")) return "ruang"
  return "rak"
}

/**
 * The floating bottom nav. The chevron folds it into one small button in the
 * corner so the page gets more room; tapping that button opens it again.
 */
export function FloatingNav() {
  const { secret, currentEdition, talkUnlocked } = useRoom()
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useNavCollapsed()
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
  const ActiveIcon = tabs.find((t) => t.id === active)?.icon ?? LibraryBigIcon

  return (
    <MotionConfig reducedMotion="user" transition={spring}>
      <div
        className={cn(
          "pointer-events-none fixed inset-x-0 bottom-0 z-40 flex px-3 pb-[calc(env(safe-area-inset-bottom)+12px)]",
          collapsed ? "justify-start" : "justify-center"
        )}
      >
        <LayoutGroup>
          <motion.nav
            layout
            aria-label="Navigasi"
            style={{ borderRadius: 999 }}
            className={cn("pointer-events-auto flex items-center p-1", glass)}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {collapsed ? (
                <motion.button
                  key="open"
                  type="button"
                  onClick={() => setCollapsed(false)}
                  aria-label="Buka navigasi"
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  whileTap={{ scale: 0.9 }}
                  className="grid size-11 place-items-center rounded-full text-foreground"
                >
                  <ActiveIcon className="size-5" />
                </motion.button>
              ) : (
                <motion.div
                  key="tabs"
                  className="flex items-center"
                  initial={{ opacity: 0, filter: "blur(4px)" }}
                  animate={{ opacity: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, filter: "blur(4px)" }}
                >
                  <AnimatePresence initial={false}>
                    {tabs.map((tab) => (
                      <NavItem
                        key={tab.id}
                        tab={tab}
                        active={active === tab.id}
                      />
                    ))}
                  </AnimatePresence>
                  <motion.button
                    layout="position"
                    type="button"
                    onClick={() => setCollapsed(true)}
                    aria-label="Lipat navigasi"
                    whileTap={{ scale: 0.85 }}
                    className="ml-0.5 grid size-9 place-items-center rounded-full text-muted-foreground hover:text-foreground"
                  >
                    <ChevronDownIcon className="size-4" />
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.nav>
        </LayoutGroup>
      </div>
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
    "relative flex h-12 w-[66px] flex-col items-center justify-center gap-1 rounded-full transition-colors",
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

/** Puts the nav's height in `--nav-space`, so pages can keep their last bit clear of it. */
export function RoomShell({ children }: { children: React.ReactNode }) {
  const [collapsed] = useNavCollapsed()
  const pathname = usePathname()
  // the reader scrolls inside its own area and pads itself
  const ownScroll = activeTab(pathname) === "ruang"
  return (
    <div
      className="flex h-dvh flex-col"
      style={
        {
          "--nav-space": `calc(env(safe-area-inset-bottom) + ${collapsed ? 68 : 76}px)`,
        } as React.CSSProperties
      }
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {children}
        {!ownScroll && <div aria-hidden className="h-(--nav-space) shrink-0" />}
      </div>
      <FloatingNav />
    </div>
  )
}
