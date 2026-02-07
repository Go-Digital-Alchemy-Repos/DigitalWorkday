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
    <div className={cn("mb-section", className)}>
      {breadcrumbs && (
        <div className="mb-2" data-testid="page-header-breadcrumbs">
          {breadcrumbs}
        </div>
      )}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          {icon && (
            <div className="shrink-0 text-muted-foreground" data-testid="page-header-icon">
              {icon}
            </div>
          )}
          <div>
            <h1 className="text-h2" data-testid="page-header-title">
              {title}
            </h1>
            {subtitle && (
              <p className="text-muted-foreground mt-1" data-testid="page-header-subtitle">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0" data-testid="page-header-actions">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
