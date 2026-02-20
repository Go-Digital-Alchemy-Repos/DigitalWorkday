import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Play, Save, Check, Loader2, Pause, Square, RotateCcw } from "lucide-react";
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
  extraActions?: ReactNode;
  className?: string;
}

export function DrawerActionBar({
  onStartTimer,
  onSave,
  onMarkComplete,
  onMarkIncomplete,
  timerState = "idle",
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
      {extraActions}

      <div className="flex items-center gap-2 ml-auto">
        {showIncomplete && onMarkIncomplete && (
          <Button
            size="default"
            variant="outline"
            onClick={onMarkIncomplete}
            disabled={incompleteDisabled || isIncompleting}
            data-testid="button-action-mark-incomplete"
          >
            {isIncompleting ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4 mr-1.5" />
            )}
            {isIncompleting ? "Reopening..." : incompleteLabel}
          </Button>
        )}

        {showSave && onSave && (
          <Button
            size="default"
            variant="default"
            onClick={onSave}
            disabled={saveDisabled || isSaving}
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
            variant="default"
            onClick={onMarkComplete}
            disabled={completeDisabled || isCompleting}
            className="bg-success text-success-foreground border-success/80"
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
