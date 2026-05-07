import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { X, Calendar, Flag, Layers, ArrowLeft, Tag, Plus, Clock, Timer, Play, Pause, Square, Loader2, ChevronRight, CheckSquare, ListTodo, CheckCircle2, Circle, MessageSquare, Save, Check, Pencil, Activity } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/richtext";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/status-badge";
import { PrioritySelector, type PriorityLevel } from "@/components/forms/priority-selector";
import { AttachmentUploader } from "@/components/attachment-uploader";
import { CommentThread } from "@/components/comment-thread";
import { TaskHistoryTab } from "./task-panel/TaskHistoryTab";
import { MultiSelectAssignees } from "@/components/multi-select-assignees";
import { format } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useIsMobile } from "@/hooks/use-mobile";
import type { Subtask, User, Tag as TagType, Comment, TaskWithRelations } from "@shared/schema";
import { cn } from "@/lib/utils";
import { ColorPicker } from "@/components/ui/color-picker";
import { DrawerActionBar } from "@/components/layout/drawer-action-bar";
import {
  buildStopTimerPayload,
  buildSubtaskQuickStartTimerPayload,
} from "./timer-payloads";
import { normalizeTaskStatus } from "@shared/taskStatus";
import { DataPointLabel } from "@/components/data-point-help";
import { DATA_POINT_DEFINITIONS } from "@/lib/data-point-definitions";

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type SubtaskOrTask = (Subtask | (TaskWithRelations & { taskId?: string; completed?: boolean; assigneeId?: string | null })) & {
  id: string;
  title: string;
  description?: unknown;
  status: string;
  priority: string;
  dueDate?: Date | string | null;
  estimateMinutes?: number | null;
  projectId?: string | null;
};

function isSubtask(item: SubtaskOrTask | null): item is Subtask {
  if (!item) return false;
  return 'taskId' in item && 'completed' in item && typeof item.completed === 'boolean';
}

interface SubtaskAssignee {
  id: string;
  subtaskId: string;
  userId: string;
  tenantId: string | null;
  createdAt: string;
  user?: User;
}

interface SubtaskTag {
  id: string;
  subtaskId: string;
  tagId: string;
  createdAt: string;
  tag?: TagType;
}

interface ActiveTimer {
  id: string;
  taskId: string | null;
  subtaskId?: string | null;
  status: "running" | "paused";
  elapsedSeconds: number;
  lastStartedAt: string | null;
}

interface ProjectContext {
  id: string;
  name: string;
  clientId?: string | null;
  client?: { id: string; companyName: string; displayName: string | null } | null;
}

interface TimeEntryListItem {
  id: string;
  title?: string | null;
  description?: string | null;
  startTime: string;
  durationSeconds: number;
  scope: "in_scope" | "out_of_scope";
  user?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  };
}

