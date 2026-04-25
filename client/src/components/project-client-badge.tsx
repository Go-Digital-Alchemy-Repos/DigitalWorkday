import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ProjectClientBadgeProps {
  clientName?: string | null;
  className?: string;
  maxLength?: number;
  testId?: string;
}

function truncateClientName(clientName: string, maxLength: number) {
  return clientName.length > maxLength
    ? `${clientName.slice(0, Math.max(1, maxLength - 1))}\u2026`
    : clientName;
}

export function ProjectClientBadge({
  clientName,
  className,
  maxLength = 12,
  testId,
}: ProjectClientBadgeProps) {
  const normalizedName = clientName?.trim();

  if (!normalizedName) {
    return null;
  }

  return (
    <Badge
      variant="secondary"
      className={cn(
        "h-5 max-w-full rounded-full px-2 py-0 text-[10px] font-medium tracking-[0.01em]",
        className,
      )}
      data-testid={testId}
    >
      {truncateClientName(normalizedName, maxLength)}
    </Badge>
  );
}
