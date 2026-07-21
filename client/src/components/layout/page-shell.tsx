import * as React from "react";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageShellProps {
  children: ReactNode;
  className?: string;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "full";
  noPadding?: boolean;
}

const maxWidthClasses = {
  sm: "max-w-screen-sm",
  md: "max-w-screen-md",
  lg: "max-w-screen-lg",
  xl: "max-w-screen-xl",
  "2xl": "max-w-screen-2xl",
  full: "max-w-full",
};

export function PageShell({ 
  children, 
  className,
  maxWidth = "full",
  noPadding = false,
}: PageShellProps) {
  return (
    <div 
      className={cn(
        "w-full h-full overflow-auto mx-auto",
        !noPadding && "px-4 sm:px-5 lg:px-8 py-5 md:py-7",
        maxWidthClasses[maxWidth],
        "pb-24 md:pb-7",
        className
      )}
      data-testid="page-shell"
    >
      {children}
    </div>
  );
}
