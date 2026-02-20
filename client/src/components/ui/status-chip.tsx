import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Circle } from "lucide-react"

type StatusConfig = {
  bg: string;
  border: string;
  text: string;
};

const STATUS_MAP: Record<string, StatusConfig> = {
  lead: {
    bg: "bg-blue-50 dark:bg-blue-950/40",
    border: "border-blue-200 dark:border-blue-800/60",
    text: "text-blue-700 dark:text-blue-300",
  },
  prospect: {
    bg: "bg-violet-50 dark:bg-violet-950/40",
    border: "border-violet-200 dark:border-violet-800/60",
    text: "text-violet-700 dark:text-violet-300",
  },
  active: {
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    border: "border-emerald-200 dark:border-emerald-800/60",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  won: {
    bg: "bg-green-50 dark:bg-green-950/40",
    border: "border-green-200 dark:border-green-800/60",
    text: "text-green-700 dark:text-green-300",
  },
  lost: {
    bg: "bg-red-50 dark:bg-red-950/40",
    border: "border-red-200 dark:border-red-800/60",
    text: "text-red-700 dark:text-red-300",
  },
  paused: {
    bg: "bg-amber-50 dark:bg-amber-950/40",
    border: "border-amber-200 dark:border-amber-800/60",
    text: "text-amber-700 dark:text-amber-300",
  },
  archived: {
    bg: "bg-gray-50 dark:bg-gray-800/40",
    border: "border-gray-200 dark:border-gray-700/60",
    text: "text-gray-600 dark:text-gray-400",
  },
  pending: {
    bg: "bg-orange-50 dark:bg-orange-950/40",
    border: "border-orange-200 dark:border-orange-800/60",
    text: "text-orange-700 dark:text-orange-300",
  },
  "in-progress": {
    bg: "bg-sky-50 dark:bg-sky-950/40",
    border: "border-sky-200 dark:border-sky-800/60",
    text: "text-sky-700 dark:text-sky-300",
  },
  completed: {
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    border: "border-emerald-200 dark:border-emerald-800/60",
    text: "text-emerald-700 dark:text-emerald-300",
  },
};

const DEFAULT_CONFIG: StatusConfig = {
  bg: "bg-gray-50 dark:bg-gray-800/40",
  border: "border-gray-200 dark:border-gray-700/60",
  text: "text-gray-600 dark:text-gray-400",
};

interface StatusChipProps {
  status: string;
  size?: "sm" | "default";
  showDot?: boolean;
  className?: string;
}

export function StatusChip({
  status,
  size = "default",
  showDot = true,
  className,
}: StatusChipProps) {
  const key = status.toLowerCase().replace(/[\s_]+/g, "-");
  const config = STATUS_MAP[key] || DEFAULT_CONFIG;

  return (
    <Badge
      variant="outline"
      className={cn(
        "no-default-hover-elevate rounded-full font-medium",
        config.bg,
        config.border,
        config.text,
        size === "sm" ? "px-2 py-0 text-[10px]" : "px-2.5 py-0.5 text-xs",
        className
      )}
      data-testid={`status-chip-${key}`}
    >
      {showDot && (
        <Circle
          className={cn(
            "fill-current",
            size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2"
          )}
        />
      )}
      {status}
    </Badge>
  );
}
