import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Play, Save, Check, Loader2, Pause, Square } from "lucide-react";
import { cn } from "@/lib/utils";

interface DrawerActionBarProps {
  onStartTimer?: () => void;
  onSave?: () => void;
  onMarkComplete?: () => void;
  timerState?: "idle" | "running" | "paused" | "other_task" | "loading" | "hidden";
  onPauseTimer?: () => void;
  onResumeTimer?: () => void;
  onStopTimer?: () => void;
  saveDisabled?: boolean;
  saveLabel?: string;
  completeDisabled?: boolean;
  completeLabel?: string;
  isCompleting?: boolean;
  isSaving?: boolean;
  showComplete?: boolean;
  showSave?: boolean;
  showTimer?: boolean;
  extraActions?: ReactNode;
  className?: string;
}

export function DrawerActionBar({
  onStartTimer,
  onSave,
  onMarkComplete,
  timerState = "idle",
  onPauseTimer,
  onResumeTimer,
  onStopTimer,
  saveDisabled = false,
  saveLabel = "Save",
  completeDisabled = false,
  completeLabel = "Mark Complete",
  isCompleting = false,
  isSaving = false,
  showComplete = true,
  showSave = true,
  showTimer = true,
  extraActions,
  className,
}: DrawerActionBarProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 flex-wrap px-3 sm:px-6 py-3 border-t bg-background shrink-0",
        className
      )}
      data-testid="drawer-action-bar"
    >
      {showTimer && timerState !== "hidden" && (
        <div className="flex items-center gap-2">
          {timerState === "idle" && onStartTimer && (
            <Button
              size="default"
              onClick={onStartTimer}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2 border border-[#d97d26] md:min-h-9 px-4 py-2 text-white min-h-[44px] bg-[#f7902f]"
              data-testid="button-action-start-timer"
            >
              <Play className="h-4 w-4 mr-1.5" />
              Start Timer
            </Button>
          )}

          {timerState === "loading" && (
            <Button
              size="default"
              disabled
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2 border border-[#d97d26] md:min-h-9 px-4 py-2 text-white min-h-[44px] bg-[#f7902f]"
              data-testid="button-action-start-timer"
            >
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              Loading...
            </Button>
          )}

          {timerState === "running" && (
            <>
              {onPauseTimer && (
                <Button
                  variant="outline"
                  size="default"
                  onClick={onPauseTimer}
                  className="min-h-[44px]"
                  data-testid="button-action-pause-timer"
                >
                  <Pause className="h-4 w-4 mr-1.5" />
                  Pause
                </Button>
              )}
              {onStopTimer && (
                <Button
                  variant="destructive"
                  size="default"
                  onClick={onStopTimer}
                  className="min-h-[44px]"
                  data-testid="button-action-stop-timer"
                >
                  <Square className="h-4 w-4 mr-1.5" />
                  Stop
                </Button>
              )}
            </>
          )}

          {timerState === "paused" && (
            <>
              {onResumeTimer && (
                <Button
                  variant="outline"
                  size="default"
                  onClick={onResumeTimer}
                  className="min-h-[44px]"
                  data-testid="button-action-resume-timer"
                >
                  <Play className="h-4 w-4 mr-1.5" />
                  Resume
                </Button>
              )}
              {onStopTimer && (
                <Button
                  variant="destructive"
                  size="default"
                  onClick={onStopTimer}
                  className="min-h-[44px]"
                  data-testid="button-action-stop-timer"
                >
                  <Square className="h-4 w-4 mr-1.5" />
                  Stop
                </Button>
              )}
            </>
          )}
        </div>
      )}

      {extraActions}

      <div className="flex items-center gap-2 ml-auto">
        {showSave && onSave && (
          <Button
            size="default"
            onClick={onSave}
            disabled={saveDisabled || isSaving}
            className="bg-[#2563eb] text-white min-h-[44px] hover:bg-[#1d4ed8]"
            data-testid="button-action-save"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1.5" />
            )}
            {isSaving ? "Saving..." : saveLabel}
          </Button>
        )}

        {showComplete && onMarkComplete && (
          <Button
            size="default"
            onClick={onMarkComplete}
            disabled={completeDisabled || isCompleting}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2 border border-[#7fb314] md:min-h-9 px-4 py-2 text-white min-h-[44px] hover:bg-[#15803d] bg-[#94c91a]"
            data-testid="button-action-mark-complete"
          >
            {isCompleting ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Check className="h-4 w-4 mr-1.5" />
            )}
            {isCompleting ? "Completing..." : completeLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
