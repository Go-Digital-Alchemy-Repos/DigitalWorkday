import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { DataPointHelp } from "@/components/data-point-help";
import { cn } from "@/lib/utils";

export function ExplorableMetric({
  label,
  value,
  detail,
  icon,
  definition,
  tone = "neutral",
  onClick,
}: {
  label: string;
  value: string | number;
  detail?: string;
  icon: ReactNode;
  definition?: string;
  tone?: "neutral" | "danger" | "warning" | "positive";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex min-h-24 w-full items-center gap-3 border bg-background px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        tone === "danger" && "border-destructive/30",
        tone === "warning" && "border-amber-500/30",
        tone === "positive" && "border-emerald-500/30",
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {definition ? <DataPointHelp label={label} definition={definition} /> : label}
        </span>
        <span className="mt-0.5 block text-xl font-semibold">{value}</span>
        {detail ? <span className="mt-0.5 block truncate text-xs text-muted-foreground">{detail}</span> : null}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}
