import { Skeleton } from "@/components/ui/skeleton";

export function TabContentSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-4 p-4" data-testid="tab-content-skeleton">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CommentsTabSkeleton() {
  return (
    <div className="space-y-4 p-4" data-testid="comments-tab-skeleton">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="h-8 w-8 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-16 w-full rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SubtasksTabSkeleton() {
  return (
    <div className="space-y-3 p-4" data-testid="subtasks-tab-skeleton">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-8 w-24" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-2 border rounded-md">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-6 w-16 rounded-full ml-auto" />
        </div>
      ))}
    </div>
  );
}

export function ActivityTabSkeleton() {
  return (
    <div className="space-y-3 p-4" data-testid="activity-tab-skeleton">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3">
          <Skeleton className="h-6 w-6 rounded-full shrink-0" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TimeEntriesTabSkeleton() {
  return (
    <div className="space-y-3 p-4" data-testid="time-entries-tab-skeleton">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-24" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-3 border rounded-md">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-12" />
        </div>
      ))}
    </div>
  );
}

export function AttachmentsTabSkeleton() {
  return (
    <div className="space-y-4 p-4" data-testid="attachments-tab-skeleton">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border rounded-lg p-3 space-y-2">
            <Skeleton className="h-20 w-full rounded" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
