import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { X, Calendar, Flag, Layers, ArrowLeft, Tag, Plus, Clock, Timer, Play, Pause, Square, Loader2, ChevronRight, CheckSquare, ListTodo, CheckCircle2, Circle, MessageSquare, Save, Check } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
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
import { useIsMobile } from "@/hooks/use-mobile";
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
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const isMobile = useIsMobile();
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(subtask?.title || "");
  const [description, setDescription] = useState<string>(
    typeof subtask?.description === 'string' 
      ? subtask.description 
      : subtask?.description ? JSON.stringify(subtask.description) : ""
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
    mutationFn: async (body: string) => {
      const response = await apiRequest("POST", `/api/subtasks/${subtask?.id}/comments`, { body });
      return response.json() as Promise<Comment & { user?: User }>;
    },
    onMutate: async (body: string) => {
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
        onBack?.();
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
      if (projectId && !isActualSubtask) {
        // Handle case where we might need more context for non-subtask items if any
      }
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
    onError: (error: Error) => {
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
            <div className="flex items-center gap-2">
              {hasUnsavedChanges && (
                <Button
                  size="sm"
                  onClick={handleSaveAll}
                  className="h-8 bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
                  data-testid="button-header-save-subtask"
                >
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  Save Subtask
                </Button>
              )}
              {isActualSubtask && (
                <Button
                  size="sm"
                  onClick={handleMarkComplete}
                  disabled={toggleCompleteMutation.isPending}
                  className="h-8 border border-[#7fb314] text-white bg-[#94c91a] hover:bg-[#8bbd18]"
                  data-testid="button-header-mark-complete-subtask"
                >
                  {toggleCompleteMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  {(subtask as Subtask).completed ? "Reopen" : "Mark Complete"}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                aria-label="Close drawer"
                data-testid="button-close-subtask-drawer"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
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

                {isActualSubtask && subtask.createdAt && (
                  <div className="text-xs text-muted-foreground" data-testid="subtask-created-at">
                    Created {format(new Date(subtask.createdAt), "MMM d, yyyy")}
                  </div>
                )}

                <div className={cn("grid gap-4", isMobile ? "grid-cols-1" : "grid-cols-2")}>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Flag className="h-3.5 w-3.5" />
                      Priority
                    </label>
                    <PrioritySelector
                      value={(subtask.priority || "medium") as PriorityLevel}
                      onChange={(value) => onUpdate?.(subtask.id, { priority: value })}
                      className={cn(isMobile ? "w-full" : "w-[140px]")}
                      data-testid="select-subtask-priority"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Layers className="h-3.5 w-3.5" />
                      Status
                    </label>
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
                        <SelectItem value="blocked">Blocked</SelectItem>
                        <SelectItem value="done">Done</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      Due Date
                    </label>
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
                      className={cn(isMobile ? "w-full" : "w-[140px]")}
                      data-testid="input-subtask-estimate"
                    />
                  </div>
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
                    <MultiSelectAssignees
                      taskId={subtask.id}
                      assignees={assigneeUsers}
                      disabled
                    />
                  )}
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Description</label>
                <RichTextEditor
                  value={description}
                  onChange={handleDescriptionChange}
                  placeholder="Add a description... Type @ to mention someone"
                  minHeight="100px"
                  users={availableUsers}
                  data-testid="textarea-subtask-description"
                />
              </div>

              <Separator />

              {projectId && (
                <div 
                  className="p-3 sm:p-4 bg-[#edebff4d] border border-[#d6d2ff]"
                  style={{ borderRadius: "10px" }}
                >
                  <AttachmentUploader taskId={subtask.id} projectId={projectId} />
                </div>
              )}

              <div 
                className="p-3 sm:p-4 bg-[#d1f6ff4d] border border-[#ade8f5]"
                style={{ borderRadius: "10px" }}
              >
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 font-medium text-[#171717] text-[16px]">
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
                        <Button variant="ghost" size="sm" className="h-6 px-2" data-testid="button-add-subtask-tag">
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

              <Separator />

              {isActualSubtask && (
                <div 
                  className="p-3 sm:p-4 bg-[#ffbb734d] border border-[#f5ac5b]"
                  style={{ borderRadius: "10px" }}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 font-medium text-[#171717] text-[16px]">
                        <Timer className="h-3.5 w-3.5" />
                        Time Entries
                      </label>
                      <div className="flex items-center gap-2">
                        {timerState === "idle" && (
                          <Button
                            size="sm"
                            onClick={() => startTimerMutation.mutate()}
                            className="h-8 border border-[#d97d26] text-white bg-[#f7902f] hover:bg-[#e67e22]"
                          >
                            <Play className="h-3.5 w-3.5 mr-1.5" />
                            Start Timer
                          </Button>
                        )}
                        {timerState === "loading" && (
                          <Button size="sm" disabled className="h-8 border border-[#d97d26] text-white bg-[#f7902f]">
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                            Loading...
                          </Button>
                        )}
                        {timerState === "running" && (
                          <>
                            <Button variant="outline" size="sm" onClick={() => pauseTimerMutation.mutate()} className="h-8">
                              <Pause className="h-3.5 w-3.5 mr-1.5" />
                              Pause
                            </Button>
                            <Button variant="destructive" size="sm" onClick={() => stopTimerMutation.mutate()} className="h-8">
                              <Square className="h-3.5 w-3.5 mr-1.5" />
                              Stop
                            </Button>
                          </>
                        )}
                        {timerState === "paused" && (
                          <>
                            <Button variant="outline" size="sm" onClick={() => resumeTimerMutation.mutate()} className="h-8">
                              <Play className="h-3.5 w-3.5 mr-1.5" />
                              Resume
                            </Button>
                            <Button variant="destructive" size="sm" onClick={() => stopTimerMutation.mutate()} className="h-8">
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
                          <div key={entry.id} className="flex items-start justify-between p-3 rounded-md border bg-muted/30">
                            <div className="space-y-1 flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium">
                                  {formatDurationShort(entry.durationSeconds)}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>{format(new Date(entry.startTime), "MMM d, yyyy")}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <Separator />

              {isActualSubtask && (
                <div 
                  className="p-3 sm:p-4 bg-[#c2dfff4d] border border-[#adc6e6]"
                  style={{ borderRadius: "10px" }}
                  data-testid="subtask-comments-section"
                >
                  <CommentThread
                    comments={subtaskComments}
                    taskId={subtask.id}
                    currentUserId={currentUser?.id}
                    onAdd={(body) => addCommentMutation.mutate(body)}
                    onUpdate={(id, body) => updateCommentMutation.mutate({ id, body })}
                    onDelete={(id) => deleteCommentMutation.mutate(id)}
                    onResolve={(id) => resolveCommentMutation.mutate(id)}
                    onUnresolve={(id) => unresolveCommentMutation.mutate(id)}
                    users={availableUsers}
                  />
                </div>
              )}
            </div>
          </ScrollArea>

        </div>
      </SheetContent>
    </Sheet>

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