function formatDurationShort(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

interface SubtaskDetailDrawerProps {
  subtask: SubtaskOrTask | null;
  parentTaskTitle: string;
  projectId?: string;
  workspaceId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate?: (subtaskId: string, data: any) => void;
  onBack?: () => void;
  availableUsers?: User[];
}

export function SubtaskDetailDrawer({
  subtask,
  parentTaskTitle,
  projectId,
  workspaceId,
  open,
  onOpenChange,
  onUpdate,
  onBack,
  availableUsers = [],
}: SubtaskDetailDrawerProps) {
  const { data: tenantUsers = [] } = useQuery<User[]>({
    queryKey: ["/api/tenant/users"],
    enabled: open && (!availableUsers || availableUsers.length === 0),
  });
  const mentionUsers = availableUsers && availableUsers.length > 0 ? availableUsers : tenantUsers;

  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const isMobile = useIsMobile();
  const sectionCardClass =
    "rounded-2xl border border-border/70 bg-card/90 p-4 shadow-[var(--shadow-soft)] sm:p-5";
  const sectionHeaderClass = "mb-3 flex items-center justify-between gap-3";
  const sectionTitleClass = "flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground";
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(subtask?.title || "");
  const [description, setDescription] = useState<string>(
    typeof subtask?.description === 'string' 
      ? subtask.description 
      : subtask?.description ? (typeof subtask.description === 'object' ? JSON.stringify(subtask.description) : String(subtask.description)) : ""
  );
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [dueDatePopoverOpen, setDueDatePopoverOpen] = useState(false);
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#3b82f6");
  const [localDueDate, setLocalDueDate] = useState<Date | null>(
    subtask?.dueDate ? new Date(subtask.dueDate) : null
  );
  const [showHistory, setShowHistory] = useState(false);
  const [showUnsavedChangesDialog, setShowUnsavedChangesDialog] = useState(false);
  const [editingTimeEntry, setEditingTimeEntry] = useState<TimeEntryListItem | null>(null);
  const [timeEntryTitle, setTimeEntryTitle] = useState("");
  const [timeEntryDescription, setTimeEntryDescription] = useState("");
  const [timeEntryScope, setTimeEntryScope] = useState<"in_scope" | "out_of_scope">("in_scope");
  const [showStopTimerDialog, setShowStopTimerDialog] = useState(false);
  const [stopTimerDescription, setStopTimerDescription] = useState("");

  const isActualSubtask = isSubtask(subtask);

  const { data: subtaskAssignees = [], isLoading: loadingAssignees } = useQuery<(SubtaskAssignee & { user?: User })[]>({
    queryKey: ["/api/subtasks", subtask?.id, "assignees"],
    queryFn: async () => {
      if (!subtask?.id) return [];
      const res = await fetch(`/api/subtasks/${subtask.id}/assignees`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!subtask?.id && open && isActualSubtask,
  });

  const { data: subtaskTags = [], refetch: refetchTags, isLoading: loadingTags } = useQuery<SubtaskTag[]>({
    queryKey: ["/api/subtasks", subtask?.id, "tags"],
    queryFn: async () => {
      if (!subtask?.id) return [];
      const res = await fetch(`/api/subtasks/${subtask.id}/tags`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!subtask?.id && open && isActualSubtask,
  });

  const { data: subtaskComments = [] } = useQuery<(Comment & { user?: User })[]>({
    queryKey: [`/api/subtasks/${subtask?.id}/comments`],
    enabled: !!subtask?.id && open && isActualSubtask,
  });

  const { data: workspaceTags = [] } = useQuery<TagType[]>({
    queryKey: ["/api/workspaces", workspaceId, "tags"],
    enabled: !!workspaceId && open,
  });

  const invalidateCommentQueries = () => {
    if (subtask) {
      queryClient.invalidateQueries({ queryKey: [`/api/subtasks/${subtask.id}/comments`] });
    }
  };

  const addCommentMutation = useMutation({
    mutationFn: async ({ body, attachmentIds }: { body: string; attachmentIds?: string[] }) => {
      const payload: any = { body };
      if (attachmentIds && attachmentIds.length > 0) payload.attachmentIds = attachmentIds;
      const response = await apiRequest("POST", `/api/subtasks/${subtask?.id}/comments`, payload);
      return response.json() as Promise<Comment & { user?: User }>;
    },
    onMutate: async ({ body }: { body: string; attachmentIds?: string[] }) => {
      if (!subtask?.id || !currentUser) return undefined;
      const commentsKey = [`/api/subtasks/${subtask.id}/comments`];
      await queryClient.cancelQueries({ queryKey: commentsKey });
      const previousComments = queryClient.getQueryData<(Comment & { user?: User })[]>(commentsKey);
      const optimisticComment = {
        id: `temp-${Date.now()}`,
        body,
        subtaskId: subtask.id,
        userId: currentUser.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        resolved: false,
        resolvedAt: null,
        resolvedByUserId: null,
        tenantId: currentUser.tenantId || "",
        user: {
          id: currentUser.id,
          email: currentUser.email,
          firstName: currentUser.firstName,
          lastName: currentUser.lastName,
          name: `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim() || currentUser.email,
          avatarUrl: currentUser.avatarUrl,
        },
      } as any;
      queryClient.setQueryData<(Comment & { user?: User })[]>(commentsKey, (old = []) => [...old, optimisticComment]);
      return { previousComments, commentsKey };
    },
    onError: (error: any, _body, context: any) => {
      if (context?.previousComments !== undefined && context?.commentsKey) {
        queryClient.setQueryData(context.commentsKey, context.previousComments);
      }
      toast({
        title: "Failed to add comment",
        description: error?.message || "Please try again",
        variant: "destructive",
      });
    },
    onSettled: () => {
      invalidateCommentQueries();
    },
  });

  const updateCommentMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      await apiRequest("PATCH", `/api/comments/${id}`, { body });
    },
    onSuccess: invalidateCommentQueries,
    onError: (error: any) => {
      toast({
        title: "Failed to update comment",
        description: error?.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/comments/${id}`);
    },
    onSuccess: invalidateCommentQueries,
    onError: (error: any) => {
      toast({
        title: "Failed to delete comment",
        description: error?.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const resolveCommentMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/comments/${id}/resolve`);
    },
    onSuccess: invalidateCommentQueries,
  });

  const unresolveCommentMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/comments/${id}/unresolve`);
    },
    onSuccess: invalidateCommentQueries,
  });

  const addTagMutation = useMutation({
    mutationFn: async (tagId: string) => {
      return apiRequest("POST", `/api/subtasks/${subtask?.id}/tags`, { tagId });
    },
    onSuccess: () => {
      refetchTags();
      queryClient.invalidateQueries({ queryKey: ["/api/subtasks", subtask?.id] });
      setTagPopoverOpen(false);
    },
    onError: (error: any) => {
      if (error.message?.includes("already added")) {
        toast({ title: "Tag already added", variant: "destructive" });
      } else {
        toast({ title: "Failed to add tag", description: error.message, variant: "destructive" });
      }
    },
  });

  const removeTagMutation = useMutation({
    mutationFn: async (tagId: string) => {
      return apiRequest("DELETE", `/api/subtasks/${subtask?.id}/tags/${tagId}`);
    },
    onSuccess: () => {
      refetchTags();
      queryClient.invalidateQueries({ queryKey: ["/api/subtasks", subtask?.id] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to remove tag", description: error.message, variant: "destructive" });
    },
  });

  const createTagMutation = useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      const res = await apiRequest("POST", `/api/workspaces/${workspaceId}/tags`, { name, color });
      return res.json() as Promise<TagType>;
    },
    onSuccess: async (newTag: TagType) => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces", workspaceId, "tags"] });
      addTagMutation.mutate(newTag.id);
      setIsCreatingTag(false);
      setNewTagName("");
      setNewTagColor("#3b82f6");
      toast({ title: "Tag created and added" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create tag", description: error.message, variant: "destructive" });
    },
  });

  const toggleCompleteMutation = useMutation({
    mutationFn: async (completed: boolean) => {
      if (!subtask) return;
      return apiRequest("PATCH", `/api/subtasks/${subtask.id}`, { 
        completed,
        status: completed ? "done" : "todo"
      });
    },
    onSuccess: (_, completed) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ 
        title: completed ? "Subtask completed" : "Subtask reopened",
        description: completed ? "Great work!" : "Subtask is now active again"
      });
      if (completed) {
        onOpenChange(false);
      }
    },
    onError: (error: any) => {
      toast({ title: "Failed to update subtask", description: error.message, variant: "destructive" });
    },
  });

  const handleMarkComplete = () => {
    if (!subtask) return;
    const isCompleted = isActualSubtask && (subtask as Subtask).completed;
    toggleCompleteMutation.mutate(!isCompleted);
  };

  const sendToReviewMutation = useMutation({
    mutationFn: async () => {
      if (!subtask) return;
      const updateData: Record<string, unknown> = {
        status: "in_review",
        completed: false,
      };

      if (title.trim() && title !== subtask.title) {
        updateData.title = title.trim();
      }
      const originalDescription = typeof subtask.description === "string"
        ? subtask.description
        : subtask.description ? JSON.stringify(subtask.description) : "";
      if (description !== originalDescription) {
        updateData.description = description || null;
      }
      const originalDueDate = subtask.dueDate ? new Date(subtask.dueDate).toISOString() : null;
      const currentDueDate = localDueDate ? localDueDate.toISOString() : null;
      if (currentDueDate !== originalDueDate) {
        updateData.dueDate = localDueDate || null;
      }

      return apiRequest("PATCH", `/api/subtasks/${subtask.id}`, updateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Subtask sent for review" });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({ title: "Failed to send subtask for review", description: error.message, variant: "destructive" });
    },
  });

  const handleCreateTag = () => {
    if (!newTagName.trim() || !workspaceId) return;
    createTagMutation.mutate({ name: newTagName.trim(), color: newTagColor });
  };

  useEffect(() => {
    if (subtask) {
      setTitle(subtask.title);
      setDescription(
        typeof subtask.description === 'string' 
          ? subtask.description 
          : subtask.description ? JSON.stringify(subtask.description) : ""
      );
      setLocalDueDate(subtask.dueDate ? new Date(subtask.dueDate) : null);
    }
  }, [subtask?.id]);

  const { data: activeTimer, isLoading: timerLoading } = useQuery<ActiveTimer | null>({
    queryKey: ["/api/timer/current"],
    enabled: open,
    refetchInterval: 30000,
  });

  const { data: projectContext, isLoading: projectContextLoading, isError: projectContextError } = useQuery<ProjectContext | null>({
    queryKey: ["/api/projects", projectId, "context"],
    queryFn: async () => {
      if (!projectId) return null;
      const projectRes = await fetch(`/api/projects/${projectId}`, { credentials: "include" });
      if (!projectRes.ok) throw new Error("Failed to load project");
      const project = await projectRes.json();
      let client = null;
      if (project?.clientId) {
        const clientRes = await fetch(`/api/clients/${project.clientId}`, { credentials: "include" });
        if (clientRes.ok) {
          client = await clientRes.json();
        }
      }
      return { ...project, client };
    },
    enabled: !!projectId && open,
    retry: 1,
  });

  const isTimerOnThisTask = isActualSubtask
    ? activeTimer?.subtaskId === subtask?.id
    : activeTimer?.taskId === subtask?.id && !activeTimer?.subtaskId;
  const isTimerRunning = activeTimer?.status === "running";
  const timeEntriesQueryKey = isActualSubtask
    ? ["/api/time-entries", { subtaskId: subtask?.id }]
    : ["/api/time-entries", { taskId: subtask?.id }];
  const timeEntriesUrl = isActualSubtask
    ? `/api/time-entries?subtaskId=${subtask?.id}`
    : `/api/time-entries?taskId=${subtask?.id}`;

  const startTimerMutation = useMutation({
    mutationFn: async () => {
      if (projectId && !projectContext?.clientId) {
        throw new Error("Client context required for project subtasks");
      }
      return apiRequest(
        "POST",
        "/api/timer/start",
        buildSubtaskQuickStartTimerPayload({
          clientId: projectContext?.clientId,
          projectId,
          taskId: isActualSubtask ? (subtask as Subtask).taskId : subtask?.id,
          subtaskId: isActualSubtask ? subtask?.id : null,
          title: subtask?.title,
        }),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timer/current"] });
      toast({ title: "Timer started", description: `Tracking time for "${subtask?.title}"` });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to start timer",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const pauseTimerMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/timer/pause"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timer/current"] });
      toast({ title: "Timer paused" });
    },
  });

  const resumeTimerMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/timer/resume"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timer/current"] });
      toast({ title: "Timer resumed" });
    },
  });

  const stopTimerMutation = useMutation({
    mutationFn: async (description: string) =>
      apiRequest(
        "POST",
        "/api/timer/stop",
        buildStopTimerPayload({
          title: subtask?.title,
          description,
          clientId: projectContext?.clientId,
          projectId,
          taskId: isActualSubtask ? (subtask as Subtask).taskId : subtask?.id,
          subtaskId: isActualSubtask ? subtask?.id : null,
        }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timer/current"] });
      queryClient.invalidateQueries({ queryKey: timeEntriesQueryKey });
      setShowStopTimerDialog(false);
      setStopTimerDescription("");
      toast({ title: "Timer stopped", description: "Time entry saved" });
    },
  });

  const { data: timeEntries = [], isLoading: timeEntriesLoading } = useQuery<TimeEntryListItem[]>({
    queryKey: timeEntriesQueryKey,
    queryFn: async () => {
      const res = await fetch(timeEntriesUrl, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load time entries");
      return res.json();
    },
    enabled: !!subtask?.id && open,
  });

  const updateTimeEntryMutation = useMutation({
    mutationFn: async (entry: { id: string; title: string | null; description: string | null; scope: "in_scope" | "out_of_scope" }) => {
      const response = await apiRequest("PATCH", `/api/time-entries/${entry.id}`, entry);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: timeEntriesQueryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/my/stats"] });
      setEditingTimeEntry(null);
      toast({ title: "Time entry updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update time entry", description: error.message, variant: "destructive" });
    },
  });

  const timerState = 
    timerLoading ? "loading" :
    activeTimer && isTimerOnThisTask && isTimerRunning ? "running" :
    activeTimer && isTimerOnThisTask && !isTimerRunning ? "paused" :
    activeTimer && !isTimerOnThisTask ? "other_task" :
    projectContextLoading && !!projectId ? "loading" :
    (!activeTimer && !!projectId && !projectContext?.clientId) || projectContextError ? "hidden" :
    "idle";

  const creatorId = subtask && "createdBy" in subtask ? subtask.createdBy : undefined;
  const creatorUser = creatorId
    ? mentionUsers.find((user) => user.id === creatorId)
    : undefined;
  const creatorLabel = creatorUser
    ? `${creatorUser.firstName || ""} ${creatorUser.lastName || ""}`.trim() || creatorUser.email || "Unknown"
    : null;

  if (!subtask) return null;

  const childTaskAssignees = !isActualSubtask && 'assignees' in subtask ? (subtask as TaskWithRelations).assignees || [] : [];
  const childTaskTags = !isActualSubtask && 'tags' in subtask ? (subtask as TaskWithRelations).tags || [] : [];

  const assigneeUsers: Partial<User>[] = isActualSubtask 
    ? subtaskAssignees.map((a) => a.user).filter(Boolean) as Partial<User>[]
    : childTaskAssignees.map((a) => a.user).filter(Boolean) as Partial<User>[];

  const assignedTagIds = new Set(
    isActualSubtask
      ? subtaskTags.map((t) => t.tagId)
      : childTaskTags.map((t) => t.tagId)
  );

  const handleTitleSave = () => {
    setEditingTitle(false);
  };

  const handleDescriptionChange = (value: string) => {
    setDescription(value);
  };

  const openTimeEntryEditor = (entry: TimeEntryListItem) => {
    setEditingTimeEntry(entry);
    setTimeEntryTitle(entry.title || "");
    setTimeEntryDescription(entry.description || "");
    setTimeEntryScope(entry.scope);
  };

  const handleTimeEntrySave = () => {
    if (!editingTimeEntry) return;
    updateTimeEntryMutation.mutate({
      id: editingTimeEntry.id,
      title: timeEntryTitle.trim() || null,
      description: timeEntryDescription || null,
      scope: timeEntryScope,
    });
  };

  const originalDescription = typeof subtask.description === 'string' 
    ? subtask.description 
    : subtask.description ? JSON.stringify(subtask.description) : "";
  const originalDueDate = subtask.dueDate ? new Date(subtask.dueDate).toISOString() : null;
  const currentDueDate = localDueDate ? localDueDate.toISOString() : null;
  
  const hasUnsavedChanges = 
    title !== subtask.title || 
    description !== originalDescription ||
    currentDueDate !== originalDueDate;

  const handleSaveAll = () => {
    if (title.trim()) {
      onUpdate?.(subtask.id, { 
        title: title.trim(),
        description: description || null,
        dueDate: localDueDate || null
      });
      toast({ title: "Subtask saved" });
      onOpenChange(false);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen && hasUnsavedChanges) {
      setShowUnsavedChangesDialog(true);
      return;
    }
    onOpenChange(isOpen);
  };
  
  const handleConfirmClose = () => {
    setShowUnsavedChangesDialog(false);
    onOpenChange(false);
  };

  return (
    <>
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        className="w-full sm:max-w-xl overflow-y-auto p-0"
        data-testid="subtask-detail-drawer"
      >
        <SheetHeader className="sticky top-0 z-10 bg-background border-b border-border px-3 sm:px-6 py-3 sm:py-4">
          <SheetDescription className="sr-only">Edit subtask details</SheetDescription>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={onBack}
                aria-label="Back to parent task"
                data-testid="button-back-to-parent"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <SheetTitle className="sr-only">Subtask Details</SheetTitle>
              <StatusBadge status={subtask.status as any} />
            </div>
            <Button
              variant="secondary"
              size="icon"
              onClick={() => onOpenChange(false)}
              aria-label="Close drawer"
              data-testid="button-close-subtask-drawer"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2 flex-wrap" data-testid="subtask-breadcrumbs">
            <button
              onClick={onBack}
              className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
              data-testid="breadcrumb-parent-task"
            >
              <CheckSquare className="h-3 w-3" />
              <span className="truncate max-w-[120px] sm:max-w-[150px]">{parentTaskTitle}</span>
            </button>
            <ChevronRight className="h-3 w-3 shrink-0" />
            <span className="flex items-center gap-1 font-medium text-foreground">
              <ListTodo className="h-3 w-3" />
              <span className="truncate max-w-[120px] sm:max-w-[150px]">{subtask.title}</span>
            </span>
          </div>
        </SheetHeader>

        <div className="flex flex-col h-[calc(100vh-120px)]">
          <ScrollArea className="flex-1">
            <div className="px-3 sm:px-6 py-4 sm:py-6 space-y-6">
              <div className="space-y-4">
                {editingTitle ? (
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={handleTitleSave}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleTitleSave();
                      if (e.key === "Escape") {
                        setTitle(subtask.title);
                        setEditingTitle(false);
                      }
                    }}
                    className="text-lg sm:text-xl font-semibold h-auto py-1"
                    autoFocus
                    data-testid="input-subtask-title"
                  />
                ) : (
                  <h2
                    className="text-lg sm:text-xl font-semibold cursor-pointer hover:text-muted-foreground transition-colors"
                    onClick={() => {
                      setTitle(subtask.title);
                      setEditingTitle(true);
                    }}
                    data-testid="text-subtask-title"
                  >
                    {title || subtask.title}
                  </h2>
                )}

                {(isActualSubtask && subtask.createdAt) || creatorLabel ? (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {isActualSubtask && subtask.createdAt && (
                      <div data-testid="subtask-created-at">
                        Created {format(new Date(subtask.createdAt), "MMM d, yyyy")}
                      </div>
                    )}
                    {creatorLabel && (
                      <Badge variant="outline" className="rounded-full border-border/70 bg-background/70 px-3 py-1 text-[11px]" data-testid="subtask-created-by-badge">
                        Created by {creatorLabel}
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-xl px-3 text-[11px]"
                      onClick={() => setShowHistory((value) => !value)}
                      data-testid="button-subtask-history"
                    >
                      <Activity className="h-3.5 w-3.5 mr-1" />
                      {showHistory ? "Hide History" : "Subtask History"}
                    </Button>
                  </div>
                ) : null}

                {showHistory && isActualSubtask && (
                  <div className="rounded-2xl border border-border/70 bg-background/70 p-3 sm:p-4">
                    <TaskHistoryTab entityType="subtask" entityId={subtask.id} />
                  </div>
                )}
                <div className={cn("grid gap-4 rounded-2xl border border-border/70 bg-background/60 p-4", isMobile ? "grid-cols-1" : "grid-cols-2")}>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Flag className="h-3.5 w-3.5" />
                      <DataPointLabel label="Priority" definition={DATA_POINT_DEFINITIONS.priority} />
                    </div>
                    <PrioritySelector
                      value={(subtask.priority || "medium") as PriorityLevel}
                      onChange={(value) => onUpdate?.(subtask.id, { priority: value })}
                      className={cn(isMobile ? "w-full" : "w-[140px]")}
                      data-testid="select-subtask-priority"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Layers className="h-3.5 w-3.5" />
                      <DataPointLabel label="Status" definition={DATA_POINT_DEFINITIONS.status} />
                    </div>
                    <Select
                      value={subtask.status || "todo"}
                      onValueChange={(value) => onUpdate?.(subtask.id, { status: value })}
                    >
                      <SelectTrigger className={cn(isMobile ? "w-full" : "w-[140px]")} data-testid="select-subtask-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todo">To Do</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="in_review">In Review</SelectItem>
                        <SelectItem value="blocked">Blocked</SelectItem>
                        <SelectItem value="done">Done</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      <DataPointLabel label="Due Date" definition={DATA_POINT_DEFINITIONS.dueDate} />
                    </div>
                    <Popover open={dueDatePopoverOpen} onOpenChange={setDueDatePopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn("justify-start px-2 font-normal", isMobile ? "w-full" : "")}
                          data-testid="button-subtask-due-date"
                        >
                          {localDueDate ? (
                            format(localDueDate, "MMM d, yyyy")
                          ) : (
                            <span className="text-muted-foreground">Set due date</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="single"
                          selected={localDueDate || undefined}
                          onSelect={(date) => {
                            setLocalDueDate(date || null);
                            setDueDatePopoverOpen(false);
                          }}
                          initialFocus
                        />
                        {localDueDate && (
                          <div className="p-2 border-t">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full"
                              onClick={() => {
                                setLocalDueDate(null);
                                setDueDatePopoverOpen(false);
                              }}
                            >
                              Clear due date
                            </Button>
                          </div>
                        )}
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      <DataPointLabel label="Estimate" definition={DATA_POINT_DEFINITIONS.estimate} />
                    </div>
                    <Input
                      type="number"
                      min="0"
                      value={subtask.estimateMinutes || ""}
                      onChange={(e) => {
                        const val = e.target.value ? parseInt(e.target.value) : null;
                        onUpdate?.(subtask.id, { estimateMinutes: val });
                      }}
                      placeholder="Minutes"
                      className={cn(isMobile ? "w-full" : "w-[140px]")}
                      data-testid="input-subtask-estimate"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <DataPointLabel label="Assignees" definition={DATA_POINT_DEFINITIONS.assignees} />
                  </div>
                  {isActualSubtask ? (
                    loadingAssignees ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <MultiSelectAssignees
                        taskId={subtask.id}
                        assignees={assigneeUsers}
                        apiPrefix={`/api/subtasks/${subtask.id}`}
                        invalidateKeys={[
                          ["/api/subtasks", subtask.id, "assignees"],
                          ["/api/subtasks", subtask.id],
                          ["/api/tasks", subtask.taskId],
                          ["/api/tasks/my"],
                        ]}
                      />
                    )
                  ) : (
                    <MultiSelectAssignees
                      taskId={subtask.id}
                      assignees={assigneeUsers}
                      disabled
                    />
                  )}
                </div>
              </div>

              <div className={cn(sectionCardClass, "space-y-2")}>
                <label className={sectionTitleClass}>Description</label>
                <RichTextEditor
                  value={description}
                  onChange={handleDescriptionChange}
                  placeholder="Add a description... Type @ to mention someone"
                  minHeight="100px"
                  users={mentionUsers}
                  data-testid="textarea-subtask-description"
                />
              </div>

              {projectId && (
                <div className={sectionCardClass}>
                  <AttachmentUploader taskId={subtask.id} projectId={projectId} />
                </div>
              )}

              <div className={sectionCardClass}>
                <div className={sectionHeaderClass}>
                  <label className={sectionTitleClass}>
                    <Tag className="h-3.5 w-3.5" />
                    Tags
                  </label>
                  {isActualSubtask && (
                    <Popover open={tagPopoverOpen} onOpenChange={(open) => {
                      setTagPopoverOpen(open);
                      if (!open) {
                        setIsCreatingTag(false);
                        setNewTagName("");
                      }
                    }}>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 rounded-xl px-3" data-testid="button-add-subtask-tag">
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Add
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56 p-2" align="end">
                        {isCreatingTag ? (
                          <div className="space-y-2">
                            <div className="text-xs font-medium text-muted-foreground">Create new tag</div>
                            <Input
                              value={newTagName}
                              onChange={(e) => setNewTagName(e.target.value)}
                              placeholder="Tag name..."
                              className="text-sm"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleCreateTag();
                                if (e.key === "Escape") {
                                  setIsCreatingTag(false);
                                  setNewTagName("");
                                }
                              }}
                              data-testid="input-new-tag-name"
                            />
                            <div className="flex items-center gap-2">
                              <ColorPicker
                                value={newTagColor}
                                onChange={setNewTagColor}
                                data-testid="input-new-tag-color"
                              />
                              <span className="text-xs text-muted-foreground">Pick color</span>
                            </div>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                className="flex-1"
                                onClick={handleCreateTag}
                                disabled={!newTagName.trim() || createTagMutation.isPending}
                                data-testid="button-create-tag-submit"
                              >
                                {createTagMutation.isPending ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  "Create"
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setIsCreatingTag(false);
                                  setNewTagName("");
                                }}
                                data-testid="button-cancel-create-tag"
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <ScrollArea className="max-h-48">
                              <div className="space-y-0.5">
                                {workspaceTags.map((tag) => {
                                  if (assignedTagIds.has(tag.id)) return null;
                                  return (
                                    <button
                                      key={tag.id}
                                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover-elevate"
                                      onClick={() => addTagMutation.mutate(tag.id)}
                                      data-testid={`button-subtask-add-tag-${tag.id}`}
                                    >
                                      <div
                                        className="h-3 w-3 rounded-full"
                                        style={{ backgroundColor: tag.color || "#888" }}
                                      />
                                      <span className="text-sm truncate">{tag.name}</span>
                                    </button>
                                  );
                                })}
                                {workspaceTags.filter((t) => !assignedTagIds.has(t.id)).length === 0 && (
                                  <div className="px-2 py-2 text-xs text-muted-foreground">
                                    {workspaceTags.length === 0 ? "No tags in workspace" : "All tags added"}
                                  </div>
                                )}
                              </div>
                            </ScrollArea>
                            {workspaceId && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full justify-start text-xs"
                                onClick={() => setIsCreatingTag(true)}
                                data-testid="button-create-new-tag"
                              >
                                <Plus className="h-3 w-3 mr-1" />
                                Create new tag
                              </Button>
                            )}
                          </div>
                        )}
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 min-h-[32px] items-center">
                  {(isActualSubtask && loadingTags) ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <>
                      {(isActualSubtask ? subtaskTags : childTaskTags).map((st) => {
                        const tag = isActualSubtask ? (st as SubtaskTag).tag : (st as any).tag;
                        const tagId = isActualSubtask ? (st as SubtaskTag).tagId : (st as any).tagId;
                        if (!tag) return null;
                        return (
                          <Badge
                            key={tagId}
                            variant="secondary"
                            className="gap-1 pr-1"
                            style={{ backgroundColor: `${tag.color}20`, borderColor: tag.color }}
                            data-testid={`subtask-tag-${tag.id}`}
                          >
                            <span style={{ color: tag.color }}>{tag.name}</span>
                            {isActualSubtask && (
                              <button
                                className="ml-1 h-3 w-3 rounded-full hover:bg-destructive/20 flex items-center justify-center"
                                onClick={() => removeTagMutation.mutate(tag.id)}
                                data-testid={`button-remove-tag-${tag.id}`}
                              >
                                <X className="h-2 w-2" />
                              </button>
                            )}
                          </Badge>
                        );
                      })}
                      {(isActualSubtask ? subtaskTags : childTaskTags).length === 0 && (
                        <span className="text-sm text-muted-foreground">No tags</span>
                      )}
                    </>
                  )}
                </div>
              </div>

              {isActualSubtask && (
                <div className={sectionCardClass}>
                  <div className="space-y-3">
                    <div className={sectionHeaderClass}>
                      <label className={sectionTitleClass}>
                        <Timer className="h-3.5 w-3.5" />
                        Time Entries
                      </label>
                      <div className="flex items-center gap-2">
                        {timerState === "idle" && (
                          <Button
                            size="sm"
                            onClick={() => startTimerMutation.mutate()}
                            className="h-9 rounded-xl shadow-[var(--shadow-soft)]"
                          >
                            <Play className="h-3.5 w-3.5 mr-1.5" />
                            Start Timer
                          </Button>
                        )}
                        {timerState === "loading" && (
                          <Button size="sm" disabled className="h-9 rounded-xl">
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                            Loading...
                          </Button>
                        )}
                        {timerState === "running" && (
                          <>
                            <Button variant="outline" size="sm" onClick={() => pauseTimerMutation.mutate()} className="h-9 rounded-xl">
                              <Pause className="h-3.5 w-3.5 mr-1.5" />
                              Pause
                            </Button>
                            <Button variant="destructive" size="sm" onClick={() => setShowStopTimerDialog(true)} className="h-9 rounded-xl">
                              <Square className="h-3.5 w-3.5 mr-1.5" />
                              Stop
                            </Button>
                          </>
                        )}
                        {timerState === "paused" && (
                          <>
                            <Button variant="outline" size="sm" onClick={() => resumeTimerMutation.mutate()} className="h-9 rounded-xl">
                              <Play className="h-3.5 w-3.5 mr-1.5" />
                              Resume
                            </Button>
                            <Button variant="destructive" size="sm" onClick={() => setShowStopTimerDialog(true)} className="h-9 rounded-xl">
                              <Square className="h-3.5 w-3.5 mr-1.5" />
                              Stop
                            </Button>
                          </>
                        )}
                        {timeEntries.length > 0 && (
                          <span className="text-xs text-muted-foreground ml-2">
                            Total: {formatDurationShort(timeEntries.reduce((sum, e) => sum + e.durationSeconds, 0))}
                          </span>
                        )}
                      </div>
                    </div>
                    {timeEntriesLoading ? (
                      <p className="text-sm text-muted-foreground">Loading time entries...</p>
                    ) : timeEntries.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No time entries for this subtask</p>
                    ) : (
                      <div className="space-y-2">
                        {timeEntries.map((entry) => (
                          <div key={entry.id} className="flex items-start justify-between rounded-2xl border border-border/70 bg-background/70 p-3 shadow-[var(--shadow-soft)]">
                            <div className="space-y-1 flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium">
                                  {formatDurationShort(entry.durationSeconds)}
                                </span>
                                <Badge variant={entry.scope === "out_of_scope" ? "default" : "secondary"} className="text-xs">
                                  {entry.scope === "out_of_scope" ? "Billable" : "Unbillable"}
                                </Badge>
                              </div>
                              {entry.title && (
                                <p className="text-sm font-medium truncate">{entry.title}</p>
                              )}
                              {entry.description && (
                                <p className="text-sm text-muted-foreground truncate">{entry.description}</p>
                              )}
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>{format(new Date(entry.startTime), "MMM d, yyyy")}</span>
                                {entry.user && (
                                  <>
                                    <span>•</span>
                                    <span>
                                      {entry.user.firstName && entry.user.lastName
                                        ? `${entry.user.firstName} ${entry.user.lastName}`
                                        : entry.user.email}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openTimeEntryEditor(entry)}
                              aria-label="Edit time entry"
                              data-testid={`button-edit-subtask-time-entry-${entry.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {isActualSubtask && (
                <div className={sectionCardClass} data-testid="subtask-comments-section">
                  <CommentThread
                    comments={subtaskComments}
                    taskId={subtask.id}
                    projectId={projectId}
                    currentUserId={currentUser?.id}
                    onAdd={(body, attachmentIds) => addCommentMutation.mutate({ body, attachmentIds })}
                    onUpdate={(id, body) => updateCommentMutation.mutate({ id, body })}
                    onDelete={(id) => deleteCommentMutation.mutate(id)}
                    onResolve={(id) => resolveCommentMutation.mutate(id)}
                    onUnresolve={(id) => unresolveCommentMutation.mutate(id)}
                    users={mentionUsers}
                  />
                </div>
              )}
            </div>
          </ScrollArea>

        <DrawerActionBar
          showTimer={false}
          showSave={true}
          onSave={handleSaveAll}
          saveLabel="Save Subtask"
          showReview={
            isActualSubtask &&
            Boolean(projectId) &&
            normalizeTaskStatus(subtask.status) !== "done" &&
            normalizeTaskStatus(subtask.status) !== "in_review"
          }
          onSendToReview={() => sendToReviewMutation.mutate()}
          reviewDisabled={sendToReviewMutation.isPending}
          isSendingToReview={sendToReviewMutation.isPending}
          showComplete={isActualSubtask}
          onMarkComplete={handleMarkComplete}
          isCompleting={toggleCompleteMutation.isPending}
          completeLabel={(subtask as Subtask).completed ? "Reopen" : "Mark Complete"}
          className="sticky bottom-0 z-10"
        />
        </div>
      </SheetContent>
    </Sheet>

    <Dialog open={!!editingTimeEntry} onOpenChange={(open) => !open && setEditingTimeEntry(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Time Entry</DialogTitle>
          <DialogDescription>Update the tracked details for this time entry.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="subtask-time-entry-title">Title</Label>
            <Input
              id="subtask-time-entry-title"
              value={timeEntryTitle}
              onChange={(e) => setTimeEntryTitle(e.target.value)}
              placeholder="Optional title"
              data-testid="input-subtask-time-entry-title"
            />
          </div>
          <div className="space-y-2">
            <Label>Scope</Label>
            <Select value={timeEntryScope} onValueChange={(value: "in_scope" | "out_of_scope") => setTimeEntryScope(value)}>
              <SelectTrigger data-testid="select-subtask-time-entry-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in_scope">Unbillable</SelectItem>
                <SelectItem value="out_of_scope">Billable</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <div className="min-h-[140px] border rounded-md focus-within:ring-1 focus-within:ring-ring transition-shadow">
              <RichTextEditor
                value={timeEntryDescription}
                onChange={setTimeEntryDescription}
                placeholder="Add more detail about the work performed..."
                className="border-0 focus-visible:ring-0"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setEditingTimeEntry(null)}>
            Cancel
          </Button>
          <Button onClick={handleTimeEntrySave} disabled={updateTimeEntryMutation.isPending}>
            {updateTimeEntryMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={showStopTimerDialog} onOpenChange={setShowStopTimerDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save Time Entry</DialogTitle>
          <DialogDescription>
            Add a description before saving time for this {isActualSubtask ? "subtask" : "task"}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={subtask?.title || ""} readOnly data-testid="input-subtask-stop-title" />
          </div>
          <div className="space-y-2">
            <Label>Description <span className="text-destructive">*</span></Label>
            <Textarea
              value={stopTimerDescription}
              onChange={(e) => setStopTimerDescription(e.target.value)}
              placeholder="What work did you complete?"
              className={cn("min-h-[140px] resize-none", !stopTimerDescription.trim() && "border-destructive/50")}
              data-testid="textarea-subtask-stop-description"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowStopTimerDialog(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => stopTimerMutation.mutate(stopTimerDescription.trim())}
            disabled={stopTimerMutation.isPending || !stopTimerDescription.trim()}
            data-testid="button-subtask-stop-save"
          >
            {stopTimerMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog open={showUnsavedChangesDialog} onOpenChange={setShowUnsavedChangesDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved changes. Are you sure you want to close without saving?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-cancel-close-subtask">Keep Editing</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirmClose}
            className="bg-destructive text-destructive-foreground"
            data-testid="button-confirm-close-subtask"
          >
            Discard Changes
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
