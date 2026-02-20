import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Calendar, Users, Tag, Flag, Layers, CalendarIcon, Clock, Timer, Play, Eye, Square, Pause, ChevronRight, Building2, FolderKanban, Loader2, CheckSquare, Save, Check, Plus, Trash2, Link2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { TaskDrawerSkeleton } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor, RichTextRenderer } from "@/components/richtext";
import { toPlainText } from "@/components/richtext/richTextUtils";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { SubtaskList } from "./subtask-list";
import { SubtaskDetailDrawer } from "./subtask-detail-drawer";
import { CommentThread } from "@/components/comment-thread";
import { AttachmentUploader } from "@/components/attachment-uploader";
import { StatusBadge } from "@/components/status-badge";
import { TagBadge } from "@/components/tag-badge";
import { ColorPicker } from "@/components/ui/color-picker";
import { MultiSelectAssignees } from "@/components/multi-select-assignees";
import { MultiSelectWatchers } from "@/components/multi-select-watchers";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { StartTimerDrawer } from "@/features/timer/start-timer-drawer";
import { useToast } from "@/hooks/use-toast";
import { DrawerActionBar } from "@/components/layout/drawer-action-bar";
import { FormFieldWrapper, DatePickerWithChips, PrioritySelector, StatusSelector, type PriorityLevel, type TaskStatus } from "@/components/forms";
import type { TaskWithRelations, User, Tag as TagType, Comment, Project, Client } from "@shared/schema";

type ActiveTimer = {
  id: string;
  taskId: string | null;
  status: "running" | "paused";
  elapsedSeconds: number;
  lastStartedAt: string | null;
};

type ProjectContext = Project & {
  client?: Client;
  division?: { id: string; name: string; color?: string | null };
};

type TimeEntry = {
  id: string;
  userId: string;
  description: string | null;
  startTime: string;
  durationSeconds: number;
  scope: "in_scope" | "out_of_scope";
  user?: { id: string; firstName: string | null; lastName: string | null; email: string };
};

