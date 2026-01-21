import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Play, Pause, Square, Clock } from "lucide-react";
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
import { TaskSelectorWithCreate } from "@/components/task-selector-with-create";
import { useAuth } from "@/lib/auth";

type ActiveTimer = {
  id: string;
  workspaceId: string;
  userId: string;
  clientId: string | null;
  projectId: string | null;
  taskId: string | null;
  description: string | null;
  status: "running" | "paused";
  elapsedSeconds: number;
  lastStartedAt: string | null;
  createdAt: string;
  client?: { id: string; companyName: string; displayName: string | null };
  project?: { id: string; name: string };
  task?: { id: string; title: string };
};

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function GlobalActiveTimer() {
  const { isAuthenticated, user } = useAuth();
  const { toast } = useToast();
  const [displaySeconds, setDisplaySeconds] = useState(0);
  const [stopDialogOpen, setStopDialogOpen] = useState(false);
  const [stopScope, setStopScope] = useState<"in_scope" | "out_of_scope">("in_scope");
  const [stopTitle, setStopTitle] = useState("");
  const [stopDescription, setStopDescription] = useState("");
  const [stopTaskId, setStopTaskId] = useState<string | null>(null);
  const [stopClientId, setStopClientId] = useState<string | null>(null);

  const { data: timer } = useQuery<ActiveTimer | null>({
    queryKey: ["/api/timer/current"],
    enabled: isAuthenticated && user?.role !== "super_user",
    refetchInterval: 30000,
  });

  const { data: clients = [] } = useQuery<Array<{ id: string; companyName: string; displayName: string | null }>>({
    queryKey: ["/api/clients"],
    enabled: isAuthenticated && user?.role !== "super_user",
  });

  const { data: projects = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["/api/projects"],
    enabled: isAuthenticated && user?.role !== "super_user",
  });

  const pauseMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/timer/pause"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timer/current"] });
      toast({ title: "Timer paused" });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/timer/resume"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timer/current"] });
      toast({ title: "Timer resumed" });
    },
  });

  const stopMutation = useMutation({
    mutationFn: (data: { discard?: boolean; scope?: string; description?: string; taskId?: string | null; clientId?: string | null }) =>
      apiRequest("POST", "/api/timer/stop", data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/timer/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      if (variables.discard) {
        toast({ title: "Timer discarded" });
      } else {
        toast({ title: "Time entry saved" });
      }
      setStopDialogOpen(false);
      resetStopForm();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save entry", description: error.message, variant: "destructive" });
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
    const finalDescription = stopTitle.trim() + (stopDescription.trim() ? `\n\n${stopDescription.trim()}` : "");
    stopMutation.mutate({
      scope: stopScope,
      description: finalDescription,
      taskId: stopTaskId,
      clientId: stopClientId,
    });
  };

  if (!timer) {
    return null;
  }

  const isRunning = timer.status === "running";

  return (
    <>
      <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-destructive/10 border border-destructive/30" data-testid="global-timer">
        <Clock className="h-4 w-4 text-destructive animate-pulse" />
        <span className="font-mono text-sm font-semibold text-destructive" data-testid="global-timer-display">
          {formatDuration(displaySeconds)}
        </span>
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
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={handleOpenStopDialog}
          data-testid="button-global-stop"
        >
          <Square className="h-3 w-3 mr-1" />
          Stop
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
              Discard
            </Button>
            <Button
              onClick={handleSaveEntry}
              disabled={stopMutation.isPending || !stopTitle.trim() || !stopClientId}
              data-testid="button-global-save-entry"
            >
              Save Entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
