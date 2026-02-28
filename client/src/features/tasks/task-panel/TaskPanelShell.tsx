import { ReactNode, useEffect, useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { createPortal } from "react-dom";
import { GripVertical } from "lucide-react";

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

const SIDEBAR_MIN = 280;
const SIDEBAR_MAX = 520;
const SIDEBAR_DEFAULT = 340;

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
  const didIncrementRef = useRef(false);
  const [depth, setDepth] = useState(0);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(SIDEBAR_DEFAULT);

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      const count = parseInt(document.body.dataset.panelCount || "0", 10);
      setDepth(count);
      document.body.dataset.panelCount = String(count + 1);
      didIncrementRef.current = true;
      document.body.style.overflow = "hidden";
      requestAnimationFrame(() => {
        panelRef.current?.focus();
      });
    }
    return () => {
      if (!didIncrementRef.current) return;
      didIncrementRef.current = false;
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

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = sidebarWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const delta = startXRef.current - e.clientX;
      const newWidth = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startWidthRef.current + delta));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [sidebarWidth]);

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
              : "w-[calc(100vw-3rem)] max-w-[1400px] h-[calc(100vh-3rem)] rounded-xl border border-border",
            className
          )}
          style={!isMobile && depth > 0 ? { marginTop: `${24 + depth * 20}px` } : !isMobile ? { marginTop: "24px" } : undefined}
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
                <div
                  className="relative shrink-0 group/divider"
                  style={{ width: 0 }}
                >
                  <div
                    className="absolute inset-y-0 -left-1 w-2 cursor-col-resize z-10 flex items-center justify-center"
                    onMouseDown={handleMouseDown}
                    data-testid="sidebar-resize-handle"
                  >
                    <div className="h-8 w-[3px] rounded-full bg-border group-hover/divider:bg-primary/40 transition-colors flex items-center justify-center">
                    </div>
                  </div>
                </div>
                <div
                  className="shrink-0 border-l border-border overflow-y-auto bg-muted/20"
                  style={{ width: `${sidebarWidth}px` }}
                >
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
