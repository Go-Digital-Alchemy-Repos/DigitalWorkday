import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { CheckCircle2, CheckSquare, ChevronRight, ClipboardCheck, Eye, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout";

export interface DashboardReviewQueueItem {
  id: string;
  type: "task" | "subtask";
  title: string;
  status: string;
  projectId: string | null;
  projectName: string | null;
  clientId: string | null;
  clientName: string | null;
  taskId: string;
  taskTitle: string;
  priority: string | null;
  dueDate: string | null;
  estimateMinutes: number | null;
  submittedAt: string | null;
  updatedAt: string | null;
  approvedAt?: string | null;
  approverName?: string | null;
  assignees: Array<{
    id: string;
    name: string;
    email: string | null;
  }>;
}

export interface DashboardReviewQueueResponse {
  items: DashboardReviewQueueItem[];
  clearedItems: DashboardReviewQueueItem[];
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  low: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};

interface ReviewQueueCardProps {
  enabled?: boolean;
  onOpenItem: (item: DashboardReviewQueueItem) => void;
  onApproveItem: (item: DashboardReviewQueueItem) => void;
  approvingItemKey?: string | null;
}

function formatTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return formatDistanceToNow(new Date(value), { addSuffix: true });
  } catch {
    return null;
  }
}

function QueueRow({
  item,
  mode,
  onOpen,
  onApprove,
  isApproving,
}: {
  item: DashboardReviewQueueItem;
  mode: "pending" | "cleared";
  onOpen: () => void;
  onApprove?: () => void;
  isApproving?: boolean;
}) {
  const timestamp = mode === "pending" ? item.submittedAt : item.approvedAt ?? item.updatedAt;
  const relativeTime = formatTimestamp(timestamp);
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className="rounded-lg border bg-background/70 p-3 cursor-pointer transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      data-testid={`review-queue-row-${mode}-${item.type}-${item.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate">{item.title}</span>
            <Badge variant="outline">{item.type === "task" ? "Task" : "Subtask"}</Badge>
            {item.priority && (
              <Badge
                variant="secondary"
                className={`text-[10px] px-1.5 py-0 ${PRIORITY_COLORS[item.priority] || ""}`}
              >
                {item.priority}
              </Badge>
            )}
          </div>
          {item.type === "subtask" && (
            <p className="mt-1 text-xs text-muted-foreground">
              Parent task: {item.taskTitle}
            </p>
          )}
          <div className="mt-2 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
            {item.projectName && <span>{item.projectName}</span>}
            {item.clientName && <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">{item.clientName}</Badge>}
            {relativeTime && <span>{relativeTime}</span>}
            {mode === "pending" && item.assignees.length > 0 && (
              <span>
                Assigned to {item.assignees.map((assignee) => assignee.name).join(", ")}
              </span>
            )}
            {mode === "cleared" && item.approverName && (
              <span>Approved by {item.approverName}</span>
            )}
          </div>
          {timestamp && mode === "cleared" && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Awaiting time entry and final closure since {format(new Date(timestamp), "MMM d, yyyy")}
            </p>
          )}
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground mt-1" />
      </div>
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
        >
          <Eye className="mr-2 h-4 w-4" />
          Open
        </Button>
        {mode === "pending" && onApprove && (
          <Button
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              onApprove();
            }}
            disabled={isApproving}
          >
            {isApproving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckSquare className="mr-2 h-4 w-4" />
            )}
            Approve Review
          </Button>
        )}
      </div>
    </div>
  );
}

export function ReviewQueueCard({
  enabled = true,
  onOpenItem,
  onApproveItem,
  approvingItemKey,
}: ReviewQueueCardProps) {
  const { data, isLoading, isError, error, refetch } = useQuery<DashboardReviewQueueResponse>({
    queryKey: ["/api/dashboard/review-queue"],
    enabled,
    staleTime: 15000,
    refetchOnWindowFocus: true,
  });

  if (!enabled) return null;

  if (isLoading) {
    return (
      <Card className="mb-6" data-testid="pm-review-queue-loading">
        <CardHeader className="pb-3">
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="mb-6 border-destructive/30" data-testid="pm-review-queue-error">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-destructive" />
            <CardTitle className="text-lg">Review Workflow</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            The review queue failed to load, so this card may appear empty until the request succeeds.
          </p>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load review queue"}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const items = data?.items ?? [];
  const clearedItems = data?.clearedItems ?? [];

  return (
    <Card className="mb-6" data-testid="pm-review-queue">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Review Workflow</CardTitle>
          <Badge variant="secondary" className="ml-auto">
            {items.length} pending
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Review submitted work, approve it, and return it to the assignee for time entry and final closure.
        </p>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">Sent for Review</h3>
          </div>
          {items.length === 0 ? (
            <EmptyState
              icon={<ClipboardCheck className="h-8 w-8" />}
              title="No items waiting for review"
              description="Tasks and subtasks sent for review will appear here."
            />
          ) : (
            <div className="space-y-3">
              {items.map((item) => {
                const itemKey = `${item.type}-${item.id}`;
                return (
                  <QueueRow
                    key={itemKey}
                    item={item}
                    mode="pending"
                    onOpen={() => onOpenItem(item)}
                    onApprove={() => onApproveItem(item)}
                    isApproving={approvingItemKey === itemKey}
                  />
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            <h3 className="font-semibold">Approved, Awaiting Closure</h3>
          </div>
          {clearedItems.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="h-8 w-8" />}
              title="No recently approved items"
              description="Once a PM approves review, items waiting on time entry and closure will show here."
            />
          ) : (
            <div className="space-y-3">
              {clearedItems.map((item) => (
                <QueueRow
                  key={`cleared-${item.type}-${item.id}`}
                  item={item}
                  mode="cleared"
                  onOpen={() => onOpenItem(item)}
                />
              ))}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
