import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export type SkeletonVariant = 
  | "card" 
  | "list" 
  | "table" 
  | "metric" 
  | "detail"
  | "chat"
  | "drawer"
  | "dashboard"
  | "kanban"
  | "task-row"
  | "project-row"
  | "client-card";

interface LoadingSkeletonProps {
  variant?: SkeletonVariant;
  count?: number;
  className?: string;
  columns?: number;
}

export function LoadingSkeleton({ 
  variant = "card", 
  count = 1, 
  className,
  columns,
}: LoadingSkeletonProps) {
  const items = Array.from({ length: count }, (_, i) => i);

  if (variant === "metric") {
    return (
      <div className={cn("grid gap-4 md:grid-cols-2 lg:grid-cols-4", className)}>
        {items.map((i) => (
          <div key={i} className="rounded-xl border bg-card p-6">
            <Skeleton className="h-4 w-24 mb-3" />
            <Skeleton className="h-8 w-16 mb-2" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "list") {
    return (
      <div className={cn("space-y-3", className)}>
        {items.map((i) => (
          <div key={i} className="flex items-center gap-4 p-4 rounded-lg border">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "table") {
    return (
      <div className={cn("rounded-lg border", className)}>
        <div className="p-4 border-b">
          <div className="flex gap-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>
        {items.map((i) => (
          <div key={i} className="p-4 border-b last:border-0">
            <div className="flex gap-4 items-center">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === "detail" || variant === "drawer") {
    return (
      <div className={cn("space-y-6", className)}>
        <div className="flex items-start gap-4">
          <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
        <div className="grid gap-4 grid-cols-2">
          <div className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-9 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-9 w-full" />
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  if (variant === "chat") {
    return (
      <div className={cn("space-y-4 p-4", className)}>
        {items.map((i) => (
          <div 
            key={i} 
            className={cn(
              "flex gap-3",
              i % 2 === 0 ? "flex-row" : "flex-row-reverse"
            )}
          >
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <div className={cn(
              "space-y-1.5 max-w-[70%]",
              i % 2 === 0 ? "items-start" : "items-end"
            )}>
              <div className="flex items-center gap-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-12" />
              </div>
              <Skeleton 
                className={cn(
                  "h-16 rounded-lg",
                  i % 3 === 0 ? "w-64" : i % 3 === 1 ? "w-48" : "w-56"
                )} 
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === "dashboard") {
    return (
      <div className={cn("space-y-6", className)}>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border bg-card p-6">
              <Skeleton className="h-4 w-24 mb-3" />
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border bg-card p-6">
            <Skeleton className="h-5 w-32 mb-4" />
            <Skeleton className="h-[200px] w-full" />
          </div>
          <div className="rounded-xl border bg-card p-6">
            <Skeleton className="h-5 w-32 mb-4" />
            <Skeleton className="h-[200px] w-full" />
          </div>
        </div>
        <div className="rounded-xl border bg-card p-6">
          <Skeleton className="h-5 w-40 mb-4" />
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (variant === "kanban") {
    const cols = columns || 4;
    return (
      <div className={cn("flex gap-4 overflow-x-auto pb-4", className)}>
        {Array.from({ length: cols }).map((_, col) => (
          <div key={col} className="w-72 shrink-0 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-5 rounded" />
            </div>
            {Array.from({ length: Math.floor(count / cols) + (col < count % cols ? 1 : 0) }).map((_, card) => (
              <div key={card} className="rounded-lg border bg-card p-3 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-3/4" />
                <div className="flex items-center justify-between pt-2">
                  <div className="flex gap-1">
                    <Skeleton className="h-5 w-12 rounded-full" />
                    <Skeleton className="h-5 w-12 rounded-full" />
                  </div>
                  <Skeleton className="h-6 w-6 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (variant === "task-row") {
    return (
      <div className={cn("space-y-1", className)}>
        {items.map((i) => (
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

  if (variant === "project-row") {
    return (
      <div className={cn("space-y-2", className)}>
        {items.map((i) => (
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

  if (variant === "client-card") {
    return (
      <div className={cn("grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4", className)}>
        {items.map((i) => (
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

  return (
    <div className={cn("grid gap-4 md:grid-cols-2 lg:grid-cols-3", className)}>
      {items.map((i) => (
        <div key={i} className="rounded-xl border bg-card p-6">
          <div className="flex items-center gap-4 mb-4">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}

export function ChatMessageSkeleton({ count = 5 }: { count?: number }) {
  return <LoadingSkeleton variant="chat" count={count} />;
}

export function DashboardSkeleton() {
  return <LoadingSkeleton variant="dashboard" />;
}

export function TaskListSkeleton({ rows = 8 }: { rows?: number }) {
  return <LoadingSkeleton variant="task-row" count={rows} />;
}

export function ProjectListSkeleton({ rows = 6 }: { rows?: number }) {
  return <LoadingSkeleton variant="project-row" count={rows} />;
}

export function ClientListSkeleton({ count = 6 }: { count?: number }) {
  return <LoadingSkeleton variant="client-card" count={count} />;
}

export function DrawerSkeleton() {
  return <LoadingSkeleton variant="drawer" />;
}

export function KanbanSkeleton({ columns = 4, cardsPerColumn = 3 }: { columns?: number; cardsPerColumn?: number }) {
  return <LoadingSkeleton variant="kanban" columns={columns} count={columns * cardsPerColumn} />;
}
