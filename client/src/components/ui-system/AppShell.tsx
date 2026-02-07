import { cn } from "@/lib/utils";

type MaxWidth = "sm" | "md" | "lg" | "xl" | "2xl" | "full";

interface AppShellProps {
  children: React.ReactNode;
  className?: string;
  maxWidth?: MaxWidth;
  noPadding?: boolean;
  "data-testid"?: string;
}

const maxWidthMap: Record<MaxWidth, string> = {
  sm: "max-w-screen-sm",
  md: "max-w-screen-md",
  lg: "max-w-screen-lg",
  xl: "max-w-screen-xl",
  "2xl": "max-w-screen-2xl",
  full: "max-w-full",
};

export function AppShell({
  children,
  className,
  maxWidth = "full",
  noPadding = false,
  "data-testid": testId = "app-shell",
}: AppShellProps) {
  return (
    <div
      className={cn(
        "w-full h-full overflow-auto",
        !noPadding && "p-page",
        maxWidthMap[maxWidth],
        className
      )}
      data-testid={testId}
    >
      {children}
    </div>
  );
}
