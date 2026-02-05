import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: {
    container: "py-8",
    icon: "h-8 w-8",
    title: "text-base",
    description: "text-sm",
  },
  md: {
    container: "py-12",
    icon: "h-12 w-12",
    title: "text-lg",
    description: "text-sm",
  },
  lg: {
    container: "py-16",
    icon: "h-16 w-16",
    title: "text-xl",
    description: "text-base",
  },
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  size = "md",
}: EmptyStateProps) {
  const sizes = sizeClasses[size];
  
  return (
    <div 
      className={cn(
        "flex flex-col items-center justify-center text-center",
        sizes.container,
        className
      )}
      data-testid="empty-state"
    >
      {icon && (
        <div className="mb-4 text-muted-foreground opacity-50" data-testid="empty-state-icon">
          {icon}
        </div>
      )}
      <h3 className={cn("font-semibold", sizes.title)} data-testid="empty-state-title">
        {title}
      </h3>
      {description && (
        <p className={cn("text-muted-foreground mt-1 max-w-md", sizes.description)} data-testid="empty-state-description">
          {description}
        </p>
      )}
      {action && (
        <div className="mt-4" data-testid="empty-state-action">
          {action}
        </div>
      )}
    </div>
  );
}
