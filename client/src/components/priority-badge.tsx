import { AlertTriangle, ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PRIORITY_CLASSES, type PriorityLevel } from "@/design/tokens";

type Priority = "low" | "medium" | "high" | "urgent";

const priorityToLevel: Record<Priority, PriorityLevel> = {
  low: "low",
  medium: "medium",
  high: "high",
  urgent: "urgent",
};

const priorityConfig: Record<Priority, { icon: React.ElementType; label: string }> = {
  low: { icon: ArrowDown, label: "Low" },
  medium: { icon: ArrowRight, label: "Medium" },
  high: { icon: ArrowUp, label: "High" },
  urgent: { icon: AlertTriangle, label: "Urgent" },
};

interface PriorityBadgeProps {
  priority: Priority;
  showLabel?: boolean;
  size?: "sm" | "default";
}

export function PriorityBadge({ priority, showLabel = true, size = "default" }: PriorityBadgeProps) {
  const config = priorityConfig[priority];
  const Icon = config.icon;

  return (
    <Badge
      variant="secondary"
      className={cn(
        "gap-1 border-0 font-normal",
        PRIORITY_CLASSES[priorityToLevel[priority]],
        size === "sm" && "px-1.5 py-0 text-[10px]"
      )}
      data-testid={`badge-priority-${priority}`}
    >
      <Icon className={cn("h-3 w-3", size === "sm" && "h-2.5 w-2.5")} />
      {showLabel && <span>{config.label}</span>}
    </Badge>
  );
}
