import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { getPreviewText, toPlainText } from "@/components/richtext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FolderKanban, Search, Filter, Calendar, Users, CheckSquare, AlertTriangle, Clock, CircleOff, Plus, X, Pin, Link2, Trash2, Loader2, Lock } from "lucide-react";
import { ProjectDrawer } from "@/features/projects";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useWorkspaceRealtime } from "@/lib/realtime";
import { AccessInfoBanner } from "@/components/access-info-banner";
import { PageShell, PageHeader, EmptyState, LoadingState, ErrorState } from "@/components/layout";
import { ReviewQueueCard, type DashboardReviewQueueItem, type DashboardReviewQueueResponse } from "@/components/review-queue-card";
import { applyApprovedReviewToDashboardQueue } from "@/components/reports/review-queue-utils";
import type { Project, Client, Team, ClientDivision } from "@shared/schema";
import { UserRole } from "@shared/schema";
import { format } from "date-fns";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { hasProjectManagerDashboardAccess } from "@shared/roles";
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

interface ProjectWithCounts extends Project {
  openTaskCount?: number;
}

interface ProjectAnalyticsSummary {
  totals: {
    activeProjects: number;
    projectsWithOverdue: number;
    tasksDueToday: number;
    unassignedOpenTasks: number;
    totalOpenTasks: number;
    totalOverdueTasks: number;
  };
  perProject: Array<{
    projectId: string;
    openTasks: number;
    completedTasks: number;
    overdueTasks: number;
    dueToday: number;
    completionPercent: number;
    lastActivityAt: string | null;
  }>;
}

interface ProjectsDashboardProps {
  variant?: "projects" | "pm";
}

