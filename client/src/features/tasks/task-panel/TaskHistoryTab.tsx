import { History } from "lucide-react";
import { ActivityFeed } from "@/components/activity-feed";

interface TaskHistoryTabProps {
  entityType: "task" | "subtask";
  entityId: string;
  enabled?: boolean;
}

export function TaskHistoryTab({ entityType, entityId, enabled = true }: TaskHistoryTabProps) {
  if (!enabled || !entityId) {
    return null;
  }

  const apiEndpoint = `/api/activity-log/${entityType}/${entityId}/rich`;

  const emptyTitle = entityType === "task" ? "No task history yet" : "No subtask history yet";
  const emptyDescription =
    entityType === "task"
      ? "Task activity will appear here as changes are made"
      : "Subtask activity will appear here as changes are made";

  return (
    <div className="border rounded-lg overflow-hidden" data-testid={`${entityType}-history-tab`}>
      <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
        <History className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">
          {entityType === "task" ? "Task History" : "Subtask History"}
        </span>
      </div>
      <ActivityFeed
        entityType={entityType}
        entityId={entityId}
        apiEndpoint={apiEndpoint}
        height="260px"
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        showFilters={false}
        showDateFilter={false}
      />
    </div>
  );
}
