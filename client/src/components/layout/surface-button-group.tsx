import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface SurfaceButtonGroupProps extends HTMLAttributes<HTMLDivElement> {
  compact?: boolean;
}

export function SurfaceButtonGroup({
  className,
  compact = false,
  ...props
}: SurfaceButtonGroupProps) {
  return (
    <div
      className={cn(
        "flex items-center border border-border/70 bg-card/90 shadow-[var(--shadow-soft)]",
        compact ? "rounded-xl p-0.5" : "rounded-2xl p-1",
        className
      )}
      {...props}
    />
  );
}
