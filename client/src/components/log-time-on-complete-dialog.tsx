import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Clock, Loader2, DollarSign } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface LogTimeOnCompleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemType: "task" | "subtask";
  itemId: string;
  itemTitle: string;
  taskId?: string;
  projectId?: string | null;
  clientId?: string | null;
  workspaceId: string;
  onComplete: () => Promise<void>;
  onSkip: () => Promise<void>;
}

export function LogTimeOnCompleteDialog({
  open,
  onOpenChange,
  itemType,
  itemId,
  itemTitle,
  taskId,
  projectId,
  clientId,
  workspaceId,
  onComplete,
  onSkip,
}: LogTimeOnCompleteDialogProps) {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [description, setDescription] = useState("");
  const [billable, setBillable] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createTimeEntryMutation = useMutation({
    mutationFn: async (data: {
      durationSeconds: number;
      description: string;
      billable: boolean;
      taskId?: string | null;
      subtaskId?: string | null;
      projectId?: string | null;
      clientId?: string | null;
    }) => {
      return apiRequest("POST", "/api/time-entries", {
        ...data,
        workspaceId,
        startTime: new Date().toISOString(),
        isManual: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      if (taskId) {
        queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "time-entries"] });
      }
    },
  });

  const handleSkip = async () => {
    setIsSubmitting(true);
    try {
      await onSkip();
      resetAndClose();
    } catch (error) {
      toast({ title: "Failed to complete", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleYesLogTime = () => {
    setShowForm(true);
  };

  const handleSubmit = async () => {
    const totalSeconds = (hours * 60 + minutes) * 60;
    
    if (totalSeconds <= 0) {
      toast({ title: "Please enter a valid time", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    
    try {
      await createTimeEntryMutation.mutateAsync({
        durationSeconds: totalSeconds,
        description: description || `Completed: ${itemTitle}`,
        billable,
        taskId: itemType === "task" ? itemId : taskId || null,
        subtaskId: itemType === "subtask" ? itemId : null,
        projectId: projectId || null,
        clientId: clientId || null,
      });
      
      await onComplete();
      
      toast({ 
        title: `${itemType === "task" ? "Task" : "Subtask"} completed with time logged`, 
        description: `Logged ${hours}h ${minutes}m for "${itemTitle}"` 
      });
      resetAndClose();
    } catch (error) {
      toast({ title: "Failed to save time entry", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetAndClose = () => {
    setShowForm(false);
    setHours(0);
    setMinutes(0);
    setDescription("");
    setBillable(true);
    onOpenChange(false);
  };

  const handleCancel = () => {
    if (showForm) {
      setShowForm(false);
    } else {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="log-time-on-complete-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {showForm ? "Log time" : "Log time before completing?"}
          </DialogTitle>
          <DialogDescription>
            {showForm 
              ? `Record time spent on "${itemTitle}"`
              : `Do you want to add time for "${itemTitle}"?`
            }
          </DialogDescription>
        </DialogHeader>

        {showForm ? (
          <div className="space-y-4 py-2">
            <div className="flex gap-4">
              <div className="flex-1">
                <Label htmlFor="hours">Hours</Label>
                <Input
                  id="hours"
                  type="number"
                  min={0}
                  max={99}
                  value={hours}
                  onChange={(e) => setHours(parseInt(e.target.value) || 0)}
                  data-testid="input-hours"
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="minutes">Minutes</Label>
                <Input
                  id="minutes"
                  type="number"
                  min={0}
                  max={59}
                  value={minutes}
                  onChange={(e) => setMinutes(parseInt(e.target.value) || 0)}
                  data-testid="input-minutes"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                placeholder="What did you work on?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="resize-none"
                rows={2}
                data-testid="input-description"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setBillable(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  billable
                    ? "bg-green-50 border-green-300 text-green-700 dark:bg-green-950/40 dark:border-green-700 dark:text-green-400"
                    : "bg-muted/50 border-border text-muted-foreground hover:bg-muted"
                }`}
                data-testid="button-billable"
              >
                <DollarSign className="h-3.5 w-3.5" />
                Billable
              </button>
              <button
                type="button"
                onClick={() => setBillable(false)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  !billable
                    ? "bg-muted border-foreground/30 text-foreground"
                    : "bg-muted/50 border-border text-muted-foreground hover:bg-muted"
                }`}
                data-testid="button-non-billable"
              >
                Non-billable
              </button>
            </div>
          </div>
        ) : null}

        <DialogFooter className="flex gap-2 sm:gap-0">
          {showForm ? (
            <>
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={isSubmitting}
                data-testid="button-cancel"
              >
                Back
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || (hours === 0 && minutes === 0)}
                data-testid="button-save-time"
              >
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save time & complete
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={handleSkip}
                disabled={isSubmitting}
                data-testid="button-no-skip"
              >
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                No, mark complete
              </Button>
              <Button
                onClick={handleYesLogTime}
                disabled={isSubmitting}
                data-testid="button-yes-log-time"
              >
                Yes, log time
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
