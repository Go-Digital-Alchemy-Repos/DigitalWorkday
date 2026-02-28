import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Save, Check, Loader2, Pause, Square, RotateCcw, Timer } from "lucide-react";
import { cn } from "@/lib/utils";

interface DrawerActionBarProps {
  onStartTimer?: () => void;
  onSave?: () => void;
  onMarkComplete?: () => void;
  onMarkIncomplete?: () => void;
  timerState?: "idle" | "running" | "paused" | "other_task" | "loading" | "hidden";
  onPauseTimer?: () => void;
  onResumeTimer?: () => void;
  onStopTimer?: () => void;
  saveDisabled?: boolean;
  saveLabel?: string;
  completeDisabled?: boolean;
  completeLabel?: string;
  incompleteDisabled?: boolean;
  incompleteLabel?: string;
  isCompleting?: boolean;
  isIncompleting?: boolean;
  isSaving?: boolean;
  showComplete?: boolean;
  showIncomplete?: boolean;
  showSave?: boolean;
  showTimer?: boolean;
  timerTotalLabel?: string;
  extraActions?: ReactNode;
  className?: string;
}

const actionBtn = "bg-background hover:bg-muted border-border/60";

export function DrawerActionBar({
  onStartTimer,
  onSave,
  onMarkComplete,
  onMarkIncomplete,
  timerState = "hidden",
  onPauseTimer,
  onResumeTimer,
  onStopTimer,
  saveDisabled = false,
  saveLabel = "Save",
  completeDisabled = false,
  completeLabel = "Mark Complete",
  incompleteDisabled = false,
  incompleteLabel = "Mark Incomplete",
  isCompleting = false,
  isIncompleting = false,
  isSaving = false,
  showComplete = true,
  showIncomplete = false,
  showSave = true,
  showTimer = false,
  timerTotalLabel,
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
      <div className="flex items-center gap-2 flex-wrap">
        {showSave && onSave && (
          <Button
            size="default"
            variant="outline"
            onClick={onSave}
            disabled={saveDisabled || isSaving}
            className={actionBtn}
            data-testid="button-action-save"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1.5 text-blue-500" />
            )}
            {isSaving ? "Saving..." : saveLabel}
          </Button>
        )}

        {showTimer && timerState === "idle" && onStartTimer && (
          <Button
            size="default"
            variant="outline"
            onClick={onStartTimer}
            className={actionBtn}
            data-testid="button-timer-start"
          >
            <Timer className="h-4 w-4 mr-1.5 text-amber-500" />
            Start Timer
          </Button>
        )}

        {showTimer && timerState === "loading" && (
          <Button size="default" variant="outline" disabled className={actionBtn}>
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin text-amber-500" />
            Loading...
          </Button>
        )}

        {showTimer && timerState === "running" && (
          <>
            <Button
              size="default"
              variant="outline"
              onClick={onPauseTimer}
              className={actionBtn}
              data-testid="button-timer-pause"
            >
              <Pause className="h-4 w-4 mr-1.5 text-amber-500" />
              Pause
            </Button>
            <Button
              size="default"
              variant="outline"
              onClick={onStopTimer}
              className={actionBtn}
              data-testid="button-timer-stop"
            >
              <Square className="h-4 w-4 mr-1.5 text-red-500" />
              Stop
            </Button>
          </>
        )}

        {showTimer && timerState === "paused" && (
          <>
            <Button
              size="default"
              variant="outline"
              onClick={onResumeTimer}
              className={actionBtn}
              data-testid="button-timer-resume"
            >
              <Play className="h-4 w-4 mr-1.5 text-amber-500" />
              Resume
            </Button>
            <Button
              size="default"
              variant="outline"
              onClick={onStopTimer}
              className={actionBtn}
              data-testid="button-timer-stop"
            >
              <Square className="h-4 w-4 mr-1.5 text-red-500" />
              Stop
            </Button>
          </>
        )}

        {showTimer && timerState === "other_task" && (
          <Badge variant="secondary" className="text-xs">Timer running on another task</Badge>
        )}

        {showTimer && timerTotalLabel && (
          <span className="text-xs text-muted-foreground">{timerTotalLabel}</span>
        )}

        {extraActions}
      </div>

      <div className="flex items-center gap-2 ml-auto">
        {showIncomplete && onMarkIncomplete && (
          <Button
            size="default"
            variant="outline"
            onClick={onMarkIncomplete}
            disabled={incompleteDisabled || isIncompleting}
            className={actionBtn}
            data-testid="button-action-mark-incomplete"
          >
            {isIncompleting ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4 mr-1.5 text-orange-500" />
            )}
            {isIncompleting ? "Reopening..." : incompleteLabel}
          </Button>
        )}

        {showComplete && onMarkComplete && (
          <Button
            size="default"
            variant="outline"
            onClick={onMarkComplete}
            disabled={completeDisabled || isCompleting}
            className={cn(actionBtn, "border-emerald-200 dark:border-emerald-800")}
            data-testid="button-action-mark-complete"
          >
            {isCompleting ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Check className="h-4 w-4 mr-1.5 text-emerald-500" />
            )}
            {isCompleting ? "Completing..." : completeLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
