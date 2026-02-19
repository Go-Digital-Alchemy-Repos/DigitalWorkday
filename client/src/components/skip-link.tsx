import { cn } from "@/lib/utils";

interface SkipLinkProps {
  targetId?: string;
  className?: string;
}

export function SkipLink({ targetId = "main-content", className }: SkipLinkProps) {
  return (
    <a
      href={`#${targetId}`}
      className={cn(
        "sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999]",
        "focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded-md",
        "focus:text-sm focus:font-medium focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring",
        className
      )}
      data-testid="skip-link"
    >
      Skip to main content
    </a>
  );
}
