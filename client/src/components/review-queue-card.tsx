import { useQuery } from "@tanstack/react-query";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
import { formatDistanceToNow } from "date-fns";
import { ClipboardCheck, ChevronRight } from "lucide-react";
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

interface ReviewQueueResponse {
  items: ReviewQueueItem[];
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

  if (!data?.items?.length) return null;

  const items = data.items.slice(0, 10);
  const hasMore = data.items.length > 10;

  return (
    <Card data-testid="card-review-queue" className="border-yellow-200 dark:border-yellow-800">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
          <CardTitle className="text-lg">Tasks Pending Review</CardTitle>
          <Badge
            variant="secondary"
            className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 ml-auto"
            data-testid="badge-review-count"
          >
            {data.items.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-1">
          {items.map((item) => (
            <button
              key={item.taskId}
              onClick={() => onTaskClick(item.taskId)}
              className="w-full text-left flex items-center gap-3 p-2.5 rounded-md hover:bg-muted/50 transition-colors group"
              data-testid={`review-queue-item-${item.taskId}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{item.title}</span>
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
                  {item.pmReviewRequestedAt && (
                    <>
                      <span>·</span>
                      <span>{formatDistanceToNow(new Date(item.pmReviewRequestedAt), { addSuffix: true })}</span>
                    </>
                  )}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </button>
          ))}
        </div>
        {hasMore && (
          <div className="text-center pt-2">
            <span className="text-xs text-muted-foreground">
              Showing 10 of {data.items.length} tasks
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
