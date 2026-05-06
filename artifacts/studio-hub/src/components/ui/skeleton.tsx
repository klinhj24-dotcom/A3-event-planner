import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-primary/10", className)}
      {...props}
    />
  )
}

function SkeletonTableRow({ cols = 4 }: { cols?: number }) {
  return (
    <tr className="border-b border-border/30">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className="h-4 w-full max-w-[180px]" />
        </td>
      ))}
    </tr>
  )
}

function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonTableRow key={i} cols={cols} />
      ))}
    </>
  )
}

function SkeletonStatCard() {
  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5 space-y-2">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-20" />
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-full" />
        <div className="space-y-1.5 flex-1">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
    </div>
  )
}

function SkeletonForm({ fields = 4 }: { fields?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
      ))}
      <Skeleton className="h-9 w-24 rounded-md mt-2" />
    </div>
  )
}

function SkeletonListItem() {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-border/40">
      <Skeleton className="h-8 w-8 rounded-md flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-2/5" />
        <Skeleton className="h-3 w-3/5" />
      </div>
      <Skeleton className="h-7 w-16 rounded-md" />
    </div>
  )
}

function SkeletonList({ rows = 6 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonListItem key={i} />
      ))}
    </>
  )
}

export {
  Skeleton,
  SkeletonTable,
  SkeletonTableRow,
  SkeletonStatCard,
  SkeletonCard,
  SkeletonForm,
  SkeletonList,
  SkeletonListItem,
}
