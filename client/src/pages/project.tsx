import { useState, useCallback, useMemo, useEffect, lazy, Suspense } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useCreateTask } from "@/hooks/use-create-task";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import {
  LayoutGrid,
  List,
  Calendar as CalendarIcon,
  Plus,
  MoreHorizontal,
  ChevronLeft,
  Users,
  Settings,
  Play,
  Activity,
  Sparkles,
  Loader2,
  FileStack,
  RotateCcw,
  Archive,
  Link2,
  Lock,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SectionColumn } from "@/features/tasks/section-column";
import { TaskCard } from "@/features/tasks/task-card";
import { ListSectionDroppable } from "@/features/tasks/list-section-droppable";
import { TaskDetailDrawer } from "@/features/tasks/task-detail-drawer";
import { TaskCreateDrawer } from "@/features/tasks/task-create-drawer";
import { ProjectCalendar, ProjectSettingsSheet, ProjectMembersSheet, ProjectActivityFeed, AIProjectPlanner } from "@/features/projects";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { RichTextRenderer } from "@/components/richtext";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { fetchTaskDetail } from "@/lib/task-detail";
import { useProjectSocket, useWorkspaceRealtime } from "@/lib/realtime";
import { useAuth } from "@/lib/auth";
import type { Project, SectionWithTasks, TaskWithRelations, Section, ProjectTemplate, ProjectTemplateContent } from "@shared/schema";
import { Link } from "wouter";
import { usePromptDialog } from "@/components/prompt-dialog";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import type { Client } from "@shared/schema";
import { hasTenantAdminAccess } from "@shared/roles";

const LazyStartTimerDrawer = lazy(() =>
  import("@/features/timer/start-timer-drawer").then((module) => ({
    default: module.StartTimerDrawer,
  })),
);

type ViewType = "board" | "list" | "calendar";

function isTaskDone(status: string | null | undefined): boolean {
  return status === "done" || status === "completed";
}

function getDueDateRank(task: TaskWithRelations): number {
  if (isTaskDone(task.status)) return 2;
  if (!task.dueDate) return 1;
  return 0;
}