function formatDurationShort(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

const PERF_ENABLED = typeof window !== "undefined" && (window as any).__TASK_DRAWER_PERF === 1;

function perfLog(label: string, startMs: number) {
  if (PERF_ENABLED) {
    console.log(`[TaskDrawer:perf] ${label}: ${(performance.now() - startMs).toFixed(2)}ms`);
  }
}

interface TaskDetailDrawerProps {
  task: TaskWithRelations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate?: (taskId: string, data: Partial<TaskWithRelations>) => void;
  onAddComment?: (taskId: string, body: string) => void;
  onRefresh?: () => void;
  availableTags?: TagType[];
  availableUsers?: User[];
  workspaceId?: string;
  isLoading?: boolean;
  isError?: boolean;
}

export function TaskDetailDrawer({
  task: taskProp,
  open,
  onOpenChange,
  onUpdate,
  onAddComment,
  onRefresh,
  availableTags = [],
  availableUsers = [],
  workspaceId = "",
  isLoading = false,
  isError = false,
}: TaskDetailDrawerProps) {
  const renderCount = useRef(0);
  if (PERF_ENABLED) {
    renderCount.current++;
    console.log(`[TaskDrawer:perf] render #${renderCount.current}, taskId=${taskProp?.id ?? "none"}, open=${open}`);
  }
  const renderStart = PERF_ENABLED ? performance.now() : 0;

  const { data: liveTask } = useQuery<TaskWithRelations>({
    queryKey: ["/api/tasks", taskProp?.id],
    enabled: !!taskProp?.id && open,
    initialData: taskProp || undefined,
    staleTime: 5000,
  });
  const task = liveTask || taskProp;

  const { data: tenantUsers = [] } = useQuery<User[]>({
    queryKey: ["/api/tenant/users"],
    enabled: open && (!availableUsers || availableUsers.length === 0),
  });
  const mentionUsers = useMemo(
    () => availableUsers && availableUsers.length > 0 ? availableUsers : tenantUsers,
    [availableUsers, tenantUsers]
  );

  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "super_user";
  const isMobile = useIsMobile();
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(task?.title || "");
  const [description, setDescription] = useState(task?.description || "");
  const [estimateMinutes, setEstimateMinutes] = useState<string>(
    task?.estimateMinutes ? String(task.estimateMinutes) : ""
  );
  const [selectedSubtask, setSelectedSubtask] = useState<any | null>(null);
  const [subtaskDrawerOpen, setSubtaskDrawerOpen] = useState(false);
  const [timerDrawerOpen, setTimerDrawerOpen] = useState(false);
  const closingRef = useRef(false);

  useEffect(() => {
    if (!open) {
      closingRef.current = false;
    }
  }, [open]);
  
  const [showTimeTrackingPrompt, setShowTimeTrackingPrompt] = useState(false);
  const [showTimeEntryForm, setShowTimeEntryForm] = useState(false);
  const [completionTimeHours, setCompletionTimeHours] = useState(0);
  const [completionTimeMinutes, setCompletionTimeMinutes] = useState(0);
  const [completionTimeDescription, setCompletionTimeDescription] = useState("");
  const [isCompletingTask, setIsCompletingTask] = useState(false);
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#3b82f6");
  
  const { isDirty, setDirty, markClean, confirmIfDirty, UnsavedChangesDialog } = useUnsavedChanges();

  const commentQueryKey = useMemo(
    () => ["/api/tasks", task?.id, "comments"] as const,
    [task?.id]
  );

  const invalidateCommentQueries = useCallback(() => {
    if (task) {
      queryClient.invalidateQueries({ queryKey: commentQueryKey });
    }
  }, [task?.id, commentQueryKey]);

  const { data: taskComments = [] } = useQuery<(Comment & { user?: User })[]>({
    queryKey: commentQueryKey,
    enabled: !!task?.id && open,
  });

  const addCommentMutation = useMutation({
    mutationFn: async ({ body, attachmentIds }: { body: string; attachmentIds?: string[] }) => {
      const payload: any = { body };
      if (attachmentIds && attachmentIds.length > 0) payload.attachmentIds = attachmentIds;
      const response = await apiRequest("POST", `/api/tasks/${task?.id}/comments`, payload);
      return response.json() as Promise<Comment & { user?: User }>;
    },
    onMutate: async ({ body }: { body: string; attachmentIds?: string[] }) => {
      if (!task?.id || !currentUser) return undefined;
      const commentsKey = commentQueryKey;
      await queryClient.cancelQueries({ queryKey: commentsKey });
      const previousComments = queryClient.getQueryData<(Comment & { user?: User })[]>(commentsKey);
      const optimisticComment = {
        id: `temp-${Date.now()}`,
        body,
        taskId: task.id,
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

  const invalidateTaskQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    queryClient.invalidateQueries({ queryKey: ["/api/tasks/my"] });
    if (task?.id) {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", task.id] });
    }
    if (task?.projectId) {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", task.projectId, "tasks"] });
    }
  }, [task?.id, task?.projectId]);

  // Workspace tags query for adding existing tags
  const { data: workspaceTags = [] } = useQuery<TagType[]>({
    queryKey: ["/api/workspaces", workspaceId, "tags"],
    enabled: !!workspaceId && open,
  });

  const taskTagIds = useMemo(
    () => new Set((task?.tags || []).map((tt) => tt.tagId)),
    [task?.tags]
  );

  const addTagToTaskMutation = useMutation({
    mutationFn: async (tagId: string) => {
      return apiRequest("POST", `/api/tasks/${task?.id}/tags`, { tagId });
    },
    onSuccess: () => {
      invalidateTaskQueries();
      setTagPopoverOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Failed to add tag", description: error.message, variant: "destructive" });
    },
  });

  const removeTagFromTaskMutation = useMutation({
    mutationFn: async (tagId: string) => {
      return apiRequest("DELETE", `/api/tasks/${task?.id}/tags/${tagId}`);
    },
    onSuccess: () => {
      invalidateTaskQueries();
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
      // Auto-add the new tag to the task
      await addTagToTaskMutation.mutateAsync(newTag.id);
      setIsCreatingTag(false);
      setNewTagName("");
      setNewTagColor("#3b82f6");
      toast({ title: "Tag created and added" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create tag", description: error.message, variant: "destructive" });
    },
  });

  const handleCreateTag = () => {
    if (!newTagName.trim() || !workspaceId) return;
    createTagMutation.mutate({ name: newTagName.trim(), color: newTagColor });
  };

  const addSubtaskMutation = useMutation({
    mutationFn: async ({ taskId, title }: { taskId: string; title: string }) => {
      return apiRequest("POST", `/api/tasks/${taskId}/subtasks`, { title });
    },
    onSuccess: () => {
      invalidateTaskQueries();
      onRefresh?.();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to add subtask",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const toggleSubtaskMutation = useMutation({
    mutationFn: async ({ subtaskId, completed }: { subtaskId: string; completed: boolean }) => {
      return apiRequest("PATCH", `/api/subtasks/${subtaskId}`, { completed });
    },
    onSuccess: invalidateTaskQueries,
  });

  const updateSubtaskTitleMutation = useMutation({
    mutationFn: async ({ subtaskId, title }: { subtaskId: string; title: string }) => {
      return apiRequest("PATCH", `/api/subtasks/${subtaskId}`, { title });
    },
    onSuccess: invalidateTaskQueries,
  });

  const deleteSubtaskMutation = useMutation({
    mutationFn: async (subtaskId: string) => {
      return apiRequest("DELETE", `/api/subtasks/${subtaskId}`);
    },
    onSuccess: invalidateTaskQueries,
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      return apiRequest("DELETE", `/api/tasks/${taskId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      if (task?.projectId) {
        queryClient.invalidateQueries({ queryKey: [`/api/projects/${task.projectId}/sections`] });
      }
      toast({
        title: "Task deleted",
        description: `"${task?.title}" has been permanently deleted.`,
      });
      onOpenChange(false);
      onRefresh?.();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete task.",
        variant: "destructive",
      });
    },
  });

  const timeEntriesQueryKey = useMemo(
    () => ["/api/time-entries", { taskId: task?.id }] as const,
    [task?.id]
  );

  const { data: timeEntries = [], isLoading: timeEntriesLoading } = useQuery<TimeEntry[]>({
    queryKey: timeEntriesQueryKey,
    queryFn: async () => {
      const res = await fetch(`/api/time-entries?taskId=${task?.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load time entries");
      return res.json();
    },
    enabled: !!task?.id && open,
  });

  const { data: projectContext, isLoading: projectContextLoading, isError: projectContextError } = useQuery<ProjectContext>({
    queryKey: ["/api/projects", task?.projectId, "context"],
    queryFn: async () => {
      if (!task?.projectId) return null;
      const projectRes = await fetch(`/api/projects/${task.projectId}`, { credentials: "include" });
      if (!projectRes.ok) throw new Error("Failed to load project");
      const project = await projectRes.json();
      let client = null;
      let division = null;
      if (project?.clientId) {
        const clientRes = await fetch(`/api/clients/${project.clientId}`, { credentials: "include" });
        if (clientRes.ok) client = await clientRes.json();
      }
      if (project?.divisionId && project?.clientId) {
        const divisionsRes = await fetch(`/api/v1/clients/${project.clientId}/divisions`, { credentials: "include" });
        if (divisionsRes.ok) {
          const divisions = await divisionsRes.json();
          division = divisions.find((d: any) => d.id === project.divisionId) || null;
        }
      }
      return { ...project, client, division };
    },
    enabled: !!task?.projectId && open,
    retry: 1,
  });

  const canQuickStartTimer = !task?.projectId || (projectContext && projectContext.clientId);

  const { data: activeTimer, isLoading: timerLoading } = useQuery<ActiveTimer | null>({
    queryKey: ["/api/timer/current"],
    enabled: open,
    refetchInterval: 30000,
  });

  const { toast } = useToast();
  const qc = useQueryClient();

  const isTimerOnThisTask = activeTimer?.taskId === task?.id;
  const isTimerRunning = activeTimer?.status === "running";

  const timerState = 
    timerLoading ? "loading" :
    activeTimer && isTimerOnThisTask && isTimerRunning ? "running" :
    activeTimer && isTimerOnThisTask && !isTimerRunning ? "paused" :
    activeTimer && !isTimerOnThisTask ? "other_task" :
    (!activeTimer && !canQuickStartTimer) || projectContextError ? "hidden" :
    projectContextLoading && task?.projectId ? "loading" :
    "idle";

  const startTimerMutation = useMutation({
    mutationFn: async () => {
      if (task?.projectId && !projectContext?.clientId) {
        throw new Error("Client context required for project tasks");
      }
      return apiRequest("POST", "/api/timer/start", {
        clientId: projectContext?.clientId || null,
        projectId: task?.projectId || null,
        taskId: task?.id || null,
        description: task?.title || "",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/timer/current"] });
      toast({ title: "Timer started", description: `Tracking time for "${task?.title}"` });
    },
    onError: (error: Error) => {
      if (error.message === "Client context required for project tasks") {
        toast({ 
          title: "Use timer drawer", 
          description: "Please use the full timer form for this task",
          variant: "default" 
        });
        setTimerDrawerOpen(true);
      } else {
        toast({ title: "Failed to start timer", variant: "destructive" });
      }
    },
  });

  const pauseTimerMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/timer/pause"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/timer/current"] });
      toast({ title: "Timer paused" });
    },
  });

  const resumeTimerMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/timer/resume"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/timer/current"] });
      toast({ title: "Timer resumed" });
    },
  });

  const stopTimerMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/timer/stop", { scope: "in_scope" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/timer/current"] });
      qc.invalidateQueries({ queryKey: timeEntriesQueryKey });
      toast({ title: "Timer stopped", description: "Time entry saved" });
    },
  });

  const createTimeEntryMutation = useMutation({
    mutationFn: async (data: { 
      durationSeconds: number; 
      description: string;
      taskId: string;
      projectId: string | null;
      clientId: string | null;
    }) => {
      return apiRequest("POST", "/api/time-entries", {
        taskId: data.taskId,
        projectId: data.projectId,
        clientId: data.clientId,
        description: data.description,
        durationSeconds: data.durationSeconds,
        startTime: new Date().toISOString(),
        scope: "in_scope",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: timeEntriesQueryKey });
      qc.invalidateQueries({ queryKey: ["/api/time-entries"] });
    },
  });

  const updateTaskStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      return apiRequest("PATCH", `/api/tasks/${task!.id}`, { status });
    },
    onMutate: async (newStatus: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/tasks/my"] });
      const previousMyTasks = queryClient.getQueryData(["/api/tasks/my"]);
      queryClient.setQueryData<any[]>(["/api/tasks/my"], (old) =>
        old?.map((t: any) => (t.id === task?.id ? { ...t, status: newStatus } : t))
      );
      if (task?.projectId) {
        const projectTasksKey = ["/api/projects", task.projectId, "tasks"];
        await queryClient.cancelQueries({ queryKey: projectTasksKey });
        const previousProjectTasks = queryClient.getQueryData(projectTasksKey);
        queryClient.setQueryData<any[]>(projectTasksKey, (old) =>
          old?.map((t: any) => (t.id === task?.id ? { ...t, status: newStatus } : t))
        );
        return { previousMyTasks, previousProjectTasks, projectTasksKey };
      }
      return { previousMyTasks };
    },
    onError: (_err, _status, context: any) => {
      if (context?.previousMyTasks) {
        queryClient.setQueryData(["/api/tasks/my"], context.previousMyTasks);
      }
      if (context?.previousProjectTasks && context?.projectTasksKey) {
        queryClient.setQueryData(context.projectTasksKey, context.previousProjectTasks);
      }
    },
    onSettled: () => {
      invalidateTaskQueries();
    },
  });

  const handleMarkAsComplete = () => {
    if (task?.status === "done" || timeEntriesLoading) return;
    
    if (timeEntries.length === 0) {
      setShowTimeTrackingPrompt(true);
    } else {
      completeTaskDirectly();
    }
  };

  const completeTaskDirectly = async () => {
    setIsCompletingTask(true);
    try {
      await updateTaskStatusMutation.mutateAsync("done");
      toast({ title: "Task completed", description: `"${task?.title}" marked as done` });
      resetCompletionState();
      onOpenChange(false);
    } catch (error) {
      toast({ title: "Failed to complete task", variant: "destructive" });
    } finally {
      setIsCompletingTask(false);
    }
  };

  const [isReopeningTask, setIsReopeningTask] = useState(false);

  const handleMarkAsIncomplete = async () => {
    if (task?.status !== "done") return;
    setIsReopeningTask(true);
    try {
      await updateTaskStatusMutation.mutateAsync("todo");
      toast({ title: "Task reopened", description: `"${task?.title}" marked as incomplete` });
    } catch (error) {
      toast({ title: "Failed to reopen task", variant: "destructive" });
    } finally {
      setIsReopeningTask(false);
    }
  };

  const handleTimeTrackingNo = () => {
    setShowTimeTrackingPrompt(false);
    completeTaskDirectly();
  };

  const handleTimeTrackingYes = () => {
    setShowTimeTrackingPrompt(false);
    setShowTimeEntryForm(true);
  };

  const handleTimeEntrySubmit = async () => {
    const totalSeconds = (completionTimeHours * 60 + completionTimeMinutes) * 60;
    
    if (totalSeconds <= 0) {
      toast({ title: "Please enter a valid time", variant: "destructive" });
      return;
    }

    if (task?.projectId && !projectContext?.clientId) {
      toast({ 
        title: "Client context required", 
        description: "Unable to log time for this project task. Completing without time entry.",
        variant: "destructive" 
      });
      await completeTaskDirectly();
      return;
    }

    setIsCompletingTask(true);
    
    try {
      await createTimeEntryMutation.mutateAsync({
        durationSeconds: totalSeconds,
        description: completionTimeDescription || `Completed: ${task?.title}`,
        taskId: task!.id,
        projectId: task?.projectId || null,
        clientId: projectContext?.clientId || null,
      });
      
      await updateTaskStatusMutation.mutateAsync("done");
      toast({ 
        title: "Task completed with time logged", 
        description: `Logged ${completionTimeHours}h ${completionTimeMinutes}m for "${task?.title}"` 
      });
      resetCompletionState();
      onOpenChange(false);
    } catch (error) {
      toast({ title: "Failed to complete task", variant: "destructive" });
    } finally {
      setIsCompletingTask(false);
    }
  };

  const resetCompletionState = () => {
    setShowTimeTrackingPrompt(false);
    setShowTimeEntryForm(false);
    setCompletionTimeHours(0);
    setCompletionTimeMinutes(0);
    setCompletionTimeDescription("");
  };

  const handleStatusChange = (newStatus: string) => {
    if (newStatus === "done" && task?.status !== "done") {
      if (timeEntriesLoading) return;
      
      if (timeEntries.length === 0) {
        setShowTimeTrackingPrompt(true);
      } else {
        onUpdate?.(task!.id, { status: newStatus });
      }
    } else {
      onUpdate?.(task!.id, { status: newStatus });
    }
  };

  
  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || "");
      setEstimateMinutes(task.estimateMinutes ? String(task.estimateMinutes) : "");
    }
  }, [task?.id, task?.description, task?.title, task?.estimateMinutes]);

  const assigneeUsers = useMemo<Partial<User>[]>(
    () => task?.assignees?.map((a) => a.user).filter(Boolean) as Partial<User>[] || [],
    [task?.assignees]
  );
  const watcherUsers = useMemo<Partial<User>[]>(
    () => task?.watchers?.map((w) => w.user).filter(Boolean) as Partial<User>[] || [],
    [task?.watchers]
  );
  const taskTags = useMemo<TagType[]>(
    () => task?.tags?.map((tt) => tt.tag).filter(Boolean) as TagType[] || [],
    [task?.tags]
  );

  const handleAddSubtask = useCallback(
    (title: string) => {
      if (task) addSubtaskMutation.mutate({ taskId: task.id, title });
    },
    [task?.id]
  );

  const handleToggleSubtask = useCallback(
    (subtaskId: string, completed: boolean) => toggleSubtaskMutation.mutate({ subtaskId, completed }),
    []
  );

  const handleDeleteSubtask = useCallback(
    (subtaskId: string) => deleteSubtaskMutation.mutate(subtaskId),
    []
  );

  const handleUpdateSubtask = useCallback(
    (subtaskId: string, title: string) => updateSubtaskTitleMutation.mutate({ subtaskId, title }),
    []
  );

  const handleSubtaskUpdate = useCallback(() => {
    onRefresh?.();
    invalidateTaskQueries();
  }, [onRefresh, invalidateTaskQueries]);

  const saveAndClose = useCallback(() => {
    closingRef.current = true;
    if (task && title.trim() && title !== task.title) {
      onUpdate?.(task.id, { title: title.trim() });
    }
    if (task) {
      const currentPlain = toPlainText(description);
      const taskPlain = toPlainText(task.description);
      if (currentPlain !== taskPlain) {
        onUpdate?.(task.id, { description });
      }
    }
    markClean();
    onOpenChange(false);
  }, [task?.id, task?.title, task?.description, title, description, onUpdate, markClean, onOpenChange]);

  const drawerContentClass = isMobile 
    ? "w-full flex flex-col h-full p-0 overflow-hidden" 
    : "w-full sm:max-w-2xl flex flex-col h-full p-0 overflow-hidden";
  const drawerPadding = isMobile ? "px-4 py-3" : "px-6 py-4";
  const drawerBodyPadding = isMobile ? "px-4 py-4" : "px-6 py-6";

  if (isError) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent 
          className={drawerContentClass}
          data-testid="task-detail-drawer-error"
        >
          <SheetHeader className={cn("shrink-0 bg-background border-b border-border", drawerPadding)}>
            <SheetDescription className="sr-only">Error loading task</SheetDescription>
            <div className="flex items-center justify-between">
              <SheetTitle className="text-destructive">Error</SheetTitle>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onOpenChange(false)}
                aria-label="Close drawer"
                data-testid="button-close-drawer"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </SheetHeader>
          <div className="flex-1 flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="text-muted-foreground mb-4">Failed to load task details</div>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  if (isLoading || !task) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent 
          className={drawerContentClass}
          data-testid="task-detail-drawer-loading"
        >
          <SheetHeader className={cn("shrink-0 bg-background border-b border-border", drawerPadding)}>
            <SheetDescription className="sr-only">Loading task details</SheetDescription>
            <div className="flex items-center justify-between">
              <SheetTitle className="sr-only">Loading Task</SheetTitle>
              <div className="h-6 w-24 bg-muted animate-pulse rounded" />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onOpenChange(false)}
                aria-label="Close drawer"
                data-testid="button-close-drawer"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto">
            <TaskDrawerSkeleton />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  const handleTitleSave = () => {
    if (title.trim() && title !== task.title) {
      onUpdate?.(task.id, { title: title.trim() });
    }
    setEditingTitle(false);
  };

  const handleDescriptionChange = (value: string) => {
    setDescription(value);
    if (value !== (task?.description || "")) {
      setDirty(true);
    }
  };

  const handleDescriptionBlur = () => {
    if (closingRef.current) return;
    if (!task) return;
    const currentPlain = toPlainText(description);
    const taskPlain = toPlainText(task.description);
    if (currentPlain !== taskPlain) {
      onUpdate?.(task.id, { description: description || null });
      markClean();
    }
  };


  const handleDrawerClose = (newOpen: boolean) => {
    if (newOpen) return;
    if (isDirty) {
      closingRef.current = true;
      confirmIfDirty(() => {
        saveAndClose();
      });
      requestAnimationFrame(() => {
        if (open) closingRef.current = false;
      });
    } else {
      closingRef.current = true;
      onOpenChange(false);
    }
  };

  if (PERF_ENABLED) perfLog("render-complete", renderStart);

  return (
    <>
      <UnsavedChangesDialog />
      <Sheet open={open} onOpenChange={handleDrawerClose}>
        <SheetContent
        className={drawerContentClass}
        data-testid="task-detail-drawer"
      >
        <SheetHeader className={cn("sticky top-0 z-10 bg-background border-b border-border", drawerPadding)}>
          <SheetDescription className="sr-only">Edit task details, add subtasks, and manage comments</SheetDescription>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <SheetTitle className="sr-only">Task Details</SheetTitle>
              <StatusBadge status={task.status as any} />
            </div>
            <div className="flex items-center gap-1">
              {task.projectId && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    const url = `${window.location.origin}/projects/${task.projectId}?task=${task.id}`;
                    navigator.clipboard.writeText(url).then(() => {
                      toast({ title: "Link copied", description: "Task link copied to clipboard" });
                    });
                  }}
                  title="Copy task link"
                  data-testid="button-copy-task-link"
                >
                  <Link2 className="h-4 w-4" />
                </Button>
              )}
              {isAdmin && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={deleteTaskMutation.isPending}
                      aria-label="Delete task"
                      data-testid="button-delete-task"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Task</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to permanently delete <span className="font-semibold">"{task.title}"</span>? This will remove all subtasks, comments, and attachments associated with this task. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel data-testid="button-cancel-delete-task">Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteTaskMutation.mutate(task.id)}
                        className="bg-destructive text-destructive-foreground"
                        disabled={deleteTaskMutation.isPending}
                        data-testid="button-confirm-delete-task"
                      >
                        Delete Task
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <Button
                variant="secondary"
                size="icon"
                onClick={saveAndClose}
                aria-label="Close drawer"
                data-testid="button-close-drawer"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </SheetHeader>

        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className={cn("flex-1 overflow-y-auto space-y-6 scrollbar-hide", drawerBodyPadding)}>
            <div className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap" data-testid="task-breadcrumbs">
            {task.projectId && projectContextLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Loading context...</span>
              </div>
            ) : (
              <>
                {task.projectId && projectContext?.client && (
                  <>
                    <Building2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="font-medium" data-testid="breadcrumb-client">
                      {projectContext.client.displayName || projectContext.client.companyName}
                    </span>
                    <ChevronRight className="h-3 w-3 shrink-0" />
                  </>
                )}
                {task.projectId && projectContext?.division && (
                  <>
                    <div className="flex items-center gap-1">
                      {projectContext.division.color && (
                        <div
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: projectContext.division.color }}
                        />
                      )}
                      <span data-testid="breadcrumb-division">{projectContext.division.name}</span>
                    </div>
                    <ChevronRight className="h-3 w-3 shrink-0" />
                  </>
                )}
                {task.projectId && (
                  <>
                    <FolderKanban className="h-3.5 w-3.5 shrink-0" />
                    <span data-testid="breadcrumb-project">{projectContext?.name || "Project"}</span>
                    <ChevronRight className="h-3 w-3 shrink-0" />
                  </>
                )}
                <CheckSquare className="h-3.5 w-3.5 shrink-0" />
                <span className="font-medium" data-testid="breadcrumb-task">{task.title?.slice(0, 30) || "Task"}{(task.title?.length || 0) > 30 ? "..." : ""}</span>
              </>
            )}
          </div>

          <div className="space-y-4">
            {editingTitle ? (
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleTitleSave();
                  if (e.key === "Escape") {
                    setTitle(task.title);
                    setEditingTitle(false);
                  }
                }}
                className="text-xl font-semibold h-auto py-1"
                autoFocus
                data-testid="input-task-title"
              />
            ) : (
              <h2
                className="text-xl font-semibold cursor-pointer hover:text-muted-foreground transition-colors"
                onClick={() => {
                  setTitle(task.title);
                  setEditingTitle(true);
                }}
                data-testid="text-task-title"
              >
                {task.title}
              </h2>
            )}

            <div className={cn("grid gap-4", isMobile ? "grid-cols-1" : "grid-cols-2")}>
              <FormFieldWrapper
                label="Assignees"
                labelIcon={<Users className="h-3.5 w-3.5" />}
              >
                <MultiSelectAssignees
                  taskId={task.id}
                  assignees={assigneeUsers}
                  workspaceId={workspaceId}
                  onAssigneeChange={onRefresh}
                />
              </FormFieldWrapper>

              <FormFieldWrapper
                label="Due Date"
                labelIcon={<Calendar className="h-3.5 w-3.5" />}
              >
                <DatePickerWithChips
                  value={task.dueDate ? new Date(task.dueDate) : null}
                  onChange={(date) => onUpdate?.(task.id, { dueDate: date as any })}
                  className={cn(isMobile ? "w-full h-10" : "w-[180px] h-8")}
                  data-testid="button-due-date"
                />
              </FormFieldWrapper>

              <FormFieldWrapper
                label="Priority"
                labelIcon={<Flag className="h-3.5 w-3.5" />}
              >
                <PrioritySelector
                  value={task.priority as PriorityLevel}
                  onChange={(value) => onUpdate?.(task.id, { priority: value })}
                  className={cn(isMobile ? "w-full h-10" : "w-[140px] h-8")}
                  data-testid="select-priority"
                />
              </FormFieldWrapper>

              <FormFieldWrapper
                label="Status"
                labelIcon={<Layers className="h-3.5 w-3.5" />}
              >
                <StatusSelector
                  value={task.status as TaskStatus}
                  onChange={handleStatusChange}
                  className={cn(isMobile ? "w-full h-10" : "w-[140px] h-8")}
                  data-testid="select-status"
                />
              </FormFieldWrapper>

              <FormFieldWrapper
                label="Estimate"
                labelIcon={<Clock className="h-3.5 w-3.5" />}
                helpText="Time in minutes"
              >
                <Input
                  type="number"
                  min="0"
                  value={estimateMinutes}
                  onChange={(e) => setEstimateMinutes(e.target.value)}
                  onBlur={() => {
                    const val = estimateMinutes.trim();
                    const parsed = val ? parseInt(val, 10) : null;
                    if (parsed !== task.estimateMinutes) {
                      onUpdate?.(task.id, { estimateMinutes: parsed });
                    }
                  }}
                  placeholder="0"
                  className={cn(isMobile ? "w-full h-10" : "w-[140px] h-8")}
                  data-testid="input-estimate-minutes"
                />
              </FormFieldWrapper>

              <FormFieldWrapper
                label="Watchers"
                labelIcon={<Eye className="h-3.5 w-3.5" />}
              >
                <MultiSelectWatchers
                  taskId={task.id}
                  watchers={watcherUsers}
                  workspaceId={workspaceId}
                  onWatcherChange={onRefresh}
                />
              </FormFieldWrapper>
            </div>
          </div>

          <Separator />

          <FormFieldWrapper label="Description" className="overflow-hidden">
            <div className="max-w-full overflow-hidden">
              <RichTextEditor
                value={description}
                onChange={handleDescriptionChange}
                onBlur={handleDescriptionBlur}
                placeholder="Add a description... Type @ to mention someone"
                minHeight="100px"
                users={mentionUsers}
                data-testid="textarea-description"
              />
            </div>
          </FormFieldWrapper>

          <Separator />

          {task.projectId && (
            <div 
              className="p-3 sm:p-4 bg-[#edebff4d] dark:bg-[hsl(var(--section-attachments))] border border-[#d6d2ff] dark:border-[hsl(var(--section-attachments-border))]"
              style={{ borderRadius: "10px" }}
            >
              <AttachmentUploader taskId={task.id} projectId={task.projectId} />
            </div>
          )}
          {!task.projectId && (
            <div className="text-sm text-muted-foreground">
              Attachments are available for project tasks only
            </div>
          )}

          <Separator />

          <div 
            className="p-3 sm:p-4 bg-[#e3e3e34d] dark:bg-[hsl(var(--section-subtasks))] border border-[#cfcfcf] dark:border-[hsl(var(--section-subtasks-border))]"
            style={{ borderRadius: "10px" }}
          >
            <div className="flex items-center justify-between mb-3">
              <label className="flex items-center gap-2 font-medium text-foreground text-[16px]">
                <Layers className="h-3.5 w-3.5" />
                Subtasks
              </label>
            </div>
            <SubtaskList
              subtasks={task.subtasks || []}
              taskId={task.id}
              workspaceId={workspaceId}
              projectId={task.projectId}
              clientId={task.project?.clientId}
              taskTitle={task.title}
              taskDescription={task.description || undefined}
              onAdd={handleAddSubtask}
              onToggle={handleToggleSubtask}
              onDelete={handleDeleteSubtask}
              onUpdate={handleUpdateSubtask}
              onSubtaskUpdate={handleSubtaskUpdate}
              onSubtaskClick={(subtask) => {
                setSelectedSubtask(subtask);
                setSubtaskDrawerOpen(true);
              }}
            />
          </div>

          <div 
            className="p-3 sm:p-4 dark:bg-[hsl(var(--section-tags))] border border-[#ade8f5] dark:border-[hsl(var(--section-tags-border))] bg-[#edf4f54d]"
            style={{ borderRadius: "10px" }}
          >
            <div className="space-y-2">
              <label className="flex items-center gap-2 font-medium text-foreground text-[16px]">
                <Tag className="h-3.5 w-3.5" />
                Tags
              </label>
              <div className="flex flex-wrap gap-1.5 min-h-[32px] items-center">
                {taskTags.map((tag) => (
                  <Badge
                    key={tag.id}
                    variant="secondary"
                    className="gap-1 pr-1"
                    style={{ backgroundColor: tag.color ? `${tag.color}20` : undefined, borderColor: tag.color || undefined }}
                    data-testid={`task-tag-${tag.id}`}
                  >
                    <span style={{ color: tag.color || undefined }}>{tag.name}</span>
                    <button
                      className="ml-1 h-3 w-3 rounded-full hover:bg-destructive/20 flex items-center justify-center"
                      onClick={() => removeTagFromTaskMutation.mutate(tag.id)}
                      data-testid={`button-remove-tag-${tag.id}`}
                    >
                      <X className="h-2 w-2" />
                    </button>
                  </Badge>
                ))}
                {taskTags.length === 0 && (
                  <span className="text-sm text-muted-foreground">No tags</span>
                )}
                
                <Popover open={tagPopoverOpen} onOpenChange={(open) => {
                  setTagPopoverOpen(open);
                  if (!open) {
                    setIsCreatingTag(false);
                    setNewTagName("");
                  }
                }}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-full hover:bg-muted ml-auto">
                      <Plus className="h-4 w-4" />
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
                          className={cn(isMobile ? "h-10" : "h-8", "text-sm")}
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
                              if (taskTagIds.has(tag.id)) return null;
                              return (
                                <button
                                  key={tag.id}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover-elevate"
                                  onClick={() => addTagToTaskMutation.mutate(tag.id)}
                                  data-testid={`button-add-tag-${tag.id}`}
                                >
                                  <div
                                    className="h-3 w-3 rounded-full"
                                    style={{ backgroundColor: tag.color || "#888" }}
                                  />
                                  <span className="text-sm truncate">{tag.name}</span>
                                </button>
                              );
                            })}
                            {workspaceTags.filter((t) => !taskTagIds.has(t.id)).length === 0 && (
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
              </div>
            </div>
          </div>

          <Separator />

          <div 
            className="p-3 sm:p-4 dark:bg-[hsl(var(--section-comments))] border border-[#adc6e6] dark:border-[hsl(var(--section-comments-border))] bg-[#ebf4fc4d]"
            style={{ borderRadius: "10px" }}
          >
            <CommentThread
              comments={taskComments}
              taskId={task.id}
              projectId={task.projectId}
              currentUserId={currentUser?.id}
              onAdd={(body, attachmentIds) => addCommentMutation.mutate({ body, attachmentIds })}
              onUpdate={(id, body) => updateCommentMutation.mutate({ id, body })}
              onDelete={(id) => deleteCommentMutation.mutate(id)}
              onResolve={(id) => resolveCommentMutation.mutate(id)}
              onUnresolve={(id) => unresolveCommentMutation.mutate(id)}
              users={mentionUsers}
            />
          </div>

          <Separator />

          <div 
            className="p-3 sm:p-4 dark:bg-[hsl(var(--section-time))] border border-[#f5ac5b] dark:border-[hsl(var(--section-time-border))] bg-[#f7ebe44d]"
            style={{ borderRadius: "10px" }}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 font-medium text-foreground text-[16px]">
                  <Timer className="h-3.5 w-3.5" />
                  Time Entries
                </label>
                <div className="flex items-center gap-2">
                  {timerState === "idle" && (
                    <Button
                      size="sm"
                      onClick={() => {
                        if (canQuickStartTimer && !projectContextError) {
                          startTimerMutation.mutate();
                        } else {
                          setTimerDrawerOpen(true);
                        }
                      }}
                      className="h-8 border border-[#d97d26] text-white hover:bg-[#e67e22] bg-[#ff8614ed]"
                      data-testid="button-timer-start"
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
                <p className="text-sm text-muted-foreground">No time entries for this task</p>
              ) : (
                <div className="space-y-2">
                  {timeEntries.map((entry) => (
                    <div key={entry.id} className="flex items-start justify-between p-3 rounded-md border bg-muted/30">
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">
                            {formatDurationShort(entry.durationSeconds)}
                          </span>
                          <Badge variant={entry.scope === "out_of_scope" ? "default" : "secondary"} className="text-xs">
                            {entry.scope === "out_of_scope" ? "Billable" : "Unbillable"}
                          </Badge>
                        </div>
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
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <DrawerActionBar
          showSave={true}
          onSave={saveAndClose}
          saveLabel="Save Task"
          showComplete={task.status !== "done"}
          onMarkComplete={handleMarkAsComplete}
          completeDisabled={timeEntriesLoading || isCompletingTask}
          isCompleting={isCompletingTask}
          showIncomplete={task.status === "done"}
          onMarkIncomplete={handleMarkAsIncomplete}
          incompleteDisabled={isReopeningTask}
          isIncompleting={isReopeningTask}
          extraActions={
            activeTimer && !isTimerOnThisTask ? (
              <Badge variant="secondary" className="text-xs">
                Timer running on another task
              </Badge>
            ) : undefined
          }
          className="sticky bottom-0 z-10"
        />
        </div>
      </SheetContent>

      <SubtaskDetailDrawer
        subtask={selectedSubtask}
        parentTaskTitle={task.title}
        projectId={task.projectId || undefined}
        workspaceId={workspaceId}
        open={subtaskDrawerOpen}
        onOpenChange={(open) => {
          setSubtaskDrawerOpen(open);
          if (!open) setSelectedSubtask(null);
        }}
        onUpdate={(subtaskId, data) => {
          apiRequest("PATCH", `/api/subtasks/${subtaskId}`, data).then(() => {
            invalidateTaskQueries();
            if (selectedSubtask && selectedSubtask.id === subtaskId) {
              setSelectedSubtask({ ...selectedSubtask, ...data });
            }
          }).catch(console.error);
        }}
        onBack={() => {
          setSubtaskDrawerOpen(false);
          setSelectedSubtask(null);
        }}
        availableUsers={mentionUsers}
      />

      <StartTimerDrawer
        open={timerDrawerOpen}
        onOpenChange={setTimerDrawerOpen}
        initialTaskId={task.id}
        initialProjectId={task.projectId || null}
      />

      <Dialog open={showTimeTrackingPrompt} onOpenChange={setShowTimeTrackingPrompt}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Track time for this task?</DialogTitle>
            <DialogDescription>
              No time has been logged for this task. Would you like to add a time entry before completing it?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={handleTimeTrackingNo}
              data-testid="button-time-tracking-no"
            >
              No, just complete
            </Button>
            <Button
              onClick={handleTimeTrackingYes}
              data-testid="button-time-tracking-yes"
            >
              Yes, add time
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showTimeEntryForm} onOpenChange={(open) => {
        if (!open) resetCompletionState();
        else setShowTimeEntryForm(open);
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Log time and complete task</DialogTitle>
            <DialogDescription>
              Enter the time spent on "{task.title}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Duration</Label>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="24"
                    value={completionTimeHours}
                    onChange={(e) => setCompletionTimeHours(parseInt(e.target.value) || 0)}
                    className="w-20"
                    data-testid="input-completion-hours"
                  />
                  <span className="text-sm text-muted-foreground">hours</span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="59"
                    value={completionTimeMinutes}
                    onChange={(e) => setCompletionTimeMinutes(parseInt(e.target.value) || 0)}
                    className="w-20"
                    data-testid="input-completion-minutes"
                  />
                  <span className="text-sm text-muted-foreground">minutes</span>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea
                value={completionTimeDescription}
                onChange={(e) => setCompletionTimeDescription(e.target.value)}
                placeholder="What did you work on?"
                className="resize-none"
                data-testid="textarea-completion-description"
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => resetCompletionState()}
              data-testid="button-cancel-time-entry"
            >
              Cancel
            </Button>
            <Button
              onClick={handleTimeEntrySubmit}
              disabled={isCompletingTask || (completionTimeHours === 0 && completionTimeMinutes === 0)}
              data-testid="button-submit-time-complete"
            >
              {isCompletingTask ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Completing...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  Log Time & Complete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </Sheet>
    </>
  );
}
