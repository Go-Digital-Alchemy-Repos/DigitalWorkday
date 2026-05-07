import * as React from "react";
import type { HTMLAttributes } from "react";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DATA_POINT_DEFINITIONS } from "@/lib/data-point-definitions";
import { cn } from "@/lib/utils";

export type ContextBadgeKind = "client" | "project";

const CONTEXT_BADGE_STYLES: Record<ContextBadgeKind, string> = {
  client:
    "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-800/70 dark:bg-teal-950/40 dark:text-teal-300",
  project:
    "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800/70 dark:bg-sky-950/40 dark:text-sky-300",
};

interface ContextBadgeProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  kind: ContextBadgeKind;
  value?: string | null;
  label: string;
  tooltip?: string;
  maxLength?: number;
  testId?: string;
}

function truncateContextValue(value: string, maxLength: number) {
  return value.length > maxLength
    ? `${value.slice(0, Math.max(1, maxLength - 1))}...`
    : value;
}

export function ContextBadge({
  kind,
  value,
  label,
  tooltip,
  maxLength = 28,
  className,
  testId,
  ...props
}: ContextBadgeProps) {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    return null;
  }

  const tooltipText = tooltip ?? (kind === "client" ? DATA_POINT_DEFINITIONS.client : DATA_POINT_DEFINITIONS.project);
  const displayValue = truncateContextValue(normalizedValue, maxLength);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          tabIndex={0}
          aria-label={`${label}: ${normalizedValue}`}
          data-tooltip-label={label}
          data-context-badge-kind={kind}
          data-testid={testId}
          className={cn(
            "h-5 max-w-[11rem] cursor-default rounded-full px-2 py-0 text-[10px] font-semibold shadow-none",
            CONTEXT_BADGE_STYLES[kind],
            className,
          )}
          {...props}
        >
          <span className="truncate">{displayValue}</span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p>{tooltipText}</p>
      </TooltipContent>
    </Tooltip>
  );
}
