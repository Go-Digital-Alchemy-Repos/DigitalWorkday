import * as React from "react";
import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type SurfaceTone = "default" | "subtle" | "warning";
type SurfaceRadius = "xl" | "2xl" | "3xl";
type SurfacePadding = "none" | "sm" | "md" | "lg";

const toneClasses: Record<SurfaceTone, string> = {
  default: "border-border/70 bg-card/90 shadow-[var(--shadow-soft)]",
  subtle: "border-border/70 bg-card/75 shadow-[var(--shadow-soft)]",
  warning: "border-amber-200/70 bg-amber-50/30 shadow-[var(--shadow-soft)] dark:border-amber-800 dark:bg-amber-950/10",
};

const radiusClasses: Record<SurfaceRadius, string> = {
  xl: "rounded-xl",
  "2xl": "rounded-2xl",
  "3xl": "rounded-3xl",
};

const paddingClasses: Record<SurfacePadding, string> = {
  none: "",
  sm: "p-3",
  md: "p-4 md:p-5",
  lg: "p-5 md:p-6",
};

interface SurfacePanelProps extends HTMLAttributes<HTMLDivElement> {
  tone?: SurfaceTone;
  radius?: SurfaceRadius;
  padding?: SurfacePadding;
}

export function SurfacePanel({
  className,
  tone = "default",
  radius = "2xl",
  padding = "md",
  ...props
}: SurfacePanelProps) {
  return (
    <div
      className={cn(
        "border",
        toneClasses[tone],
        radiusClasses[radius],
        paddingClasses[padding],
        className
      )}
      {...props}
    />
  );
}
