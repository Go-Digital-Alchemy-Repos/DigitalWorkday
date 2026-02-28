import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
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
import { format, isPast } from "date-fns";
import { cn } from "@/lib/utils";
import {
  Flag,
  Plus,
  CalendarIcon,
  Trash2,
  CheckCircle2,
  Circle,
  Clock,
  ChevronDown,
  ChevronUp,
  Pencil,
  X,
  Check,
} from "lucide-react";

export type MilestoneStatus = "not_started" | "in_progress" | "completed";

export interface MilestoneWithStats {
  id: string;
  tenantId: string;
  projectId: string;
  name: string;
  description: string | null;
  dueDate: string | null;
  status: MilestoneStatus;
  orderIndex: number;
  createdByUserId: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  totalTasks: number;
  completedTasks: number;
  percentComplete: number;
}

interface MilestonesTabProps {
  projectId: string;
}

function statusBadge(status: MilestoneStatus) {
  if (status === "completed")
    return (
      <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Completed
      </Badge>
    );
  if (status === "in_progress")
    return (
      <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 gap-1">
        <Clock className="h-3 w-3" />
        In Progress
      </Badge>
    );
  return (
    <Badge variant="secondary" className="bg-muted text-muted-foreground gap-1">
      <Circle className="h-3 w-3" />
      Not Started
    </Badge>
  );
}

function DueDateBadge({ dueDate }: { dueDate: string | null }) {
  if (!dueDate) return null;
  const d = new Date(dueDate);
  const overdue = isPast(d);
  return (
    <span
      className={cn(
        "flex items-center gap-1 text-xs",
        overdue ? "text-red-500 dark:text-red-400" : "text-muted-foreground"
      )}
    >
      <CalendarIcon className="h-3 w-3" />
      {format(d, "MMM d, yyyy")}
      {overdue && <span className="font-medium">(Overdue)</span>}
    </span>
  );
}

