import { ReactNode, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { createPortal } from "react-dom";

interface TaskPanelShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  header: ReactNode;
  sidebar: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
}

export function TaskPanelShell({
  open,
  onOpenChange,
  header,
  sidebar,
  footer,
  children,
  className,
  "data-testid": testId,
}: TaskPanelShellProps) {
  const isMobile = useIsMobile();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      const count = parseInt(document.body.dataset.panelCount || "0", 10);
      document.body.dataset.panelCount = String(count + 1);
      document.body.style.overflow = "hidden";
      requestAnimationFrame(() => {
        panelRef.current?.focus();
      });
    }
    return () => {
      const count = parseInt(document.body.dataset.panelCount || "1", 10) - 1;
      document.body.dataset.panelCount = String(Math.max(0, count));
      if (count <= 0) {
        document.body.style.overflow = "";
      }
      previousFocusRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpenChange(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-[2px] animate-in fade-in-0 duration-200"
        onClick={() => onOpenChange(false)}
        data-testid="task-panel-overlay"
      />
      <div className="fixed inset-0 flex items-start justify-center overflow-hidden">
        <div
          ref={panelRef}
          tabIndex={-1}
          className={cn(
            "relative flex flex-col bg-background shadow-2xl outline-none",
            "animate-in slide-in-from-bottom-4 fade-in-0 duration-300",
            isMobile
              ? "w-full h-full"
              : "w-[calc(100vw-3rem)] max-w-[1400px] h-[calc(100vh-3rem)] mt-6 rounded-xl border border-border",
            className
          )}
          data-testid={testId}
        >
          <div className="sticky top-0 z-20 bg-background border-b border-border rounded-t-xl shrink-0">
            {header}
          </div>
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {isMobile ? (
              <div className="flex-1 overflow-y-auto">
                {children}
                <div className="px-4 py-4 space-y-4">
                  {sidebar}
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto min-w-0">
                  {children}
                </div>
                <div className="w-[340px] shrink-0 border-l border-border overflow-y-auto bg-muted/20">
                  {sidebar}
                </div>
              </>
            )}
          </div>
          {footer && (
            <div className="sticky bottom-0 z-20 bg-background border-t border-border shrink-0">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
