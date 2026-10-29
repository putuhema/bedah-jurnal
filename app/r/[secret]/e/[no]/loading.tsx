import { TopBar } from "@/components/bedah/bits"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar>
        <Skeleton className="h-4 w-24" />
        <span className="flex-1" />
        <Skeleton className="h-6 w-20" />
      </TopBar>
      <div className="flex min-h-0 flex-1 flex-col items-center gap-3 overflow-hidden pt-[calc(var(--top-space)+0.75rem)] sm:px-4">
        <Skeleton className="aspect-[1/1.294] w-full max-w-[880px] rounded-none" />
      </div>
    </div>
  )
}
