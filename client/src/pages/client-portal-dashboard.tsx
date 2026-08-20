import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { getPreviewText } from "@/components/richtext";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  FolderKanban,
  CheckSquare,
  Clock,
  AlertCircle,
  ArrowRight,
  Calendar,
  TrendingUp,
  FileText,
  MessageSquare,
  ClipboardCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  formatDistanceToNow,
  format,
  isToday,
  isTomorrow,
  isPast,
} from "date-fns";

interface ClientInfo {
  id: string;
  companyName: string;
  displayName: string | null;
  accessLevel: string;
}

interface ProjectInfo {
  id: string;
  name: string;
  description: string | null;
  status: string;
  clientId: string;
}

interface TaskInfo {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  projectId: string;
  projectName: string;
}

interface DashboardStats {
  totalProjects: number;
  activeProjects: number;
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
}

interface DashboardData {
  clients: ClientInfo[];
  projects: ProjectInfo[];
  tasks: TaskInfo[];
  upcomingDeadlines: TaskInfo[];
  stats: DashboardStats;
}

const dashboardPanelClass =
  "rounded-2xl border-border/70 bg-card/90 shadow-[var(--shadow-soft)]";
const dashboardMetricClass = `${dashboardPanelClass} transition-all hover:-translate-y-0.5 hover:shadow-lg`;
const projectAccentClasses = [
  "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
];

