import * as React from "react";
import { Info } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface DataPointHelpProps {
  label: string;
  definition?: React.ReactNode;
  source?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
  side?: React.ComponentProps<typeof TooltipContent>["side"];
  align?: React.ComponentProps<typeof TooltipContent>["align"];
}

function stringifyTooltipPart(value: React.ReactNode): string | null {
  if (typeof value === "string" || typeof value === "number") return String(value);
  return null;
}

function buildAccessibleLabel(label: string, definition?: React.ReactNode, source?: React.ReactNode) {
  const parts = [stringifyTooltipPart(definition), stringifyTooltipPart(source) ? `Source: ${stringifyTooltipPart(source)}` : null]
    .filter(Boolean);
  return parts.length > 0 ? `${label}: ${parts.join(" ")}` : label;
}

export function DataPointHelp({
  label,
  definition,
  source,
  children,
  className,
  triggerClassName,
  contentClassName,
  side = "top",
  align = "center",
}: DataPointHelpProps) {
  if (!definition && !source) {
    return children ? <>{children}</> : null;
  }

  const accessibleLabel = buildAccessibleLabel(label, definition, source);
  const trigger = children ? (
    <span
      tabIndex={0}
      className={cn("inline-flex min-w-0 cursor-help items-center", triggerClassName)}
      aria-label={accessibleLabel}
      data-tooltip-label={label}
      data-tooltip-definition={stringifyTooltipPart(definition) ?? undefined}
      data-tooltip-source={stringifyTooltipPart(source) ?? undefined}
    >
      {children}
    </span>
  ) : (
    <button
      type="button"
      className={cn(
        "inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        triggerClassName,
      )}
      aria-label={accessibleLabel}
      data-tooltip-label={label}
      data-tooltip-definition={stringifyTooltipPart(definition) ?? undefined}
      data-tooltip-source={stringifyTooltipPart(source) ?? undefined}
    >
      <Info className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent side={side} align={align} className={cn("max-w-[280px] space-y-1 leading-relaxed", contentClassName)}>
        {definition && <p>{definition}</p>}
        {source && <p className="text-muted-foreground">Source: {source}</p>}
      </TooltipContent>
    </Tooltip>
  );
}

interface DataPointLabelProps {
  label: string;
  definition?: React.ReactNode;
  source?: React.ReactNode;
  className?: string;
  labelClassName?: string;
  helpClassName?: string;
}

export function DataPointLabel({
  label,
  definition,
  source,
  className,
  labelClassName,
  helpClassName,
}: DataPointLabelProps) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <span className={cn("truncate", labelClassName)}>{label}</span>
      <DataPointHelp label={label} definition={definition} source={source} triggerClassName={helpClassName} />
    </span>
  );
}
