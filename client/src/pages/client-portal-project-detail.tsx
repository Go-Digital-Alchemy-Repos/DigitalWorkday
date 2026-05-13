import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { RichTextRenderer, getPreviewText } from "@/components/richtext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CheckSquare,
  AlertCircle,
  Calendar,
  ArrowLeft,
  MessageCircle,
  FolderKanban,
  Clock,
  User2,
} from "lucide-react";
import { format, isPast, isToday, isTomorrow } from "date-fns";
import { getTaskStatusLabel, isTaskDoneStatus, normalizeTaskStatus } from "@shared/taskStatus";
import { useBackNavigation } from "@/hooks/use-back-navigation";

interface ProjectDetail {
  id: string;
  name: string;
  description: string | null;
  status: string;
  clientId: string;
  createdAt: string;
}

interface TaskInfo {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  assignmentStatus?: "Assigned" | "Unassigned";
  assigneeCount?: number;
  assignees?: Array<{
    id: string;
    name: string | null;
    email: string;
  }>;
  assigneeNames?: string[];
}

interface ProjectData {
  id: string;
  name: string;
  description: string | null;
  status: string;
  clientId: string;
  clientName: string | null;
  createdAt: string;
  tasks: TaskInfo[];
  taskCount: number;
  completedCount: number;
}

function getStatusColor(status: string) {
  switch (normalizeTaskStatus(status) || status) {
    case "done":
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "in_progress":
    case "active":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    case "on_hold":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "blocked":
    case "cancelled":
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function getPriorityColor(priority: string) {
  switch (priority) {
    case "urgent":
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    case "high":
      return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
    case "medium":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "low":
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function formatDueDate(dateStr: string | null) {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  return format(date, "MMM d, yyyy");
}

function getDueDateClass(dateStr: string | null) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (isPast(date) && !isToday(date)) return "text-destructive";
  if (isToday(date)) return "text-orange-600 dark:text-orange-400";
  return "text-muted-foreground";
}

function formatAssignees(task: TaskInfo) {
  const names = task.assigneeNames?.length
    ? task.assigneeNames
    : task.assignees?.map((assignee) => assignee.name || assignee.email).filter(Boolean);

  if (!names || names.length === 0) {
    return "Unassigned";
  }

  if (names.length <= 2) {
    return names.join(", ");
  }

  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

export default function ClientPortalProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const goBack = useBackNavigation("/portal/projects");

  const { data, isLoading, error } = useQuery<ProjectData>({
    queryKey: ["/api/client-portal/projects", id],
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="p-6 overflow-y-auto h-full">
        <div className="mb-6">
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Error Loading Project
            </CardTitle>
            <CardDescription>
              There was a problem loading the project. You may not have access to this project.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={goBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Projects
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const project = data;
  const tasks = data.tasks || [];
  const completedTasks = data.completedCount || tasks.filter((t) => isTaskDoneStatus(t.status)).length;
  const totalTasks = data.taskCount || tasks.length;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const todoTasks = tasks.filter((t) => t.status === "todo");
  const inProgressTasks = tasks.filter((t) => t.status === "in_progress");
  const completedTasksList = tasks.filter((t) => isTaskDoneStatus(t.status));

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="mb-6">
        <Button variant="ghost" size="sm" onClick={goBack} className="mb-2" data-testid="link-back-to-projects">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Projects
        </Button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-project-name">
              <FolderKanban className="h-6 w-6" />
              {project.name}
            </h1>
            {project.description && (
              <RichTextRenderer
                value={project.description}
                className="text-muted-foreground mt-1 [&>*]:m-0"
                data-testid="text-project-description"
              />
            )}
          </div>
          <Badge variant="outline" className={getStatusColor(project.status)}>
            {project.status.replace(/_/g, ' ')}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="font-medium">Total Tasks</CardTitle>
            <CheckSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total-tasks">
              {totalTasks}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="font-medium">Completed</CardTitle>
            <CheckSquare className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-completed-tasks">
              {completedTasks}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="font-medium">Progress</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-progress">
              {completionRate}%
            </div>
            <div className="mt-1 h-2 bg-secondary rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all"
                style={{ width: `${completionRate}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all" data-testid="tab-all-tasks">
            All ({tasks.length})
          </TabsTrigger>
          <TabsTrigger value="todo" data-testid="tab-todo-tasks">
            To Do ({todoTasks.length})
          </TabsTrigger>
          <TabsTrigger value="in_progress" data-testid="tab-in-progress-tasks">
            In Progress ({inProgressTasks.length})
          </TabsTrigger>
          <TabsTrigger value="completed" data-testid="tab-completed-tasks">
            Completed ({completedTasksList.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-2">
          <TaskList tasks={tasks} />
        </TabsContent>

        <TabsContent value="todo" className="space-y-2">
          <TaskList tasks={todoTasks} emptyMessage="No tasks to do" />
        </TabsContent>

        <TabsContent value="in_progress" className="space-y-2">
          <TaskList tasks={inProgressTasks} emptyMessage="No tasks in progress" />
        </TabsContent>

        <TabsContent value="completed" className="space-y-2">
          <TaskList tasks={completedTasksList} emptyMessage="No completed tasks" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TaskList({ tasks, emptyMessage = "No tasks" }: { tasks: TaskInfo[]; emptyMessage?: string }) {
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
        <CheckSquare className="h-8 w-8 mb-2 opacity-50" />
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <Card key={task.id} data-testid={`task-card-${task.id}`}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{task.title}</div>
                {task.description && (
                  <div className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                    {getPreviewText(task.description as string)}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <Badge variant="outline" className={getPriorityColor(task.priority)}>
                    {task.priority}
                  </Badge>
                  <Badge variant="outline" className={getStatusColor(task.status)}>
                    {getTaskStatusLabel(task.status)}
                  </Badge>
                  <Badge variant="secondary">
                    <User2 className="h-3 w-3 mr-1" />
                    {formatAssignees(task)}
                  </Badge>
                </div>
              </div>
              {task.dueDate && (
                <div className={`flex items-center gap-1 text-sm whitespace-nowrap ${getDueDateClass(task.dueDate)}`}>
                  <Calendar className="h-3 w-3" />
                  {formatDueDate(task.dueDate)}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
