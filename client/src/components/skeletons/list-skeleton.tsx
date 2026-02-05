import { Skeleton } from "@/components/ui/skeleton";

export function TaskListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-1" data-testid="task-list-skeleton">
      {Array.from({ length: rows }).map((_, i) => (
        <div 
          key={i} 
          className="grid items-center gap-3 px-4 py-3 min-h-[52px] border-b border-border grid-cols-[auto_1fr_auto_auto_auto]"
        >
          <Skeleton className="h-5 w-5 rounded" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-3/4" />
            <div className="flex gap-1">
              <Skeleton className="h-4 w-12 rounded-full" />
              <Skeleton className="h-4 w-16 rounded-full" />
            </div>
          </div>
          <Skeleton className="h-6 w-6 rounded-full" />
          <Skeleton className="h-5 w-16 rounded" />
          <Skeleton className="h-5 w-5 rounded" />
        </div>
      ))}
    </div>
  );
}

export function ProjectListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2" data-testid="project-list-skeleton">
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 px-4 py-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-12" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div 
          key={i} 
          className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 px-4 py-3 border rounded-lg items-center"
        >
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-2 w-24 rounded-full" />
          <Skeleton className="h-6 w-6 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function ClientListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="client-list-skeleton">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="border rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="space-y-1.5 flex-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <Skeleton className="h-5 w-20 rounded-full" />
          <div className="flex justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CalendarSkeleton() {
  return (
    <div className="space-y-4" data-testid="calendar-skeleton">
      <div className="flex items-center justify-between px-4">
        <Skeleton className="h-8 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-8 w-24 rounded" />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px bg-border border rounded-lg overflow-hidden">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="bg-background p-2 text-center">
            <Skeleton className="h-4 w-8 mx-auto" />
          </div>
        ))}
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="bg-background p-2 min-h-[100px]">
            <Skeleton className="h-4 w-4 mb-2" />
            {i % 5 === 0 && <Skeleton className="h-5 w-full rounded mb-1" />}
            {i % 7 === 0 && <Skeleton className="h-5 w-full rounded" />}
          </div>
        ))}
      </div>
    </div>
  );
}