function getStatusColor(status: string) {
  switch (status) {
    case "completed":
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "in_progress":
    case "active":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    case "on_hold":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
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

function formatDueDate(dateStr: string) {
  const date = new Date(dateStr);
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  if (isPast(date)) return formatDistanceToNow(date, { addSuffix: true });
  return format(date, "MMM d");
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
    </div>
  );
}

export default function ClientPortalDashboard() {
  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: queryKeys.portal.dashboard,
  });

  if (isLoading) {
    return (
      <div className="flex h-full flex-col overflow-auto bg-[radial-gradient(circle_at_top,_hsl(var(--surface-2))_0%,_transparent_40%)]">
        <div className="border-b border-border/70 bg-background/95 backdrop-blur-xl">
          <div className="px-4 py-4 sm:px-5 md:py-5 lg:px-8">
            <div className={`${dashboardPanelClass} px-4 py-4 md:px-5`}>
              <h1 className="text-2xl font-semibold tracking-tight md:text-[2rem]">
                Project Dashboard
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Welcome to your client portal
              </p>
            </div>
          </div>
        </div>
        <div className="flex-1 px-4 py-5 sm:px-5 md:py-6 lg:px-8">
          <DashboardSkeleton />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Error Loading Dashboard
            </CardTitle>
            <CardDescription>
              There was a problem loading your dashboard data. Please try again.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const stats = data?.stats || {
    totalProjects: 0,
    activeProjects: 0,
    totalTasks: 0,
    completedTasks: 0,
    overdueTasks: 0,
  };

  const completionRate =
    stats.totalTasks > 0
      ? Math.round((stats.completedTasks / stats.totalTasks) * 100)
      : 0;

  return (
    <div className="flex h-full flex-col overflow-auto bg-[radial-gradient(circle_at_top,_hsl(var(--surface-2))_0%,_transparent_40%)]">
      <div className="sticky top-0 z-10 border-b border-border/70 bg-background/95 backdrop-blur-xl">
        <div className="px-4 py-4 sm:px-5 md:py-5 lg:px-8">
          <div className={`${dashboardPanelClass} px-4 py-4 md:px-5`}>
            <h1
              className="text-2xl font-semibold tracking-tight md:text-[2rem]"
              data-testid="text-dashboard-title"
            >
              Project Dashboard
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Welcome to your client portal. Track your projects and tasks here.
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-5 px-4 py-5 sm:px-5 md:space-y-6 md:py-6 lg:px-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card
            className={`${dashboardMetricClass} border-amber-200/70 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/10`}
          >
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 px-4 pb-2 pt-4 md:px-6 md:pt-6">
              <CardTitle className="text-sm font-medium">
                Active Projects
              </CardTitle>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300">
                <FolderKanban className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 md:px-6 md:pb-6">
              <div
                className="text-3xl font-semibold tracking-tight text-amber-700 dark:text-amber-300"
                data-testid="stat-active-projects"
              >
                {stats.activeProjects}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                of {stats.totalProjects} total projects
              </p>
            </CardContent>
          </Card>

          <Card
            className={`${dashboardMetricClass} border-emerald-200/70 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/10`}
          >
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 px-4 pb-2 pt-4 md:px-6 md:pt-6">
              <CardTitle className="text-sm font-medium">Open Tasks</CardTitle>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300">
                <CheckSquare className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 md:px-6 md:pb-6">
              <div
                className="text-3xl font-semibold tracking-tight text-emerald-700 dark:text-emerald-300"
                data-testid="stat-open-tasks"
              >
                {stats.totalTasks - stats.completedTasks}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {stats.completedTasks} completed
              </p>
            </CardContent>
          </Card>

          <Card
            className={`${dashboardMetricClass} border-sky-200/70 bg-sky-50/40 dark:border-sky-800 dark:bg-sky-950/10`}
          >
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 px-4 pb-2 pt-4 md:px-6 md:pt-6">
              <CardTitle className="text-sm font-medium">
                Completion Rate
              </CardTitle>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 text-sky-600 dark:bg-sky-950/50 dark:text-sky-300">
                <TrendingUp className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 md:px-6 md:pb-6">
              <div
                className="text-3xl font-semibold tracking-tight text-sky-700 dark:text-sky-300"
                data-testid="stat-completion-rate"
              >
                {completionRate}%
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-sky-100 dark:bg-sky-950/50">
                <div
                  className="h-full rounded-full bg-sky-500 transition-all"
                  style={{ width: `${completionRate}%` }}
                />
              </div>
            </CardContent>
          </Card>

          <Card
            className={`${dashboardMetricClass} border-rose-200/70 bg-rose-50/40 dark:border-rose-800 dark:bg-rose-950/10`}
          >
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 px-4 pb-2 pt-4 md:px-6 md:pt-6">
              <CardTitle className="text-sm font-medium">
                Overdue Tasks
              </CardTitle>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300">
                <Clock className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 md:px-6 md:pb-6">
              <div
                className="text-3xl font-semibold tracking-tight text-rose-700 dark:text-rose-300"
                data-testid="stat-overdue-tasks"
              >
                {stats.overdueTasks}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {stats.overdueTasks > 0 ? "Needs attention" : "All on track"}
              </p>
            </CardContent>
          </Card>
        </div>

        {stats.totalProjects === 0 && stats.totalTasks === 0 && (
          <div className="mb-6 animate-tab-in">
            <Card className={dashboardPanelClass}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Getting Started</CardTitle>
                <CardDescription>
                  Here's what you can do in your portal
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Link href="/portal/projects">
                    <div
                      className="flex flex-col items-center gap-2 p-4 rounded-md hover-elevate text-center cursor-pointer"
                      data-testid="guide-card-projects"
                    >
                      <FolderKanban className="h-6 w-6 text-muted-foreground" />
                      <span className="font-medium">View Projects</span>
                      <span className="text-xs text-muted-foreground">
                        Track progress on your active projects
                      </span>
                    </div>
                  </Link>
                  <Link href="/portal/approvals">
                    <div
                      className="flex flex-col items-center gap-2 p-4 rounded-md hover-elevate text-center cursor-pointer"
                      data-testid="guide-card-approvals"
                    >
                      <ClipboardCheck className="h-6 w-6 text-muted-foreground" />
                      <span className="font-medium">Approvals</span>
                      <span className="text-xs text-muted-foreground">
                        Review and approve deliverables
                      </span>
                    </div>
                  </Link>
                  <Link href="/portal/messages">
                    <div
                      className="flex flex-col items-center gap-2 p-4 rounded-md hover-elevate text-center cursor-pointer"
                      data-testid="guide-card-messages"
                    >
                      <MessageSquare className="h-6 w-6 text-muted-foreground" />
                      <span className="font-medium">Messages</span>
                      <span className="text-xs text-muted-foreground">
                        Communicate with your team
                      </span>
                    </div>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className={dashboardPanelClass}>
            <CardHeader className="flex flex-row items-center justify-between gap-3 px-5 pt-5 md:px-6 md:pt-6">
              <div>
                <CardTitle>Upcoming Deadlines</CardTitle>
                <CardDescription>Tasks due in the next 14 days</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/portal/tasks" data-testid="link-view-all-tasks">
                  View All <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="px-5 pb-5 md:px-6 md:pb-6">
              {data?.upcomingDeadlines && data.upcomingDeadlines.length > 0 ? (
                <div className="space-y-3">
                  {data.upcomingDeadlines.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-start justify-between rounded-xl border border-border/70 bg-background/70 p-4 shadow-[var(--shadow-soft)]"
                      data-testid={`deadline-task-${task.id}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{task.title}</div>
                        <div className="text-sm text-muted-foreground truncate">
                          {task.projectName}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge
                            variant="outline"
                            className={getPriorityColor(task.priority)}
                          >
                            {task.priority}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={getStatusColor(task.status)}
                          >
                            {task.status.replace(/_/g, " ")}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground ml-4 whitespace-nowrap">
                        <Calendar className="h-3 w-3" />
                        {task.dueDate ? formatDueDate(task.dueDate) : "No date"}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-500 dark:bg-sky-950/40 dark:text-sky-300">
                    <Calendar className="h-6 w-6" />
                  </div>
                  <p>No upcoming deadlines</p>
                  <p className="text-sm">All tasks are on schedule</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className={dashboardPanelClass}>
            <CardHeader className="flex flex-row items-center justify-between gap-3 px-5 pt-5 md:px-6 md:pt-6">
              <div>
                <CardTitle>Recent Projects</CardTitle>
                <CardDescription>Your active projects</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link
                  href="/portal/projects"
                  data-testid="link-view-all-projects"
                >
                  View All <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="px-5 pb-5 md:px-6 md:pb-6">
              {data?.projects && data.projects.length > 0 ? (
                <div className="space-y-2.5">
                  {data.projects.slice(0, 5).map((project, index) => (
                    <Link
                      key={project.id}
                      href={`/portal/projects/${project.id}`}
                      className="block"
                      data-testid={`project-card-${project.id}`}
                    >
                      <div className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/70 p-4 shadow-[var(--shadow-soft)] transition-all hover:-translate-y-0.5 hover:shadow-md">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-semibold ${projectAccentClasses[index % projectAccentClasses.length]}`}
                          >
                            {project.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">
                              {project.name}
                            </div>
                            {project.description && (
                              <div className="text-sm text-muted-foreground truncate">
                                {getPreviewText(project.description)}
                              </div>
                            )}
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={getStatusColor(project.status)}
                        >
                          {project.status.replace(/_/g, " ")}
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                  <FolderKanban className="h-8 w-8 mb-2 opacity-50" />
                  <p>No projects yet</p>
                  <p className="text-sm">
                    Projects will appear here when created
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