function getDueTimestamp(task: TaskWithRelations): number {
  if (!task.dueDate) return Number.MAX_SAFE_INTEGER;
  const parsed = new Date(task.dueDate).getTime();
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

function sortTasksForProjectDisplay(tasks: TaskWithRelations[]): TaskWithRelations[] {
  return [...tasks].sort((a, b) => {
    const rankDiff = getDueDateRank(a) - getDueDateRank(b);
    if (rankDiff !== 0) return rankDiff;

    const dueDiff = getDueTimestamp(a) - getDueTimestamp(b);
    if (dueDiff !== 0) return dueDiff;

    return (a.orderIndex ?? 0) - (b.orderIndex ?? 0);
  });
}

export default function ProjectPage() {
  const [, params] = useRoute("/projects/:id");
  const projectId = params?.id;
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { user: currentUser } = useAuth();
  const isAdmin = hasTenantAdminAccess(currentUser?.role);

  // Subscribe to real-time updates for this project
  useProjectSocket(projectId);
  useWorkspaceRealtime({ enableMyTasks: true, enableTimer: true });

  const [view, setView] = useState<ViewType>("board");
  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [timerDrawerOpen, setTimerDrawerOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [aiPlannerOpen, setAiPlannerOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState<string | undefined>();
  const [localSections, setLocalSections] = useState<SectionWithTasks[] | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  
  const [pendingCompletionTaskId, setPendingCompletionTaskId] = useState<string | null>(null);
  const [showTimeTrackingPrompt, setShowTimeTrackingPrompt] = useState(false);
  const [showTimeEntryForm, setShowTimeEntryForm] = useState(false);
  const [completionTimeHours, setCompletionTimeHours] = useState(0);
  const [completionTimeMinutes, setCompletionTimeMinutes] = useState(0);
  const [completionTimeDescription, setCompletionTimeDescription] = useState("");
  const [isCompletingTask, setIsCompletingTask] = useState(false);
  const [isCheckingTimeEntries, setIsCheckingTimeEntries] = useState(false);

  const [deleteSectionDialogOpen, setDeleteSectionDialogOpen] = useState(false);
  const [sectionToDelete, setSectionToDelete] = useState<string | null>(null);
  const [templatePopoverOpen, setTemplatePopoverOpen] = useState(false);

  const { prompt: promptSectionName, PromptDialogComponent: SectionNameDialog } = usePromptDialog({
    title: "Create Section",
    description: "Enter a name for the new section",
    label: "Section Name",
    placeholder: "e.g., In Progress, Review, Done",
    confirmText: "Create",
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const { data: project, isLoading: projectLoading } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  // Fetch client for breadcrumbs
  const { data: client } = useQuery<Client>({
    queryKey: ["/api/clients", project?.clientId],
    enabled: !!project?.clientId,
  });

  const { data: sections, isLoading: sectionsLoading } = useQuery<SectionWithTasks[]>({
    queryKey: ["/api/projects", projectId, "sections"],
    enabled: !!projectId,
  });

  const { data: tasks } = useQuery<TaskWithRelations[]>({
    queryKey: ["/api/projects", projectId, "tasks"],
    enabled: !!projectId,
  });
  
  const { data: tenantUsers = [] } = useQuery<{ id: string; email: string; firstName?: string | null; lastName?: string | null }[]>({
    queryKey: ["/api/users"],
    enabled: !!projectId,
  });

  const displaySections = localSections || sections;
  const orderedSections = useMemo(
    () =>
      displaySections?.map((section) => ({
        ...section,
        tasks: sortTasksForProjectDisplay(section.tasks || []),
      })) || [],
    [displaySections],
  );

  const activeTask = activeTaskId
    ? orderedSections.flatMap((s) => s.tasks || []).find((t) => t.id === activeTaskId)
    : null;

  const [urlTaskId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('task');
  });
  const [deepLinkHandled, setDeepLinkHandled] = useState(false);

  const { data: linkedTask } = useQuery<TaskWithRelations>({
    queryKey: ["/api/tasks", urlTaskId],
    enabled: !!urlTaskId && !deepLinkHandled && !selectedTask && !!tasks && !tasks.find(t => t.id === urlTaskId),
  });

  const openTaskDrawer = useCallback(async (taskId: string) => {
    const fullTask = await queryClient.fetchQuery({
      queryKey: ["/api/tasks", taskId],
      queryFn: () => fetchTaskDetail(taskId),
      staleTime: 5000,
    });

    setSelectedTask(fullTask);

    const url = new URL(window.location.href);
    url.searchParams.set("task", taskId);
    window.history.replaceState({}, "", url.pathname + url.search);
  }, []);

  useEffect(() => {
    if (deepLinkHandled || sectionsLoading || selectedTask || !urlTaskId) return;
    const allTasks = orderedSections.flatMap((s) => s.tasks || []);
    const found = allTasks.find(t => t.id === urlTaskId) || tasks?.find(t => t.id === urlTaskId);
    if (found) {
      void openTaskDrawer(urlTaskId);
      setDeepLinkHandled(true);
      return;
    }
    if (linkedTask) {
      void openTaskDrawer(urlTaskId);
      setDeepLinkHandled(true);
    }
  }, [sectionsLoading, tasks, linkedTask, selectedTask, urlTaskId, orderedSections, deepLinkHandled, openTaskDrawer]);

  const createTaskMutation = useCreateTask();

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, data }: { taskId: string; data: Partial<TaskWithRelations> }) => {
      return apiRequest("PATCH", `/api/tasks/${taskId}`, data);
    },
    onMutate: async ({ taskId, data }) => {
      const projectTasksKey = ["/api/projects", projectId, "tasks"] as const;
      const projectSectionsKey = ["/api/projects", projectId, "sections"] as const;
      const taskDetailKey = ["/api/tasks", taskId] as const;

      await queryClient.cancelQueries({ queryKey: projectTasksKey });
      await queryClient.cancelQueries({ queryKey: projectSectionsKey });
      await queryClient.cancelQueries({ queryKey: taskDetailKey });
      await queryClient.cancelQueries({ queryKey: ["/api/tasks/my"] });

      const previousProjectTasks =
        queryClient.getQueryData<TaskWithRelations[]>(projectTasksKey) || [];
      const previousProjectSections =
        queryClient.getQueryData<SectionWithTasks[]>(projectSectionsKey) || [];
      const previousTaskDetail =
        queryClient.getQueryData<TaskWithRelations>(taskDetailKey) || null;
      const previousMyTasks =
        queryClient.getQueryData<TaskWithRelations[]>(["/api/tasks/my"]) || [];
      const previousSelectedTask =
        selectedTask && selectedTask.id === taskId ? selectedTask : null;
      const previousLocalSections = localSections;

      queryClient.setQueryData<TaskWithRelations[]>(projectTasksKey, (current = []) =>
        current.map((task) => (task.id === taskId ? { ...task, ...data } : task)),
      );

      queryClient.setQueryData<SectionWithTasks[]>(projectSectionsKey, (current = []) =>
        current.map((section) => ({
          ...section,
          tasks: (section.tasks || []).map((task) =>
            task.id === taskId ? { ...task, ...data } : task,
          ),
        })),
      );

      queryClient.setQueryData<TaskWithRelations>(taskDetailKey, (current) =>
        current ? { ...current, ...data } : current,
      );

      queryClient.setQueryData<TaskWithRelations[]>(["/api/tasks/my"], (current = []) =>
        current.map((task) => (task.id === taskId ? { ...task, ...data } : task)),
      );

      setLocalSections((current) =>
        current
          ? current.map((section) => ({
              ...section,
              tasks: (section.tasks || []).map((task) =>
                task.id === taskId ? { ...task, ...data } : task,
              ),
            }))
          : current,
      );

      if (previousSelectedTask) {
        setSelectedTask((current) =>
          current && current.id === taskId ? { ...current, ...data } : current,
        );
      }

      return {
        previousProjectTasks,
        previousProjectSections,
        previousTaskDetail,
        previousMyTasks,
        previousSelectedTask,
        previousLocalSections,
        projectTasksKey,
        projectSectionsKey,
        taskDetailKey,
      };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", variables.taskId] });
    },
    onError: (_error, variables, context) => {
      if (context?.previousProjectTasks) {
        queryClient.setQueryData(context.projectTasksKey, context.previousProjectTasks);
      }
      if (context?.previousProjectSections) {
        queryClient.setQueryData(context.projectSectionsKey, context.previousProjectSections);
      }
      if (context?.previousTaskDetail) {
        queryClient.setQueryData(context.taskDetailKey, context.previousTaskDetail);
      }
      if (context?.previousMyTasks) {
        queryClient.setQueryData(["/api/tasks/my"], context.previousMyTasks);
      }
      if (context?.previousSelectedTask) {
        setSelectedTask(context.previousSelectedTask);
      }
      setLocalSections(context?.previousLocalSections ?? null);
      toast({
        title: "Failed to update task",
        description: "The task status could not be updated. Please try again.",
        variant: "destructive",
      });
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "sections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/my"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", variables.taskId] });
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: async ({ taskId, body }: { taskId: string; body: string }) => {
      return apiRequest("POST", `/api/tasks/${taskId}/comments`, { body });
    },
    onSuccess: () => {
      if (selectedTask) {
        refetchSelectedTask();
      }
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
        ...data,
        startTime: new Date().toISOString(),
        scope: "in_scope",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
    },
  });

  const restoreProjectMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", `/api/projects/${projectId}`, { status: "active" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/projects"] });
      toast({ title: "Project restored", description: "This project is now active again." });
    },
    onError: () => {
      toast({ title: "Failed to restore project", variant: "destructive" });
    },
  });

  const updateSectionMutation = useMutation({
    mutationFn: async ({ sectionId, name }: { sectionId: string; name: string }) => {
      return apiRequest("PATCH", `/api/sections/${sectionId}`, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "sections"] });
      toast({ title: "Section updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update section", variant: "destructive" });
    },
  });

  const deleteSectionMutation = useMutation({
    mutationFn: async (sectionId: string) => {
      return apiRequest("DELETE", `/api/sections/${sectionId}`);
    },
    onSuccess: () => {
      setLocalSections(null);
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "sections"] });
      toast({ title: "Section deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete section", variant: "destructive" });
    },
  });

  const archiveSectionMutation = useMutation({
    mutationFn: async (sectionId: string) => {
      return apiRequest("POST", `/api/sections/${sectionId}/archive`);
    },
    onSuccess: () => {
      setLocalSections(null);
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "sections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "tasks"] });
      toast({
        title: "Section archived",
        description: "The section was removed from active project views and kept for history.",
      });
    },
    onError: () => {
      toast({ title: "Failed to archive section", variant: "destructive" });
    },
  });

  const clearSectionTasksMutation = useMutation({
    mutationFn: async (sectionId: string) => {
      return apiRequest("DELETE", `/api/sections/${sectionId}/tasks`);
    },
    onSuccess: () => {
      setLocalSections(null);
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "sections"] });
      toast({ title: "All tasks in section deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete section tasks", variant: "destructive" });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (moves: { itemType: string; taskId: string; toSectionId: string; toIndex: number }[]) => {
      return apiRequest("PATCH", `/api/projects/${projectId}/tasks/reorder`, { moves });
    },
    onSuccess: () => {
      setLocalSections(null);
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "sections"] });
    },
    onError: () => {
      setLocalSections(null);
      toast({
        title: "Failed to move task",
        description: "The task could not be moved. Please try again.",
        variant: "destructive",
      });
    },
  });

  const createSectionMutation = useMutation({
    mutationFn: async (name: string) => {
      const nextOrderIndex = sections?.length || 0;
      return apiRequest("POST", "/api/sections", { projectId, name, orderIndex: nextOrderIndex });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "sections"] });
      toast({
        title: "Section created",
        description: "New section has been added to the project.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to create section",
        description: "The section could not be created. Please try again.",
        variant: "destructive",
      });
    },
  });

  const { data: templates = [], isLoading: templatesLoading } = useQuery<ProjectTemplate[]>({
    queryKey: ["/api/project-templates"],
    enabled: templatePopoverOpen,
  });

  const applyTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      return apiRequest("POST", `/api/projects/${projectId}/apply-template`, { templateId });
    },
    onSuccess: (_data, _templateId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "sections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "tasks"] });
      setTemplatePopoverOpen(false);
      toast({
        title: "Template applied",
        description: "Sections and tasks from the template have been added to this project.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to apply template",
        variant: "destructive",
      });
    },
  });

  const handleAddSection = useCallback(async () => {
    const sectionName = await promptSectionName();
    if (sectionName && sectionName.trim()) {
      createSectionMutation.mutate(sectionName.trim());
    }
  }, [createSectionMutation, promptSectionName]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveTaskId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveTaskId(null);

      const currentSections = orderedSections;
      if (!over || !currentSections) return;

      const activeId = active.id as string;
      const overId = over.id as string;

      const activeData = active.data.current as { type: string; task: TaskWithRelations } | undefined;
      const overData = over.data.current as { type: string; section?: SectionWithTasks; task?: TaskWithRelations } | undefined;

      if (!activeData || activeData.type !== "task") return;

      const activeTask = activeData.task;
      const fromSectionId = activeTask.sectionId;

      let toSectionId: string;
      let overIndex: number;

      if (overData?.type === "section") {
        toSectionId = overId;
        const targetSection = currentSections.find((s) => s.id === toSectionId);
        overIndex = targetSection?.tasks?.length ?? 0;
      } else if (overData?.type === "task") {
        const overTask = overData.task!;
        toSectionId = overTask.sectionId!;
        const targetSection = currentSections.find((s) => s.id === toSectionId);
        if (!targetSection) return;
        overIndex = targetSection.tasks?.findIndex((t) => t.id === overId) ?? 0;
      } else {
        return;
      }

      if (fromSectionId === toSectionId && activeId === overId) return;

      const fromSection = currentSections.find((s) => s.id === fromSectionId);
      const fromIndex = fromSection?.tasks?.findIndex((t) => t.id === activeId) ?? -1;

      if (fromSectionId === toSectionId) {
        if (fromIndex === -1 || fromIndex === overIndex) return;
        const sectionTasks = [...(fromSection?.tasks || [])];
        const reorderedTasks = arrayMove(sectionTasks, fromIndex, overIndex);
        
        const newSections = currentSections.map((section) => {
          if (section.id === fromSectionId) {
            return { ...section, tasks: reorderedTasks };
          }
          return section;
        });

        setLocalSections(newSections);

        reorderMutation.mutate([
          {
            itemType: "task",
            taskId: activeId,
            toSectionId,
            toIndex: overIndex,
          },
        ]);
      } else {
        const newSections = currentSections.map((section) => {
          if (section.id === fromSectionId) {
            const newTasks = [...(section.tasks || [])];
            const taskIndex = newTasks.findIndex((t) => t.id === activeId);
            if (taskIndex !== -1) {
              newTasks.splice(taskIndex, 1);
            }
            return { ...section, tasks: newTasks };
          }
          return section;
        });

        const targetSectionIndex = newSections.findIndex((s) => s.id === toSectionId);
        if (targetSectionIndex !== -1) {
          const newTasks = [...(newSections[targetSectionIndex].tasks || [])];
          const updatedTask = { ...activeTask, sectionId: toSectionId };
          newTasks.splice(overIndex, 0, updatedTask);
          newSections[targetSectionIndex] = { ...newSections[targetSectionIndex], tasks: newTasks };
        }

        setLocalSections(newSections);

        reorderMutation.mutate([
          {
            itemType: "task",
            taskId: activeId,
            toSectionId,
            toIndex: overIndex,
          },
        ]);
      }
    },
    [displaySections, reorderMutation]
  );

  const refetchSelectedTask = useCallback(async () => {
    setLocalSections(null);
    if (projectId) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "sections"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "tasks"] }),
      ]);
    }
    if (selectedTask) {
      const updatedTask = await fetchTaskDetail(selectedTask.id);
      setSelectedTask(updatedTask);
      queryClient.setQueryData(["/api/tasks", selectedTask.id], updatedTask);
    }
  }, [projectId, selectedTask?.id]);

  const handleAddTask = (sectionId?: string) => {
    setSelectedSectionId(sectionId);
    setCreateTaskOpen(true);
  };

  const handleCreateTask = async (data: any) => {
    const { tagIds, subtaskTitles, queuedFiles, ...taskData } = data;
    return new Promise<void>((resolve, reject) => {
      createTaskMutation.mutate({ ...taskData, projectId: projectId! }, {
        onSuccess: async (createdTask: any) => {
          toast({ title: "Task created successfully" });

          const postOps: Promise<any>[] = [];

          if (tagIds && tagIds.length > 0) {
            for (const tagId of tagIds) {
              postOps.push(
                apiRequest("POST", `/api/tasks/${createdTask.id}/tags`, { tagId }).catch((err) =>
                  console.warn("Failed to add tag:", err)
                )
              );
            }
          }

          if (subtaskTitles && subtaskTitles.length > 0) {
            for (const title of subtaskTitles) {
              postOps.push(
                apiRequest("POST", `/api/tasks/${createdTask.id}/subtasks`, { title }).catch((err) =>
                  console.warn("Failed to create subtask:", err)
                )
              );
            }
          }

          if (queuedFiles && queuedFiles.length > 0) {
            for (const file of queuedFiles as File[]) {
              const formData = new FormData();
              formData.append("file", file);
              postOps.push(
                fetch(`/api/projects/${projectId}/tasks/${createdTask.id}/attachments/upload`, {
                  method: "POST",
                  body: formData,
                  credentials: "include",
                }).catch((err) =>
                  console.warn("Failed to upload attachment:", err)
                )
              );
            }
          }

          if (postOps.length > 0) {
            await Promise.allSettled(postOps);
            queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "tasks"] });
            queryClient.invalidateQueries({ queryKey: ["/api/tasks", createdTask.id] });
          }

          resolve();
        },
        onError: (error) => {
          toast({ 
            title: "Failed to create task", 
            description: error instanceof Error ? error.message : "Unknown error",
            variant: "destructive"
          });
          reject(error);
        },
      });
    });
  };

  const handleTaskSelect = (task: TaskWithRelations) => {
    void openTaskDrawer(task.id);
  };

  const handleCloseTaskDrawer = () => {
    setSelectedTask(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('task');
    window.history.replaceState({}, '', url.pathname + url.search);
  };

  const handleStatusChange = async (taskId: string, completed: boolean) => {
    if (!completed) {
      updateTaskMutation.mutate({
        taskId,
        data: { status: "todo" },
      });
      return;
    }
    
    setIsCheckingTimeEntries(true);
    setPendingCompletionTaskId(taskId);
    
    try {
      const response = await apiRequest("GET", `/api/tasks/${taskId}/time-entries`);
      const timeEntries = await response.json();
      
      if (!timeEntries || timeEntries.length === 0) {
        setShowTimeTrackingPrompt(true);
      } else {
        completeTaskDirectly(taskId);
      }
    } catch (error) {
      completeTaskDirectly(taskId);
    } finally {
      setIsCheckingTimeEntries(false);
    }
  };

  const completeTaskDirectly = (taskId: string) => {
    updateTaskMutation.mutate({
      taskId,
      data: { status: "done" },
    });
    const pendingTask = orderedSections.flatMap(s => s.tasks || []).find(t => t.id === taskId);
    toast({ title: "Task completed", description: `"${pendingTask?.title}" marked as done` });
    resetCompletionState();
  };

  const handleTimeTrackingNo = () => {
    if (pendingCompletionTaskId) {
      completeTaskDirectly(pendingCompletionTaskId);
    }
    setShowTimeTrackingPrompt(false);
  };

  const handleTimeTrackingYes = () => {
    setShowTimeTrackingPrompt(false);
    setShowTimeEntryForm(true);
  };

  const handleTimeEntrySubmit = async () => {
    if (!pendingCompletionTaskId) return;
    
    const totalSeconds = (completionTimeHours * 60 + completionTimeMinutes) * 60;
    
    if (totalSeconds <= 0) {
      toast({ title: "Please enter a valid time", variant: "destructive" });
      return;
    }

    const pendingTask = orderedSections.flatMap(s => s.tasks || []).find(t => t.id === pendingCompletionTaskId);
    
    if (projectId && !project?.clientId) {
      toast({ 
        title: "Client context required", 
        description: "Unable to log time for this project task. Completing without time entry.",
        variant: "destructive" 
      });
      completeTaskDirectly(pendingCompletionTaskId);
      return;
    }
    
    setIsCompletingTask(true);
    
    try {
      await createTimeEntryMutation.mutateAsync({
        durationSeconds: totalSeconds,
        description: completionTimeDescription || `Completed: ${pendingTask?.title}`,
        taskId: pendingCompletionTaskId,
        projectId: projectId || null,
        clientId: project?.clientId || null,
      });
      
      updateTaskMutation.mutate({
        taskId: pendingCompletionTaskId,
        data: { status: "done" },
      });
      
      toast({ 
        title: "Task completed with time logged", 
        description: `Logged ${completionTimeHours}h ${completionTimeMinutes}m for "${pendingTask?.title}"` 
      });
      resetCompletionState();
    } catch (error) {
      toast({ title: "Failed to complete task", variant: "destructive" });
    } finally {
      setIsCompletingTask(false);
    }
  };

  const resetCompletionState = () => {
    setShowTimeTrackingPrompt(false);
    setShowTimeEntryForm(false);
    setPendingCompletionTaskId(null);
    setCompletionTimeHours(0);
    setCompletionTimeMinutes(0);
    setCompletionTimeDescription("");
  };

  const handleEditSection = (sectionId: string, name: string) => {
    updateSectionMutation.mutate({ sectionId, name });
  };

  const openDeleteSectionDialog = (sectionId: string) => {
    setSectionToDelete(sectionId);
    setDeleteSectionDialogOpen(true);
  };

  const handleConfirmDeleteSection = () => {
    if (sectionToDelete) {
      deleteSectionMutation.mutate(sectionToDelete);
      setDeleteSectionDialogOpen(false);
      setSectionToDelete(null);
    }
  };

  const isLoading = projectLoading || sectionsLoading;

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="border-b border-border px-6 py-4">
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="flex-1 p-6">
          <div className="flex gap-4 overflow-x-auto">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="min-w-[280px] h-[400px] rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <h2 className="text-lg font-medium mb-2">Project not found</h2>
        <Link href="/">
          <Button variant="outline">
            <ChevronLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="sticky top-0 z-10 border-b border-border/70 bg-background/95 backdrop-blur-xl">
        {/* Breadcrumbs: Client > Project (or just Project if no client) */}
        <div className="hidden px-4 pt-4 sm:px-5 lg:px-8 md:block">
          <Breadcrumb>
            <BreadcrumbList>
              {client ? (
                <>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link href="/clients" data-testid="breadcrumb-clients">Clients</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link href={`/clients/${client.id}`} data-testid="breadcrumb-client">
                        {client.companyName}
                      </Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                </>
              ) : (
                <>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link href="/projects" data-testid="breadcrumb-projects">Projects</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                </>
              )}
              <BreadcrumbItem>
                <BreadcrumbPage data-testid="breadcrumb-project">{project.name}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        <div className="px-4 py-4 sm:px-5 lg:px-8 md:py-5">
          <div className="flex items-start justify-between gap-4 rounded-2xl border border-border/70 bg-card/85 px-4 py-4 shadow-[var(--shadow-soft)] md:px-5">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-base font-semibold text-white shadow-[var(--shadow-soft)] md:h-11 md:w-11"
              style={{ backgroundColor: project.color || "#3B82F6" }}
            >
              {project.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="truncate text-lg font-semibold tracking-tight md:text-[1.7rem]">{project.name}</h1>
                {project.visibility === "private" && (
                  <Badge variant="outline" className="gap-1 text-xs shrink-0" data-testid="badge-private-project">
                    <Lock className="h-3 w-3" />
                    Private
                  </Badge>
                )}
                {project.status === "archived" && (
                  <Badge variant="secondary" className="text-xs shrink-0" data-testid="badge-project-archived">
                    <Archive className="h-3 w-3 mr-1" />
                    Archived
                  </Badge>
                )}
              </div>
              {project.description && (
                <div className="mt-2 hidden md:block">
                  <RichTextRenderer
                    value={project.description}
                    className="max-h-14 overflow-hidden text-[13px] leading-relaxed text-muted-foreground [&>*]:m-0 [&_*]:break-words [&_a]:break-all"
                    data-testid="text-project-description"
                  />
                </div>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden items-center gap-2 lg:flex">
              {project.status === "archived" ? (
                <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
                  Read-only
                </Badge>
              ) : (
                <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
                  Active workspace
                </Badge>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => setSettingsOpen(true)}
              data-testid="button-manage-project-header"
            >
              <Settings className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Manage</span>
            </Button>
          </div>
          </div>
        </div>

        <div className="px-4 pb-4 sm:px-5 lg:px-8">
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-card/90 px-3 py-3 shadow-[var(--shadow-soft)] md:px-4">
          <div className="flex items-center gap-2 md:gap-4">
            <Tabs value={view} onValueChange={(v) => setView(v as ViewType)}>
              <TabsList className="h-10 rounded-2xl border border-border/70 bg-muted/60 p-1">
                <TabsTrigger value="board" className="gap-1 md:gap-1.5 text-xs md:text-sm" data-testid="tab-board">
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Board</span>
                </TabsTrigger>
                <TabsTrigger value="list" className="gap-1 md:gap-1.5 text-xs md:text-sm" data-testid="tab-list">
                  <List className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">List</span>
                </TabsTrigger>
                <TabsTrigger value="calendar" className="gap-1 md:gap-1.5 text-xs md:text-sm" data-testid="tab-calendar">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Calendar</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex items-center gap-1 md:gap-2 shrink-0">
              <Button 
                variant="default" 
                size="icon"
                className="rounded-xl md:hidden"
                onClick={() => setTimerDrawerOpen(true)}
                aria-label="Start timer"
                data-testid="button-start-timer-project-mobile"
              >
                <Play className="h-4 w-4" />
              </Button>
              <Button 
                variant="default" 
                size="sm"
                className="hidden rounded-xl shadow-[var(--shadow-soft)] md:flex"
                onClick={() => setTimerDrawerOpen(true)}
                data-testid="button-start-timer-project"
              >
                <Play className="h-4 w-4 mr-1" />
                Start Timer
              </Button>
              {isAdmin && (
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-xl md:hidden"
                  onClick={() => setAiPlannerOpen(true)}
                  aria-label="AI planner"
                  data-testid="button-ai-planner-mobile"
                >
                  <Sparkles className="h-4 w-4" />
                </Button>
              )}
              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  className="hidden rounded-xl md:flex"
                  onClick={() => setAiPlannerOpen(true)}
                  data-testid="button-ai-planner"
                >
                  <Sparkles className="h-4 w-4 mr-1" />
                  AI Plan
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMembersOpen(true)}
                aria-label="Project members"
                data-testid="button-project-members"
                className="hidden rounded-xl md:flex"
              >
                <Users className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setActivityOpen(true)}
                aria-label="Project activity"
                data-testid="button-project-activity"
                className="hidden rounded-xl md:flex"
              >
                <Activity className="h-4 w-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setSettingsOpen(true)}
                aria-label="Project settings"
                data-testid="button-project-settings"
                className="hidden rounded-xl md:flex"
              >
                <Settings className="h-4 w-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-xl md:hidden"
                    aria-label="More options"
                    data-testid="button-project-more-mobile"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setMembersOpen(true)} data-testid="menu-project-members-mobile">
                    <Users className="h-4 w-4 mr-2" />
                    Members
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setActivityOpen(true)} data-testid="menu-project-activity-mobile">
                    <Activity className="h-4 w-4 mr-2" />
                    Activity
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSettingsOpen(true)} data-testid="menu-project-settings-mobile">
                    <Settings className="h-4 w-4 mr-2" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => {
                      const url = `${window.location.origin}/projects/${projectId}`;
                      navigator.clipboard.writeText(url).then(() => {
                        toast({ title: "Link copied", description: "Project link copied to clipboard" });
                      });
                    }}
                    data-testid="menu-copy-link-mobile"
                  >
                    <Link2 className="h-4 w-4 mr-2" />
                    Copy Link
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTemplatePopoverOpen(true)} data-testid="menu-apply-template-mobile">
                    <FileStack className="h-4 w-4 mr-2" />
                    Apply Template
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Popover open={templatePopoverOpen} onOpenChange={setTemplatePopoverOpen}>
                <PopoverTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    aria-label="Apply template"
                    title="Apply Template"
                    data-testid="button-apply-template"
                    className="hidden rounded-xl md:flex"
                  >
                    <FileStack className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="end">
                  <div className="p-3 border-b">
                    <h4 className="font-medium">Apply Template</h4>
                    <p className="text-xs text-muted-foreground mt-1">Add sections and tasks from a template</p>
                  </div>
                  <ScrollArea className="max-h-[300px]">
                    {templatesLoading ? (
                      <div className="p-6 flex items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : templates.length > 0 ? (
                      <div className="p-2 space-y-1">
                        {templates.map((tpl) => {
                          const content = tpl.content as ProjectTemplateContent | undefined;
                          const sectionCount = content?.sections?.length || 0;
                          const taskCount = content?.sections?.reduce((sum, s) => sum + (s.tasks?.length || 0), 0) || 0;
                          return (
                            <button
                              key={tpl.id}
                              className="w-full text-left p-2 rounded-md hover-elevate cursor-pointer disabled:opacity-50"
                              onClick={() => applyTemplateMutation.mutate(tpl.id)}
                              disabled={applyTemplateMutation.isPending}
                              data-testid={`template-option-${tpl.id}`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium truncate">{tpl.name}</span>
                                <div className="flex items-center gap-1 shrink-0">
                                  <Badge variant="secondary" className="text-xs">{sectionCount} sections</Badge>
                                  <Badge variant="secondary" className="text-xs">{taskCount} tasks</Badge>
                                </div>
                              </div>
                              {tpl.description && (
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{tpl.description}</p>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-6 text-center">
                        <FileStack className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">No templates available</p>
                        <p className="text-xs text-muted-foreground mt-1">Create templates in the Templates page</p>
                      </div>
                    )}
                  </ScrollArea>
                </PopoverContent>
              </Popover>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Copy project link"
                title="Copy Project Link"
                data-testid="button-copy-project-link"
                className="hidden rounded-xl md:flex"
                onClick={() => {
                  const url = `${window.location.origin}/projects/${projectId}`;
                  navigator.clipboard.writeText(url).then(() => {
                    toast({ title: "Link copied", description: "Project link copied to clipboard" });
                  });
                }}
              >
                <Link2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {project.status === "archived" ? (
            <Button
              size="sm"
              className="rounded-xl"
              onClick={() => restoreProjectMutation.mutate()}
              disabled={restoreProjectMutation.isPending}
              data-testid="button-restore-project"
            >
              {restoreProjectMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin md:mr-1" />
              ) : (
                <RotateCcw className="h-4 w-4 md:mr-1" />
              )}
              <span className="hidden md:inline">Restore Project</span>
            </Button>
          ) : (
            <Button size="sm" className="rounded-xl shadow-[var(--shadow-soft)]" onClick={() => handleAddTask()} data-testid="button-add-task">
              <Plus className="h-4 w-4 md:mr-1" />
              <span className="hidden md:inline">Add Task</span>
            </Button>
          )}
        </div>
        </div>
      </div>
      <div className="flex-1 overflow-hidden bg-[radial-gradient(circle_at_top,_hsl(var(--surface-2))_0%,_transparent_45%)]">
        {view === "board" && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex h-full gap-4 overflow-x-auto px-4 py-5 sm:px-5 lg:px-8 md:py-6 snap-x snap-mandatory sm:snap-none scroll-smooth">
              {orderedSections.map((section) => (
                <div key={section.id} className="snap-center sm:snap-align-none">
                  <SectionColumn
                    section={section}
                    onAddTask={() => handleAddTask(section.id)}
                    onTaskSelect={handleTaskSelect}
                    onTaskStatusChange={handleStatusChange}
                    onEditSection={handleEditSection}
                    onArchiveSection={(sectionId) => archiveSectionMutation.mutate(sectionId)}
                    onDeleteSection={openDeleteSectionDialog}
                    onClearSectionTasks={(sectionId) => clearSectionTasksMutation.mutate(sectionId)}
                  />
                </div>
              ))}
              <div className="min-w-[85vw] max-w-[85vw] shrink-0 snap-center sm:max-w-[280px] sm:min-w-[280px] sm:snap-align-none">
                <Button
                  variant="outline"
                  className="h-14 w-full justify-center rounded-2xl border-dashed bg-card/80"
                  onClick={handleAddSection}
                  data-testid="button-add-section"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Section
                </Button>
              </div>
            </div>
            <DragOverlay>
              {activeTask && (
                <TaskCard
                  task={activeTask}
                  view="board"
                  isDragging
                />
              )}
            </DragOverlay>
          </DndContext>
        )}

        {view === "list" && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="h-full overflow-y-auto px-4 py-5 sm:px-5 lg:px-8 md:py-6">
              {orderedSections.map((section) => (
                <ListSectionDroppable
                  key={section.id}
                  section={section}
                  onAddTask={() => handleAddTask(section.id)}
                  onTaskSelect={handleTaskSelect}
                  onTaskStatusChange={handleStatusChange}
                />
              ))}
              <Button
                variant="outline"
                className="h-14 w-full justify-center rounded-2xl border-dashed bg-card/80"
                onClick={handleAddSection}
                data-testid="button-add-section-list"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Section
              </Button>
            </div>
            <DragOverlay>
              {activeTask && (
                <TaskCard
                  task={activeTask}
                  view="list"
                  isDragging
                />
              )}
            </DragOverlay>
          </DndContext>
        )}

        {view === "calendar" && projectId && sections && (
          <ProjectCalendar
            projectId={projectId}
            sections={sections}
            onTaskSelect={handleTaskSelect}
            onDateClick={(date) => {
              setSelectedSectionId(sections[0]?.id);
              setCreateTaskOpen(true);
            }}
          />
        )}
      </div>
      <TaskDetailDrawer
        task={selectedTask}
        open={!!selectedTask}
        onOpenChange={(open) => !open && handleCloseTaskDrawer()}
        onUpdate={(taskId: string, data: Partial<TaskWithRelations>) => {
          updateTaskMutation.mutate({ taskId, data });
        }}
        onAddComment={(taskId: string, body: string) => {
          addCommentMutation.mutate({ taskId, body });
        }}
        onRefresh={refetchSelectedTask}
        workspaceId={project?.workspaceId}
      />
      <TaskCreateDrawer
        open={createTaskOpen}
        onOpenChange={setCreateTaskOpen}
        onSubmit={handleCreateTask}
        sections={sections || []}
        defaultSectionId={selectedSectionId}
        tenantUsers={tenantUsers}
        isLoading={createTaskMutation.isPending}
        projectId={projectId}
        workspaceId={project?.workspaceId}
      />
      {project && (
        <ProjectSettingsSheet
          project={project}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
        />
      )}
      {project && (
        <ProjectMembersSheet
          project={project}
          open={membersOpen}
          onOpenChange={setMembersOpen}
        />
      )}
      <Sheet open={aiPlannerOpen} onOpenChange={setAiPlannerOpen}>
        <SheetContent className="w-[440px] sm:w-[540px] flex flex-col">
          <SheetHeader className="flex-shrink-0">
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Project Planner
            </SheetTitle>
          </SheetHeader>
          {project && projectId && (
            <div className="mt-4 flex-1 overflow-y-auto min-h-0">
              <AIProjectPlanner
                projectName={project.name}
                projectDescription={project.description || undefined}
                projectId={projectId}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>
      <Suspense fallback={null}>
        <LazyStartTimerDrawer
          open={timerDrawerOpen}
          onOpenChange={setTimerDrawerOpen}
          initialProjectId={projectId}
          initialClientId={project?.clientId}
        />
      </Suspense>
      <Sheet open={activityOpen} onOpenChange={setActivityOpen}>
        <SheetContent className="w-[380px] sm:w-[440px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Activity
            </SheetTitle>
          </SheetHeader>
          {projectId && (
            <div className="h-[calc(100vh-120px)] mt-4">
              <ProjectActivityFeed
                projectId={projectId}
                limit={30}
                onTaskClick={(taskId) => {
                  setActivityOpen(false);
                  const task = tasks?.find((t) => t.id === taskId);
                  if (task) handleTaskSelect(task);
                }}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>
      <SectionNameDialog />
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
              Enter the time spent on this task
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
          <DialogFooter>
            <Button
              variant="outline"
              onClick={resetCompletionState}
              disabled={isCompletingTask}
            >
              Cancel
            </Button>
            <Button
              onClick={handleTimeEntrySubmit}
              disabled={isCompletingTask}
              data-testid="button-submit-time-entry"
            >
              {isCompletingTask ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              {isCompletingTask ? "Completing..." : "Log Time & Complete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={deleteSectionDialogOpen} onOpenChange={setDeleteSectionDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Section</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this section? All tasks in this section will be moved to no section.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-section">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmDeleteSection}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete-section"
            >
              {deleteSectionMutation.isPending ? "Deleting..." : "Delete Section"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
