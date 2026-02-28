import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { X, Calendar, Flag, Layers, ArrowLeft, Tag, Plus, Clock, Timer, Play, Pause, Square, Loader2, ChevronRight, CheckSquare, ListTodo, MessageSquare, FileText, History, Link2 } from "lucide-react";
import { TaskPanelShell } from "./task-panel/TaskPanelShell";
import { TaskHistoryTab } from "./task-panel/TaskHistoryTab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { MultiSelectAssignees } from "@/components/multi-select-assignees";
import { format } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import type { Subtask, User, Tag as TagType, Comment, TaskWithRelations } from "@shared/schema";
import { cn } from "@/lib/utils";
import { ColorPicker } from "@/components/ui/color-picker";
import { DrawerActionBar } from "@/components/layout/drawer-action-bar";

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

type ActiveTimer = {
  id: string;
  taskId: string | null;
  status: string;
};

function formatDurationShort(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

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
  const [activeTab, setActiveTab] = useState<"overview" | "history">("overview");
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
  const [showUnsavedChangesDialog, setShowUnsavedChangesDialog] = useState(false);

  const isActualSubtask = isSubtask(subtask);

  const { data: subtaskAssignees = [], isLoading: loadingAssignees } = useQuery<SubtaskAssignee[]>({
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
      toast({ title: "Failed to update comment", description: error?.message || "Please try again", variant: "destructive" });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/comments/${id}`);
    },
    onSuccess: invalidateCommentQueries,
    onError: (error: any) => {
      toast({ title: "Failed to delete comment", description: error?.message || "Please try again", variant: "destructive" });
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

  const isTimerOnThisTask = activeTimer?.taskId === subtask?.id;
  const isTimerRunning = activeTimer?.status === "running";

  const startTimerMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/timer/start", {
        clientId: (subtask as any).project?.clientId || null,
        projectId: projectId || null,
        taskId: subtask?.id || null,
        description: subtask?.title || "",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timer/current"] });
      toast({ title: "Timer started", description: `Tracking time for "${subtask?.title}"` });
    },
    onError: () => {
      toast({ title: "Failed to start timer", variant: "destructive" });
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
    mutationFn: async () => apiRequest("POST", "/api/timer/stop", { scope: "in_scope" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timer/current"] });
      queryClient.invalidateQueries({ queryKey: [`/api/time-entries?taskId=${subtask?.id}`] });
      toast({ title: "Timer stopped", description: "Time entry saved" });
    },
  });

  const { data: timeEntries = [], isLoading: timeEntriesLoading } = useQuery<any[]>({
    queryKey: [`/api/time-entries?taskId=${subtask?.id}`],
    enabled: !!subtask?.id && open,
  });

  const timerState = 
    timerLoading ? "loading" :
    activeTimer && isTimerOnThisTask && isTimerRunning ? "running" :
    activeTimer && isTimerOnThisTask && !isTimerRunning ? "paused" :
    activeTimer && !isTimerOnThisTask ? "other_task" :
    "idle";

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

  const tabItems = [
    { id: "overview" as const, label: "Overview", icon: <FileText className="h-3.5 w-3.5" /> },
    { id: "history" as const, label: "History", icon: <History className="h-3.5 w-3.5" /> },
  ];

  const panelHeader = (
    <div className="px-4 sm:px-6 py-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={onBack} aria-label="Back to parent task" data-testid="button-back-to-parent">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          {editingTitle ? (
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.stopPropagation(); handleTitleSave(); }
                if (e.key === "Escape") { e.stopPropagation(); setTitle(subtask.title); setEditingTitle(false); }
              }}
              className="text-base font-semibold h-8 min-w-0 flex-1"
              autoFocus
              data-testid="input-subtask-title"
            />
          ) : (
            <h2
              className="font-semibold cursor-pointer hover:text-muted-foreground transition-colors truncate min-w-0 flex-1 text-[22px]"
              onClick={() => { setTitle(subtask.title); setEditingTitle(true); }}
              data-testid="text-subtask-title"
            >
              {title || subtask.title}
            </h2>
          )}
          <StatusBadge status={subtask.status as any} />
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              const url = `${window.location.origin}/projects/${projectId}?task=${subtask.id}`;
              navigator.clipboard.writeText(url);
              toast({ title: "Link copied", description: "Subtask link copied to clipboard" });
            }}
            title="Copy subtask link"
            data-testid="button-copy-subtask-link"
          >
            <Link2 className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="icon" onClick={() => onOpenChange(false)} aria-label="Close drawer" data-testid="button-close-subtask-drawer">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {isActualSubtask && (
        <div className="flex items-center justify-end gap-2">
          {timerState === "idle" && (
            <Button size="sm" onClick={() => startTimerMutation.mutate()} className="h-8 border border-[#d97d26] text-white bg-[#f7902f] hover:bg-[#e67e22]" data-testid="button-timer-start">
              <Play className="h-3.5 w-3.5 mr-1.5" /> Start Timer
            </Button>
          )}
          {timerState === "loading" && (
            <Button size="sm" disabled className="h-8 border border-[#d97d26] text-white bg-[#f7902f]">
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Loading...
            </Button>
          )}
          {timerState === "running" && (
            <>
              <Button variant="outline" size="sm" onClick={() => pauseTimerMutation.mutate()} className="h-8">
                <Pause className="h-3.5 w-3.5 mr-1.5" /> Pause
              </Button>
              <Button variant="destructive" size="sm" onClick={() => stopTimerMutation.mutate()} className="h-8">
                <Square className="h-3.5 w-3.5 mr-1.5" /> Stop
              </Button>
            </>
          )}
          {timerState === "paused" && (
            <>
              <Button variant="outline" size="sm" onClick={() => resumeTimerMutation.mutate()} className="h-8">
                <Play className="h-3.5 w-3.5 mr-1.5" /> Resume
              </Button>
              <Button variant="destructive" size="sm" onClick={() => stopTimerMutation.mutate()} className="h-8">
                <Square className="h-3.5 w-3.5 mr-1.5" /> Stop
              </Button>
            </>
          )}
          {timeEntries.length > 0 && (
            <span className="text-xs text-muted-foreground">
              Total: {formatDurationShort(timeEntries.reduce((sum: number, e: any) => sum + e.durationSeconds, 0))}
            </span>
          )}
        </div>
      )}
      <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap" data-testid="subtask-breadcrumbs">
        <button onClick={onBack} className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer" data-testid="breadcrumb-parent-task">
          <CheckSquare className="h-3 w-3" />
          <span className="truncate max-w-[120px] sm:max-w-[150px]">{parentTaskTitle}</span>
        </button>
        <ChevronRight className="h-3 w-3 shrink-0" />
        <span className="flex items-center gap-1 font-medium text-foreground">
          <ListTodo className="h-3 w-3" />
          <span className="truncate max-w-[120px] sm:max-w-[150px]">{subtask.title}</span>
        </span>
      </div>
      <div className="flex items-center gap-1 border-b border-border -mx-4 sm:-mx-6 px-4 sm:px-6">
        {tabItems.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            )}
            data-testid={`tab-${tab.id}`}
          >
            {tab.icon}
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <Badge variant="secondary" className="h-5 min-w-[20px] px-1 text-[10px]">{tab.count}</Badge>
            )}
          </button>
        ))}
      </div>
    </div>
  );

  const panelSidebar = (
    <div className="p-4 space-y-5">
      {isActualSubtask && subtask.createdAt && (
        <div className="text-xs text-muted-foreground" data-testid="subtask-created-at">
          Created {format(new Date(subtask.createdAt), "MMM d, yyyy")}
        </div>
      )}

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Layers className="h-3.5 w-3.5" />
            Status
          </label>
          <Select value={subtask.status || "todo"} onValueChange={(value) => onUpdate?.(subtask.id, { status: value })}>
            <SelectTrigger className="w-full h-8" data-testid="select-subtask-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todo">To Do</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
              <SelectItem value="done">Done</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Flag className="h-3.5 w-3.5" />
            Priority
          </label>
          <PrioritySelector
            value={(subtask.priority || "medium") as PriorityLevel}
            onChange={(value) => onUpdate?.(subtask.id, { priority: value })}
            className="w-full h-8"
            data-testid="select-subtask-priority"
          />
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            Due Date
          </label>
          <Popover open={dueDatePopoverOpen} onOpenChange={setDueDatePopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="justify-start px-2 font-normal w-full h-8" data-testid="button-subtask-due-date">
                {localDueDate ? format(localDueDate, "MMM d, yyyy") : <span className="text-muted-foreground">Set due date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                mode="single"
                selected={localDueDate || undefined}
                onSelect={(date) => { setLocalDueDate(date || null); setDueDatePopoverOpen(false); }}
                initialFocus
              />
              {localDueDate && (
                <div className="p-2 border-t">
                  <Button variant="ghost" size="sm" className="w-full" onClick={() => { setLocalDueDate(null); setDueDatePopoverOpen(false); }}>
                    Clear due date
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            Estimate
          </label>
          <Input
            type="number"
            min="0"
            value={subtask.estimateMinutes || ""}
            onChange={(e) => {
              const val = e.target.value ? parseInt(e.target.value) : null;
              onUpdate?.(subtask.id, { estimateMinutes: val });
            }}
            placeholder="Minutes"
            className="w-full h-8"
            data-testid="input-subtask-estimate"
          />
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            Assignees
          </label>
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
                  ["/api/tasks/my"],
                ]}
              />
            )
          ) : (
            <MultiSelectAssignees taskId={subtask.id} assignees={assigneeUsers} disabled />
          )}
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Tag className="h-3.5 w-3.5" />
          Tags
        </label>
        <div className="flex flex-wrap gap-1.5 min-h-[28px] items-center">
          {(isActualSubtask && loadingTags) ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <>
              {(isActualSubtask ? subtaskTags : childTaskTags).map((st) => {
                const tag = isActualSubtask ? (st as SubtaskTag).tag : (st as any).tag;
                const tagId = isActualSubtask ? (st as SubtaskTag).tagId : (st as any).tagId;
                if (!tag) return null;
                return (
                  <Badge key={tagId} variant="secondary" className="gap-1 pr-1" style={{ backgroundColor: `${tag.color}20`, borderColor: tag.color }} data-testid={`subtask-tag-${tag.id}`}>
                    <span style={{ color: tag.color }}>{tag.name}</span>
                    {isActualSubtask && (
                      <button className="ml-1 h-3 w-3 rounded-full hover:bg-destructive/20 flex items-center justify-center" onClick={() => removeTagMutation.mutate(tag.id)} data-testid={`button-remove-tag-${tag.id}`}>
                        <X className="h-2 w-2" />
                      </button>
                    )}
                  </Badge>
                );
              })}
              {(isActualSubtask ? subtaskTags : childTaskTags).length === 0 && (
                <span className="text-xs text-muted-foreground">No tags</span>
              )}
            </>
          )}
          {isActualSubtask && (
            <Popover open={tagPopoverOpen} onOpenChange={(open) => { setTagPopoverOpen(open); if (!open) { setIsCreatingTag(false); setNewTagName(""); } }}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 rounded-full hover:bg-muted" data-testid="button-add-subtask-tag">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2" align="end">
                {isCreatingTag ? (
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">Create new tag</div>
                    <Input value={newTagName} onChange={(e) => setNewTagName(e.target.value)} placeholder="Tag name..." className="h-8 text-sm" autoFocus onKeyDown={(e) => { if (e.key === "Enter") handleCreateTag(); if (e.key === "Escape") { setIsCreatingTag(false); setNewTagName(""); } }} data-testid="input-new-tag-name" />
                    <div className="flex items-center gap-2">
                      <ColorPicker value={newTagColor} onChange={setNewTagColor} data-testid="input-new-tag-color" />
                      <span className="text-xs text-muted-foreground">Pick color</span>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" className="flex-1" onClick={handleCreateTag} disabled={!newTagName.trim() || createTagMutation.isPending} data-testid="button-create-tag-submit">
                        {createTagMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Create"}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => { setIsCreatingTag(false); setNewTagName(""); }} data-testid="button-cancel-create-tag">Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <ScrollArea className="max-h-48">
                      <div className="space-y-0.5">
                        {workspaceTags.map((tag) => {
                          if (assignedTagIds.has(tag.id)) return null;
                          return (
                            <button key={tag.id} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover-elevate" onClick={() => addTagMutation.mutate(tag.id)} data-testid={`button-subtask-add-tag-${tag.id}`}>
                              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: tag.color || "#888" }} />
                              <span className="text-sm truncate">{tag.name}</span>
                            </button>
                          );
                        })}
                        {workspaceTags.filter((t) => !assignedTagIds.has(t.id)).length === 0 && (
                          <div className="px-2 py-2 text-xs text-muted-foreground">{workspaceTags.length === 0 ? "No tags in workspace" : "All tags added"}</div>
                        )}
                      </div>
                    </ScrollArea>
                    {workspaceId && (
                      <Button variant="ghost" size="sm" className="w-full justify-start text-xs" onClick={() => setIsCreatingTag(true)} data-testid="button-create-new-tag">
                        <Plus className="h-3 w-3 mr-1" /> Create new tag
                      </Button>
                    )}
                  </div>
                )}
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <CheckSquare className="h-3.5 w-3.5" />
          Parent Task
        </label>
        <button onClick={onBack} className="text-sm text-primary hover:underline cursor-pointer" data-testid="link-parent-task">
          {parentTaskTitle}
        </button>
      </div>
    </div>
  );

  const panelFooter = (
    <DrawerActionBar
      showTimer={false}
      showSave={true}
      onSave={handleSaveAll}
      saveLabel="Save Subtask"
      showComplete={isActualSubtask}
      onMarkComplete={handleMarkComplete}
      isCompleting={toggleCompleteMutation.isPending}
      completeLabel={(subtask as Subtask).completed ? "Reopen" : "Mark Complete"}
    />
  );

  return (
    <>
      <TaskPanelShell
        open={open}
        onOpenChange={handleOpenChange}
        header={panelHeader}
        sidebar={panelSidebar}
        footer={panelFooter}
        data-testid="subtask-detail-drawer"
      >
        <div className="p-4 sm:p-6 space-y-6">
          {activeTab === "overview" && (
            <>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Description</label>
                <RichTextEditor
                  value={description}
                  onChange={handleDescriptionChange}
                  placeholder="Add a description... Type @ to mention someone"
                  minHeight="120px"
                  users={mentionUsers}
                  data-testid="textarea-subtask-description"
                />
              </div>

              {projectId && (
                <div className="p-3 sm:p-4 bg-muted/40 border border-border rounded-xl">
                  <AttachmentUploader taskId={subtask.id} projectId={projectId} />
                </div>
              )}

              {isActualSubtask && (
                <div className="p-3 sm:p-4 bg-muted/40 border border-border rounded-xl" data-testid="subtask-comments-section">
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
            </>
          )}

          {activeTab === "history" && (
            <TaskHistoryTab entityType="subtask" entityId={subtask.id} enabled={activeTab === "history"} />
          )}
        </div>
      </TaskPanelShell>

      <AlertDialog open={showUnsavedChangesDialog} onOpenChange={setShowUnsavedChangesDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>You have unsaved changes. Are you sure you want to close without saving?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-close-subtask">Keep Editing</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmClose} className="bg-destructive text-destructive-foreground" data-testid="button-confirm-close-subtask">
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
