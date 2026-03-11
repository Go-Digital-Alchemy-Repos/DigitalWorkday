import { useQuery } from "@tanstack/react-query";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
import { formatDistanceToNow } from "date-fns";
import { ClipboardCheck, ChevronRight, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface ReviewQueueItem {
  taskId: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  projectId: string | null;
  projectName: string | null;
  pmReviewRequestedAt: string | null;
  pmReviewRequestedBy: string | null;
  requesterFirstName: string | null;
  requesterLastName: string | null;
}

interface ClearedReviewItem {
  taskId: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  projectId: string | null;
  projectName: string | null;
  pmReviewResolvedAt: string | null;
  requesterFirstName: string | null;
  requesterLastName: string | null;
}

interface ReviewQueueResponse {
  items: ReviewQueueItem[];
  clearedItems: ClearedReviewItem[];
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  low: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};

interface ReviewQueueCardProps {
  onTaskClick: (taskId: string) => void;
}

function TaskRow({
  item,
  timestamp,
  onClick,
  testId,
}: {
  item: { taskId: string; title: string; priority: string; projectName: string | null; requesterFirstName: string | null; requesterLastName: string | null };
  timestamp: string | null;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 p-2.5 rounded-md hover:bg-muted/50 transition-colors group"
      data-testid={testId}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
          <span className="font-medium text-sm truncate shrink">{item.title}</span>
          {item.priority && (
            <Badge
              variant="secondary"
              className={`text-[10px] px-1.5 py-0 shrink-0 ${PRIORITY_COLORS[item.priority] || ""}`}
            >
              {item.priority}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
          {item.projectName && <span className="truncate">{item.projectName}</span>}
          {item.projectName && item.requesterFirstName && <span>·</span>}
          {item.requesterFirstName && (
            <span>by {item.requesterFirstName} {item.requesterLastName || ""}</span>
          )}
          {timestamp && (
            <>
              <span>·</span>
              <span>{formatDistanceToNow(new Date(timestamp), { addSuffix: true })}</span>
            </>
          )}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </button>
  );
}

export function ReviewQueueCard({ onTaskClick }: ReviewQueueCardProps) {
  const { enableTaskReviewQueue } = useFeatureFlags();

  const { data, isLoading } = useQuery<ReviewQueueResponse>({
    queryKey: ["/api/dashboard/review-queue"],
    enabled: enableTaskReviewQueue,
    staleTime: 30000,
  });

  if (!enableTaskReviewQueue) return null;

  if (isLoading) {
    return (
      <Card data-testid="card-review-queue-loading">
        <CardHeader className="pb-3">
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const pendingItems = data?.items ?? [];
  const clearedItems = data?.clearedItems ?? [];

  if (!pendingItems.length && !clearedItems.length) return null;

  const visiblePending = pendingItems.slice(0, 10);
  const visibleCleared = clearedItems.slice(0, 10);
  const hasMorePending = pendingItems.length > 10;
  const hasMoreCleared = clearedItems.length > 10;

  return (
    <Card data-testid="card-review-queue" className="border-yellow-200 dark:border-yellow-800">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
          <CardTitle className="text-lg">Task Review</CardTitle>
          {pendingItems.length > 0 && (
            <Badge
              variant="secondary"
              className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 ml-auto"
              data-testid="badge-review-count"
            >
              {pendingItems.length} pending
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 gap-0 divide-x divide-border">
          <div className="pr-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold text-foreground">Pending Review</span>
            </div>
            <p className="text-[11px] text-muted-foreground mb-2 leading-tight">
              Here are the tasks you've submitted to the PM for review.
            </p>
            {visiblePending.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3 text-center">No tasks pending review</p>
            ) : (
              <div className="space-y-0.5">
                {visiblePending.map((item) => (
                  <TaskRow
                    key={item.taskId}
                    item={item}
                    timestamp={item.pmReviewRequestedAt}
                    onClick={() => onTaskClick(item.taskId)}
                    testId={`review-queue-item-${item.taskId}`}
                  />
                ))}
                {hasMorePending && (
                  <p className="text-xs text-muted-foreground pt-1 text-center">
                    Showing 10 of {pendingItems.length} tasks
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="pl-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
              <span className="text-sm font-semibold text-foreground">Cleared Review</span>
            </div>
            <p className="text-[11px] text-muted-foreground mb-2 leading-tight">
              These tasks have cleared review and are awaiting time entry and closure.
            </p>
            {visibleCleared.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3 text-center">No tasks awaiting closure</p>
            ) : (
              <div className="space-y-0.5">
                {visibleCleared.map((item) => (
                  <TaskRow
                    key={item.taskId}
                    item={item}
                    timestamp={item.pmReviewResolvedAt}
                    onClick={() => onTaskClick(item.taskId)}
                    testId={`cleared-review-item-${item.taskId}`}
                  />
                ))}
                {hasMoreCleared && (
                  <p className="text-xs text-muted-foreground pt-1 text-center">
                    Showing 10 of {clearedItems.length} tasks
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
