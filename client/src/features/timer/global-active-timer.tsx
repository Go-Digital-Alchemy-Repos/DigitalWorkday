import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Play, Pause, Square, Clock, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TaskSelectorWithCreate } from "@/features/tasks/task-selector-with-create";
import { useAuth } from "@/lib/auth";

type ActiveTimer = {
  id: string;
  workspaceId: string;
  userId: string;
  clientId: string | null;
  projectId: string | null;
  taskId: string | null;
  title: string | null;
  description: string | null;
  status: "running" | "paused";
  elapsedSeconds: number;
  lastStartedAt: string | null;
  createdAt: string;
  client?: { id: string; companyName: string; displayName: string | null };
  project?: { id: string; name: string };
  task?: { id: string; title: string };
};

const TIMER_QUERY_KEY = "/api/timer/current";
const BROADCAST_CHANNEL_NAME = "active-timer-sync";
const RUNNING_REFETCH_INTERVAL = 30000;
const PAUSED_REFETCH_INTERVAL = 60000;

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function GlobalActiveTimer() {
  const { isAuthenticated, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [displaySeconds, setDisplaySeconds] = useState(0);
  const [stopDialogOpen, setStopDialogOpen] = useState(false);
  const [stopScope, setStopScope] = useState<"in_scope" | "out_of_scope">("in_scope");
  const [stopTitle, setStopTitle] = useState("");
  const [stopDescription, setStopDescription] = useState("");
  const [stopTaskId, setStopTaskId] = useState<string | null>(null);
  const [stopClientId, setStopClientId] = useState<string | null>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const hasShownRecoveryToast = useRef(false);

  const isEligible = isAuthenticated && user?.role !== "super_user";

  const { data: timer, isLoading: timerLoading, refetch: refetchTimer } = useQuery<ActiveTimer | null>({
    queryKey: [TIMER_QUERY_KEY],
    enabled: isEligible,
    staleTime: 10000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });

  const { data: clients = [] } = useQuery<Array<{ id: string; companyName: string; displayName: string | null }>>({
    queryKey: ["/api/clients"],
    enabled: isEligible,
    staleTime: 60 * 1000,
  });

  const invalidateTimer = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [TIMER_QUERY_KEY] });
  }, [queryClient]);

  const broadcastTimerUpdate = useCallback(() => {
    if (broadcastChannelRef.current) {
      try {
        broadcastChannelRef.current.postMessage({ type: "timer-updated" });
      } catch {
        // BroadcastChannel may fail in some environments
      }
    }
    try {
      localStorage.setItem("timer-sync", Date.now().toString());
      localStorage.removeItem("timer-sync");
    } catch {
      // localStorage may be unavailable
    }
  }, []);

  // Setup BroadcastChannel for cross-tab sync
  useEffect(() => {
    if (!isEligible) return;

    try {
      broadcastChannelRef.current = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      broadcastChannelRef.current.onmessage = (event) => {
        if (event.data?.type === "timer-updated") {
          invalidateTimer();
        }
      };
    } catch {
      // BroadcastChannel not supported
    }

    const handleStorageEvent = (event: StorageEvent) => {
      if (event.key === "timer-sync") {
        invalidateTimer();
      }
    };
    window.addEventListener("storage", handleStorageEvent);

    return () => {
      broadcastChannelRef.current?.close();
      broadcastChannelRef.current = null;
      window.removeEventListener("storage", handleStorageEvent);
    };
  }, [isEligible, invalidateTimer]);

  // Periodic refetch based on timer status
  useEffect(() => {
    if (!isEligible || !timer) return;

    const interval = timer.status === "running" 
      ? RUNNING_REFETCH_INTERVAL 
      : PAUSED_REFETCH_INTERVAL;

    const intervalId = setInterval(() => {
      refetchTimer();
    }, interval);

    return () => clearInterval(intervalId);
  }, [isEligible, timer?.status, refetchTimer]);

  // Show recovery toast on app boot if timer exists
  useEffect(() => {
    if (timer && !hasShownRecoveryToast.current && !timerLoading) {
      const sessionKey = `timer-recovered-${timer.id}`;
      const alreadyShown = sessionStorage.getItem(sessionKey);
      
      if (!alreadyShown) {
        toast({
          title: "Timer recovered",
          description: `Your ${timer.status === "running" ? "running" : "paused"} timer has been restored.`,
        });
        sessionStorage.setItem(sessionKey, "true");
      }
      hasShownRecoveryToast.current = true;
    }
  }, [timer, timerLoading, toast]);

  const pauseMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/timer/pause");
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.message || errorData.error || "Failed to pause timer";
        const requestId = errorData.requestId || response.headers.get("x-request-id");
        throw new Error(requestId ? `${errorMessage} (Ref: ${requestId})` : errorMessage);
      }
      return response.json();
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: [TIMER_QUERY_KEY] });
      const previousTimer = queryClient.getQueryData<ActiveTimer | null>([TIMER_QUERY_KEY]);
      if (previousTimer) {
        // Calculate elapsed seconds to match server-side pause behavior
        let newElapsedSeconds = previousTimer.elapsedSeconds;
        if (previousTimer.status === "running" && previousTimer.lastStartedAt) {
          const lastStarted = new Date(previousTimer.lastStartedAt).getTime();
          const now = Date.now();
          newElapsedSeconds += Math.floor((now - lastStarted) / 1000);
        }
        
        queryClient.setQueryData<ActiveTimer | null>([TIMER_QUERY_KEY], {
          ...previousTimer,
          status: "paused",
          elapsedSeconds: newElapsedSeconds,
        });
      }
      return { previousTimer };
    },
    onSuccess: () => {
      invalidateTimer();
      broadcastTimerUpdate();
      toast({ title: "Timer paused" });
    },
    onError: (error: Error, _, context) => {
      if (context?.previousTimer) {
        queryClient.setQueryData([TIMER_QUERY_KEY], context.previousTimer);
      }
      toast({ title: "Failed to pause timer", description: error.message, variant: "destructive", duration: 10000 });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/timer/resume");
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.message || errorData.error || "Failed to resume timer";
        const requestId = errorData.requestId || response.headers.get("x-request-id");
        throw new Error(requestId ? `${errorMessage} (Ref: ${requestId})` : errorMessage);
      }
      return response.json();
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: [TIMER_QUERY_KEY] });
      const previousTimer = queryClient.getQueryData<ActiveTimer | null>([TIMER_QUERY_KEY]);
      if (previousTimer) {
        queryClient.setQueryData<ActiveTimer | null>([TIMER_QUERY_KEY], {
          ...previousTimer,
          status: "running",
          lastStartedAt: new Date().toISOString(),
        });
      }
      return { previousTimer };
    },
    onSuccess: () => {
      invalidateTimer();
      broadcastTimerUpdate();
      toast({ title: "Timer resumed" });
    },
    onError: (error: Error, _, context) => {
      if (context?.previousTimer) {
        queryClient.setQueryData([TIMER_QUERY_KEY], context.previousTimer);
      }
      toast({ title: "Failed to resume timer", description: error.message, variant: "destructive", duration: 10000 });
    },
  });

  const stopMutation = useMutation({
    mutationFn: async (data: { discard?: boolean; scope?: string; title?: string; description?: string | null; taskId?: string | null; clientId?: string | null; projectId?: string | null }) => {
      const response = await apiRequest("POST", "/api/timer/stop", data);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.message || errorData.error || "Failed to save time entry";
        const requestId = errorData.requestId || response.headers.get("x-request-id");
        throw new Error(requestId ? `${errorMessage} (Ref: ${requestId})` : errorMessage);
      }
      return response.json();
    },
    onSuccess: (_, variables) => {
      // Immediately clear the timer from cache so UI updates instantly
      queryClient.setQueryData([TIMER_QUERY_KEY], null);
      invalidateTimer();
      broadcastTimerUpdate();
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/my/stats"] });
      if (variables.discard) {
        toast({ title: "Timer discarded" });
      } else {
        toast({ title: "Time entry saved" });
      }
      setStopDialogOpen(false);
      resetStopForm();
    },
    onError: (error: Error) => {
      // Do NOT clear timer on failure - keep it recoverable
      toast({ 
        title: "Failed to save entry", 
        description: error.message || "Please try again. Your timer is still active.", 
        variant: "destructive",
        duration: 10000, // Keep visible longer for user to see error
      });
      invalidateTimer();
    },
  });

  const resetStopForm = () => {
    setStopTaskId(null);
    setStopTitle("");
    setStopDescription("");
    setStopClientId(null);
    setStopScope("in_scope");
  };

  useEffect(() => {
    if (!timer) {
      setDisplaySeconds(0);
      return;
    }

    const calculateElapsed = () => {
      let elapsed = timer.elapsedSeconds;
      if (timer.status === "running" && timer.lastStartedAt) {
        const lastStarted = new Date(timer.lastStartedAt).getTime();
        const now = Date.now();
        elapsed += Math.floor((now - lastStarted) / 1000);
      }
      return elapsed;
    };

    setDisplaySeconds(calculateElapsed());

    if (timer.status === "running") {
      const interval = setInterval(() => {
        setDisplaySeconds(calculateElapsed());
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [timer]);

  useEffect(() => {
    if (timer?.title) {
      setStopTitle(timer.title);
    }
  }, [timer?.title]);

  useEffect(() => {
    if (timer?.description) {
      setStopDescription(timer.description);
    }
  }, [timer?.description]);

  useEffect(() => {
    setStopTaskId(timer?.taskId || null);
  }, [timer?.taskId]);

  useEffect(() => {
    setStopClientId(timer?.clientId || null);
  }, [timer?.clientId]);

  const handleOpenStopDialog = () => {
    setStopDialogOpen(true);
  };

  const handleSaveEntry = () => {
    if (!stopTitle.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    if (!stopClientId) {
      toast({ title: "Client is required", variant: "destructive" });
      return;
    }
    stopMutation.mutate({
      scope: stopScope,
      title: stopTitle.trim(),
      description: stopDescription.trim() || null,
      taskId: stopTaskId,
      clientId: stopClientId,
      projectId: timer?.projectId || null,
    });
  };

  if (!timer) {
    return null;
  }

  const isRunning = timer.status === "running";
  const isStopping = stopMutation.isPending;
  const hasStopError = stopMutation.isError;

  return (
    <>
      <div 
        className={`flex items-center gap-2 px-2 py-1 rounded-md border ${
          hasStopError 
            ? "bg-destructive/20 border-destructive" 
            : isStopping 
              ? "bg-yellow-500/10 border-yellow-500/30" 
              : "bg-destructive/10 border-destructive/30"
        }`} 
        data-testid="global-timer"
      >
        {isStopping ? (
          <Loader2 className="h-4 w-4 text-yellow-600 animate-spin" />
        ) : hasStopError ? (
          <AlertCircle className="h-4 w-4 text-destructive" />
        ) : (
          <Clock className="h-4 w-4 text-destructive animate-pulse" />
        )}
        <span className="text-sm font-semibold text-destructive tabular-nums" data-testid="global-timer-display">
          {formatDuration(displaySeconds)}
        </span>
        {isStopping ? (
          <span className="text-xs text-yellow-600 font-medium">Saving...</span>
        ) : hasStopError ? (
          <span className="text-xs text-destructive font-medium">Save failed - Retry</span>
        ) : (
          <>
            {isRunning ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => pauseMutation.mutate()}
                disabled={pauseMutation.isPending}
                data-testid="button-global-pause"
              >
                <Pause className="h-3 w-3 mr-1" />
                Pause
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => resumeMutation.mutate()}
                disabled={resumeMutation.isPending}
                data-testid="button-global-resume"
              >
                <Play className="h-3 w-3 mr-1" />
                Resume
              </Button>
            )}
          </>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={handleOpenStopDialog}
          disabled={isStopping}
          data-testid="button-global-stop"
        >
          <Square className="h-3 w-3 mr-1" />
          {hasStopError ? "Retry" : "Stop"}
        </Button>
      </div>

      <Dialog open={stopDialogOpen} onOpenChange={setStopDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save Time Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Title <span className="text-destructive">*</span></Label>
              <Input
                value={stopTitle}
                onChange={(e) => setStopTitle(e.target.value)}
                placeholder="Brief summary of work"
                data-testid="input-global-stop-title"
              />
            </div>
            <div className="space-y-2">
              <Label>Client <span className="text-destructive">*</span></Label>
              <Select
                value={stopClientId || ""}
                onValueChange={(value) => setStopClientId(value || null)}
              >
                <SelectTrigger data-testid="select-global-stop-client" className={!stopClientId ? "border-destructive/50" : ""}>
                  <SelectValue placeholder="Select client (required)" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.displayName || client.companyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={stopDescription}
                onChange={(e) => setStopDescription(e.target.value)}
                placeholder="Additional details about the work performed..."
                className="min-h-[80px] resize-none"
                data-testid="input-global-stop-description"
              />
            </div>
            <div className="space-y-2">
              <Label>Task (optional)</Label>
              <TaskSelectorWithCreate
                taskId={stopTaskId}
                onTaskChange={setStopTaskId}
                projectId={null}
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-md border bg-muted/30">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">
                  {stopScope === "out_of_scope" ? "Out of Scope (Billable)" : "In Scope (Unbillable)"}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {stopScope === "out_of_scope" 
                    ? "Work outside original project scope" 
                    : "Work within original project scope"}
                </p>
              </div>
              <Switch
                checked={stopScope === "out_of_scope"}
                onCheckedChange={(checked) => setStopScope(checked ? "out_of_scope" : "in_scope")}
                data-testid="toggle-global-stop-scope"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => stopMutation.mutate({ discard: true })}
              disabled={stopMutation.isPending}
              data-testid="button-global-discard"
            >
              {stopMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Discarding...
                </>
              ) : (
                "Discard"
              )}
            </Button>
            <Button
              onClick={handleSaveEntry}
              disabled={stopMutation.isPending || !stopTitle.trim() || !stopClientId}
              data-testid="button-global-save-entry"
            >
              {stopMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Entry"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