export default function ProjectsDashboard({ variant = "projects" }: ProjectsDashboardProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [divisionFilter, setDivisionFilter] = useState<string>("all");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectWithCounts | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const isEmployee = user?.role === UserRole.EMPLOYEE;
  const isPmDashboard = variant === "pm";
  const dashboardTitle = isPmDashboard ? "PM Dashboard" : "Projects";
  const dashboardSubtitle = isPmDashboard
    ? "Monitor delivery, workload, and project risk across the workspace"
    : "View and manage all projects across your workspace";
  const canAccessPmDashboard = hasProjectManagerDashboardAccess(user?.role);
  useWorkspaceRealtime({ enableDashboard: isPmDashboard && canAccessPmDashboard, enableTimer: true });

  const { data: projects, isLoading: projectsLoading, error: projectsError, refetch: refetchProjects } = useQuery<ProjectWithCounts[]>({
    queryKey: ["/api/v1/projects", { includeCounts: true }],
  });

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const { data: teams } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  const { data: clientDivisions = [] } = useQuery<ClientDivision[]>({
    queryKey: ["/api/v1/clients", clientFilter, "divisions"],
    queryFn: () => fetch(`/api/v1/clients/${clientFilter}/divisions`, { credentials: "include" }).then(r => r.json()),
    enabled: clientFilter !== "all",
  });

  const selectedClientHasDivisions = clientDivisions.length > 0;

  const { data: analytics } = useQuery<ProjectAnalyticsSummary>({
    queryKey: ["/api/v1/projects/analytics/summary"],
    staleTime: 30000,
  });

  const {
    data: overdueItems = [],
    isLoading: overdueItemsLoading,
    isError: overdueItemsError,
    refetch: refetchOverdueItems,
  } = useQuery<DashboardReviewQueueItem[]>({
    queryKey: ["/api/dashboard/overdue-tasks"],
    enabled: isPmDashboard && canAccessPmDashboard,
    staleTime: 15000,
    refetchOnWindowFocus: true,
  });

  const createProjectMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/projects", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/projects"] });
      setCreateProjectOpen(false);
      toast({ title: "Project created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create project", variant: "destructive" });
    },
  });

  const handleCreateProject = async (data: any) => {
    await createProjectMutation.mutateAsync(data);
  };

  const updateProjectMutation = useMutation({
    mutationFn: async ({ projectId, data }: { projectId: string; data: any }) => {
      const { memberIds, ...projectData } = data;
      const res = await apiRequest("PATCH", `/api/projects/${projectId}`, projectData);
      const updatedProject = await res.json();
      if (memberIds !== undefined) {
        await apiRequest("PUT", `/api/projects/${projectId}/members`, { memberIds });
      }
      return { projectId, updatedProject };
    },
    onSuccess: ({ projectId, updatedProject }) => {
      queryClient.setQueryData<any[]>(["/api/projects"], (old) => {
        if (!old) return old;
        return old.map((p) =>
          p.id === projectId ? { ...p, ...updatedProject } : p,
        );
      });
      queryClient.setQueryData<any[]>(["/api/v1/projects", { includeCounts: true }], (old) => {
        if (!old) return old;
        return old.map((p: any) =>
          p.id === projectId ? { ...p, ...updatedProject } : p,
        );
      });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "members"] });
      setEditProjectOpen(false);
      setEditingProject(null);
      toast({ title: "Project updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update project", variant: "destructive" });
    },
  });

  const handleUpdateProject = async (data: any) => {
    if (!editingProject) return;
    await updateProjectMutation.mutateAsync({ projectId: editingProject.id, data });
  };

  const approveReviewMutation = useMutation({
    mutationFn: async (item: DashboardReviewQueueItem) => {
      const endpoint =
        item.type === "task" ? `/api/tasks/${item.id}` : `/api/subtasks/${item.id}`;
      await apiRequest("PATCH", endpoint, { status: "in_progress" });
    },
    onMutate: async (item) => {
      await queryClient.cancelQueries({ queryKey: ["/api/tasks/review-queue"] });
      await queryClient.cancelQueries({ queryKey: ["/api/dashboard/review-queue"] });

      const previousReviewQueue =
        queryClient.getQueryData<DashboardReviewQueueItem[]>(["/api/tasks/review-queue"]) || [];
      const previousDashboardQueue =
        queryClient.getQueryData<DashboardReviewQueueResponse>(["/api/dashboard/review-queue"]);
      const approverName =
        [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() || user?.email || "A project manager";
      const now = new Date().toISOString();

      queryClient.setQueryData<DashboardReviewQueueItem[]>(
        ["/api/tasks/review-queue"],
        (current = []) =>
          current.filter(
            (queueItem) => !(queueItem.id === item.id && queueItem.type === item.type),
          ),
      );

      queryClient.setQueryData<DashboardReviewQueueResponse>(
        ["/api/dashboard/review-queue"],
        (current) => {
          return applyApprovedReviewToDashboardQueue(current, item, approverName, now);
        },
      );

      return { previousReviewQueue, previousDashboardQueue };
    },
    onSuccess: (_, item) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/review-queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/review-queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/overdue-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/projects/analytics/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/projects"] });
      if (item.projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", item.projectId, "tasks"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", item.projectId, "sections"] });
      }
      toast({
        title: item.type === "task" ? "Task returned to assignee" : "Subtask returned to assignee",
      });
    },
    onError: (_, __, context) => {
      if (context?.previousReviewQueue) {
        queryClient.setQueryData(["/api/tasks/review-queue"], context.previousReviewQueue);
      }
      if (context?.previousDashboardQueue) {
        queryClient.setQueryData(["/api/dashboard/review-queue"], context.previousDashboardQueue);
      }
      toast({ title: "Failed to approve review", variant: "destructive" });
    },
  });
  const getProjectStats = (projectId: string) => {
    if (!analytics?.perProject) return null;
    return analytics.perProject.find(p => p.projectId === projectId);
  };

  const handleClientFilterChange = (newClientId: string) => {
    setClientFilter(newClientId);
    setDivisionFilter("all");
  };

  const hasActiveFilters = searchQuery || statusFilter !== "active" || clientFilter !== "all" || divisionFilter !== "all" || teamFilter !== "all";

  const handleClearFilters = () => {
    setSearchQuery("");
    setStatusFilter("active");
    setClientFilter("all");
    setDivisionFilter("all");
    setTeamFilter("all");
  };

  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    
    return projects
      .filter((project) => {
        const matchesSearch = !searchQuery || 
          project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          toPlainText(project.description).toLowerCase().includes(searchQuery.toLowerCase());
        
        const isArchived = project.status === "archived";
        const matchesStatus = statusFilter === "all" || 
          (statusFilter === "active" && !isArchived) ||
          (statusFilter === "archived" && isArchived);
        
        const matchesClient = clientFilter === "all" || project.clientId === clientFilter;
        
        const matchesDivision = divisionFilter === "all" || project.divisionId === divisionFilter;
        
        const matchesTeam = teamFilter === "all" || project.teamId === teamFilter;
        
        return matchesSearch && matchesStatus && matchesClient && matchesDivision && matchesTeam;
      })
      .sort((a, b) => {
        const aSticky = a.stickyAt ? new Date(a.stickyAt).getTime() : 0;
        const bSticky = b.stickyAt ? new Date(b.stickyAt).getTime() : 0;
        if (aSticky && !bSticky) return -1;
        if (!aSticky && bSticky) return 1;
        if (aSticky && bSticky) return aSticky - bSticky;
        return 0;
      });
  }, [projects, searchQuery, statusFilter, clientFilter, divisionFilter, teamFilter]);

  const [, navigate] = useLocation();

  const handleRowClick = (project: ProjectWithCounts) => {
    navigate(`/projects/${project.id}`);
  };

  const handleOpenReviewItem = (item: DashboardReviewQueueItem) => {
    if (!item.projectId) return;
    const taskId = item.type === "task" ? item.id : item.taskId;
    navigate(`/projects/${item.projectId}?task=${taskId}`);
  };
  const getClientName = (clientId: string | null) => {
    if (!clientId || !clients) return "-";
    const client = clients.find(c => c.id === clientId);
    return client?.companyName || "-";
  };

  if (isPmDashboard && !canAccessPmDashboard) {
    return (
      <PageShell>
        <ErrorState
          error={new Error("Project Manager access required")}
          title="Access denied"
        />
      </PageShell>
    );
  }

  if (projectsLoading) {
    return (
      <PageShell>
        <PageHeader
          title={dashboardTitle}
          subtitle={dashboardSubtitle}
          icon={<FolderKanban className="h-6 w-6" />}
        />
        <LoadingState type="table" rows={5} />
      </PageShell>
    );
  }

  if (projectsError) {
    return (
      <PageShell>
        <PageHeader
          title={dashboardTitle}
          subtitle={dashboardSubtitle}
          icon={<FolderKanban className="h-6 w-6" />}
        />
        <ErrorState
          error={projectsError as Error}
          title="Failed to load projects"
          onRetry={() => refetchProjects()}
        />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title={dashboardTitle}
        subtitle={dashboardSubtitle}
        icon={<FolderKanban className="h-6 w-6" />}
        actions={
          <Button onClick={() => setCreateProjectOpen(true)} data-testid="button-new-project">
            <Plus className="h-4 w-4 mr-2" />
            New Project
          </Button>
        }
      />

      {analytics?.totals && (
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="border-border/70 bg-card/85 shadow-[var(--shadow-soft)]">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FolderKanban className="h-4 w-4 text-primary" />
                <span className="text-muted-foreground">Active Projects</span>
              </div>
              <div className="mt-2 text-3xl font-semibold tracking-tight">{analytics.totals.activeProjects}</div>
              <p className="mt-1 text-xs text-muted-foreground">Currently moving across the workspace.</p>
            </CardContent>
          </Card>
          <Card className="border-destructive/20 bg-destructive/[0.04] shadow-[var(--shadow-soft)]">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span className="text-muted-foreground">Projects at Risk</span>
              </div>
              <div className="mt-2 text-3xl font-semibold tracking-tight text-destructive">
                {analytics.totals.projectsWithOverdue}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Projects carrying overdue work right now.</p>
            </CardContent>
          </Card>
          <Card className="border-border/70 bg-card/85 shadow-[var(--shadow-soft)]">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Clock className="h-4 w-4 text-orange-500" />
                <span className="text-muted-foreground">Due Today</span>
              </div>
              <div className="mt-2 text-3xl font-semibold tracking-tight">{analytics.totals.tasksDueToday}</div>
              <p className="mt-1 text-xs text-muted-foreground">Tasks that need attention before end of day.</p>
            </CardContent>
          </Card>
          <Card className="border-border/70 bg-card/85 shadow-[var(--shadow-soft)]">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CircleOff className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Unassigned Tasks</span>
              </div>
              <div className="mt-2 text-3xl font-semibold tracking-tight">{analytics.totals.unassignedOpenTasks}</div>
              <p className="mt-1 text-xs text-muted-foreground">Open work without a clear owner yet.</p>
            </CardContent>
          </Card>
        </div>
      )}

      {isPmDashboard && (
        <>
          <ReviewQueueCard
            enabled={canAccessPmDashboard}
            onOpenItem={handleOpenReviewItem}
            onApproveItem={(item) => approveReviewMutation.mutate(item)}
            approvingItemKey={approveReviewMutation.variables ? `${approveReviewMutation.variables.type}-${approveReviewMutation.variables.id}` : null}
          />
          <Card className="mb-8 border-border/70 bg-card/90 shadow-[var(--shadow-soft)]" data-testid="pm-overdue-tasks">
            <CardContent className="pt-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    <h2 className="text-lg font-semibold">Overdue Across Projects</h2>
                    <Badge variant="destructive">{overdueItems.length}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A PM-level view of work that is already past due across active projects.
                  </p>
                </div>
                {overdueItemsError && (
                  <Button variant="outline" size="sm" onClick={() => refetchOverdueItems()}>
                    Retry
                  </Button>
                )}
              </div>

              {overdueItemsLoading ? (
                <LoadingState type="table" rows={4} />
              ) : overdueItemsError ? (
                <ErrorState
                  error={new Error("Failed to load overdue tasks")}
                  title="Could not load overdue tasks"
                  onRetry={() => refetchOverdueItems()}
                />
              ) : overdueItems.length === 0 ? (
                <EmptyState
                  icon={<AlertTriangle className="h-8 w-8" />}
                  title="No overdue work right now"
                  description="Anything that slips past its due date will show up here."
                />
              ) : (
                <div className="space-y-3">
                  {overdueItems.map((item) => (
                    <div
                      key={`overdue-${item.type}-${item.id}`}
                      role="button"
                      tabIndex={0}
                      className="cursor-pointer rounded-2xl border border-destructive/20 bg-gradient-to-r from-destructive/[0.07] via-destructive/[0.03] to-transparent p-4 transition-all hover:border-destructive/30 hover:bg-destructive/[0.08] hover:shadow-[var(--shadow-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => handleOpenReviewItem(item)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleOpenReviewItem(item);
                        }
                      }}
                      data-testid={`pm-overdue-row-${item.type}-${item.id}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-semibold text-foreground">{item.title}</span>
                            <Badge variant="outline">{item.type === "task" ? "Task" : "Subtask"}</Badge>
                            {item.projectName ? <Badge variant="secondary">{item.projectName}</Badge> : null}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            {item.clientName ? <span>{item.clientName}</span> : null}
                            {item.dueDate ? (
                              <span className="text-destructive">
                                Due {format(new Date(item.dueDate), "MMM d, yyyy")}
                              </span>
                            ) : null}
                            {item.assignees.length > 0 ? (
                              <span>
                                Assigned to {item.assignees.map((assignee) => assignee.name).join(", ")}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleOpenReviewItem(item);
                          }}
                        >
                          Open
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
      <div className="mb-6 rounded-2xl border border-border/70 bg-card/90 p-4 shadow-[var(--shadow-soft)]" data-testid="projects-pipeline-bar">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Project Snapshot</h2>
            <p className="mt-1 text-xs text-muted-foreground">Filter the portfolio quickly by active and archived work.</p>
          </div>
          <Badge variant="secondary" className="shrink-0">{projects?.length || 0} total</Badge>
        </div>
        <div className="mb-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-muted">
          {projects && projects.length > 0 && (
            <>
              {(() => {
                const total = projects.length;
                const activeCount = projects.filter(p => p.status !== "archived").length;
                const archivedCount = total - activeCount;
                const activePct = (activeCount / total) * 100;
                const archivedPct = (archivedCount / total) * 100;
                
                return (
                  <>
                    <div 
                      className="bg-primary transition-all duration-300 cursor-pointer" 
                      style={{ width: `${Math.max(activePct, 2)}%` }}
                      onClick={() => setStatusFilter("active")}
                      title={`Active: ${activeCount}`}
                    />
                    <div 
                      className="bg-muted-foreground/30 transition-all duration-300 cursor-pointer" 
                      style={{ width: `${Math.max(archivedPct, 2)}%` }}
                      onClick={() => setStatusFilter("archived")}
                      title={`Archived: ${archivedCount}`}
                    />
                  </>
                );
              })()}
            </>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <Button
            variant={statusFilter === "all" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setStatusFilter("all")}
            className="shrink-0 h-8"
          >
            All
            <span className="ml-1.5 text-xs text-muted-foreground">{projects?.length || 0}</span>
          </Button>
          <Button
            variant={statusFilter === "active" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setStatusFilter("active")}
            className="shrink-0 h-8"
          >
            <span className="h-2 w-2 rounded-full mr-1.5 shrink-0 bg-primary" />
            Active
            <span className="ml-1.5 text-xs text-muted-foreground">
              {projects?.filter(p => p.status !== "archived").length || 0}
            </span>
          </Button>
          <Button
            variant={statusFilter === "archived" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setStatusFilter("archived")}
            className="shrink-0 h-8"
          >
            <span className="h-2 w-2 rounded-full mr-1.5 shrink-0 bg-muted-foreground/30" />
            Archived
            <span className="ml-1.5 text-xs text-muted-foreground">
              {projects?.filter(p => p.status === "archived").length || 0}
            </span>
          </Button>
        </div>
      </div>

      {isEmployee && (
        <AccessInfoBanner variant="projects" className="mb-4" />
      )}

      <div className="mb-6 rounded-2xl border border-border/70 bg-card/90 p-4 shadow-[var(--shadow-soft)] md:p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Portfolio Filters</h2>
            <p className="mt-1 text-xs text-muted-foreground">Search, narrow, and clear filters without leaving the dashboard.</p>
          </div>
          {hasActiveFilters && (
            <Badge variant="outline" className="shrink-0">Filtered</Badge>
          )}
        </div>
        <div className="flex flex-col gap-3 md:gap-4">
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-projects"
          />
        </div>
        
        <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1 scrollbar-hide">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
          
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[100px] md:w-[130px] shrink-0" data-testid="select-status-filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>

          <Select value={clientFilter} onValueChange={handleClientFilterChange}>
            <SelectTrigger className="w-[110px] md:w-[150px] shrink-0" data-testid="select-client-filter">
              <SelectValue placeholder="Client" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clients</SelectItem>
              {clients?.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.displayName || client.companyName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedClientHasDivisions && (
            <Select value={divisionFilter} onValueChange={setDivisionFilter}>
              <SelectTrigger className="w-[110px] md:w-[150px] shrink-0" data-testid="select-division-filter">
                <SelectValue placeholder="Division" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Divisions</SelectItem>
                {clientDivisions.map((division) => (
                  <SelectItem key={division.id} value={division.id}>
                    {division.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={teamFilter} onValueChange={setTeamFilter}>
            <SelectTrigger className="w-[100px] md:w-[130px] shrink-0" data-testid="select-team-filter">
              <SelectValue placeholder="Team" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Teams</SelectItem>
              {teams?.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearFilters}
              className="shrink-0 text-muted-foreground gap-1"
              data-testid="button-clear-filters"
            >
              <X className="h-4 w-4" />
              <span className="hidden md:inline">Clear filters</span>
            </Button>
          )}
        </div>
        </div>
      </div>

      {filteredProjects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="h-12 w-12" />}
          title="No projects found"
          description={
            hasActiveFilters
              ? "Try adjusting your filters"
              : "Create your first project to get started"
          }
          action={
            !hasActiveFilters && (
              <Button onClick={() => setCreateProjectOpen(true)} data-testid="button-add-first-project">
                <Plus className="h-4 w-4 mr-2" />
                Create Project
              </Button>
            )
          }
        />
      ) : (
        <>
          {/* Mobile card view */}
          <div className="md:hidden space-y-3">
            {filteredProjects.map((project) => {
              const stats = getProjectStats(project.id);
              return (
                <Card
                  key={project.id}
                  className={`cursor-pointer border-border/70 bg-card/90 shadow-[var(--shadow-soft)] transition-all hover:-translate-y-0.5 hover:shadow-lg ${project.status === "archived" ? "opacity-60" : ""}`}
                  onClick={() => handleRowClick(project)}
                  data-testid={`card-project-${project.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div
                        className="h-8 w-8 rounded-md flex items-center justify-center text-white text-sm font-medium shrink-0"
                        style={{ backgroundColor: project.status === "archived" ? "#9ca3af" : (project.color || "#3B82F6") }}
                      >
                        {project.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium truncate">{project.name}</h3>
                          {project.visibility === "private" && (
                            <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" data-testid={`icon-private-project-${project.id}`} />
                          )}
                          {project.stickyAt && (
                            <Pin className="h-3 w-3 shrink-0 text-muted-foreground" />
                          )}
                          <Badge variant={project.status === "archived" ? "secondary" : "default"} className="shrink-0">
                            {project.status === "archived" ? "Archived" : "Active"}
                          </Badge>
                        </div>
                        {project.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1 mb-2">{getPreviewText(project.description)}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {getClientName(project.clientId) !== "-" && (
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {getClientName(project.clientId)}
                            </span>
                          )}
                          {stats && (
                            <>
                              <span className="flex items-center gap-1">
                                <CheckSquare className="h-3 w-3" />
                                {stats.openTasks} open
                              </span>
                              {stats.overdueTasks > 0 && (
                                <Badge variant="destructive" className="text-xs px-1.5 py-0">
                                  {stats.overdueTasks} overdue
                                </Badge>
                              )}
                            </>
                          )}
                        </div>
                        {stats && (
                          <div className="mt-2">
                            <Progress value={stats.completionPercent} className="h-1.5" />
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Desktop table view */}
          <div className="hidden md:block border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[250px]">Project Name</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <CheckSquare className="h-3.5 w-3.5" />
                      Open
                    </div>
                  </TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                      Overdue
                    </div>
                  </TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      Today
                    </div>
                  </TableHead>
                  <TableHead className="w-[100px]">Progress</TableHead>
                  <TableHead>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      Activity
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProjects.map((project) => (
                  <TableRow
                    key={project.id}
                    className={`cursor-pointer hover-elevate ${project.status === "archived" ? "opacity-60" : ""}`}
                    onClick={() => handleRowClick(project)}
                    data-testid={`row-project-${project.id}`}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div
                          className="h-3 w-3 rounded-sm shrink-0"
                          style={{ backgroundColor: project.status === "archived" ? "#9ca3af" : (project.color || "#3B82F6") }}
                        />
                        {project.stickyAt && (
                          <Pin className="h-3 w-3 shrink-0 text-muted-foreground" />
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 font-medium truncate">
                            {project.name}
                            {project.visibility === "private" && (
                              <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" data-testid={`icon-private-project-table-${project.id}`} />
                            )}
                          </div>
                          {project.description && (
                            <div className="text-xs text-muted-foreground truncate max-w-[250px]">
                              {getPreviewText(project.description)}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{getClientName(project.clientId)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={project.status === "archived" ? "secondary" : "default"}>
                          {project.status === "archived" ? "Archived" : "Active"}
                        </Badge>
                        {getProjectStats(project.id)?.overdueTasks ? (
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge variant="destructive" className="text-xs">At Risk</Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              {getProjectStats(project.id)?.overdueTasks} overdue tasks
                            </TooltipContent>
                          </Tooltip>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-muted-foreground">
                        {getProjectStats(project.id)?.openTasks ?? project.openTaskCount ?? "-"}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {(getProjectStats(project.id)?.overdueTasks ?? 0) > 0 ? (
                        <Badge variant="destructive" className="text-xs">
                          {getProjectStats(project.id)?.overdueTasks}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {(getProjectStats(project.id)?.dueToday ?? 0) > 0 ? (
                        <Badge variant="secondary" className="text-xs">
                          {getProjectStats(project.id)?.dueToday}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const stats = getProjectStats(project.id);
                        if (!stats) return <span className="text-muted-foreground">-</span>;
                        return (
                          <Tooltip>
                            <TooltipTrigger className="w-full">
                              <div className="flex items-center gap-2">
                                <Progress value={stats.completionPercent} className="h-2 flex-1" />
                                <span className="text-xs text-muted-foreground w-8">
                                  {stats.completionPercent}%
                                </span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              {stats.completedTasks} of {stats.openTasks + stats.completedTasks} tasks completed
                            </TooltipContent>
                          </Tooltip>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const stats = getProjectStats(project.id);
                        if (!stats || !stats.lastActivityAt) return <span className="text-muted-foreground">-</span>;
                        return (
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(stats.lastActivityAt), "MMM d, yyyy")}
                          </span>
                        );
                      })()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <ProjectDrawer
        open={createProjectOpen}
        onOpenChange={setCreateProjectOpen}
        onSubmit={handleCreateProject}
        isLoading={createProjectMutation.isPending}
        mode="create"
      />

      <ProjectDrawer
        open={editProjectOpen}
        onOpenChange={setEditProjectOpen}
        onSubmit={handleUpdateProject}
        project={editingProject}
        isLoading={updateProjectMutation.isPending}
        mode="edit"
      />
    </PageShell>
  );
}