function StatusCycleButton({
  status,
  milestoneId,
  projectId,
}: {
  status: MilestoneStatus;
  milestoneId: string;
  projectId: string;
}) {
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: (newStatus: MilestoneStatus) =>
      apiRequest("PATCH", `/api/milestones/${milestoneId}`, { status: newStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/milestones`] });
    },
    onError: () => {
      toast({ title: "Failed to update milestone status", variant: "destructive" });
    },
  });

  const next: Record<MilestoneStatus, MilestoneStatus> = {
    not_started: "in_progress",
    in_progress: "completed",
    completed: "not_started",
  };

  const icons: Record<MilestoneStatus, React.ReactNode> = {
    not_started: <Circle className="h-4 w-4 text-muted-foreground" />,
    in_progress: <Clock className="h-4 w-4 text-blue-500" />,
    completed: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  };

  return (
    <button
      onClick={() => mutation.mutate(next[status])}
      disabled={mutation.isPending}
      className="flex-shrink-0 hover:opacity-70 transition-opacity"
      data-testid={`button-milestone-status-${milestoneId}`}
      title={`Mark as ${next[status].replace("_", " ")}`}
    >
      {icons[status]}
    </button>
  );
}

function MilestoneRow({
  milestone,
  projectId,
  onDeleted,
}: {
  milestone: MilestoneWithStats;
  projectId: string;
  onDeleted: () => void;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(milestone.name);
  const [editDesc, setEditDesc] = useState(milestone.description ?? "");
  const [editDueDate, setEditDueDate] = useState<Date | undefined>(
    milestone.dueDate ? new Date(milestone.dueDate) : undefined
  );
  const [dateOpen, setDateOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("PATCH", `/api/milestones/${milestone.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/milestones`] });
      setEditing(false);
    },
    onError: () => {
      toast({ title: "Failed to update milestone", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/milestones/${milestone.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/milestones`] });
      toast({ title: "Milestone deleted" });
      onDeleted();
    },
    onError: () => {
      toast({ title: "Failed to delete milestone", variant: "destructive" });
    },
  });

  const handleSave = () => {
    if (!editName.trim()) return;
    updateMutation.mutate({
      name: editName.trim(),
      description: editDesc.trim() || null,
      dueDate: editDueDate ? editDueDate.toISOString() : null,
    });
  };

  const handleCancelEdit = () => {
    setEditName(milestone.name);
    setEditDesc(milestone.description ?? "");
    setEditDueDate(milestone.dueDate ? new Date(milestone.dueDate) : undefined);
    setEditing(false);
  };

  const isCompleted = milestone.status === "completed";

  return (
    <div
      className={cn(
        "border rounded-lg p-3 space-y-2 transition-colors",
        isCompleted ? "border-border/50 bg-muted/20" : "border-border bg-card"
      )}
      data-testid={`card-milestone-${milestone.id}`}
    >
      <div className="flex items-start gap-2">
        <StatusCycleButton status={milestone.status} milestoneId={milestone.id} projectId={projectId} />

        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-2">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-7 text-sm font-medium"
                placeholder="Milestone name"
                data-testid="input-milestone-name-edit"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                  if (e.key === "Escape") handleCancelEdit();
                }}
                autoFocus
              />
              <Textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                className="text-xs min-h-[60px] resize-none"
                placeholder="Description (optional)"
                data-testid="textarea-milestone-desc-edit"
              />
              <div className="flex items-center gap-2">
                <Popover open={dateOpen} onOpenChange={setDateOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1" data-testid="button-milestone-due-date-edit">
                      <CalendarIcon className="h-3 w-3" />
                      {editDueDate ? format(editDueDate, "MMM d, yyyy") : "Set due date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={editDueDate}
                      onSelect={(d) => { setEditDueDate(d ?? undefined); setDateOpen(false); }}
                    />
                    {editDueDate && (
                      <div className="p-2 border-t">
                        <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setEditDueDate(undefined)}>
                          Clear date
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
                <Button size="sm" className="h-7 text-xs gap-1" onClick={handleSave} disabled={updateMutation.isPending || !editName.trim()} data-testid="button-milestone-save">
                  <Check className="h-3 w-3" />
                  Save
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleCancelEdit} data-testid="button-milestone-cancel-edit">
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn("font-medium text-sm", isCompleted && "line-through text-muted-foreground")}>
                  {milestone.name}
                </span>
                {statusBadge(milestone.status)}
                <DueDateBadge dueDate={milestone.dueDate} />
              </div>
              {milestone.description && !expanded && (
                <p className="text-xs text-muted-foreground line-clamp-1">{milestone.description}</p>
              )}
              {expanded && milestone.description && (
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">{milestone.description}</p>
              )}
            </div>
          )}

          {!editing && (
            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{milestone.completedTasks} / {milestone.totalTasks} tasks</span>
                <span>{milestone.percentComplete}%</span>
              </div>
              <Progress value={milestone.percentComplete} className="h-1.5" />
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {!editing && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setEditing(true)}
                data-testid={`button-milestone-edit-${milestone.id}`}
              >
                <Pencil className="h-3 w-3" />
              </Button>
              {(milestone.description || expanded) && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setExpanded(!expanded)}
                  data-testid={`button-milestone-expand-${milestone.id}`}
                >
                  {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive hover:text-destructive"
                onClick={() => setConfirmDelete(true)}
                data-testid={`button-milestone-delete-${milestone.id}`}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete milestone?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove "{milestone.name}" and unlink all tasks. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-milestone"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AddMilestoneForm({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [dateOpen, setDateOpen] = useState(false);

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description?: string | null; dueDate?: string | null }) =>
      apiRequest("POST", `/api/projects/${projectId}/milestones`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/milestones`] });
      toast({ title: "Milestone created" });
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to create milestone", variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!name.trim()) return;
    createMutation.mutate({
      name: name.trim(),
      description: description.trim() || null,
      dueDate: dueDate ? dueDate.toISOString() : null,
    });
  };

  return (
    <div className="border-2 border-dashed border-primary/30 rounded-lg p-3 space-y-3 bg-primary/5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">New Milestone</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose} data-testid="button-close-add-milestone">
          <X className="h-3 w-3" />
        </Button>
      </div>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Milestone name"
        className="h-8 text-sm"
        data-testid="input-milestone-name"
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
          if (e.key === "Escape") onClose();
        }}
        autoFocus
      />
      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        className="text-xs min-h-[60px] resize-none"
        data-testid="textarea-milestone-description"
      />
      <div className="flex items-center gap-2">
        <Popover open={dateOpen} onOpenChange={setDateOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" data-testid="button-milestone-due-date">
              <CalendarIcon className="h-3 w-3" />
              {dueDate ? format(dueDate, "MMM d, yyyy") : "Due date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dueDate}
              onSelect={(d) => { setDueDate(d ?? undefined); setDateOpen(false); }}
            />
            {dueDate && (
              <div className="p-2 border-t">
                <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setDueDate(undefined)}>
                  Clear date
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
        <Button
          size="sm"
          className="h-7 text-xs gap-1 ml-auto"
          onClick={handleSubmit}
          disabled={createMutation.isPending || !name.trim()}
          data-testid="button-create-milestone"
        >
          <Plus className="h-3 w-3" />
          Create
        </Button>
      </div>
    </div>
  );
}

export function MilestonesTab({ projectId }: MilestonesTabProps) {
  const [showAddForm, setShowAddForm] = useState(false);

  const { data: milestones = [], isLoading } = useQuery<MilestoneWithStats[]>({
    queryKey: [`/api/projects/${projectId}/milestones`],
  });

  const completed = milestones.filter((m) => m.status === "completed");
  const active = milestones.filter((m) => m.status !== "completed");

  return (
    <div className="space-y-4" data-testid="milestones-tab">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Flag className="h-4 w-4 text-primary" />
            Milestones
            {milestones.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {completed.length}/{milestones.length}
              </Badge>
            )}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Track key deliverables and goals for this project
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 h-8 text-xs"
          onClick={() => setShowAddForm(true)}
          data-testid="button-add-milestone"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Milestone
        </Button>
      </div>

      {showAddForm && (
        <AddMilestoneForm projectId={projectId} onClose={() => setShowAddForm(false)} />
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : milestones.length === 0 && !showAddForm ? (
        <div className="flex flex-col items-center justify-center py-10 text-center border-2 border-dashed rounded-lg">
          <Flag className="h-8 w-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm font-medium text-muted-foreground">No milestones yet</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Add milestones to track key goals</p>
          <Button
            size="sm"
            className="mt-3 gap-1.5"
            onClick={() => setShowAddForm(true)}
            data-testid="button-add-first-milestone"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Milestone
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {active.length > 0 && (
            <div className="space-y-2">
              {active.map((m) => (
                <MilestoneRow
                  key={m.id}
                  milestone={m}
                  projectId={projectId}
                  onDeleted={() => {}}
                />
              ))}
            </div>
          )}

          {completed.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  {completed.length} completed
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>
              {completed.map((m) => (
                <MilestoneRow
                  key={m.id}
                  milestone={m}
                  projectId={projectId}
                  onDeleted={() => {}}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
