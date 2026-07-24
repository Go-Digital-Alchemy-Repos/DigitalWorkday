import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarClock, CheckCircle2, Loader2, ReceiptText } from "lucide-react";

import { FullScreenDrawer, FullScreenDrawerFooter } from "@/components/ui/full-screen-drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PrioritySelector, type PriorityLevel } from "@/components/forms/priority-selector";
import { apiRequest } from "@/lib/queryClient";
import { useTaskDrawer } from "@/lib/task-drawer-context";
import { useToast } from "@/hooks/use-toast";

interface NewTimeEntryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ClientOption {
  id: string;
  companyName: string;
  displayName: string | null;
}

interface DivisionOption {
  id: string;
  name: string;
  color?: string | null;
}

interface ProjectOption {
  id: string;
  name: string;
  divisionId?: string | null;
}

interface SectionOption {
  id: string;
  name: string;
}

interface CreatedTask {
  id: string;
  title: string;
  projectId: string | null;
}

interface CreateResult {
  task: CreatedTask;
  closeFailed: boolean;
}

const initialDate = () => format(new Date(), "yyyy-MM-dd");

export function NewTimeEntryDrawer({ open, onOpenChange }: NewTimeEntryDrawerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { openTask } = useTaskDrawer();
  const createdTaskRef = useRef<CreatedTask | null>(null);

  const [clientId, setClientId] = useState<string | null>(null);
  const [divisionId, setDivisionId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<PriorityLevel>("medium");
  const [dueDate, setDueDate] = useState("");
  const [entryDate, setEntryDate] = useState(initialDate);
  const [hours, setHours] = useState("0");
  const [minutes, setMinutes] = useState("30");
  const [billable, setBillable] = useState(false);
  const [closeTask, setCloseTask] = useState(false);
  const [createdTask, setCreatedTask] = useState<CreatedTask | null>(null);

  const resetForm = useCallback(() => {
    createdTaskRef.current = null;
    setCreatedTask(null);
    setClientId(null);
    setDivisionId(null);
    setProjectId(null);
    setSectionId(null);
    setTitle("");
    setDescription("");
    setPriority("medium");
    setDueDate("");
    setEntryDate(initialDate());
    setHours("0");
    setMinutes("30");
    setBillable(false);
    setCloseTask(false);
  }, []);

  useEffect(() => {
    if (open && !createdTaskRef.current) {
      resetForm();
    }
  }, [open, resetForm]);

  const { data: clients = [], isLoading: clientsLoading } = useQuery<ClientOption[]>({
    queryKey: ["/api/clients"],
    enabled: open,
  });

  const { data: divisions = [], isLoading: divisionsLoading } = useQuery<DivisionOption[]>({
    queryKey: ["/api/v1/clients", clientId, "divisions"],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/v1/clients/${clientId}/divisions`);
      return response.json();
    },
    enabled: open && !!clientId,
  });

  const { data: clientProjects = [], isLoading: projectsLoading } = useQuery<ProjectOption[]>({
    queryKey: ["/api/clients", clientId, "projects"],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/clients/${clientId}/projects`);
      return response.json();
    },
    enabled: open && !!clientId,
  });

  const { data: sections = [], isLoading: sectionsLoading } = useQuery<SectionOption[]>({
    queryKey: ["/api/projects", projectId, "sections"],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/projects/${projectId}/sections`);
      return response.json();
    },
    enabled: open && !!projectId,
  });

  const projects = divisionId
    ? clientProjects.filter((project) => project.divisionId === divisionId)
    : clientProjects;

  const hoursValue = Number.parseInt(hours || "0", 10) || 0;
  const minutesValue = Number.parseInt(minutes || "0", 10) || 0;
  const durationSeconds = hoursValue * 3600 + minutesValue * 60;
  const hasValidDuration =
    durationSeconds > 0 &&
    hoursValue >= 0 &&
    hoursValue <= 24 &&
    minutesValue >= 0 &&
    minutesValue <= 59 &&
    (hoursValue < 24 || minutesValue === 0);
  const formLocked = !!createdTask;
  const canSave =
    !!clientId &&
    !!projectId &&
    !!title.trim() &&
    !!entryDate &&
    hasValidDuration;

  const createMutation = useMutation<CreateResult>({
    mutationFn: async () => {
      if (!clientId || !projectId || !title.trim() || !entryDate || !hasValidDuration) {
        throw new Error("Complete all required fields before saving.");
      }

      let task = createdTaskRef.current;
      if (!task) {
        const taskResponse = await apiRequest("POST", "/api/tasks", {
          projectId,
          sectionId,
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          status: "todo",
          dueDate: dueDate ? new Date(`${dueDate}T12:00:00`).toISOString() : null,
        });
        task = await taskResponse.json();
        createdTaskRef.current = task;
        setCreatedTask(task);
      }
      if (!task) {
        throw new Error("The task could not be created.");
      }

      await apiRequest("POST", "/api/time-entries", {
        clientId,
        projectId,
        taskId: task.id,
        title: task.title,
        description: description.trim() || task.title,
        durationSeconds,
        startTime: new Date(`${entryDate}T12:00:00`).toISOString(),
        scope: billable ? "out_of_scope" : "in_scope",
      });

      let closeFailed = false;
      if (closeTask) {
        try {
          await apiRequest("PATCH", `/api/tasks/${task.id}`, { status: "done" });
        } catch {
          closeFailed = true;
        }
      }

      return { task, closeFailed };
    },
    onSuccess: ({ task, closeFailed }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/my"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/my/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", task.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/my"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", task.projectId, "tasks"] });

      toast({
        title: closeFailed ? "Time saved; task left open" : "New time entry created",
        description: closeFailed
          ? "Your time is safe, but the task could not be closed. You can close it from the task panel."
          : `${task.title} was created with ${formatDuration(durationSeconds)} logged.`,
        variant: closeFailed ? "destructive" : "default",
      });

      resetForm();
      onOpenChange(false);
      window.setTimeout(() => openTask(task.id), 0);
    },
    onError: (error: Error) => {
      const taskWasCreated = !!createdTaskRef.current;
      toast({
        title: taskWasCreated ? "Task created; time not saved" : "Could not create time entry",
        description: taskWasCreated
          ? "The task is safe and will not be duplicated. Check the time details and retry."
          : error.message,
        variant: "destructive",
      });
    },
  });

  const handleClientChange = (value: string) => {
    setClientId(value);
    setDivisionId(null);
    setProjectId(null);
    setSectionId(null);
  };

  const handleProjectChange = (value: string) => {
    setProjectId(value);
    setSectionId(null);
  };

  const hasChanges =
    !!clientId ||
    !!divisionId ||
    !!projectId ||
    !!title ||
    !!description ||
    priority !== "medium" ||
    !!dueDate ||
    entryDate !== initialDate() ||
    hours !== "0" ||
    minutes !== "30" ||
    billable ||
    closeTask;

  return (
    <FullScreenDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Create New Time Entry"
      description="Create a task and log time without starting a timer."
      width="2xl"
      hasUnsavedChanges={hasChanges && !createMutation.isSuccess}
      onConfirmClose={resetForm}
      footer={
        <FullScreenDrawerFooter
          onCancel={() => onOpenChange(false)}
          onSave={() => createMutation.mutate()}
          isLoading={createMutation.isPending}
          saveDisabled={!canSave}
          saveLabel={createdTask ? "Retry Time Entry" : closeTask ? "Create, Log & Close" : "Create & Log Time"}
        />
      }
    >
      <div className="space-y-8" data-testid="new-time-entry-form">
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <ReceiptText className="h-4 w-4" />
            </span>
            <div>
              <h3 className="font-semibold">Client and project</h3>
              <p className="text-sm text-muted-foreground">Choose where this new task belongs.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>
                Client <span className="text-destructive">*</span>
              </Label>
              <Select value={clientId || ""} onValueChange={handleClientChange} disabled={formLocked}>
                <SelectTrigger data-testid="select-new-time-client">
                  <SelectValue placeholder={clientsLoading ? "Loading clients..." : "Select a client"} />
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

            {divisions.length > 0 && (
              <div className="space-y-2">
                <Label>Division</Label>
                <Select
                  value={divisionId || "all"}
                  onValueChange={(value) => {
                    setDivisionId(value === "all" ? null : value);
                    setProjectId(null);
                    setSectionId(null);
                  }}
                  disabled={formLocked || divisionsLoading}
                >
                  <SelectTrigger data-testid="select-new-time-division">
                    <SelectValue placeholder="All divisions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All divisions</SelectItem>
                    {divisions.map((division) => (
                      <SelectItem key={division.id} value={division.id}>
                        <span className="flex items-center gap-2">
                          {division.color && (
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: division.color }} />
                          )}
                          {division.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>
                Project <span className="text-destructive">*</span>
              </Label>
              <Select
                value={projectId || ""}
                onValueChange={handleProjectChange}
                disabled={!clientId || formLocked || projectsLoading}
              >
                <SelectTrigger data-testid="select-new-time-project">
                  <SelectValue
                    placeholder={!clientId ? "Select a client first" : projectsLoading ? "Loading projects..." : "Select a project"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Section</Label>
              <Select
                value={sectionId || "none"}
                onValueChange={(value) => setSectionId(value === "none" ? null : value)}
                disabled={!projectId || formLocked || sectionsLoading}
              >
                <SelectTrigger data-testid="select-new-time-section">
                  <SelectValue placeholder={projectId ? "No section" : "Select a project first"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No section</SelectItem>
                  {sections.map((section) => (
                    <SelectItem key={section.id} value={section.id}>
                      {section.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <section className="space-y-4 border-t border-border/70 pt-7">
          <div>
            <h3 className="font-semibold">Task details</h3>
            <p className="text-sm text-muted-foreground">The task opens in its standard detail panel after it is created.</p>
          </div>

          {createdTask && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-300/70 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                “{createdTask.title}” has been created. Retry will only save the time entry—it will not create another task.
              </span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="new-time-task-title">
              Task title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="new-time-task-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="What did you work on?"
              disabled={formLocked}
              data-testid="input-new-time-task-title"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-time-task-description">Description</Label>
            <Textarea
              id="new-time-task-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Add notes or context for the task and time entry."
              className="min-h-28 resize-y"
              disabled={formLocked}
              data-testid="textarea-new-time-description"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Priority</Label>
              <PrioritySelector
                value={priority}
                onChange={setPriority}
                disabled={formLocked}
                data-testid="select-new-time-priority"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-time-due-date">Due date</Label>
              <Input
                id="new-time-due-date"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                disabled={formLocked}
                data-testid="input-new-time-due-date"
              />
            </div>
          </div>
        </section>

        <section className="space-y-4 border-t border-border/70 pt-7">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CalendarClock className="h-4 w-4" />
            </span>
            <div>
              <h3 className="font-semibold">Time details</h3>
              <p className="text-sm text-muted-foreground">Enter the time directly—no timer or approval step is required.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="new-time-entry-date">Date</Label>
              <Input
                id="new-time-entry-date"
                type="date"
                value={entryDate}
                onChange={(event) => setEntryDate(event.target.value)}
                data-testid="input-new-time-date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-time-hours">Hours</Label>
              <Input
                id="new-time-hours"
                type="number"
                min="0"
                max="24"
                inputMode="numeric"
                value={hours}
                onChange={(event) => setHours(event.target.value)}
                data-testid="input-new-time-hours"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-time-minutes">Minutes</Label>
              <Input
                id="new-time-minutes"
                type="number"
                min="0"
                max="59"
                inputMode="numeric"
                value={minutes}
                onChange={(event) => setMinutes(event.target.value)}
                data-testid="input-new-time-minutes"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border/70 bg-muted/20 p-4">
              <span>
                <span className="block text-sm font-medium">Billable time</span>
                <span className="block text-xs text-muted-foreground">Include this entry in billable totals.</span>
              </span>
              <Switch checked={billable} onCheckedChange={setBillable} data-testid="switch-new-time-billable" />
            </label>

            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border/70 bg-muted/20 p-4">
              <span>
                <span className="block text-sm font-medium">Close task after saving</span>
                <span className="block text-xs text-muted-foreground">Mark the new task Done immediately.</span>
              </span>
              <Switch checked={closeTask} onCheckedChange={setCloseTask} data-testid="switch-new-time-close-task" />
            </label>
          </div>

          {createMutation.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating the task and saving time…
            </div>
          )}
        </section>
      </div>
    </FullScreenDrawer>
  );
}

function formatDuration(seconds: number) {
  const totalMinutes = Math.round(seconds / 60);
  const formattedHours = Math.floor(totalMinutes / 60);
  const formattedMinutes = totalMinutes % 60;
  if (!formattedHours) return `${formattedMinutes}m`;
  if (!formattedMinutes) return `${formattedHours}h`;
  return `${formattedHours}h ${formattedMinutes}m`;
}
