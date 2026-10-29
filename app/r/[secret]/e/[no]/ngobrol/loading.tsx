import { TopBar } from "@/components/bedah/bits"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar>
        <Skeleton className="h-4 w-36" />
      </TopBar>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <div className="flex min-h-0 flex-1 justify-center overflow-hidden pt-4 sm:px-4">
          <Skeleton className="aspect-[1/1.294] w-full max-w-[880px] rounded-none" />
        </div>
        <div className="flex h-[45%] flex-col gap-3 border-t border-rail bg-card p-4 lg:h-auto lg:w-[420px] lg:border-t-0 lg:border-l">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
    </div>
  )
}
