import { Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DUE_DATE_CLASSES, type DueDateUrgency } from "@/design/tokens";
import { format, isToday, isTomorrow, isPast, isThisWeek } from "date-fns";

interface DueDateBadgeProps {
  date: Date | string | null;
  size?: "sm" | "default";
}

function getUrgency(dateObj: Date): { label: string; urgency: DueDateUrgency } {
  if (isPast(dateObj) && !isToday(dateObj)) {
    return { label: format(dateObj, "MMM d"), urgency: "overdue" };
  }
  if (isToday(dateObj)) {
    return { label: "Today", urgency: "today" };
  }
  if (isTomorrow(dateObj)) {
    return { label: "Tomorrow", urgency: "tomorrow" };
  }
  if (isThisWeek(dateObj, { weekStartsOn: 1 })) {
    return { label: format(dateObj, "EEEE"), urgency: "upcoming" };
  }
  return { label: format(dateObj, "MMM d"), urgency: "none" };
}

export function DueDateBadge({ date, size = "default" }: DueDateBadgeProps) {
  if (!date) return null;

  const dateObj = typeof date === "string" ? new Date(date) : date;
  const { label, urgency } = getUrgency(dateObj);

  return (
    <Badge
      variant="secondary"
      className={cn(
        "gap-1 border-0 font-normal",
        DUE_DATE_CLASSES[urgency],
        size === "sm" && "px-1.5 py-0 text-[10px]"
      )}
      data-testid="badge-due-date"
    >
      <Calendar className={cn("h-3 w-3", size === "sm" && "h-2.5 w-2.5")} />
      <span>{label}</span>
    </Badge>
  );
}
