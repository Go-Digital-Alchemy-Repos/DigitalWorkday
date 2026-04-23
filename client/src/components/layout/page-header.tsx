import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: ReactNode;
  className?: string;
  icon?: ReactNode;
}

export function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumbs,
  className,
  icon,
}: PageHeaderProps) {
  return (
    <div className={cn("mb-section rounded-2xl border border-border/70 bg-card/70 px-4 py-4 shadow-[var(--shadow-soft)] backdrop-blur-sm sm:px-5 sm:py-5", className)}>
      {breadcrumbs && (
        <div className="mb-3" data-testid="page-header-breadcrumbs">
          {breadcrumbs}
        </div>
      )}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 sm:gap-4">
          {icon && (
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background/80 text-primary shadow-[var(--shadow-soft)]"
              data-testid="page-header-icon"
            >
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[2rem]" data-testid="page-header-title">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-[15px]" data-testid="page-header-subtitle">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0 self-start" data-testid="page-header-actions">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
