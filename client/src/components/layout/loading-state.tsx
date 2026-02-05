import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface LoadingStateProps {
  type?: "page" | "card" | "table" | "list" | "detail";
  rows?: number;
  className?: string;
}

function PageLoadingSkeleton() {
  return (
    <div className="space-y-6" data-testid="loading-state-page">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-10 w-full" />
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function CardLoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="loading-state-card">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="border rounded-lg p-4 space-y-3">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
    </div>
  );
}

function TableLoadingSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" data-testid="loading-state-table">
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

function ListLoadingSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3" data-testid="loading-state-list">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

function DetailLoadingSkeleton() {
  return (
    <div className="space-y-6" data-testid="loading-state-detail">
      <div className="space-y-2">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <Skeleton className="h-10 w-full" />
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}

export function LoadingState({ type = "list", rows = 5, className }: LoadingStateProps) {
  return (
    <div className={cn("animate-in fade-in-50", className)}>
      {type === "page" && <PageLoadingSkeleton />}
      {type === "card" && <CardLoadingSkeleton rows={rows} />}
      {type === "table" && <TableLoadingSkeleton rows={rows} />}
      {type === "list" && <ListLoadingSkeleton rows={rows} />}
      {type === "detail" && <DetailLoadingSkeleton />}
    </div>
  );
}
