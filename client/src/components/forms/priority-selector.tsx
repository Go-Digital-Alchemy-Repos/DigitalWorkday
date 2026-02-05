import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type PriorityLevel = "low" | "medium" | "high" | "urgent";

interface PrioritySelectorProps {
  value: PriorityLevel;
  onChange: (value: PriorityLevel) => void;
  disabled?: boolean;
  error?: boolean;
  className?: string;
  "data-testid"?: string;
}

const priorityConfig: Record<PriorityLevel, { label: string; color: string; bgColor: string }> = {
  low: { 
    label: "Low", 
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-500"
  },
  medium: { 
    label: "Medium", 
    color: "text-yellow-600 dark:text-yellow-400",
    bgColor: "bg-yellow-500"
  },
  high: { 
    label: "High", 
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-500"
  },
  urgent: { 
    label: "Urgent", 
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-500"
  },
};

function PriorityIndicator({ priority }: { priority: PriorityLevel }) {
  const config = priorityConfig[priority];
  return (
    <span className="flex items-center gap-2">
      <span className={cn("h-2 w-2 rounded-full", config.bgColor)} />
      <span className={config.color}>{config.label}</span>
    </span>
  );
}

export function PrioritySelector({
  value,
  onChange,
  disabled = false,
  error = false,
  className,
  "data-testid": testId,
}: PrioritySelectorProps) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as PriorityLevel)} disabled={disabled}>
      <SelectTrigger
        className={cn(
          "w-full",
          error && "border-destructive focus:ring-destructive",
          className
        )}
        data-testid={testId}
      >
        <SelectValue>
          <PriorityIndicator priority={value} />
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(priorityConfig) as PriorityLevel[]).map((priority) => (
          <SelectItem key={priority} value={priority}>
            <PriorityIndicator priority={priority} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
