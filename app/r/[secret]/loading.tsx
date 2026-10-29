import { Logo, TopBar } from "@/components/bedah/bits"
import { Skeleton } from "@/components/ui/skeleton"

/** Shown the moment you tap a tab, while the server gets the page ready. */
export default function Loading() {
  return (
    <>
      <TopBar>
        <Logo />
      </TopBar>
      <div className="mx-auto flex w-full max-w-xl flex-col gap-3 px-4 pt-5">
        <Skeleton className="h-30 rounded-lg" />
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-8 w-4/5" />
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-3 h-1 w-full" />
        <Skeleton className="h-1 w-full" />
        <Skeleton className="mt-4 h-9 w-full" />
      </div>
    </>
  )
}
