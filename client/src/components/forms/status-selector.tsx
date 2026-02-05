import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Circle, Play, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done";

interface StatusSelectorProps {
  value: TaskStatus;
  onChange: (value: TaskStatus) => void;
  disabled?: boolean;
  error?: boolean;
  className?: string;
  "data-testid"?: string;
}

const statusConfig: Record<TaskStatus, { label: string; icon: LucideIcon; color: string }> = {
  todo: { 
    label: "To Do", 
    icon: Circle,
    color: "text-muted-foreground"
  },
  in_progress: { 
    label: "In Progress", 
    icon: Play,
    color: "text-blue-500"
  },
  blocked: { 
    label: "Blocked", 
    icon: AlertTriangle,
    color: "text-amber-500"
  },
  done: { 
    label: "Done", 
    icon: CheckCircle2,
    color: "text-green-500"
  },
};

function StatusIndicator({ status }: { status: TaskStatus }) {
  const config = statusConfig[status];
  const Icon = config.icon;
  return (
    <span className="flex items-center gap-2">
      <Icon className={cn("h-4 w-4", config.color)} />
      <span>{config.label}</span>
    </span>
  );
}

export function StatusSelector({
  value,
  onChange,
  disabled = false,
  error = false,
  className,
  "data-testid": testId,
}: StatusSelectorProps) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as TaskStatus)} disabled={disabled}>
      <SelectTrigger
        className={cn(
          "w-full",
          error && "border-destructive focus:ring-destructive",
          className
        )}
        data-testid={testId}
      >
        <SelectValue>
          <StatusIndicator status={value} />
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(statusConfig) as TaskStatus[]).map((status) => (
          <SelectItem key={status} value={status}>
            <StatusIndicator status={status} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
