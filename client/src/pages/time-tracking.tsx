import { useState, useEffect, useCallback, memo, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Clock, Play, Pause, Square, Plus, Download, Filter, 
  ChevronDown, Timer, Calendar, BarChart3, Trash2, Edit2, MoreHorizontal, X, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { FullScreenDrawer, FullScreenDrawerFooter } from "@/components/ui/full-screen-drawer";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { TaskSelectorWithCreate } from "@/features/tasks/task-selector-with-create";
import { StartTimerDrawer } from "@/features/timer/start-timer-drawer";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { RichTextEditor } from "@/components/richtext";
import { GroupedVirtuoso } from "react-virtuoso";

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

type TimeEntry = {
  id: string;
  workspaceId: string;
  userId: string;
  clientId: string | null;
  projectId: string | null;
  taskId: string | null;
  title: string | null;
  description: string | null;
  startTime: string;
  endTime: string | null;
  durationSeconds: number;
  scope: "in_scope" | "out_of_scope";
  isManual: boolean;
  createdAt: string;
  client?: { id: string; companyName: string; displayName: string | null };
  project?: { id: string; name: string };
  task?: { id: string; title: string };
  user?: { id: string; name: string; email: string };
};

type ReportSummary = {
  totalSeconds: number;
  inScopeSeconds: number;
  outOfScopeSeconds: number;
  entryCount: number;
  byClient: Array<{ id: string; name: string; seconds: number }>;
  byProject: Array<{ id: string; name: string; clientName: string | null; seconds: number }>;
  byUser: Array<{ id: string; name: string; seconds: number }>;
};

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function formatDurationShort(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

const ActiveTimerPanel = memo(function ActiveTimerPanel() {
  const { toast } = useToast();
  const [displaySeconds, setDisplaySeconds] = useState(0);
  const [stopDialogOpen, setStopDialogOpen] = useState(false);
  const [stopScope, setStopScope] = useState<"in_scope" | "out_of_scope">("in_scope");
  const [stopTitle, setStopTitle] = useState("");
  const [stopDescription, setStopDescription] = useState("");
  const [stopTaskId, setStopTaskId] = useState<string | null>(null);
  const [stopClientId, setStopClientId] = useState<string | null>(null);

  const { data: timer, isLoading } = useQuery<ActiveTimer | null>({
    queryKey: ["/api/timer/current"],
  });

  const { data: projects = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["/api/projects"],
  });

  const { data: clients = [] } = useQuery<Array<{ id: string; companyName: string; displayName: string | null }>>({
    queryKey: ["/api/clients"],
  });

  const startMutation = useMutation({
    mutationFn: (data: { clientId?: string; projectId?: string; description?: string }) =>
      apiRequest("POST", "/api/timer/start", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timer/current"] });
      toast({ title: "Timer started" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to start timer", description: error.message, variant: "destructive" });
    },
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
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["/api/timer/current"] });
      const previousTimer = queryClient.getQueryData(["/api/timer/current"]);
      queryClient.setQueryData(["/api/timer/current"], null);
      return { previousTimer };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/timer/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/my/stats"] });
      if (variables.discard) {
        toast({ title: "Timer discarded" });
      } else {
        toast({ title: "Time entry saved", description: "Your time entry has been recorded successfully" });
      }
      setStopDialogOpen(false);
      setStopTaskId(null);
      setStopTitle("");
      setStopDescription("");
      setStopClientId(null);
      setStopScope("in_scope");
    },
    onError: (error: Error, _, context: any) => {
      if (context?.previousTimer) {
        queryClient.setQueryData(["/api/timer/current"], context.previousTimer);
      }
      toast({ title: "Failed to save entry", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: { clientId?: string | null; projectId?: string | null; description?: string | null }) =>
      apiRequest("PATCH", "/api/timer/current", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timer/current"] });
    },
  });

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
  }, [timer?.taskId, timer?.projectId]);

  useEffect(() => {
    setStopClientId(timer?.clientId || null);
  }, [timer?.clientId]);

  const handleStartTimer = useCallback(() => {
    startMutation.mutate({});
  }, [startMutation]);

  if (isLoading) {
    return (
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-muted animate-pulse" />
            <div className="flex-1">
              <div className="h-8 w-32 bg-muted animate-pulse rounded mb-2" />
              <div className="h-4 w-24 bg-muted animate-pulse rounded" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!timer) {
    return (
      <Card className="mb-4 sm:mb-6">
        <CardContent className="p-3 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex items-center justify-center h-12 w-12 sm:h-16 sm:w-16 rounded-full bg-muted shrink-0">
                <Timer className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl sm:text-3xl tabular-nums font-bold text-foreground" data-testid="text-timer-display">
                  00:00:00
                </p>
                <p className="text-sm text-muted-foreground">No active timer</p>
              </div>
            </div>
            <Button
              onClick={handleStartTimer}
              disabled={startMutation.isPending}
              className="w-full sm:w-auto"
              data-testid="button-start-timer"
            >
              <Play className="h-5 w-5 mr-2" />
              Start Timer
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="mb-4 sm:mb-6 border-primary/50">
        <CardContent className="p-3 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className={`flex items-center justify-center h-12 w-12 sm:h-16 sm:w-16 rounded-full shrink-0 ${
                timer.status === "running" ? "bg-primary/20 animate-pulse" : "bg-muted"
              }`}>
                <Timer className={`h-6 w-6 sm:h-8 sm:w-8 ${timer.status === "running" ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <div>
                <p className="text-3xl sm:text-4xl tabular-nums font-bold text-foreground" data-testid="text-timer-display">
                  {formatDuration(displaySeconds)}
                </p>
                <Badge variant={timer.status === "running" ? "default" : "secondary"}>
                  {timer.status === "running" ? "Running" : "Paused"}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {timer.status === "running" ? (
                <Button
                  variant="outline"
                  onClick={() => pauseMutation.mutate()}
                  disabled={pauseMutation.isPending}
                  className="flex-1 sm:flex-none"
                  data-testid="button-pause-timer"
                >
                  <Pause className="h-5 w-5 mr-2" />
                  Pause
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => resumeMutation.mutate()}
                  disabled={resumeMutation.isPending}
                  className="flex-1 sm:flex-none"
                  data-testid="button-resume-timer"
                >
                  <Play className="h-5 w-5 mr-2" />
                  Resume
                </Button>
              )}
              <Button
                onClick={() => setStopDialogOpen(true)}
                className="flex-1 sm:flex-none"
                data-testid="button-stop-timer"
              >
                <Square className="h-5 w-5 mr-2" />
                Stop
              </Button>
            </div>
          </div>

          <Separator className="my-4" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Client</Label>
              <Select
                value={timer.clientId || "none"}
                onValueChange={(value) => updateMutation.mutate({ clientId: value === "none" ? null : value })}
              >
                <SelectTrigger data-testid="select-timer-client">
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No client</SelectItem>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.displayName || client.companyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Project</Label>
              <Select
                value={timer.projectId || "none"}
                onValueChange={(value) => updateMutation.mutate({ projectId: value === "none" ? null : value })}
              >
                <SelectTrigger data-testid="select-timer-project">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Description</Label>
              <div className="min-h-[80px] border rounded-md focus-within:ring-1 focus-within:ring-ring transition-shadow mt-1">
                <RichTextEditor
                  value={timer.description || ""}
                  onChange={(val) => updateMutation.mutate({ description: val })}
                  placeholder="What are you working on?"
                  className="border-0 focus-visible:ring-0"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={stopDialogOpen} onOpenChange={setStopDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stop Timer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="text-center">
              <p className="text-3xl tabular-nums font-bold">{formatDuration(displaySeconds)}</p>
              <p className="text-sm text-muted-foreground mt-1">Total time tracked</p>
            </div>
            <div className="space-y-2">
              <Label>Title <span className="text-destructive">*</span></Label>
              <Input
                value={stopTitle}
                onChange={(e) => setStopTitle(e.target.value)}
                placeholder="Brief summary of work"
                data-testid="input-stop-title"
              />
            </div>
            <div className="space-y-2">
              <Label>Client <span className="text-destructive">*</span></Label>
              <Select
                value={stopClientId || ""}
                onValueChange={(value) => setStopClientId(value || null)}
              >
                <SelectTrigger data-testid="select-stop-client" className={!stopClientId ? "border-destructive/50" : ""}>
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
              <div className="min-h-[100px] border rounded-md focus-within:ring-1 focus-within:ring-ring transition-shadow">
                <RichTextEditor
                  value={stopDescription}
                  onChange={(val) => setStopDescription(val)}
                  placeholder="What did you work on?"
                  className="border-0 focus-visible:ring-0"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Scope</Label>
              <div className="flex gap-2" data-testid="toggle-stop-scope">
                <Button
                  type="button"
                  variant={stopScope === "in_scope" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setStopScope("in_scope")}
                  data-testid="button-scope-in"
                >
                  In Scope (Unbillable)
                </Button>
                <Button
                  type="button"
                  variant={stopScope === "out_of_scope" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setStopScope("out_of_scope")}
                  data-testid="button-scope-out"
                >
                  Out of Scope (Billable)
                </Button>
              </div>
            </div>
            {timer?.projectId && (
              <TaskSelectorWithCreate
                projectId={timer.projectId}
                taskId={stopTaskId}
                onTaskChange={setStopTaskId}
              />
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => stopMutation.mutate({ discard: true })}
              disabled={stopMutation.isPending}
              data-testid="button-discard-timer"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Discard
            </Button>
            <Button
              onClick={() => {
                if (!stopTitle.trim()) {
                  toast({ title: "Title required", description: "Please enter a title for this time entry", variant: "destructive" });
                  return;
                }
                if (!stopClientId) {
                  toast({ title: "Client required", description: "Please select a client for this time entry", variant: "destructive" });
                  return;
                }
                stopMutation.mutate({ 
                  scope: stopScope, 
                  description: `${stopTitle}${stopDescription ? '\n\n' + stopDescription : ''}`,
                  taskId: stopTaskId,
                  clientId: stopClientId
                });
              }}
              disabled={stopMutation.isPending || !stopTitle.trim() || !stopClientId}
              data-testid="button-save-timer"
            >
              Save Entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
});

/**
 * ManualEntryDialog - Full-screen drawer for creating manual time entries
 * 
 * SELECTION CASCADE LOGIC:
 * 1. Client selection → filters available Projects to that client
 * 2. Project selection → enables Task dropdown with open tasks from project
 * 3. Task selection → if task has subtasks, shows Subtask dropdown
 * 4. Clear cascade: changing Client clears Project/Task/Subtask
 *                   changing Project clears Task/Subtask
 *                   changing Task clears Subtask
 * 
 * Final task assignment: finalTaskId = subtaskId || taskId
 */
const ManualEntryDialog = memo(function ManualEntryDialog({ 
  open, 
  onOpenChange 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState("0");
  const [minutes, setMinutes] = useState("30");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [clientId, setClientId] = useState<string | null>(null);
  const [divisionId, setDivisionId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [subtaskId, setSubtaskId] = useState<string | null>(null);
  const [scope, setScope] = useState<"in_scope" | "out_of_scope">("in_scope");

  const { data: clients = [] } = useQuery<Array<{ id: string; companyName: string; displayName: string | null }>>({
    queryKey: ["/api/clients"],
    enabled: open,
  });

  const { data: clientDivisions = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["/api/v1/clients", clientId, "divisions"],
    queryFn: () => fetch(`/api/v1/clients/${clientId}/divisions`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!clientId && open,
  });

  const clientHasDivisions = clientDivisions.length > 0;

  const { data: clientProjects = [] } = useQuery<Array<{ id: string; name: string; clientId: string | null; divisionId?: string | null }>>({
    queryKey: ["/api/clients", clientId, "projects"],
    queryFn: () => fetch(`/api/clients/${clientId}/projects`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!clientId && open,
  });

  const filteredProjects = clientHasDivisions && divisionId
    ? clientProjects.filter(p => p.divisionId === divisionId)
    : clientProjects;

  const { data: projectTasks = [] } = useQuery<Array<{ id: string; title: string; parentTaskId: string | null; status: string }>>({
    queryKey: ["/api/projects", projectId, "tasks"],
    queryFn: () => fetch(`/api/projects/${projectId}/tasks`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!projectId && open,
  });

  const openTasks = projectTasks.filter((t) => t.status !== "done" && !t.parentTaskId);
  const subtasks = projectTasks.filter((t) => t.parentTaskId === taskId && t.status !== "done");
  const hasSubtasks = subtasks.length > 0;

  const handleClientChange = (newClientId: string | null) => {
    setClientId(newClientId);
    setDivisionId(null);
    setProjectId(null);
    setTaskId(null);
    setSubtaskId(null);
  };

  const handleDivisionChange = (newDivisionId: string | null) => {
    setDivisionId(newDivisionId);
    setProjectId(null);
    setTaskId(null);
    setSubtaskId(null);
  };

  const handleProjectChange = (newProjectId: string | null) => {
    setProjectId(newProjectId);
    setTaskId(null);
    setSubtaskId(null);
  };

  const handleTaskChange = (newTaskId: string | null) => {
    setTaskId(newTaskId);
    setSubtaskId(null);
  };

  const createMutation = useMutation({
    mutationFn: (data: {
      title: string;
      description: string;
      durationSeconds: number;
      startTime: string;
      clientId: string | null;
      projectId: string | null;
      taskId: string | null;
      scope: string;
    }) => apiRequest("POST", "/api/time-entries", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/my/stats"] });
      toast({ title: "Time entry created" });
      onOpenChange(false);
      setTitle("");
      setDescription("");
      setHours("0");
      setMinutes("30");
      setClientId(null);
      setDivisionId(null);
      setProjectId(null);
      setTaskId(null);
      setSubtaskId(null);
      setScope("in_scope");
      setDate(format(new Date(), "yyyy-MM-dd"));
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create entry", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!clientId) {
      toast({ title: "Client required", description: "Please select a client for this time entry", variant: "destructive" });
      return;
    }
    const durationSeconds = parseInt(hours) * 3600 + parseInt(minutes) * 60;
    if (durationSeconds === 0) {
      toast({ title: "Duration required", description: "Please enter a duration greater than 0", variant: "destructive" });
      return;
    }
    const startTime = new Date(`${date}T09:00:00`);
    const finalTaskId = subtaskId || taskId;
    createMutation.mutate({
      title,
      description,
      durationSeconds,
      startTime: startTime.toISOString(),
      clientId,
      projectId,
      taskId: finalTaskId,
      scope,
    });
  };

  const initialDate = format(new Date(), "yyyy-MM-dd");
  const hasChanges = 
    title !== "" ||
    description !== "" || 
    hours !== "0" || 
    minutes !== "30" || 
    clientId !== null || 
    divisionId !== null ||
    projectId !== null || 
    taskId !== null ||
    subtaskId !== null ||
    date !== initialDate ||
    scope !== "in_scope";

  return (
    <FullScreenDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Add Manual Time Entry"
      description="Log time spent on a task"
      hasUnsavedChanges={hasChanges}
      width="xl"
      footer={
        <FullScreenDrawerFooter
          onCancel={() => onOpenChange(false)}
          onSave={handleSubmit}
          isLoading={createMutation.isPending}
          saveLabel="Save Entry"
        />
      }
    >
      <div className="space-y-6">
        <div className="space-y-2">
          <Label>Title</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Brief title for this time entry"
            data-testid="input-manual-title"
          />
        </div>
        <div className="space-y-2">
          <Label>Description</Label>
          <div 
            className="min-h-[120px] border rounded-md focus-within:ring-1 focus-within:ring-ring transition-shadow"
            data-testid="input-manual-description"
          >
            <RichTextEditor
              value={description}
              onChange={(val) => setDescription(val)}
              placeholder="What did you work on?"
              className="border-0 focus-visible:ring-0"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label>Hours</Label>
            <Input
              type="number"
              min="0"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              data-testid="input-manual-hours"
            />
          </div>
          <div className="space-y-2">
            <Label>Minutes</Label>
            <Input
              type="number"
              min="0"
              max="59"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              data-testid="input-manual-minutes"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Date</Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            data-testid="input-manual-date"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label>Client <span className="text-destructive">*</span></Label>
            <Select value={clientId || ""} onValueChange={(v) => handleClientChange(v || null)}>
              <SelectTrigger data-testid="select-manual-client" className={!clientId ? "border-destructive/50" : ""}>
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
          {clientHasDivisions && (
            <div className="space-y-2">
              <Label>Division</Label>
              <Select 
                value={divisionId || "none"} 
                onValueChange={(v) => handleDivisionChange(v === "none" ? null : v)}
              >
                <SelectTrigger data-testid="select-manual-division">
                  <SelectValue placeholder="Select division" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">All divisions</SelectItem>
                  {clientDivisions.map((division) => (
                    <SelectItem key={division.id} value={division.id}>
                      {division.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div className={`grid grid-cols-1 ${clientHasDivisions ? "" : "md:grid-cols-2"} gap-6`}>
          <div className="space-y-2">
            <Label>Project</Label>
            <Select 
              value={projectId || "none"} 
              onValueChange={(v) => handleProjectChange(v === "none" ? null : v)}
              disabled={!clientId}
            >
              <SelectTrigger data-testid="select-manual-project">
                <SelectValue placeholder={clientId ? "Select project" : "Select client first"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No project</SelectItem>
                {filteredProjects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <TaskSelectorWithCreate
            projectId={projectId}
            taskId={taskId}
            onTaskChange={handleTaskChange}
            disabled={!projectId}
          />
          {hasSubtasks && (
            <div className="space-y-2">
              <Label>Subtask</Label>
              <Select 
                value={subtaskId || "none"} 
                onValueChange={(v) => setSubtaskId(v === "none" ? null : v)}
              >
                <SelectTrigger data-testid="select-manual-subtask">
                  <SelectValue placeholder="Select subtask (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No subtask</SelectItem>
                  {subtasks.map((st) => (
                    <SelectItem key={st.id} value={st.id}>
                      {st.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <Label>Scope</Label>
          <div className="flex gap-2" data-testid="toggle-manual-scope">
            <Button
              type="button"
              variant={scope === "in_scope" ? "default" : "outline"}
              className="flex-1"
              onClick={() => setScope("in_scope")}
              data-testid="button-manual-scope-in"
            >
              In Scope (Unbillable)
            </Button>
            <Button
              type="button"
              variant={scope === "out_of_scope" ? "default" : "outline"}
              className="flex-1"
              onClick={() => setScope("out_of_scope")}
              data-testid="button-manual-scope-out"
            >
              Out of Scope (Billable)
            </Button>
          </div>
        </div>
      </div>
    </FullScreenDrawer>
  );
});

/**
 * EditTimeEntryDrawer - Full-screen drawer for editing time entries
 * 
 * SELECTION CASCADE LOGIC:
 * 1. Client selection → filters available Projects to that client
 * 2. Project selection → enables Task dropdown with open tasks from project
 * 3. Task selection → if task has subtasks, shows Subtask dropdown
 * 4. Clear cascade: changing Client clears Project/Task/Subtask
 *                   changing Project clears Task/Subtask
 *                   changing Task clears Subtask
 * 
 * Final task assignment: finalTaskId = subtaskId || taskId
 */
interface EditTimeEntryDrawerProps {
  entry: TimeEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EditTimeEntryDrawer = memo(function EditTimeEntryDrawer({ entry, open, onOpenChange }: EditTimeEntryDrawerProps) {
  const { toast } = useToast();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  
  const [clientId, setClientId] = useState<string | null>(null);
  const [divisionId, setDivisionId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [subtaskId, setSubtaskId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [entryDate, setEntryDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [durationHours, setDurationHours] = useState(0);
  const [durationMinutes, setDurationMinutes] = useState(0);
  const [scope, setScope] = useState<"in_scope" | "out_of_scope">("in_scope");
  const [useTimeRange, setUseTimeRange] = useState(false);

  useEffect(() => {
    if (entry && open) {
      setClientId(entry.clientId);
      setDivisionId(null);
      setProjectId(entry.projectId);
      setTaskId(entry.taskId);
      setSubtaskId(null);
      setTitle(entry.title || "");
      setDescription(entry.description || "");
      setScope(entry.scope);
      
      const start = parseISO(entry.startTime);
      setEntryDate(format(start, "yyyy-MM-dd"));
      setStartTime(format(start, "HH:mm"));
      
      if (entry.endTime) {
        setEndTime(format(parseISO(entry.endTime), "HH:mm"));
        setUseTimeRange(true);
      } else {
        setEndTime("");
        setUseTimeRange(false);
      }
      
      const hours = Math.floor(entry.durationSeconds / 3600);
      const minutes = Math.floor((entry.durationSeconds % 3600) / 60);
      setDurationHours(hours);
      setDurationMinutes(minutes);
      setHasChanges(false);
    }
  }, [entry, open]);

  const markChanged = () => setHasChanges(true);

  const { data: clients = [] } = useQuery<Array<{ id: string; companyName: string; displayName: string | null }>>({
    queryKey: ["/api/clients"],
    enabled: open,
  });

  const { data: clientDivisions = [], isLoading: divisionsLoading } = useQuery<Array<{ id: string; name: string; color?: string | null }>>({
    queryKey: ["/api/v1/clients", clientId, "divisions"],
    queryFn: () => fetch(`/api/v1/clients/${clientId}/divisions`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!clientId && open,
  });

  const clientHasDivisions = clientDivisions.length > 0;

  const { data: allClientProjects = [] } = useQuery<Array<{ id: string; name: string; divisionId?: string | null }>>({
    queryKey: ["/api/clients", clientId, "projects"],
    queryFn: () => fetch(`/api/clients/${clientId}/projects`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!clientId && open,
  });

  useEffect(() => {
    if (projectId && allClientProjects.length > 0 && clientHasDivisions && divisionId === null) {
      const currentProject = allClientProjects.find(p => p.id === projectId);
      if (currentProject?.divisionId) {
        setDivisionId(currentProject.divisionId);
      }
    }
  }, [projectId, allClientProjects, clientHasDivisions, divisionId]);

  const clientProjects = clientHasDivisions && divisionId
    ? allClientProjects.filter(p => p.divisionId === divisionId)
    : allClientProjects;

  const { data: projectTasks = [] } = useQuery<Array<{ id: string; title: string; parentTaskId: string | null; status: string }>>({
    queryKey: ["/api/projects", projectId, "tasks"],
    queryFn: () => fetch(`/api/projects/${projectId}/tasks`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!projectId && open,
  });

  const openTasks = projectTasks.filter((t) => t.status !== "done" && !t.parentTaskId);
  const subtasks = projectTasks.filter((t) => t.parentTaskId === taskId && t.status !== "done");
  const hasSubtasks = subtasks.length > 0;

  const updateMutation = useMutation({
    mutationFn: async (data: {
      clientId: string | null;
      projectId: string | null;
      taskId: string | null;
      title: string | null;
      description: string | null;
      startTime: string;
      endTime: string | null;
      durationSeconds: number;
      scope: "in_scope" | "out_of_scope";
    }) => {
      return apiRequest("PATCH", `/api/time-entries/${entry?.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/my/stats"] });
      toast({ title: "Time entry updated" });
      setHasChanges(false);
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update time entry", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/time-entries/${entry?.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/my/stats"] });
      toast({ title: "Time entry deleted" });
      setDeleteDialogOpen(false);
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Failed to delete time entry", variant: "destructive" });
    },
  });

  const handleClientChange = (newClientId: string | null) => {
    setClientId(newClientId);
    setDivisionId(null);
    setProjectId(null);
    setTaskId(null);
    setSubtaskId(null);
    markChanged();
  };

  const handleDivisionChange = (newDivisionId: string | null) => {
    setDivisionId(newDivisionId);
    setProjectId(null);
    setTaskId(null);
    setSubtaskId(null);
    markChanged();
  };

  const handleProjectChange = (newProjectId: string | null) => {
    setProjectId(newProjectId);
    setTaskId(null);
    setSubtaskId(null);
    markChanged();
  };

  const handleTaskChange = (newTaskId: string | null) => {
    setTaskId(newTaskId);
    setSubtaskId(null);
    markChanged();
  };

  const handleSubtaskChange = (newSubtaskId: string | null) => {
    setSubtaskId(newSubtaskId);
    markChanged();
  };

  const handleSave = () => {
    if (!entryDate) {
      toast({ title: "Date is required", variant: "destructive" });
      return;
    }

    let durationSeconds: number;
    let calculatedStartTime: Date;
    let calculatedEndTime: Date | null = null;

    if (useTimeRange && startTime && endTime) {
      calculatedStartTime = new Date(`${entryDate}T${startTime}:00`);
      calculatedEndTime = new Date(`${entryDate}T${endTime}:00`);
      
      if (calculatedEndTime <= calculatedStartTime) {
        calculatedEndTime.setDate(calculatedEndTime.getDate() + 1);
      }
      
      durationSeconds = Math.floor((calculatedEndTime.getTime() - calculatedStartTime.getTime()) / 1000);
    } else {
      durationSeconds = (durationHours * 3600) + (durationMinutes * 60);
      calculatedStartTime = new Date(`${entryDate}T${startTime || "09:00"}:00`);
    }

    if (durationSeconds <= 0) {
      toast({ title: "Duration must be greater than zero", variant: "destructive" });
      return;
    }

    const finalTaskId = subtaskId || taskId;

    updateMutation.mutate({
      clientId,
      projectId,
      taskId: finalTaskId,
      title: title.trim() || null,
      description: description || null,
      startTime: calculatedStartTime.toISOString(),
      endTime: calculatedEndTime?.toISOString() || null,
      durationSeconds,
      scope,
    });
  };

  const handleClose = () => {
    setHasChanges(false);
    onOpenChange(false);
  };

  if (!entry) return null;

  const totalMinutes = durationHours * 60 + durationMinutes;
  const isValid = useTimeRange ? (startTime && endTime) : totalMinutes > 0;

  return (
    <>
      <FullScreenDrawer
        open={open}
        onOpenChange={onOpenChange}
        title="Edit Time Entry"
        description="Modify the details of this time entry"
        hasUnsavedChanges={hasChanges}
        onConfirmClose={handleClose}
        width="xl"
        footer={
          <FullScreenDrawerFooter
            onCancel={() => onOpenChange(false)}
            onSave={handleSave}
            isLoading={updateMutation.isPending}
            saveLabel="Save Changes"
            saveDisabled={!isValid}
          />
        }
      >
        <div className="space-y-6">
          <div>
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => { setTitle(e.target.value); markChanged(); }}
              placeholder="Brief summary of work"
              className="mt-2"
              data-testid="input-edit-title"
            />
          </div>

          <div>
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => { setDescription(e.target.value); markChanged(); }}
              placeholder="What did you work on?"
              className="min-h-[100px] resize-none mt-2"
              data-testid="input-edit-description"
            />
          </div>

          <Separator />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label>Client <span className="text-destructive">*</span></Label>
              <Select
                value={clientId || "none"}
                onValueChange={(v) => handleClientChange(v === "none" ? null : v)}
              >
                <SelectTrigger className="mt-2" data-testid="select-edit-client">
                  <SelectValue placeholder="Select client (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No client</SelectItem>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.displayName || client.companyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {clientId && divisionsLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading divisions...
              </div>
            )}

            {clientHasDivisions && (
              <div>
                <Label>Division</Label>
                <Select
                  value={divisionId || "none"}
                  onValueChange={(v) => handleDivisionChange(v === "none" ? null : v)}
                >
                  <SelectTrigger className="mt-2" data-testid="select-edit-division">
                    <SelectValue placeholder="Select division" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">All divisions</SelectItem>
                    {clientDivisions.map((division) => (
                      <SelectItem key={division.id} value={division.id}>
                        <div className="flex items-center gap-2">
                          {division.color && (
                            <div
                              className="h-3 w-3 rounded-full shrink-0"
                              style={{ backgroundColor: division.color }}
                            />
                          )}
                          {division.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className={`grid grid-cols-1 ${clientHasDivisions ? "" : "md:grid-cols-2"} gap-6`}>
            <div>
              <Label>Project</Label>
              <Select
                value={projectId || "none"}
                onValueChange={(v) => handleProjectChange(v === "none" ? null : v)}
                disabled={!clientId}
              >
                <SelectTrigger className="mt-2" data-testid="select-edit-project">
                  <SelectValue placeholder={clientId ? "Select project" : "Select client first"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project</SelectItem>
                  {clientProjects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <TaskSelectorWithCreate
              projectId={projectId}
              taskId={taskId}
              onTaskChange={(newTaskId) => { handleTaskChange(newTaskId); }}
              disabled={!projectId}
            />

            {hasSubtasks && (
              <div>
                <Label>Subtask</Label>
                <Select
                  value={subtaskId || "none"}
                  onValueChange={(v) => handleSubtaskChange(v === "none" ? null : v)}
                >
                  <SelectTrigger className="mt-2" data-testid="select-edit-subtask">
                    <SelectValue placeholder="Select subtask (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No subtask</SelectItem>
                    {subtasks.map((st) => (
                      <SelectItem key={st.id} value={st.id}>
                        {st.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <Separator />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label>Date *</Label>
              <Input
                type="date"
                value={entryDate}
                onChange={(e) => { setEntryDate(e.target.value); markChanged(); }}
                className="mt-2"
                data-testid="input-edit-date"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label>Time</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => { setUseTimeRange(!useTimeRange); markChanged(); }}
                  className="text-xs"
                  data-testid="button-toggle-time-input"
                >
                  {useTimeRange ? "Use duration" : "Use time range"}
                </Button>
              </div>
              
              {useTimeRange ? (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Start</Label>
                    <Input
                      type="time"
                      value={startTime}
                      onChange={(e) => { setStartTime(e.target.value); markChanged(); }}
                      data-testid="input-edit-start-time"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">End</Label>
                    <Input
                      type="time"
                      value={endTime}
                      onChange={(e) => { setEndTime(e.target.value); markChanged(); }}
                      data-testid="input-edit-end-time"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Hours</Label>
                    <Input
                      type="number"
                      min={0}
                      value={durationHours}
                      onChange={(e) => { setDurationHours(parseInt(e.target.value) || 0); markChanged(); }}
                      data-testid="input-edit-duration-hours"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Minutes</Label>
                    <Input
                      type="number"
                      min={0}
                      max={59}
                      value={durationMinutes}
                      onChange={(e) => { setDurationMinutes(parseInt(e.target.value) || 0); markChanged(); }}
                      data-testid="input-edit-duration-minutes"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div>
            <Label>Scope</Label>
            <div className="flex gap-2 mt-2" data-testid="toggle-edit-scope">
              <Button
                type="button"
                variant={scope === "in_scope" ? "default" : "outline"}
                className="flex-1"
                onClick={() => { setScope("in_scope"); markChanged(); }}
                data-testid="button-edit-scope-in"
              >
                In Scope (Unbillable)
              </Button>
              <Button
                type="button"
                variant={scope === "out_of_scope" ? "default" : "outline"}
                className="flex-1"
                onClick={() => { setScope("out_of_scope"); markChanged(); }}
                data-testid="button-edit-scope-out"
              >
                Out of Scope (Billable)
              </Button>
            </div>
          </div>

          <Separator />

          <Button
            variant="destructive"
            onClick={() => setDeleteDialogOpen(true)}
            className="w-full"
            data-testid="button-delete-entry"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Entry
          </Button>
        </div>
      </FullScreenDrawer>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Time Entry</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this time entry? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});

const TimeEntriesList = memo(function TimeEntriesList() {
  const [manualEntryOpen, setManualEntryOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<TimeEntry | null>(null);
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "week" | "month">("week");

  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    switch (dateFilter) {
      case "today":
        return { startDate: format(now, "yyyy-MM-dd"), endDate: format(now, "yyyy-MM-dd") };
      case "week":
        return { startDate: format(startOfWeek(now), "yyyy-MM-dd"), endDate: format(endOfWeek(now), "yyyy-MM-dd") };
      case "month":
        return { startDate: format(startOfMonth(now), "yyyy-MM-dd"), endDate: format(endOfMonth(now), "yyyy-MM-dd") };
      default:
        return {};
    }
  }, [dateFilter]);
  const queryParams = new URLSearchParams();
  if (startDate) queryParams.set("startDate", startDate);
  if (endDate) queryParams.set("endDate", endDate);

  const { data: entries = [], isLoading } = useQuery<TimeEntry[]>({
    queryKey: ["/api/time-entries", dateFilter],
    queryFn: () => 
      fetch(`/api/time-entries?${queryParams.toString()}`).then(r => r.json()),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/time-entries/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/my/stats"] });
    },
  });

  const { groupedEntries, sortedDates } = useMemo(() => {
    const grouped = entries.reduce((acc, entry) => {
      const date = format(parseISO(entry.startTime), "yyyy-MM-dd");
      if (!acc[date]) acc[date] = [];
      acc[date].push(entry);
      return acc;
    }, {} as Record<string, TimeEntry[]>);

    const sorted = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

    return { groupedEntries: grouped, sortedDates: sorted };
  }, [entries]);

  const VIRTUALIZE_THRESHOLD = 30;
  const totalEntryCount = entries.length;
  const useVirtualized = totalEntryCount > VIRTUALIZE_THRESHOLD;

  const { groupCounts, flatEntries, dayTotals } = useMemo(() => {
    if (!useVirtualized) return { groupCounts: [] as number[], flatEntries: [] as TimeEntry[], dayTotals: [] as number[] };
    const counts: number[] = [];
    const flat: TimeEntry[] = [];
    const totals: number[] = [];
    for (const date of sortedDates) {
      const dayEntries = groupedEntries[date];
      counts.push(dayEntries.length);
      totals.push(dayEntries.reduce((sum, e) => sum + e.durationSeconds, 0));
      flat.push(...dayEntries);
    }
    return { groupCounts: counts, flatEntries: flat, dayTotals: totals };
  }, [useVirtualized, sortedDates, groupedEntries]);

  const renderGroupHeader = useCallback((index: number) => {
    const date = sortedDates[index];
    const total = dayTotals[index];
    return (
      <div className="flex items-center justify-between py-2 pt-4 first:pt-0 bg-card" data-testid={`time-group-${date}`}>
        <h3 className="text-sm font-medium text-muted-foreground">
          {format(parseISO(date), "EEEE, MMMM d")}
        </h3>
        <Badge variant="secondary">{formatDurationShort(total)}</Badge>
      </div>
    );
  }, [sortedDates, dayTotals]);

  const renderEntry = useCallback((index: number) => {
    const entry = flatEntries[index];
    if (!entry) return null;
    return (
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg bg-muted/50 hover-elevate gap-2 mb-2"
        data-testid={`time-entry-${entry.id}`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <p className="text-sm font-medium truncate">
              {entry.title || entry.description || "No title"}
            </p>
            <Badge
              variant={entry.scope === "out_of_scope" ? "default" : "secondary"}
              className="text-xs"
            >
              {entry.scope === "out_of_scope" ? "Billable" : "Unbillable"}
            </Badge>
            {entry.isManual && (
              <Badge variant="outline" className="text-xs">Manual</Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            {entry.client && (
              <span>{entry.client.displayName || entry.client.companyName}</span>
            )}
            {entry.client && entry.project && <span>·</span>}
            {entry.project && <span>{entry.project.name}</span>}
            {entry.task && (
              <>
                <span>·</span>
                <span>{entry.task.title}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
          <div className="text-left sm:text-right">
            <p className="text-sm tabular-nums font-medium">
              {formatDurationShort(entry.durationSeconds)}
            </p>
            <p className="text-xs text-muted-foreground">
              {format(parseISO(entry.startTime), "h:mm a")}
              {entry.endTime && ` - ${format(parseISO(entry.endTime), "h:mm a")}`}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Time entry options" data-testid={`button-entry-menu-${entry.id}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => setEditEntry(entry)}
                data-testid={`button-edit-entry-${entry.id}`}
              >
                <Edit2 className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => deleteMutation.mutate(entry.id)}
                className="text-destructive"
                data-testid={`button-delete-entry-${entry.id}`}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  }, [flatEntries, deleteMutation, setEditEntry]);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <CardTitle className="text-lg font-medium">Time Entries</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as any)}>
              <SelectTrigger className="w-28 sm:w-32" data-testid="select-date-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => setManualEntryOpen(true)} data-testid="button-add-manual-entry">
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Add Manual Entry</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : sortedDates.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
              <p className="text-muted-foreground">No time entries found for this period</p>
            </div>
          ) : useVirtualized ? (
            <GroupedVirtuoso
              style={{ height: "min(60vh, 600px)" }}
              groupCounts={groupCounts}
              groupContent={renderGroupHeader}
              itemContent={renderEntry}
              overscan={200}
            />
          ) : (
            <div className="space-y-6">
              {sortedDates.map((date) => {
                const dayEntries = groupedEntries[date];
                const dayTotal = dayEntries.reduce((sum, e) => sum + e.durationSeconds, 0);
                return (
                  <div key={date} data-testid={`time-group-${date}`}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-medium text-muted-foreground">
                        {format(parseISO(date), "EEEE, MMMM d")}
                      </h3>
                      <Badge variant="secondary">{formatDurationShort(dayTotal)}</Badge>
                    </div>
                    <div className="space-y-2">
                      {dayEntries.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg bg-muted/50 hover-elevate gap-2"
                          data-testid={`time-entry-${entry.id}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <p className="text-sm font-medium truncate">
                                {entry.title || entry.description || "No title"}
                              </p>
                              <Badge
                                variant={entry.scope === "out_of_scope" ? "default" : "secondary"}
                                className="text-xs"
                              >
                                {entry.scope === "out_of_scope" ? "Billable" : "Unbillable"}
                              </Badge>
                              {entry.isManual && (
                                <Badge variant="outline" className="text-xs">Manual</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                              {entry.client && (
                                <span>{entry.client.displayName || entry.client.companyName}</span>
                              )}
                              {entry.client && entry.project && <span>·</span>}
                              {entry.project && <span>{entry.project.name}</span>}
                              {entry.task && (
                                <>
                                  <span>·</span>
                                  <span>{entry.task.title}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                            <div className="text-left sm:text-right">
                              <p className="text-sm tabular-nums font-medium">
                                {formatDurationShort(entry.durationSeconds)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {format(parseISO(entry.startTime), "h:mm a")}
                                {entry.endTime && ` - ${format(parseISO(entry.endTime), "h:mm a")}`}
                              </p>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" aria-label="Time entry options" data-testid={`button-entry-menu-${entry.id}`}>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => setEditEntry(entry)}
                                  data-testid={`button-edit-entry-${entry.id}`}
                                >
                                  <Edit2 className="h-4 w-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => deleteMutation.mutate(entry.id)}
                                  className="text-destructive"
                                  data-testid={`button-delete-entry-${entry.id}`}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <ManualEntryDialog open={manualEntryOpen} onOpenChange={setManualEntryOpen} />
      <EditTimeEntryDrawer 
        entry={editEntry} 
        open={!!editEntry} 
        onOpenChange={(open: boolean) => !open && setEditEntry(null)} 
      />
    </>
  );
});

function ReportsSummary() {
  const [dateRange, setDateRange] = useState<"week" | "month" | "all">("month");

  const getDateRange = () => {
    const now = new Date();
    switch (dateRange) {
      case "week":
        return { startDate: format(startOfWeek(now), "yyyy-MM-dd"), endDate: format(endOfWeek(now), "yyyy-MM-dd") };
      case "month":
        return { startDate: format(startOfMonth(now), "yyyy-MM-dd"), endDate: format(endOfMonth(now), "yyyy-MM-dd") };
      default:
        return {};
    }
  };

  const { startDate, endDate } = getDateRange();
  const queryParams = new URLSearchParams();
  if (startDate) queryParams.set("startDate", startDate);
  if (endDate) queryParams.set("endDate", endDate);

  const { data: summary, isLoading } = useQuery<ReportSummary>({
    queryKey: ["/api/time-entries/report/summary", dateRange],
    queryFn: () => 
      fetch(`/api/time-entries/report/summary?${queryParams.toString()}`).then(r => r.json()),
  });

  const handleExport = () => {
    const exportParams = new URLSearchParams();
    if (startDate) exportParams.set("startDate", startDate);
    if (endDate) exportParams.set("endDate", endDate);
    window.location.href = `/api/time-entries/export/csv?${exportParams.toString()}`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="h-64 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  if (!summary) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg font-medium">Summary</CardTitle>
        <div className="flex items-center gap-2">
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as any)}>
            <SelectTrigger className="w-32" data-testid="select-report-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleExport} data-testid="button-export-csv">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="p-4 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total Time</p>
            <p className="text-2xl tabular-nums font-bold">{formatDurationShort(summary.totalSeconds)}</p>
            <p className="text-xs text-muted-foreground">{summary.entryCount} entries</p>
          </div>
          <div className="p-4 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Unbillable</p>
            <p className="text-2xl tabular-nums font-bold">{formatDurationShort(summary.inScopeSeconds)}</p>
            <p className="text-xs text-muted-foreground">In scope</p>
          </div>
          <div className="p-4 rounded-lg bg-primary/10">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Billable</p>
            <p className="text-2xl tabular-nums font-bold text-primary">{formatDurationShort(summary.outOfScopeSeconds)}</p>
            <p className="text-xs text-muted-foreground">Out of scope</p>
          </div>
        </div>

        {summary.byClient.length > 0 && (
          <div className="mb-6">
            <h4 className="text-sm font-medium mb-3">By Client</h4>
            <div className="space-y-2">
              {summary.byClient.map((client) => (
                <div key={client.id} className="flex items-center justify-between p-2 rounded bg-muted/30">
                  <span className="text-sm">{client.name}</span>
                  <span className="text-sm tabular-nums">{formatDurationShort(client.seconds)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {summary.byProject.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-3">By Project</h4>
            <div className="space-y-2">
              {summary.byProject.map((project) => (
                <div key={project.id} className="flex items-center justify-between p-2 rounded bg-muted/30">
                  <div>
                    <span className="text-sm">{project.name}</span>
                    {project.clientName && (
                      <span className="text-xs text-muted-foreground ml-2">({project.clientName})</span>
                    )}
                  </div>
                  <span className="text-sm tabular-nums">{formatDurationShort(project.seconds)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const BROADCAST_CHANNEL_NAME = "active-timer-sync";

// Exported content component for use in My Time page
export function TimeTrackingContent() {
  const [startTimerDrawerOpen, setStartTimerDrawerOpen] = useState(false);
  const [manualEntryDrawerOpen, setManualEntryDrawerOpen] = useState(false);

  const { data: timer, refetch: refetchTimer } = useQuery<ActiveTimer | null>({
    queryKey: ["/api/timer/current"],
    staleTime: 10000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const hasActiveTimer = !!timer;

  // Cross-tab sync: listen for timer updates from other tabs
  useEffect(() => {
    let broadcastChannel: BroadcastChannel | null = null;
    
    try {
      broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      broadcastChannel.onmessage = (event) => {
        if (event.data?.type === "timer-updated") {
          refetchTimer();
          queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
          queryClient.invalidateQueries({ queryKey: ["/api/time-entries/my/stats"] });
        }
      };
    } catch {
      // BroadcastChannel not supported
    }

    // Fallback: localStorage events
    const handleStorageEvent = (event: StorageEvent) => {
      if (event.key === "timer-sync") {
        refetchTimer();
        queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
        queryClient.invalidateQueries({ queryKey: ["/api/time-entries/my/stats"] });
      }
    };
    window.addEventListener("storage", handleStorageEvent);

    return () => {
      broadcastChannel?.close();
      window.removeEventListener("storage", handleStorageEvent);
    };
  }, [refetchTimer]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-end gap-2 mb-4">
        {hasActiveTimer ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-block" data-testid="disabled-start-timer-wrapper">
                <Button
                  disabled
                  className="pointer-events-none"
                  data-testid="button-start-timer-content"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Start Timer
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>Stop the current timer before starting a new one</p>
            </TooltipContent>
          </Tooltip>
        ) : (
          <Button
            onClick={() => setStartTimerDrawerOpen(true)}
            data-testid="button-start-timer-content"
          >
            <Play className="h-4 w-4 mr-2" />
            Start Timer
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() => setManualEntryDrawerOpen(true)}
          data-testid="button-add-entry-content"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Manual Entry
        </Button>
      </div>

      <Tabs defaultValue="entries" className="flex-1">
        <TabsList>
          <TabsTrigger value="entries" data-testid="tab-entries-content">
            <Clock className="h-4 w-4 mr-2" />
            Entries
          </TabsTrigger>
          <TabsTrigger value="reports" data-testid="tab-reports-content">
            <BarChart3 className="h-4 w-4 mr-2" />
            Reports
          </TabsTrigger>
        </TabsList>
        <TabsContent value="entries" className="mt-4">
          <TimeEntriesList />
        </TabsContent>
        <TabsContent value="reports" className="mt-4">
          <ReportsSummary />
        </TabsContent>
      </Tabs>

      <StartTimerDrawer
        open={startTimerDrawerOpen}
        onOpenChange={setStartTimerDrawerOpen}
      />

      <ManualEntryDialog
        open={manualEntryDrawerOpen}
        onOpenChange={setManualEntryDrawerOpen}
      />
    </div>
  );
}

// TimeTrackingPage is deprecated - route redirects to /my-time
// Keeping as thin wrapper for backward compatibility if needed
export default function TimeTrackingPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden p-6">
      <TimeTrackingContent />
    </div>
  );
}
