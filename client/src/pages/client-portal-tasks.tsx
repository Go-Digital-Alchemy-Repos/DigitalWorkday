import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, Calendar, CalendarX, Check, CheckCircle2, CheckSquare, ChevronDown, Clock, Eye, EyeOff, FolderKanban, Plus, User } from "lucide-react";
import { format, isPast, isToday, isTomorrow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { DataToolbar, SurfacePanel } from "@/components/layout";
import type { FilterConfig, SortOption } from "@/components/layout";
import { TaskProgressBar } from "@/components/task-progress-bar";
import { PortalTaskCreateDrawer } from "@/features/client-portal/portal-task-create-drawer";
import { PortalTaskDrawer } from "@/features/client-portal/portal-task-drawer";
import { usePortalClient } from "@/hooks/use-portal-client";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";

interface TaskInfo {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  projectId: string | null;
  projectName: string;
  clientId: string;
  isPersonal?: boolean;
}

interface DashboardData {
  tasks: TaskInfo[];
  projects: Array<{ id: string; name: string; clientId: string; status: string }>;
}

type TaskSection = {
  id: string;
  title: string;
  icon: typeof Calendar;
  iconClassName?: string;
  tasks: TaskInfo[];
};

const filterConfigs: FilterConfig[] = [
  { key: "status", label: "Status", options: [
    { value: "all", label: "All statuses" }, { value: "todo", label: "To do" },
    { value: "in_progress", label: "In progress" }, { value: "blocked", label: "Blocked" },
    { value: "completed", label: "Completed" },
  ] },
  { key: "priority", label: "Priority", options: [
    { value: "all", label: "All priorities" }, { value: "urgent", label: "Urgent" },
    { value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" },
  ] },
  { key: "type", label: "Task type", options: [
    { value: "all", label: "All tasks" }, { value: "personal", label: "Personal" }, { value: "project", label: "Project" },
  ] },
  { key: "due", label: "Due date", options: [
    { value: "all", label: "Any due date" }, { value: "overdue", label: "Overdue" },
    { value: "today", label: "Today" }, { value: "upcoming", label: "Upcoming" }, { value: "none", label: "No due date" },
  ] },
];

const sortOptions: SortOption[] = [
  { value: "due_date", label: "Due date" }, { value: "priority", label: "Priority" },
  { value: "title", label: "Task name" }, { value: "project", label: "Project" },
];

const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

function isComplete(task: TaskInfo) {
  return task.status === "completed" || task.status === "done";
}

function dueDateValue(task: TaskInfo) {
  return task.dueDate ? new Date(task.dueDate).getTime() : Number.POSITIVE_INFINITY;
}

function dueDateMatches(task: TaskInfo, filter: string) {
  if (filter === "all") return true;
  if (!task.dueDate) return filter === "none";
  const date = new Date(task.dueDate);
  if (filter === "overdue") return isPast(date) && !isToday(date);
  if (filter === "today") return isToday(date);
  if (filter === "upcoming") return !isPast(date) && !isToday(date);
  return true;
}

function formatDueDate(dateString: string) {
  const date = new Date(dateString);
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  return format(date, "MMM d");
}

function PortalTaskRow({ task, onSelect, onToggleComplete, isUpdating }: {
  task: TaskInfo;
  onSelect: () => void;
  onToggleComplete: () => void;
  isUpdating: boolean;
}) {
  const completed = isComplete(task);
  const overdue = !!task.dueDate && isPast(new Date(task.dueDate)) && !isToday(new Date(task.dueDate)) && !completed;

  return (
    <div className="group flex min-h-[72px] items-center gap-3 border-b border-border/70 px-4 py-3 last:border-b-0 hover:bg-muted/35" data-testid={`task-row-${task.id}`}>
      <button
        type="button"
        onClick={onToggleComplete}
        disabled={isUpdating}
        aria-label={completed ? `Mark ${task.title} incomplete` : `Mark ${task.title} complete`}
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
          completed ? "border-primary bg-primary text-primary-foreground" : "border-primary/80 bg-background text-transparent hover:bg-primary/10",
        )}
        data-testid={`button-toggle-task-${task.id}`}
      >
        <Check className="h-4 w-4" />
      </button>
      <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left">
        <span className={cn("block truncate text-[15px] font-medium", completed && "text-muted-foreground line-through")}>{task.title}</span>
        <span className="mt-1.5 flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className={cn(
            "max-w-[240px] truncate rounded-full px-2.5 py-0.5 font-medium",
            task.isPersonal ? "border border-border bg-background text-foreground" : "border border-blue-100 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300",
          )}>
            {task.isPersonal ? <User className="mr-1 h-3 w-3" /> : <FolderKanban className="mr-1 h-3 w-3" />}
            {task.isPersonal ? "Personal" : task.projectName}
          </Badge>
          {task.status === "in_progress" && <Badge variant="outline" className="rounded-full border-blue-200 text-blue-700">In progress</Badge>}
          {task.status === "blocked" && <Badge variant="outline" className="rounded-full border-amber-200 text-amber-700">Blocked</Badge>}
          {(task.priority === "urgent" || task.priority === "high") && (
            <Badge variant="outline" className="rounded-full border-orange-200 text-orange-700 capitalize">{task.priority}</Badge>
          )}
        </span>
      </button>
      {task.dueDate && (
        <button type="button" onClick={onSelect} className={cn(
          "hidden shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-sm sm:flex",
          overdue ? "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400"
            : isToday(new Date(task.dueDate)) ? "bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400" : "text-muted-foreground",
        )}>
          <Calendar className="h-3.5 w-3.5" />{formatDueDate(task.dueDate)}
        </button>
      )}
    </div>
  );
}

