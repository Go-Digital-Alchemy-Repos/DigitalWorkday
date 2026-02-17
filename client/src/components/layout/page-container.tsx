import { cn } from "@/lib/utils";

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
  /** Use full height with overflow scrolling (for pages that need to fill the viewport) */
  fullHeight?: boolean;
  /** Disable the max-width constraint (for pages like chat that need full width) */
  fluid?: boolean;
  "data-testid"?: string;
}

export function PageContainer({
  children,
  className,
  fullHeight = true,
  fluid = false,
  "data-testid": testId,
}: PageContainerProps) {
  return (
    <div
      className={cn(
        "h-full",
        fullHeight && "overflow-auto",
        className
      )}
      data-testid={testId}
    >
      <div
        className={cn(
          "px-3 sm:px-4 lg:px-6 py-4 md:py-6",
          !fluid && "max-w-screen-xl mx-auto"
        )}
      >
        {children}
      </div>
    </div>
  );
}

interface PageHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function PageHeader({ children, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between mb-4 md:mb-6", className)}>
      {children}
    </div>
  );
}

interface PageTitleProps {
  children: React.ReactNode;
  className?: string;
}

export function PageTitle({ children, className }: PageTitleProps) {
  return (
    <h1 className={cn("text-xl md:text-2xl font-bold tracking-tight", className)}>
      {children}
    </h1>
  );
}
