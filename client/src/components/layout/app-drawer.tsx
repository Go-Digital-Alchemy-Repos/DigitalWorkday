import * as React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface AppDrawerProps {
  children: React.ReactNode;
  trigger?: React.ReactNode;
  title?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: "left" | "right" | "top" | "bottom";
  className?: string;
  headerClassName?: string;
}

export function AppDrawer({
  children,
  trigger,
  title,
  open,
  onOpenChange,
  side = "right",
  className,
  headerClassName,
}: AppDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
      <SheetContent side={side} className={cn("p-0", className)}>
        {title && (
          <SheetHeader className={cn("px-4 py-3 border-b", headerClassName)}>
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
        )}
        <div className="flex-1 overflow-y-auto h-full">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
