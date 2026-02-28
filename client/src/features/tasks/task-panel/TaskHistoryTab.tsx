import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getStorageUrl } from "@/lib/storageUrl";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowRight,
  Calendar,
  Flag,
  Layers,
  Clock,
  Type,
  FileText,
  UserPlus,
  Eye,
  Tag,
  Loader2,
  History,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface HistoryChange {
  field: string;
  from: unknown;
  to: unknown;
}

interface HistoryEntry {
  id: string;
  entityType: string;
  entityId: string;
  actorUserId: string | null;
  actionType: string;
  changes: HistoryChange[] | null;
  createdAt: string;
  actorFirstName: string | null;
  actorLastName: string | null;
  actorEmail: string | null;
  actorAvatarUrl: string | null;
  actorName: string | null;
}

interface TaskHistoryTabProps {
  entityType: "task" | "subtask";
  entityId: string;
  enabled?: boolean;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getFieldIcon(field: string) {
  switch (field) {
    case "status": return <Layers className="h-3 w-3" />;
    case "priority": return <Flag className="h-3 w-3" />;
    case "dueDate":
    case "startDate": return <Calendar className="h-3 w-3" />;
    case "estimateMinutes": return <Clock className="h-3 w-3" />;
    case "title": return <Type className="h-3 w-3" />;
    case "description": return <FileText className="h-3 w-3" />;
    case "visibility": return <Eye className="h-3 w-3" />;
    default: return <Layers className="h-3 w-3" />;
  }
}

function getFieldLabel(field: string): string {
  switch (field) {
    case "status": return "Status";
    case "priority": return "Priority";
    case "dueDate": return "Due Date";
    case "startDate": return "Start Date";
    case "estimateMinutes": return "Estimate";
    case "title": return "Title";
    case "description": return "Description";
    case "milestoneId": return "Milestone";
    case "visibility": return "Visibility";
    case "sectionId": return "Section";
    case "completed": return "Completed";
    default: return field;
  }
}

function formatValue(field: string, value: unknown): string {
  if (value === null || value === undefined) return "None";
  if (field === "dueDate" || field === "startDate") {
    try {
      return new Date(value as string).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return String(value);
    }
  }
  if (field === "estimateMinutes") {
    const mins = Number(value);
    if (mins >= 60) {
      return `${Math.floor(mins / 60)}h ${mins % 60}m`;
    }
    return `${mins}m`;
  }
  if (field === "completed") return value ? "Completed" : "Open";
  if (field === "description") return "(changed)";
  if (field === "status") {
    const statusLabels: Record<string, string> = {
      todo: "To Do",
      in_progress: "In Progress",
      blocked: "Blocked",
      review: "Review",
      done: "Done",
      completed: "Completed",
    };
    return statusLabels[String(value)] || String(value);
  }
  if (field === "priority") {
    const priorityLabels: Record<string, string> = {
      low: "Low",
      medium: "Medium",
      high: "High",
      urgent: "Urgent",
    };
    return priorityLabels[String(value)] || String(value);
  }
  return String(value);
}

function getActionLabel(actionType: string): string {
  switch (actionType) {
    case "create": return "created this";
    case "update": return "updated";
    case "status_change": return "changed status";
    case "assignment_change": return "changed assignees";
    case "comment": return "commented";
    case "attachment_add": return "added an attachment";
    case "attachment_remove": return "removed an attachment";
    default: return actionType;
  }
}

export function TaskHistoryTab({ entityType, entityId, enabled = true }: TaskHistoryTabProps) {
  const endpoint = entityType === "task"
    ? `/api/tasks/${entityId}/history`
    : `/api/subtasks/${entityId}/history`;

  const { data: history = [], isLoading } = useQuery<HistoryEntry[]>({
    queryKey: [endpoint],
    enabled: !!entityId && enabled,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <History className="h-8 w-8 mb-2 opacity-40" />
        <p className="text-sm">No history yet</p>
        <p className="text-xs mt-1">Changes to this {entityType} will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-1" data-testid="task-history-timeline">
      {history.map((entry) => {
        const actorDisplayName =
          entry.actorName ||
          [entry.actorFirstName, entry.actorLastName].filter(Boolean).join(" ") ||
          entry.actorEmail ||
          "System";

        return (
          <div
            key={entry.id}
            className="flex gap-3 py-3 px-1 group"
            data-testid={`history-entry-${entry.id}`}
          >
            <div className="shrink-0 pt-0.5">
              <Avatar className="h-7 w-7">
                {entry.actorAvatarUrl && (
                  <AvatarImage
                    src={getStorageUrl(entry.actorAvatarUrl)}
                    alt={actorDisplayName}
                  />
                )}
                <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
                  {getInitials(actorDisplayName)}
                </AvatarFallback>
              </Avatar>
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-sm font-medium">{actorDisplayName}</span>
                <span className="text-xs text-muted-foreground">
                  {getActionLabel(entry.actionType)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                </span>
              </div>
              {entry.changes && Array.isArray(entry.changes) && entry.changes.length > 0 && (
                <div className="space-y-1 mt-1">
                  {entry.changes.map((change: HistoryChange, i: number) => (
                    <div
                      key={i}
                      className="flex items-center gap-1.5 text-xs"
                    >
                      <span className="text-muted-foreground shrink-0">
                        {getFieldIcon(change.field)}
                      </span>
                      <span className="text-muted-foreground font-medium shrink-0">
                        {getFieldLabel(change.field)}:
                      </span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal h-5 max-w-[120px] truncate">
                        {formatValue(change.field, change.from)}
                      </Badge>
                      <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal h-5 max-w-[120px] truncate">
                        {formatValue(change.field, change.to)}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
