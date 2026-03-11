import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useCreatePersonalTask, useCreateSubtask } from "@/hooks/use-create-task";
import { useDebounce } from "@/hooks/use-debounce";

const MY_TASKS_FILTERS_KEY = "my-tasks-filters";
const MY_TASKS_ORDERS_KEY = "my-tasks-section-orders";

type SavedFilters = {
  statusFilter: string;
  priorityFilter: string;
  dueDateFilter: string;
  sortBy: string;
  showCompleted: boolean;
};

function loadSavedFilters(): SavedFilters {
  try {
    const saved = localStorage.getItem(MY_TASKS_FILTERS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        statusFilter: parsed.statusFilter || "all",
        priorityFilter: parsed.priorityFilter || "all",
        dueDateFilter: parsed.dueDateFilter || "all",
        sortBy: parsed.sortBy || "due_date",
        showCompleted: parsed.showCompleted ?? false,
      };
    }
  } catch {}
  return { statusFilter: "all", priorityFilter: "all", dueDateFilter: "all", sortBy: "due_date", showCompleted: false };
}

function saveFilters(filters: SavedFilters) {
  try {
    localStorage.setItem(MY_TASKS_FILTERS_KEY, JSON.stringify(filters));
  } catch {}
}

function loadSavedOrders(): Record<string, string[]> {
  try {
    const saved = localStorage.getItem(MY_TASKS_ORDERS_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {}
  return {};
}

function saveOrders(orders: Record<string, string[]>) {
  try {
    localStorage.setItem(MY_TASKS_ORDERS_KEY, JSON.stringify(orders));
  } catch {}
}
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  CheckSquare,
  Calendar,
  AlertCircle,
  Clock,
  CheckCircle2,
  Plus,
  User,
  CalendarX,
  Eye,
  EyeOff,
  GripVertical,
  TrendingUp,
  Target,
  Sparkles,
  ListTodo,
  Zap,
  Flame,
  Circle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { SortableTaskCard } from "@/features/tasks/sortable-task-card";
import { TaskDetailDrawer } from "@/features/tasks/task-detail-drawer";
import { PersonalTaskCreateDrawer } from "@/features/tasks/personal-task-create-drawer";
import { isToday, isPast, isFuture, subDays, isWithinInterval, addDays, startOfDay } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { AccessInfoBanner } from "@/components/access-info-banner";
import { TaskProgressBar } from "@/components/task-progress-bar";
import { PageShell, PageHeader, EmptyState, LoadingState, DataToolbar } from "@/components/layout";
import { LogTimeOnCompleteDialog } from "@/components/log-time-on-complete-dialog";
import type { FilterConfig, SortOption } from "@/components/layout";
import type { TaskWithRelations, TaskListItem, Workspace, User as UserType, TimeEntry } from "@shared/schema";
import { UserRole } from "@shared/schema";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
import { Virtuoso } from "react-virtuoso";

type MyTaskItem = TaskListItem | TaskWithRelations;

type TaskSection = {
  id: string;
  title: string;
  icon: React.ElementType;
  iconColor?: string;
  tasks: MyTaskItem[];
  defaultOpen: boolean;
};

function categorizeTasks(tasks: MyTaskItem[]): TaskSection[] {
  const personalTasks: MyTaskItem[] = [];
  const noDueDate: MyTaskItem[] = [];
  const overdue: MyTaskItem[] = [];
  const today: MyTaskItem[] = [];
  const upcoming: MyTaskItem[] = [];

  tasks.forEach((task) => {
    const isPersonalTask = task.isPersonal === true || (!task.projectId && task.isPersonal !== false);
    if (isPersonalTask) {
      personalTasks.push(task);
    }

    if (!task.dueDate) {
      noDueDate.push(task);
    } else {
      const dueDate = new Date(task.dueDate);
      const pastCheck = isPast(dueDate);
      const todayCheck = isToday(dueDate);
      const futureCheck = isFuture(dueDate);
      if (pastCheck && !todayCheck) {
        overdue.push(task);
      } else if (todayCheck) {
        today.push(task);
      } else if (futureCheck) {
        upcoming.push(task);
      }
    }
  });

  return [
    { id: "overdue", title: "Overdue", icon: AlertCircle, iconColor: "text-red-500", tasks: overdue, defaultOpen: true },
    { id: "today", title: "Today", icon: Clock, iconColor: "text-blue-500", tasks: today, defaultOpen: true },
    { id: "upcoming", title: "Upcoming", icon: Calendar, iconColor: "text-green-500", tasks: upcoming, defaultOpen: true },
    { id: "personal", title: "Personal Tasks", icon: User, tasks: personalTasks, defaultOpen: true },
    { id: "no-date", title: "No Due Date", icon: CalendarX, tasks: noDueDate, defaultOpen: true },
  ];
}

interface TaskSectionListProps {
  section: TaskSection;
  onTaskSelect: (task: MyTaskItem) => void;
  onStatusChange: (taskId: string, completed: boolean) => void;
  onPriorityChange: (taskId: string, priority: "low" | "medium" | "high" | "urgent") => void;
  onDueDateChange: (taskId: string, dueDate: Date | null) => void;
  localOrder: string[];
  onDragEnd: (event: DragEndEvent, sectionId: string) => void;
  onAddTask?: () => void;
  supportsAddTask?: boolean;
  useVirtualization?: boolean;
}

const SECTION_INITIAL_SHOW = 20;

const VIRTUALIZATION_THRESHOLD = 20;

function TaskSectionList({ section, onTaskSelect, onStatusChange, onPriorityChange, onDueDateChange, localOrder, onDragEnd, onAddTask, supportsAddTask = false, useVirtualization = false }: TaskSectionListProps) {
  const [showAll, setShowAll] = useState(false);
  const [isOpen, setIsOpen] = useState(section.defaultOpen);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const orderedTasks = useMemo(() => {
    if (localOrder.length === 0) return section.tasks;
    const taskMap = new Map(section.tasks.map(t => [t.id, t]));
    const ordered: MyTaskItem[] = [];
    localOrder.forEach(id => {
      const task = taskMap.get(id);
      if (task) ordered.push(task);
    });
    section.tasks.forEach(task => {
      if (!localOrder.includes(task.id)) ordered.push(task);
    });
    return ordered;
  }, [section.tasks, localOrder]);

  const shouldVirtualize = useVirtualization && orderedTasks.length > VIRTUALIZATION_THRESHOLD;
  const hasMore = !shouldVirtualize && orderedTasks.length > SECTION_INITIAL_SHOW;
  const visibleTasks = shouldVirtualize ? orderedTasks : (showAll || !hasMore ? orderedTasks : orderedTasks.slice(0, SECTION_INITIAL_SHOW));
  const hiddenCount = orderedTasks.length - SECTION_INITIAL_SHOW;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="flex items-center gap-1 border-b border-border">
        <CollapsibleTrigger
          className="flex items-center gap-2 flex-1 py-2 px-2 hover:bg-muted/50 rounded-md transition-colors"
          data-testid={`section-trigger-${section.id}`}
        >
          {isOpen
            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          }
          <section.icon className={`h-3.5 w-3.5 ${section.iconColor || "text-muted-foreground"}`} />
          <span className="font-semibold text-sm">{section.title}</span>
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full tabular-nums">
            {section.tasks.length}
          </span>
        </CollapsibleTrigger>
        {onAddTask && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={onAddTask}
            aria-label="Add task"
            data-testid={`button-add-${section.id}-task`}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <CollapsibleContent>
        {section.tasks.length > 0 && (
          <div className="grid items-center gap-2 px-4 py-1.5 grid-cols-[16px_20px_minmax(200px,2fr)_40px_minmax(80px,1fr)_minmax(80px,1fr)_90px_76px_32px] bg-muted/30 border-b border-border">
            <div />
            <div />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Task</span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Assignee</span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Client</span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Project</span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Due Date</span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Priority</span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Actions</span>
          </div>
        )}
        {section.tasks.length > 0 ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(e) => onDragEnd(e, section.id)}
          >
            <SortableContext items={visibleTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
              {shouldVirtualize ? (
                <Virtuoso
                  data={visibleTasks}
                  style={{ height: Math.min(visibleTasks.length * 44, 600) }}
                  overscan={200}
                  itemContent={(_index, task) => (
                    <SortableTaskCard
                      key={task.id}
                      task={task as TaskWithRelations}
                      view="list"
                      onSelect={() => onTaskSelect(task)}
                      onStatusChange={(completed) => onStatusChange(task.id, completed)}
                      onPriorityChange={(priority) => onPriorityChange(task.id, priority)}
                      onDueDateChange={(dueDate) => onDueDateChange(task.id, dueDate)}
                      showQuickActions
                    />
                  )}
                />
              ) : (
                <div>
                  {visibleTasks.map((task) => (
                    <SortableTaskCard
                      key={task.id}
                      task={task as TaskWithRelations}
                      view="list"
                      onSelect={() => onTaskSelect(task)}
                      onStatusChange={(completed) => onStatusChange(task.id, completed)}
                      onPriorityChange={(priority) => onPriorityChange(task.id, priority)}
                      onDueDateChange={(dueDate) => onDueDateChange(task.id, dueDate)}
                      showQuickActions
                    />
                  ))}
                </div>
              )}
            </SortableContext>
            {hasMore && !showAll && (
              <button
                className="w-full py-2 px-4 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 border-b border-border text-left transition-colors"
                onClick={() => setShowAll(true)}
                data-testid={`button-show-all-${section.id}`}
              >
                + Show {hiddenCount} more tasks
              </button>
            )}
            {hasMore && showAll && (
              <button
                className="w-full py-2 px-4 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 border-b border-border text-left transition-colors"
                onClick={() => setShowAll(false)}
                data-testid={`button-show-less-${section.id}`}
              >
                Show fewer tasks
              </button>
            )}
          </DndContext>
        ) : (
          <div className="px-4 py-3 text-sm text-muted-foreground border-b border-border flex items-center gap-3">
            {supportsAddTask && onAddTask ? (
              <>
                <button
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={onAddTask}
                  data-testid={`button-empty-add-${section.id}-task`}
                >
                  + Add a task
                </button>
              </>
            ) : (
              <span className="text-xs">No tasks in this section</span>
            )}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

interface DashboardStats {
  todayCount: number;
  overdueCount: number;
  inProgressCount: number;
  completedThisWeek: number;
  recentlyAdded: MyTaskItem[];
  recentlyCompleted: MyTaskItem[];
  completionRate: number;
  highPriorityCount: number;
  personalTaskCount: number;
  projectTaskCount: number;
}

function computeDashboardStats(tasks: MyTaskItem[]): DashboardStats {
  const now = new Date();
  const weekAgo = subDays(now, 7);
  
  const todayTasks = tasks.filter(t => t.dueDate && isToday(new Date(t.dueDate)) && t.status !== "done");
  const overdueTasks = tasks.filter(t => t.dueDate && isPast(new Date(t.dueDate)) && !isToday(new Date(t.dueDate)) && t.status !== "done");
  const inProgressTasks = tasks.filter(t => t.status === "in_progress");
  const completedThisWeek = tasks.filter(t => {
    const updatedAt = (t as any).updatedAt;
    return t.status === "done" && updatedAt && new Date(updatedAt) >= weekAgo;
  });
  
  const recentlyAdded = tasks
    .filter(t => {
      const createdAt = (t as any).createdAt;
      return createdAt && new Date(createdAt) >= weekAgo && t.status !== "done";
    })
    .sort((a, b) => new Date((b as any).createdAt).getTime() - new Date((a as any).createdAt).getTime())
    .slice(0, 5);
  
  const recentlyCompleted = tasks
    .filter(t => {
      const updatedAt = (t as any).updatedAt;
      return t.status === "done" && updatedAt && new Date(updatedAt) >= weekAgo;
    })
    .sort((a, b) => new Date((b as any).updatedAt).getTime() - new Date((a as any).updatedAt).getTime())
    .slice(0, 5);
  
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.status === "done").length;
  const completionRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  
  const highPriorityCount = tasks.filter(t => (t.priority === "high" || t.priority === "urgent") && t.status !== "done").length;
  const personalTaskCount = tasks.filter(t => !t.projectId).length;
  const projectTaskCount = tasks.filter(t => !!t.projectId).length;

  return {
    todayCount: todayTasks.length,
    overdueCount: overdueTasks.length,
    inProgressCount: inProgressTasks.length,
    completedThisWeek: completedThisWeek.length,
    recentlyAdded,
    recentlyCompleted,
    completionRate,
    highPriorityCount,
    personalTaskCount,
    projectTaskCount,
  };
}


export default function MyTasks() {
  const { user } = useAuth();
  const isEmployee = user?.role === UserRole.EMPLOYEE;
  const { virtualizationV1 } = useFeatureFlags();
  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null);
  const [showNewTaskDrawer, setShowNewTaskDrawer] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [pendingCompleteTask, setPendingCompleteTask] = useState<TaskWithRelations | null>(null);
  const [showLogTimeDialog, setShowLogTimeDialog] = useState(false);
  
  // Handle quick action from mobile nav (opens new task drawer via URL param)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'new') {
      setShowNewTaskDrawer(true);
      const url = new URL(window.location.href);
      url.searchParams.delete('action');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  }, []);

  const savedFilters = useMemo(() => loadSavedFilters(), []);
  const [statusFilter, setStatusFilter] = useState<string>(savedFilters.statusFilter);
  const [priorityFilter, setPriorityFilter] = useState<string>(savedFilters.priorityFilter);
  const [dueDateFilter, setDueDateFilter] = useState<string>(savedFilters.dueDateFilter);
  const [sortBy, setSortBy] = useState<string>(savedFilters.sortBy);
  const [showCompleted, setShowCompleted] = useState<boolean>(savedFilters.showCompleted);
  const [sectionOrders, setSectionOrders] = useState<Record<string, string[]>>(() => loadSavedOrders());

  useEffect(() => {
    saveFilters({ statusFilter, priorityFilter, dueDateFilter, sortBy, showCompleted });
  }, [statusFilter, priorityFilter, dueDateFilter, sortBy, showCompleted]);

  useEffect(() => {
    saveOrders(sectionOrders);
  }, [sectionOrders]);

  const { data: tasks, isLoading } = useQuery<MyTaskItem[]>({
    queryKey: ["/api/tasks/my", { view: "list" }],
    queryFn: async () => {
      const res = await fetch("/api/tasks/my?view=list");
      if (!res.ok) throw new Error("Failed to fetch tasks");
      return res.json();
    },
  });

  const { data: pendingTaskTimeEntries = [] } = useQuery<TimeEntry[]>({
    queryKey: ["/api/tasks", pendingCompleteTask?.id, "time-entries"],
    enabled: !!pendingCompleteTask,
  });

  // Get taskId from URL for deep linking
  const urlTaskId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('taskId');
  }, []);

  // Fetch individual task for deep linking if not in the main tasks list
  const { data: linkedTask } = useQuery<TaskWithRelations>({
    queryKey: ["/api/tasks", urlTaskId],
    enabled: !!urlTaskId && !selectedTask && !!tasks && !tasks.find(t => t.id === urlTaskId),
  });

  // Deep linking: open task from URL param (from tasks list or dedicated fetch)
  useEffect(() => {
    if (isLoading || selectedTask || !urlTaskId) return;
    
    const taskInList = tasks?.find(t => t.id === urlTaskId);
    if (taskInList || linkedTask) {
      setSelectedTask((linkedTask || taskInList) as TaskWithRelations);
    }
  }, [tasks, linkedTask, isLoading, selectedTask, urlTaskId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedTask) {
        handleCloseDrawer();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedTask]);

  const handleCloseDrawer = useCallback(() => {
    setSelectedTask(null);
    // Remove taskId from URL without page reload
    const url = new URL(window.location.href);
    if (url.searchParams.has('taskId')) {
      url.searchParams.delete('taskId');
      window.history.replaceState({}, '', url.pathname + (url.search || ''));
    }
  }, []);

  const { data: currentWorkspace } = useQuery<Workspace>({
    queryKey: ["/api/workspaces/current"],
  });

  const { data: tenantUsers } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
  });

  const createPersonalTaskMutation = useCreatePersonalTask({
    onSuccess: () => {
      setShowNewTaskDrawer(false);
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, data }: { taskId: string; data: Partial<TaskWithRelations> }) => {
      return apiRequest("PATCH", `/api/tasks/${taskId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/my"] });
      if (selectedTask) {
        refetchSelectedTask();
      }
    },
  });

  const addSubtaskMutation = useCreateSubtask({
    onSuccess: () => {
      if (selectedTask) {
        refetchSelectedTask();
      }
    },
  });

  const deleteSubtaskMutation = useMutation({
    mutationFn: async (subtaskId: string) => {
      return apiRequest("DELETE", `/api/subtasks/${subtaskId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/my"] });
      if (selectedTask) {
        refetchSelectedTask();
      }
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

  const refetchSelectedTask = async () => {
    if (selectedTask) {
      const response = await fetch(`/api/tasks/${selectedTask.id}`);
      const updatedTask = await response.json();
      setSelectedTask(updatedTask);
    }
  };

  const handleCreatePersonalTask = async (data: {
    title: string;
    description?: string;
    priority?: "low" | "medium" | "high" | "urgent";
    status?: "todo" | "in_progress" | "blocked" | "done";
    dueDate?: string | null;
    assigneeIds?: string[];
  }) => {
    await createPersonalTaskMutation.mutateAsync(data);
  };

  const handleTaskSelect = async (task: MyTaskItem) => {
    const url = new URL(window.location.href);
    url.searchParams.set('taskId', task.id);
    window.history.replaceState({}, '', url.pathname + url.search);
    try {
      const response = await fetch(`/api/tasks/${task.id}`);
      if (response.ok) {
        const fullTask = await response.json();
        setSelectedTask(fullTask);
      } else {
        setSelectedTask(task as TaskWithRelations);
      }
    } catch {
      setSelectedTask(task as TaskWithRelations);
    }
  };

  const handleStatusChange = useCallback((taskId: string, completed: boolean) => {
    if (!completed) {
      updateTaskMutation.mutate({
        taskId,
        data: { status: "todo" },
      });
      return;
    }

    const task = tasks?.find(t => t.id === taskId);
    if (!task) {
      updateTaskMutation.mutate({
        taskId,
        data: { status: "done" },
      });
      return;
    }

    setPendingCompleteTask(task as TaskWithRelations);
    setShowLogTimeDialog(true);
  }, [tasks, updateTaskMutation]);

  const handleCompleteTask = useCallback(async () => {
    if (!pendingCompleteTask) return;
    await updateTaskMutation.mutateAsync({
      taskId: pendingCompleteTask.id,
      data: { status: "done" },
    });
    setPendingCompleteTask(null);
  }, [pendingCompleteTask, updateTaskMutation]);

  const handleSkipTimeLog = useCallback(async () => {
    if (!pendingCompleteTask) return;
    await updateTaskMutation.mutateAsync({
      taskId: pendingCompleteTask.id,
      data: { status: "done" },
    });
    setPendingCompleteTask(null);
  }, [pendingCompleteTask, updateTaskMutation]);

  const handlePriorityChange = useCallback((taskId: string, priority: "low" | "medium" | "high" | "urgent") => {
    updateTaskMutation.mutate({ taskId, data: { priority } });
  }, [updateTaskMutation]);

  const handleDueDateChange = useCallback((taskId: string, dueDate: Date | null) => {
    updateTaskMutation.mutate({ 
      taskId, 
      data: { dueDate: dueDate ? dueDate.toISOString() : null } 
    });
  }, [updateTaskMutation]);

  const handleDragEnd = (event: DragEndEvent, sectionId: string) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setSectionOrders(prev => {
      const currentOrder = prev[sectionId] || [];
      const allTasks = filteredTasks.filter(t => {
        const isPersonalTask = t.isPersonal === true || (!t.projectId && t.isPersonal !== false);
        // Personal tasks section only contains personal tasks
        if (sectionId === "personal") return isPersonalTask;
        // All other sections include ALL tasks (personal and project-based) categorized by date
        if (sectionId === "no-date") return !t.dueDate;
        if (sectionId === "overdue") return t.dueDate && isPast(new Date(t.dueDate)) && !isToday(new Date(t.dueDate));
        if (sectionId === "today") return t.dueDate && isToday(new Date(t.dueDate));
        if (sectionId === "upcoming") return t.dueDate && isFuture(new Date(t.dueDate));
        return false;
      });
      
      const taskIds = currentOrder.length > 0 ? currentOrder : allTasks.map(t => t.id);
      const oldIndex = taskIds.indexOf(active.id as string);
      const newIndex = taskIds.indexOf(over.id as string);
      
      if (oldIndex === -1 || newIndex === -1) return prev;
      
      return {
        ...prev,
        [sectionId]: arrayMove(taskIds, oldIndex, newIndex),
      };
    });
  };

  // Filter configs for DataToolbar
  const filterConfigs: FilterConfig[] = useMemo(() => [
    {
      key: "status",
      label: "Status",
      options: [
        { value: "all", label: "Open Tasks" },
        { value: "todo", label: "To Do" },
        { value: "in_progress", label: "In Progress" },
        { value: "blocked", label: "Blocked" },
        { value: "done", label: "Done" },
      ],
    },
    {
      key: "priority",
      label: "Priority",
      options: [
        { value: "all", label: "All Priority" },
        { value: "urgent", label: "Urgent" },
        { value: "high", label: "High" },
        { value: "medium", label: "Medium" },
        { value: "low", label: "Low" },
      ],
    },
    {
      key: "dueDate",
      label: "Due Date",
      options: [
        { value: "all", label: "All Dates" },
        { value: "overdue", label: "Overdue" },
        { value: "today", label: "Today" },
        { value: "this_week", label: "This Week" },
        { value: "no_date", label: "No Due Date" },
      ],
    },
  ], []);

  const sortOptions: SortOption[] = useMemo(() => [
    { value: "due_date", label: "Due Date" },
    { value: "updated", label: "Last Updated" },
    { value: "priority", label: "Priority" },
    { value: "title", label: "Title" },
  ], []);

  const filterValues = useMemo(() => ({
    status: statusFilter,
    priority: priorityFilter,
    dueDate: dueDateFilter,
  }), [statusFilter, priorityFilter, dueDateFilter]);

  const handleFilterChange = useCallback((key: string, value: string) => {
    if (key === "status") setStatusFilter(value);
    if (key === "priority") setPriorityFilter(value);
    if (key === "dueDate") setDueDateFilter(value);
  }, []);

  const handleClearFilters = useCallback(() => {
    setStatusFilter("all");
    setPriorityFilter("all");
    setDueDateFilter("all");
    setSearchQuery("");
  }, []);

  const filteredTasks = useMemo(() => {
    if (!tasks) return [];
    
    const now = startOfDay(new Date());
    const weekEnd = addDays(now, 7);

    return tasks.filter((task) => {
      // Status filter
      if (task.status === "done" && !showCompleted && statusFilter !== "done") return false;
      if (statusFilter !== "all" && task.status !== statusFilter) return false;
      
      // Priority filter
      if (priorityFilter !== "all" && task.priority !== priorityFilter) return false;
      
      // Due date filter
      if (dueDateFilter !== "all") {
        const dueDate = task.dueDate ? new Date(task.dueDate) : null;
        if (dueDateFilter === "overdue") {
          if (!dueDate || !isPast(dueDate) || isToday(dueDate)) return false;
        } else if (dueDateFilter === "today") {
          if (!dueDate || !isToday(dueDate)) return false;
        } else if (dueDateFilter === "this_week") {
          if (!dueDate || !isWithinInterval(dueDate, { start: now, end: weekEnd })) return false;
        } else if (dueDateFilter === "no_date") {
          if (dueDate) return false;
        }
      }
      
      if (debouncedSearch) {
        const search = debouncedSearch.toLowerCase();
        const matchTitle = task.title.toLowerCase().includes(search);
        const matchDescription = (task as any).description?.toLowerCase().includes(search);
        const matchProject = (task as any).project?.name?.toLowerCase().includes(search);
        if (!matchTitle && !matchDescription && !matchProject) return false;
      }
      
      return true;
    });
  }, [tasks, statusFilter, priorityFilter, dueDateFilter, showCompleted, debouncedSearch]);

  // Sort filtered tasks
  const sortedTasks = useMemo(() => {
    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
    
    return [...filteredTasks].sort((a, b) => {
      if (sortBy === "due_date") {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      if (sortBy === "updated") {
        const aTime = (a as any).updatedAt ? new Date((a as any).updatedAt).getTime() : 0;
        const bTime = (b as any).updatedAt ? new Date((b as any).updatedAt).getTime() : 0;
        return bTime - aTime;
      }
      if (sortBy === "priority") {
        const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 4;
        const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 4;
        return aPriority - bPriority;
      }
      if (sortBy === "title") {
        return a.title.localeCompare(b.title);
      }
      return 0;
    });
  }, [filteredTasks, sortBy]);

  const allSections = categorizeTasks(sortedTasks);

  const totalTasks = filteredTasks.length;

  const taskStats = useMemo(() => {
    const allTasks = tasks || [];
    return {
      total: allTasks.length,
      done: allTasks.filter(t => t.status === "done").length,
      inProgress: allTasks.filter(t => t.status === "in_progress").length,
      todo: allTasks.filter(t => t.status === "todo").length,
      blocked: allTasks.filter(t => t.status === "blocked").length,
    };
  }, [tasks]);

  const dashboardStats = useMemo(() => {
    return computeDashboardStats(tasks || []);
  }, [tasks]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {isEmployee && (
        <AccessInfoBanner variant="tasks" className="mx-4 md:mx-6 mt-4" />
      )}
      <div className="border-b border-border bg-background sticky top-0 z-10">
        <div className="flex flex-col gap-3 px-3 sm:px-4 lg:px-6 py-3 md:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 md:gap-3">
              <CheckSquare className="h-5 w-5 md:h-6 md:w-6 text-primary" />
              <h1 className="text-lg md:text-2xl font-semibold">My Tasks</h1>
              <span className="text-xs md:text-sm text-muted-foreground">({totalTasks})</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={showCompleted ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setShowCompleted(!showCompleted)}
                className="gap-1 shrink-0"
                data-testid="button-toggle-completed"
              >
                {showCompleted ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                <span className="hidden md:inline">{showCompleted ? "Show done" : "Hide done"}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowNewTaskDrawer(true)}
                data-testid="button-add-personal-task"
                className="md:hidden"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button
                onClick={() => setShowNewTaskDrawer(true)}
                data-testid="button-add-personal-task-desktop"
                className="hidden md:flex"
              >
                <Plus className="h-4 w-4 mr-1" />
                Personal Task
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <DataToolbar
              searchValue={searchQuery}
              onSearchChange={setSearchQuery}
              searchPlaceholder="Search tasks..."
              filters={filterConfigs}
              filterValues={filterValues}
              onFilterChange={handleFilterChange}
              onClearFilters={handleClearFilters}
              sortOptions={sortOptions}
              sortValue={sortBy}
              onSortChange={setSortBy}
              className="mb-0 flex-1"
            />
            {taskStats.total > 0 && (
              <div className="hidden md:flex items-center gap-3 md:gap-4 flex-wrap pl-4 border-l border-border">
                <div className="flex items-center gap-1.5" data-testid="stat-done-header">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-xs md:text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{taskStats.done}</span> Done
                  </span>
                </div>
                <div className="flex items-center gap-1.5" data-testid="stat-in-progress-header">
                  <Clock className="h-4 w-4 text-blue-500" />
                  <span className="text-xs md:text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{taskStats.inProgress}</span> In Progress
                  </span>
                </div>
                <div className="flex items-center gap-1.5" data-testid="stat-todo-header">
                  <Circle className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs md:text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{taskStats.todo}</span> To Do
                  </span>
                </div>
                {taskStats.blocked > 0 && (
                  <div className="flex items-center gap-1.5" data-testid="stat-blocked-header">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <span className="text-xs md:text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">{taskStats.blocked}</span> Blocked
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {taskStats.total > 0 && (
          <div className="hidden md:block px-3 sm:px-4 lg:px-6 pb-4">
            <TaskProgressBar stats={taskStats} showMilestones hideStats />
          </div>
        )}

      </div>

      <div className="flex-1 overflow-auto">
        <div className="px-3 sm:px-4 lg:px-6 py-4 md:py-6 space-y-6">
          <div className="block md:hidden">
            {!isLoading && (
              <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth -mx-1 px-1">
                <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2 min-w-fit snap-center shrink-0">
                  <div className="h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                    <TrendingUp className="h-4 w-4 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Completion</p>
                    <p className="text-sm font-semibold">{dashboardStats.completionRate}%</p>
                  </div>
                </div>
                {dashboardStats.overdueCount > 0 && (
                  <div className="flex items-center gap-2 bg-card border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 min-w-fit snap-center shrink-0">
                    <div className="h-8 w-8 rounded-full bg-red-500/10 flex items-center justify-center">
                      <AlertCircle className="h-4 w-4 text-red-500" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Overdue</p>
                      <p className="text-sm font-semibold text-red-600 dark:text-red-400">{dashboardStats.overdueCount}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2 min-w-fit snap-center shrink-0">
                  <div className="h-8 w-8 rounded-full bg-amber-500/10 flex items-center justify-center">
                    <Target className="h-4 w-4 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Today</p>
                    <p className="text-sm font-semibold">{dashboardStats.todayCount}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2 min-w-fit snap-center shrink-0">
                  <div className="h-8 w-8 rounded-full bg-orange-500/10 flex items-center justify-center">
                    <Flame className="h-4 w-4 text-orange-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">High Priority</p>
                    <p className="text-sm font-semibold">{dashboardStats.highPriorityCount}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2 min-w-fit snap-center shrink-0">
                  <div className="h-8 w-8 rounded-full bg-green-500/10 flex items-center justify-center">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">This Week</p>
                    <p className="text-sm font-semibold">{dashboardStats.completedThisWeek}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          {isLoading ? (
            <div className="space-y-4">
              <LoadingState type="list" rows={4} />
              <LoadingState type="list" rows={4} />
            </div>
          ) : totalTasks > 0 ? (
            <div>
              <div className="space-y-1">
              {allSections.map((section) => (
                <TaskSectionList
                  key={section.id}
                  section={section}
                  onTaskSelect={handleTaskSelect}
                  onStatusChange={handleStatusChange}
                  onPriorityChange={handlePriorityChange}
                  onDueDateChange={handleDueDateChange}
                  localOrder={sectionOrders[section.id] || []}
                  onDragEnd={handleDragEnd}
                  onAddTask={section.id === "personal" ? () => setShowNewTaskDrawer(true) : undefined}
                  supportsAddTask={section.id === "personal"}
                  useVirtualization={virtualizationV1}
                />
              ))}
              </div>
            </div>
          ) : (
            <EmptyState
              icon={<CheckCircle2 className="h-12 w-12" />}
              title="You're all caught up!"
              description={
                statusFilter !== "all" || priorityFilter !== "all" || dueDateFilter !== "all" || debouncedSearch
                  ? "No tasks match your current filters"
                  : "Tasks assigned to you will appear here"
              }
              action={
                <Button
                  variant="outline"
                  onClick={() => setShowNewTaskDrawer(true)}
                  data-testid="button-add-first-task"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add a personal task
                </Button>
              }
            />
          )}
        </div>
      </div>

      <TaskDetailDrawer
        task={selectedTask}
        open={!!selectedTask}
        onOpenChange={(open) => !open && handleCloseDrawer()}
        onUpdate={(taskId: string, data: Partial<TaskWithRelations>) => {
          updateTaskMutation.mutate({ taskId, data });
        }}
        onRefresh={refetchSelectedTask}
        onAddComment={(taskId: string, body: string) => {
          addCommentMutation.mutate({ taskId, body });
        }}
        workspaceId={selectedTask?.project?.workspaceId || currentWorkspace?.id}
      />

      <PersonalTaskCreateDrawer
        open={showNewTaskDrawer}
        onOpenChange={setShowNewTaskDrawer}
        onSubmit={handleCreatePersonalTask}
        tenantUsers={tenantUsers}
        currentUserId={user?.id}
        isLoading={createPersonalTaskMutation.isPending}
      />

      {pendingCompleteTask && (
        <LogTimeOnCompleteDialog
          open={showLogTimeDialog}
          onOpenChange={(open) => {
            if (!open) {
              setShowLogTimeDialog(false);
              setPendingCompleteTask(null);
            }
          }}
          itemType="task"
          itemId={pendingCompleteTask.id}
          itemTitle={pendingCompleteTask.title}
          projectId={pendingCompleteTask.projectId}
          clientId={pendingCompleteTask.project?.clientId || null}
          workspaceId={pendingCompleteTask.project?.workspaceId || currentWorkspace?.id || ""}
          onComplete={handleCompleteTask}
          onSkip={handleSkipTimeLog}
        />
      )}
    </div>
  );
}
