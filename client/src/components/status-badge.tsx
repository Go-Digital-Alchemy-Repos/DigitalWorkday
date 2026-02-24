import { Circle, Clock, AlertCircle, CheckCircle2, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_CLASSES, type TaskStatus } from "@/design/tokens";

type Status = "todo" | "in_progress" | "in_review" | "blocked" | "done" | "completed";

const statusToTaskStatus: Record<Status, TaskStatus> = {
  todo: "todo",
  in_progress: "in_progress",
  in_review: "in_review",
  blocked: "blocked",
  done: "done",
  completed: "completed",
};

const statusConfig: Record<Status, { icon: React.ElementType; label: string }> = {
  todo: { icon: Circle, label: "To Do" },
  in_progress: { icon: Clock, label: "In Progress" },
  in_review: { icon: Eye, label: "In Review" },
  blocked: { icon: AlertCircle, label: "Blocked" },
  done: { icon: CheckCircle2, label: "Done" },
  completed: { icon: CheckCircle2, label: "Completed" },
};

interface StatusBadgeProps {
  status: Status;
  showLabel?: boolean;
  size?: "sm" | "default";
}

export function StatusBadge({ status, showLabel = true, size = "default" }: StatusBadgeProps) {
  const config = statusConfig[status] ?? statusConfig.todo;
  const Icon = config.icon;

  return (
    <Badge
      variant="secondary"
      className={cn(
        "gap-1 border-0 font-normal",
        STATUS_CLASSES[statusToTaskStatus[status]],
        size === "sm" && "px-1.5 py-0 text-[10px]"
      )}
      data-testid={`badge-status-${status}`}
    >
      <Icon className={cn("h-3 w-3", size === "sm" && "h-2.5 w-2.5")} />
      {showLabel && <span>{config.label}</span>}
    </Badge>
  );
}
