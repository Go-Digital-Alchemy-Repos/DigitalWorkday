import { useState, useEffect } from "react";
import { FullScreenDrawer, FullScreenDrawerFooter } from "@/components/ui/full-screen-drawer";
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
import { TaskSelectorWithCreate } from "@/features/tasks/task-selector-with-create";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CalendarIcon, Clock } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useTimeEntryCascade } from "@/hooks/use-time-entry-cascade";

interface TimeEntryData {
  id?: string;
  title: string;
  description: string;
  durationHours: number;
  durationMinutes: number;
  clientId: string | null;
  projectId: string | null;
  taskId: string | null;
  scope: "in_scope" | "out_of_scope";
  date: Date;
}

interface TimeEntryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: TimeEntryData) => Promise<void>;
  entry?: TimeEntryData | null;
  isLoading?: boolean;
  mode: "create" | "edit";
  clients?: Array<{ id: string; companyName: string; displayName: string | null }>;
  projects?: Array<{ id: string; name: string; clientId?: string | null }>;
}

export function TimeEntryDrawer({
  open,
  onOpenChange,
  onSubmit,
  entry,
  isLoading = false,
  mode,
  clients = [],
  projects = [],
}: TimeEntryDrawerProps) {
  const [hasChanges, setHasChanges] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [durationHours, setDurationHours] = useState(0);
  const [durationMinutes, setDurationMinutes] = useState(0);
  const [scope, setScope] = useState<"in_scope" | "out_of_scope">("in_scope");
  const [date, setDate] = useState<Date>(new Date());

  const handleFieldChange = () => {
    setHasChanges(true);
  };

  const {
    clientId, projectId, taskId, subtaskId,
    clients: hookClients, clientsFetched,
    clientProjects, projectsFetched,
    subtasks, hasSubtasks, finalTaskId,
    handleClientChange, handleProjectChange, handleTaskChange,
    handleSubtaskChange, resetAll,
  } = useTimeEntryCascade({ enabled: open, onChange: handleFieldChange });

  const displayClients = clientsFetched ? hookClients : clients;
  const displayProjects = projectsFetched
    ? clientProjects
    : clientId
      ? projects.filter(p => p.clientId === clientId)
      : [];

  useEffect(() => {
    if (open && entry && mode === "edit") {
      setTitle(entry.title || "");
      setDescription(entry.description || "");
      setDurationHours(entry.durationHours);
      setDurationMinutes(entry.durationMinutes);
      resetAll({
        clientId: entry.clientId,
        projectId: entry.projectId,
        taskId: entry.taskId,
        subtaskId: null,
      });
      setScope(entry.scope);
      setDate(entry.date);
    } else if (open && mode === "create") {
      setTitle("");
      setDescription("");
      setDurationHours(0);
      setDurationMinutes(0);
      resetAll();
      setScope("in_scope");
      setDate(new Date());
    }
    setHasChanges(false);
  }, [open, entry, mode]);

  const handleSubmit = async () => {
    try {
      await onSubmit({
        id: entry?.id,
        title,
        description,
        durationHours,
        durationMinutes,
        clientId,
        projectId,
        taskId: finalTaskId,
        scope,
        date,
      });
      setHasChanges(false);
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save time entry:", error);
    }
  };

  const handleClose = () => {
    setHasChanges(false);
    onOpenChange(false);
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  const totalMinutes = durationHours * 60 + durationMinutes;
  const isValid = totalMinutes > 0;

  return (
    <FullScreenDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={mode === "create" ? "Add Manual Entry" : "Edit Time Entry"}
      description={mode === "create" ? "Log time spent on a task" : "Update time entry details"}
      hasUnsavedChanges={hasChanges}
      onConfirmClose={handleClose}
      width="xl"
      footer={
        <FullScreenDrawerFooter
          onCancel={handleCancel}
          onSave={handleSubmit}
          isLoading={isLoading}
          saveLabel={mode === "create" ? "Add Manual Entry" : "Save Changes"}
          saveDisabled={!isValid}
        />
      }
    >
      <div className="space-y-6">
        <div>
          <Label>Date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal mt-2",
                  !date && "text-muted-foreground"
                )}
                data-testid="button-date"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {date ? format(date, "PPP") : "Pick a date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => {
                  if (d) {
                    setDate(d);
                    handleFieldChange();
                  }
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        <div>
          <Label>Duration</Label>
          <div className="flex items-center gap-4 mt-2">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                max="24"
                value={durationHours}
                onChange={(e) => {
                  setDurationHours(parseInt(e.target.value) || 0);
                  handleFieldChange();
                }}
                className="w-20"
                data-testid="input-hours"
              />
              <span className="text-sm text-muted-foreground">hours</span>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                max="59"
                value={durationMinutes}
                onChange={(e) => {
                  setDurationMinutes(parseInt(e.target.value) || 0);
                  handleFieldChange();
                }}
                className="w-20"
                data-testid="input-minutes"
              />
              <span className="text-sm text-muted-foreground">minutes</span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            <Clock className="inline h-3 w-3 mr-1" />
            Total: {durationHours}h {durationMinutes}m
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Label>Client</Label>
            <Select
              value={clientId || "none"}
              onValueChange={(v) => handleClientChange(v === "none" ? null : v)}
            >
              <SelectTrigger className="mt-2" data-testid="select-client">
                <SelectValue placeholder="Select client" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No client</SelectItem>
                {displayClients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.displayName || c.companyName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Project</Label>
            <Select
              value={projectId || "none"}
              onValueChange={(v) => handleProjectChange(v === "none" ? null : v)}
              disabled={!clientId}
            >
              <SelectTrigger className="mt-2" data-testid="select-project">
                <SelectValue placeholder={clientId ? "Select project" : "Select client first"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No project</SelectItem>
                {displayProjects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <TaskSelectorWithCreate
            projectId={projectId}
            taskId={taskId}
            onTaskChange={handleTaskChange}
          />
        </div>

        {hasSubtasks && (
          <div>
            <Label>Subtask</Label>
            <Select
              value={subtaskId || "none"}
              onValueChange={(v) => handleSubtaskChange(v === "none" ? null : v)}
            >
              <SelectTrigger className="mt-2" data-testid="select-subtask">
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

        <div>
          <Label>Scope</Label>
          <div className="flex gap-2 mt-2" data-testid="toggle-scope">
            <Button
              type="button"
              variant={scope === "in_scope" ? "default" : "outline"}
              className="flex-1 toggle-elevate"
              onClick={() => {
                setScope("in_scope");
                handleFieldChange();
              }}
              data-testid="button-scope-in"
            >
              In Scope (Unbillable)
            </Button>
            <Button
              type="button"
              variant={scope === "out_of_scope" ? "default" : "outline"}
              className="flex-1 toggle-elevate"
              onClick={() => {
                setScope("out_of_scope");
                handleFieldChange();
              }}
              data-testid="button-scope-out"
            >
              Out of Scope (Billable)
            </Button>
          </div>
        </div>

        <div>
          <Label>Title</Label>
          <Input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              handleFieldChange();
            }}
            placeholder="Brief title for this time entry"
            className="mt-2"
            data-testid="input-title"
          />
        </div>

        <div>
          <Label>Description</Label>
          <Textarea
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              handleFieldChange();
            }}
            placeholder="What did you work on?"
            className="min-h-[120px] resize-none mt-2"
            data-testid="textarea-description"
          />
        </div>
      </div>
    </FullScreenDrawer>
  );
}