function PortalTaskSection({ section, onTaskSelect, onToggleComplete, updatingTaskId, onAddTask }: {
  section: TaskSection;
  onTaskSelect: (task: TaskInfo) => void;
  onToggleComplete: (task: TaskInfo) => void;
  updatingTaskId: string | null;
  onAddTask?: () => void;
}) {
  const Icon = section.icon;
  return (
    <Collapsible defaultOpen>
      <div className="flex items-center gap-1">
        <CollapsibleTrigger className="group/trigger flex flex-1 items-center gap-2 rounded-lg px-2 py-2.5 text-left hover:bg-muted/50">
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=closed]/trigger:-rotate-90" />
          <Icon className={cn("h-4 w-4 text-muted-foreground", section.iconClassName)} />
          <span className="text-base font-semibold">{section.title}</span>
          <Badge variant="secondary" className="h-6 min-w-6 justify-center rounded-md px-1.5 font-normal">{section.tasks.length}</Badge>
        </CollapsibleTrigger>
        {onAddTask && <Button variant="ghost" size="icon" onClick={onAddTask} aria-label={`Add ${section.title} task`}><Plus className="h-4 w-4" /></Button>}
      </div>
      <CollapsibleContent>
        {section.tasks.length > 0 ? (
          <div className="mt-1 overflow-hidden rounded-xl border border-border/80 bg-background/70">
            {section.tasks.map((task) => (
              <PortalTaskRow key={task.id} task={task} onSelect={() => onTaskSelect(task)} onToggleComplete={() => onToggleComplete(task)} isUpdating={updatingTaskId === task.id} />
            ))}
          </div>
        ) : (
          <div className="mt-1 flex min-h-24 items-center justify-center rounded-xl border border-dashed border-border px-4 text-center text-sm text-muted-foreground">No tasks in this section</div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function ClientPortalTasks() {
  const { clientId } = usePortalClient();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dueFilter, setDueFilter] = useState("all");
  const [sortBy, setSortBy] = useState("due_date");
  const [showCompleted, setShowCompleted] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<DashboardData>({ queryKey: queryKeys.portal.dashboard });
  const clientTasks = useMemo(() => (data?.tasks || []).filter((task) => !clientId || task.clientId === clientId), [clientId, data?.tasks]);

  const filteredTasks = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const tasks = clientTasks.filter((task) => {
      if (!showCompleted && isComplete(task)) return false;
      if (normalizedSearch && ![task.title, task.description || "", task.projectName].some((value) => value.toLowerCase().includes(normalizedSearch))) return false;
      if (statusFilter !== "all" && (statusFilter === "completed" ? !isComplete(task) : task.status !== statusFilter)) return false;
      if (priorityFilter !== "all" && task.priority !== priorityFilter) return false;
      if (typeFilter === "personal" && !task.isPersonal) return false;
      if (typeFilter === "project" && task.isPersonal) return false;
      return dueDateMatches(task, dueFilter);
    });
    return [...tasks].sort((a, b) => {
      if (sortBy === "title") return a.title.localeCompare(b.title);
      if (sortBy === "project") return a.projectName.localeCompare(b.projectName) || a.title.localeCompare(b.title);
      if (sortBy === "priority") return (priorityOrder[a.priority] ?? 4) - (priorityOrder[b.priority] ?? 4) || dueDateValue(a) - dueDateValue(b);
      return dueDateValue(a) - dueDateValue(b) || a.title.localeCompare(b.title);
    });
  }, [clientTasks, dueFilter, priorityFilter, searchQuery, showCompleted, sortBy, statusFilter, typeFilter]);

  const sections = useMemo(() => {
    const overdue: TaskInfo[] = [], today: TaskInfo[] = [], upcoming: TaskInfo[] = [], personal: TaskInfo[] = [], noDate: TaskInfo[] = [];
    for (const task of filteredTasks) {
      if (task.isPersonal) personal.push(task);
      if (!task.dueDate) { noDate.push(task); continue; }
      const date = new Date(task.dueDate);
      if (isPast(date) && !isToday(date)) overdue.push(task);
      else if (isToday(date)) today.push(task);
      else upcoming.push(task);
    }
    return {
      scheduled: [
        { id: "overdue", title: "Overdue", icon: AlertCircle, iconClassName: "text-red-500", tasks: overdue },
        { id: "today", title: "Today", icon: Clock, iconClassName: "text-blue-500", tasks: today },
        { id: "upcoming", title: "Upcoming", icon: Calendar, iconClassName: "text-green-500", tasks: upcoming },
      ],
      unscheduled: [
        { id: "personal", title: "Personal Tasks", icon: User, tasks: personal },
        { id: "no-date", title: "No Due Date", icon: CalendarX, tasks: noDate },
      ],
    } satisfies Record<string, TaskSection[]>;
  }, [filteredTasks]);

  const taskStats = useMemo(() => ({
    total: clientTasks.length,
    done: clientTasks.filter(isComplete).length,
    inProgress: clientTasks.filter((task) => task.status === "in_progress").length,
    todo: clientTasks.filter((task) => task.status === "todo").length,
    blocked: clientTasks.filter((task) => task.status === "blocked").length,
  }), [clientTasks]);

  const updateStatus = useMutation({
    mutationFn: async (task: TaskInfo) => {
      if (!clientId) throw new Error("Select a Client before updating tasks.");
      const path = task.isPersonal ? `/api/client-portal/clients/${clientId}/personal-tasks/${task.id}` : `/api/client-portal/clients/${clientId}/tasks/${task.id}`;
      await apiRequest("PATCH", path, { status: isComplete(task) ? "todo" : "completed" });
      return task;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.portal.dashboard }),
    onError: (mutationError: Error) => toast({ title: "Unable to update task", description: mutationError.message, variant: "destructive" }),
  });

  const handleFilterChange = (key: string, value: string) => {
    if (key === "status") setStatusFilter(value);
    if (key === "priority") setPriorityFilter(value);
    if (key === "type") setTypeFilter(value);
    if (key === "due") setDueFilter(value);
  };
  const clearFilters = () => { setSearchQuery(""); setStatusFilter("all"); setPriorityFilter("all"); setTypeFilter("all"); setDueFilter("all"); };

  if (isLoading) return <div className="h-full space-y-5 overflow-y-auto p-4 sm:p-6 lg:p-8"><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-12" /><Skeleton className="h-32" /><Skeleton className="h-96 rounded-2xl" /></div>;
  if (error) return <div className="flex h-full items-center justify-center p-6"><SurfacePanel className="max-w-md text-center"><AlertCircle className="mx-auto mb-3 h-8 w-8 text-destructive" /><h1 className="text-lg font-semibold">Unable to load tasks</h1><p className="mt-1 text-sm text-muted-foreground">Please refresh the page and try again.</p></SurfacePanel></div>;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[radial-gradient(circle_at_top,_hsl(var(--surface-2))_0%,_transparent_42%)]">
      <div className="border-b border-border/70 bg-background/95 px-4 py-4 backdrop-blur-xl sm:px-6 lg:px-8">
        <div className="space-y-4">
          <SurfacePanel className="px-4 py-4 md:px-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3"><CheckSquare className="h-6 w-6 shrink-0 text-primary" /><h1 className="truncate text-2xl font-semibold tracking-tight md:text-[2rem]" data-testid="text-tasks-title">My Tasks</h1><span className="text-sm text-muted-foreground">({filteredTasks.length})</span></div>
              <div className="flex shrink-0 items-center gap-2">
                <Button variant={showCompleted ? "ghost" : "secondary"} size="sm" onClick={() => setShowCompleted((value) => !value)} className="gap-1.5 rounded-xl" data-testid="button-toggle-completed">
                  {showCompleted ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}<span className="hidden sm:inline">{showCompleted ? "Hide done" : "Show done"}</span>
                </Button>
                <Button onClick={() => setCreateOpen(true)} disabled={!clientId} className="rounded-xl" data-testid="button-create-portal-task"><Plus className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">New Task</span></Button>
              </div>
            </div>
          </SurfacePanel>
          <DataToolbar searchValue={searchQuery} onSearchChange={setSearchQuery} searchPlaceholder="Search tasks..." filters={filterConfigs} filterValues={{ status: statusFilter, priority: priorityFilter, type: typeFilter, due: dueFilter }} onFilterChange={handleFilterChange} onClearFilters={clearFilters} sortOptions={sortOptions} sortValue={sortBy} onSortChange={setSortBy} className="mb-0 [&>div:first-child]:max-w-none" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="space-y-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
          {taskStats.total > 0 && <div className="border-b border-border/70 px-1 pb-5"><TaskProgressBar stats={taskStats} showMilestones /></div>}
          {filteredTasks.length > 0 ? <>
            <SurfacePanel tone="subtle" className="space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">Scheduled Tasks</h2>
              {sections.scheduled.map((section) => <PortalTaskSection key={section.id} section={section} onTaskSelect={(task) => setSelectedTaskId(task.id)} onToggleComplete={(task) => updateStatus.mutate(task)} updatingTaskId={updateStatus.isPending ? updateStatus.variables?.id || null : null} />)}
            </SurfacePanel>
            <SurfacePanel tone="subtle" className="space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">Personal &amp; Unscheduled</h2>
              {sections.unscheduled.map((section) => <PortalTaskSection key={section.id} section={section} onTaskSelect={(task) => setSelectedTaskId(task.id)} onToggleComplete={(task) => updateStatus.mutate(task)} updatingTaskId={updateStatus.isPending ? updateStatus.variables?.id || null : null} onAddTask={section.id === "personal" ? () => setCreateOpen(true) : undefined} />)}
            </SurfacePanel>
          </> : (
            <SurfacePanel className="flex min-h-72 flex-col items-center justify-center text-center">
              <CheckCircle2 className="mb-4 h-12 w-12 text-primary/60" /><h2 className="text-xl font-semibold">You’re all caught up</h2>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">{clientTasks.length > 0 ? "No tasks match the current view. Show completed tasks or adjust your filters." : "Create a personal task or add work to an open Client project."}</p>
              <div className="mt-4 flex gap-2">{clientTasks.length > 0 && <Button variant="outline" onClick={clearFilters}>Clear filters</Button>}<Button onClick={() => setCreateOpen(true)} disabled={!clientId}><Plus className="mr-2 h-4 w-4" />Add a task</Button></div>
            </SurfacePanel>
          )}
        </div>
      </div>

      {clientId && <PortalTaskCreateDrawer open={createOpen} onOpenChange={setCreateOpen} clientId={clientId} projects={(data?.projects || []).filter((project) => project.status !== "archived")} allowTaskAssociation onCreated={() => queryClient.invalidateQueries({ queryKey: queryKeys.portal.dashboard })} />}
      <PortalTaskDrawer taskId={selectedTaskId} open={!!selectedTaskId} onOpenChange={(open) => { if (!open) setSelectedTaskId(null); }} onUpdated={() => queryClient.invalidateQueries({ queryKey: queryKeys.portal.dashboard })} />
    </div>
  );
}
