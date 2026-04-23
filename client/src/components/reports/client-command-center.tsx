import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, Building2, ShieldAlert, Activity, CheckSquare, Clock, TrendingUp, Users, HeartPulse, ArrowUpDown, ChevronUp, ChevronDown, Sparkles, Info, Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReportCommandCenterLayout, buildDateParams } from "./report-command-center-layout";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
import { ForecastSnapshotsTab } from "./forecast-snapshots-tab";
import { MobileTabSelect } from "./mobile-tab-select";
import { getClientReportDrilldownPath, getClientReportPath } from "./report-paths";
import { ReportEmptyState } from "./report-empty-state";

function formatComparisonSub(current: number, prior: number, suffix = "") {
  const delta = Math.round((current - prior) * 10) / 10;
  if (delta === 0) return "Flat vs previous period";
  const direction = delta > 0 ? "Up" : "Down";
  const value = Math.abs(delta);
  const display = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
  return `${direction} ${display}${suffix} vs previous period`;
}

interface MetricCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  color: string;
}

function MetricCard({ label, value, sub, icon, color }: MetricCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", color)}>
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{label}</p>
            <p className="text-xl font-bold leading-none mt-0.5">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function relativeDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "1 day ago";
  return `${diff} days ago`;
}

type ProjectStatusFilter = "all" | "active" | "completed" | "on_hold" | "archived";

const PROJECT_STATUS_OPTIONS: Array<{ value: ProjectStatusFilter; label: string }> = [
  { value: "all", label: "All Project Statuses" },
  { value: "active", label: "Active Projects" },
  { value: "completed", label: "Completed Projects" },
  { value: "on_hold", label: "On Hold Projects" },
  { value: "archived", label: "Archived Projects" },
];

function buildProjectStatusParams(
  rangeDays: number,
  projectStatus: ProjectStatusFilter,
  extra?: Record<string, string>,
): string {
  const params = { ...(extra ?? {}) };
  if (projectStatus !== "all") {
    params.status = projectStatus;
  }
  return buildDateParams(rangeDays, params);
}

interface ClientOverviewItem {
  clientId: string;
  companyName: string;
  activeProjects: number;
  openTasks: number;
  overdueTasks: number;
  totalHours: number;
  billableHours: number;
  lastActivityDate: string | null;
  engagementScore: number;
  completedInRange: number;
}

function OverviewTab({ rangeDays, projectStatus }: { rangeDays: number; projectStatus: ProjectStatusFilter }) {
  const { data, isLoading } = useQuery<{
    clients: ClientOverviewItem[];
    summary?: {
      current: {
        totalClients: number;
        totalOpenTasks: number;
        totalHours: number;
        avgEngagement: number;
      };
      prior: {
        totalClients: number;
        totalOpenTasks: number;
        totalHours: number;
        avgEngagement: number;
      };
    };
    pagination: { total: number; limit: number; offset: number };
    range: { startDate: string; endDate: string };
  }>({
    queryKey: ["/api/reports/v2/client/overview", rangeDays, projectStatus],
    queryFn: async () => {
      const res = await fetch(`/api/reports/v2/client/overview?${buildProjectStatusParams(rangeDays, projectStatus, { limit: "100" })}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  const totals = useMemo(() => {
    if (data?.summary) {
      return {
        totalClients: data.summary.current.totalClients,
        totalOpenTasks: data.summary.current.totalOpenTasks,
        totalHours: data.summary.current.totalHours,
        avgEngagement: data.summary.current.avgEngagement,
        prior: data.summary.prior,
      };
    }
    if (!data?.clients) return null;
    const clients = data.clients;
    return {
      totalClients: clients.length,
      totalOpenTasks: clients.reduce((s, c) => s + c.openTasks, 0),
      totalHours: Math.round(clients.reduce((s, c) => s + c.totalHours, 0) * 10) / 10,
      avgEngagement: clients.length > 0 ? Math.round(clients.reduce((s, c) => s + c.engagementScore, 0) / clients.length) : 0,
      prior: null,
    };
  }, [data?.clients, data?.summary]);

  const exceptionRows = useMemo(() => {
    if (!data?.clients) return { atRisk: [], inactive: [] } as const;
    const atRisk = [...data.clients]
      .filter((c) => c.overdueTasks > 0 || c.engagementScore < 50)
      .sort((a, b) => {
        const overdueDelta = b.overdueTasks - a.overdueTasks;
        if (overdueDelta !== 0) return overdueDelta;
        return a.engagementScore - b.engagementScore;
      })
      .slice(0, 5);
    const inactive = [...data.clients]
      .filter((c) => {
        if (!c.lastActivityDate) return true;
        const inactivityDays = Math.floor((Date.now() - new Date(c.lastActivityDate).getTime()) / 86400000);
        return inactivityDays >= 14;
      })
      .sort((a, b) => {
        const aDays = a.lastActivityDate ? Math.floor((Date.now() - new Date(a.lastActivityDate).getTime()) / 86400000) : Number.MAX_SAFE_INTEGER;
        const bDays = b.lastActivityDate ? Math.floor((Date.now() - new Date(b.lastActivityDate).getTime()) / 86400000) : Number.MAX_SAFE_INTEGER;
        return bDays - aDays;
      })
      .slice(0, 5);
    return { atRisk, inactive };
  }, [data?.clients]);

  if (isLoading) return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
    </div>
  );

  const range = `${rangeDays}d`;

  function engagementBadgeVariant(score: number): "default" | "secondary" | "destructive" {
    if (score >= 70) return "default";
    if (score >= 40) return "secondary";
    return "destructive";
  }

  return (
    <div className="space-y-4">
      {totals && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard
            label="Total Clients"
            value={totals.totalClients}
            sub={totals.prior ? formatComparisonSub(totals.totalClients, totals.prior.totalClients) : undefined}
            icon={<Users className="h-4 w-4 text-white" />}
            color="bg-blue-500"
          />
          <MetricCard
            label="Open Tasks"
            value={totals.totalOpenTasks}
            sub={totals.prior ? formatComparisonSub(totals.totalOpenTasks, totals.prior.totalOpenTasks) : undefined}
            icon={<CheckSquare className="h-4 w-4 text-white" />}
            color="bg-violet-500"
          />
          <MetricCard
            label="Hours Tracked"
            value={`${totals.totalHours}h`}
            sub={totals.prior ? formatComparisonSub(totals.totalHours, totals.prior.totalHours, "h") : undefined}
            icon={<Clock className="h-4 w-4 text-white" />}
            color="bg-green-500"
          />
          <MetricCard
            label="Avg Engagement"
            value={`${totals.avgEngagement}%`}
            sub={totals.prior ? formatComparisonSub(totals.avgEngagement, totals.prior.avgEngagement, "%") : undefined}
            icon={<TrendingUp className="h-4 w-4 text-white" />}
            color="bg-orange-500"
          />
        </div>
      )}
      {(exceptionRows.atRisk.length > 0 || exceptionRows.inactive.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                At-Risk Clients
              </CardTitle>
              <CardDescription className="text-xs">Clients with overdue work or low engagement</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {exceptionRows.atRisk.length === 0 ? (
                <p className="text-sm text-muted-foreground">No at-risk clients right now.</p>
              ) : exceptionRows.atRisk.map((c) => (
                <Link
                  key={c.clientId}
                  href={getClientReportDrilldownPath(window.location.pathname, c.clientId, { range, section: "risk" })}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2 hover:bg-muted/60"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{c.companyName}</p>
                    <p className="text-xs text-muted-foreground">{c.overdueTasks} overdue, {c.openTasks} open tasks</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-red-600 dark:text-red-400">{c.engagementScore}%</p>
                    <p className="text-xs text-muted-foreground">engagement</p>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4 text-amber-500" />
                No Recent Activity
              </CardTitle>
              <CardDescription className="text-xs">Clients with stale recent activity windows</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {exceptionRows.inactive.length === 0 ? (
                <p className="text-sm text-muted-foreground">No inactive clients in this range.</p>
              ) : exceptionRows.inactive.map((c) => (
                <Link
                  key={c.clientId}
                  href={getClientReportDrilldownPath(window.location.pathname, c.clientId, { range, section: "risk" })}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2 hover:bg-muted/60"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{c.companyName}</p>
                    <p className="text-xs text-muted-foreground">Last activity {relativeDate(c.lastActivityDate)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">{c.overdueTasks}</p>
                    <p className="text-xs text-muted-foreground">overdue</p>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
      {data?.clients && data.clients.length > 0 && (
        <div className="md:hidden space-y-3">
          {data.clients.map((c) => (
            <Card key={c.clientId} data-testid={`mobile-card-client-${c.clientId}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <Link href={getClientReportPath(window.location.pathname, c.clientId)} className="font-semibold text-sm hover:underline text-primary cursor-pointer" data-testid={`link-client-mobile-${c.clientId}`}>{c.companyName}</Link>
                  <Badge variant={engagementBadgeVariant(c.engagementScore)} data-testid={`engagement-mobile-${c.clientId}`}>
                    {c.engagementScore}%
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>Active Projects: <Link href={getClientReportDrilldownPath(window.location.pathname, c.clientId, { range, section: "projects" })} className="text-foreground font-medium hover:underline">{c.activeProjects}</Link></span>
                  <span>Open Tasks: <Link href={getClientReportDrilldownPath(window.location.pathname, c.clientId, { range, section: "workload" })} className="text-foreground font-medium hover:underline">{c.openTasks}</Link></span>
                  <span>Overdue: <Link href={getClientReportDrilldownPath(window.location.pathname, c.clientId, { range, section: "sla" })} className={cn("font-medium hover:underline", c.overdueTasks > 0 ? "text-red-600 dark:text-red-400" : "text-foreground")}>{c.overdueTasks}</Link></span>
                  <span>Hours: <Link href={getClientReportDrilldownPath(window.location.pathname, c.clientId, { range, section: "time" })} className="text-foreground font-medium hover:underline">{c.totalHours}h</Link></span>
                  <span className="col-span-2">Last Activity: <span className="text-foreground font-medium">{relativeDate(c.lastActivityDate)}</span></span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <div className="hidden md:block">
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Active Projects</TableHead>
                    <TableHead>Open Tasks</TableHead>
                    <TableHead>Overdue</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Last Activity</TableHead>
                    <TableHead>Engagement</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.clients.map((c) => (
                    <TableRow key={c.clientId} data-testid={`row-client-${c.clientId}`}>
                      <TableCell className="font-medium text-sm"><Link href={getClientReportPath(window.location.pathname, c.clientId)} className="hover:underline text-primary cursor-pointer" data-testid={`link-client-overview-${c.clientId}`}>{c.companyName}</Link></TableCell>
                      <TableCell className="text-sm">
                        <Link href={getClientReportDrilldownPath(window.location.pathname, c.clientId, { range, section: "projects" })} className="text-primary hover:underline">
                          {c.activeProjects}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">
                        <Link href={getClientReportDrilldownPath(window.location.pathname, c.clientId, { range, section: "workload" })} className="text-primary hover:underline">
                          {c.openTasks}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={getClientReportDrilldownPath(window.location.pathname, c.clientId, { range, section: "sla" })} className={cn("text-sm font-medium hover:underline", c.overdueTasks > 0 ? "text-red-600 dark:text-red-400" : "text-primary")}>
                          {c.overdueTasks}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">
                        <Link href={getClientReportDrilldownPath(window.location.pathname, c.clientId, { range, section: "time" })} className="text-primary hover:underline">
                          {c.totalHours}h
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{relativeDate(c.lastActivityDate)}</TableCell>
                      <TableCell>
                        <Link href={getClientReportDrilldownPath(window.location.pathname, c.clientId, { range, section: "health-index" })}>
                          <Badge variant={engagementBadgeVariant(c.engagementScore)} data-testid={`engagement-${c.clientId}`} className="cursor-pointer hover:opacity-90">
                            {c.engagementScore}%
                          </Badge>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                  {data?.clients.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">No clients found</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface ClientActivityItem {
  clientId: string;
  companyName: string;
  tasksCreatedInRange: number;
  timeLoggedInRange: number;
  commentsInRange: number;
  inactivityDays: number;
}

function ActivityTab({ rangeDays, projectStatus }: { rangeDays: number; projectStatus: ProjectStatusFilter }) {
  const { data, isLoading } = useQuery<{ clients: ClientActivityItem[]; pagination: { total: number; limit: number; offset: number }; range: { startDate: string; endDate: string } }>({
    queryKey: ["/api/reports/v2/client/activity", rangeDays, projectStatus],
    queryFn: async () => {
      const res = await fetch(`/api/reports/v2/client/activity?${buildProjectStatusParams(rangeDays, projectStatus, { limit: "100" })}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  if (isLoading) return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
    </div>
  );

  const range = `${rangeDays}d`;

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Tasks Created</TableHead>
                <TableHead>Hours Logged</TableHead>
                <TableHead>Comments</TableHead>
                <TableHead>Inactivity Days</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.clients.map((c) => (
                <TableRow key={c.clientId} data-testid={`row-activity-${c.clientId}`}>
                  <TableCell className="font-medium text-sm"><Link href={getClientReportPath(window.location.pathname, c.clientId)} className="hover:underline text-primary cursor-pointer" data-testid={`link-client-activity-${c.clientId}`}>{c.companyName}</Link></TableCell>
                  <TableCell className="text-sm">
                    <Link href={getClientReportDrilldownPath(window.location.pathname, c.clientId, { range, section: "workload" })} className="text-primary hover:underline">
                      {c.tasksCreatedInRange}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">
                    <Link href={getClientReportDrilldownPath(window.location.pathname, c.clientId, { range, section: "time" })} className="text-primary hover:underline">
                      {Math.round(c.timeLoggedInRange * 10) / 10}h
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">
                    <Link href={getClientReportDrilldownPath(window.location.pathname, c.clientId, { range, section: "risk" })} className="text-primary hover:underline">
                      {c.commentsInRange}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={getClientReportDrilldownPath(window.location.pathname, c.clientId, { range, section: "risk" })} className={cn("text-sm font-medium hover:underline", c.inactivityDays > 14 ? "text-red-600 dark:text-red-400" : "text-primary")}>
                      {c.inactivityDays}d
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {data?.clients.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No activity data</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

interface ClientTimeItem {
  clientId: string;
  companyName: string;
  totalHours: number;
  billableHours: number;
  nonBillableHours: number;
  estimatedHours: number;
  varianceHours: number;
}

function TimeTab({ rangeDays, projectStatus }: { rangeDays: number; projectStatus: ProjectStatusFilter }) {
  const { data, isLoading } = useQuery<{ clients: ClientTimeItem[]; pagination: { total: number; limit: number; offset: number }; range: { startDate: string; endDate: string } }>({
    queryKey: ["/api/reports/v2/client/time", rangeDays, projectStatus],
    queryFn: async () => {
      const res = await fetch(`/api/reports/v2/client/time?${buildProjectStatusParams(rangeDays, projectStatus, { limit: "100" })}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  if (isLoading) return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
    </div>
  );

  const range = `${rangeDays}d`;

  function formatVariance(v: number) {
    if (v === 0) return "0h";
    return v > 0 ? `+${v.toFixed(1)}h` : `${v.toFixed(1)}h`;
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Total Hrs</TableHead>
                <TableHead>Billable</TableHead>
                <TableHead>Non-Bill</TableHead>
                <TableHead>Estimated</TableHead>
                <TableHead>Variance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.clients.map((c) => (
                <TableRow key={c.clientId} data-testid={`row-time-${c.clientId}`}>
                  <TableCell className="font-medium text-sm"><Link href={getClientReportPath(window.location.pathname, c.clientId)} className="hover:underline text-primary cursor-pointer" data-testid={`link-client-time-${c.clientId}`}>{c.companyName}</Link></TableCell>
                  <TableCell className="text-sm"><Link href={getClientReportDrilldownPath(window.location.pathname, c.clientId, { range, section: "time" })} className="text-primary hover:underline">{c.totalHours}h</Link></TableCell>
                  <TableCell className="text-sm"><Link href={getClientReportDrilldownPath(window.location.pathname, c.clientId, { range, section: "time" })} className="text-primary hover:underline">{c.billableHours}h</Link></TableCell>
                  <TableCell className="text-sm"><Link href={getClientReportDrilldownPath(window.location.pathname, c.clientId, { range, section: "time" })} className="text-primary hover:underline">{c.nonBillableHours}h</Link></TableCell>
                  <TableCell className="text-sm"><Link href={getClientReportDrilldownPath(window.location.pathname, c.clientId, { range, section: "time" })} className="text-primary hover:underline">{c.estimatedHours}h</Link></TableCell>
                  <TableCell>
                    <Link href={getClientReportDrilldownPath(window.location.pathname, c.clientId, { range, section: "time" })} className={cn("text-sm font-medium hover:underline", c.varianceHours > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400")}>
                      {formatVariance(c.varianceHours)}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {data?.clients.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No time data</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

interface ClientTaskItem {
  clientId: string;
  companyName: string;
  openTaskCount: number;
  overdueCount: number;
  completedInRange: number;
  agingUnder7: number;
  aging7To14: number;
  aging14To30: number;
  agingOver30: number;
}

function TasksTab({ rangeDays, projectStatus }: { rangeDays: number; projectStatus: ProjectStatusFilter }) {
  const { data, isLoading } = useQuery<{ clients: ClientTaskItem[]; pagination: { total: number; limit: number; offset: number }; range: { startDate: string; endDate: string } }>({
    queryKey: ["/api/reports/v2/client/tasks", rangeDays, projectStatus],
    queryFn: async () => {
      const res = await fetch(`/api/reports/v2/client/tasks?${buildProjectStatusParams(rangeDays, projectStatus, { limit: "100" })}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  if (isLoading) return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
    </div>
  );

  const range = `${rangeDays}d`;

  function AgingBar({ item }: { item: ClientTaskItem }) {
    const total = item.agingUnder7 + item.aging7To14 + item.aging14To30 + item.agingOver30;
    if (total === 0) return <span className="text-xs text-muted-foreground">—</span>;
    const pct = (n: number) => Math.round((n / total) * 100);
    return (
      <div className="flex h-3 rounded-sm overflow-hidden w-[120px]" title={`<7d: ${item.agingUnder7}, 7-14d: ${item.aging7To14}, 14-30d: ${item.aging14To30}, >30d: ${item.agingOver30}`}>
        {item.agingUnder7 > 0 && <div className="bg-green-500" style={{ width: `${pct(item.agingUnder7)}%` }} />}
        {item.aging7To14 > 0 && <div className="bg-yellow-500" style={{ width: `${pct(item.aging7To14)}%` }} />}
        {item.aging14To30 > 0 && <div className="bg-orange-500" style={{ width: `${pct(item.aging14To30)}%` }} />}
        {item.agingOver30 > 0 && <div className="bg-red-500" style={{ width: `${pct(item.agingOver30)}%` }} />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-green-500" /> &lt;7d</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-yellow-500" /> 7–14d</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-orange-500" /> 14–30d</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-red-500" /> &gt;30d</span>
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Open</TableHead>
                  <TableHead>Overdue</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Aging</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.clients.map((c) => (
                  <TableRow key={c.clientId} data-testid={`row-tasks-${c.clientId}`}>
                    <TableCell className="font-medium text-sm"><Link href={getClientReportPath(window.location.pathname, c.clientId)} className="hover:underline text-primary cursor-pointer" data-testid={`link-client-tasks-${c.clientId}`}>{c.companyName}</Link></TableCell>
                    <TableCell className="text-sm">
                      <Link href={getClientReportDrilldownPath(window.location.pathname, c.clientId, { range, section: "workload" })} className="text-primary hover:underline">
                        {c.openTaskCount}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={getClientReportDrilldownPath(window.location.pathname, c.clientId, { range, section: "sla" })} className={cn("text-sm font-medium hover:underline", c.overdueCount > 0 ? "text-red-600 dark:text-red-400" : "text-primary")}>
                        {c.overdueCount}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-green-600 dark:text-green-400 font-medium">
                      <Link href={getClientReportDrilldownPath(window.location.pathname, c.clientId, { range, section: "workload" })} className="hover:underline">
                        {c.completedInRange}
                      </Link>
                    </TableCell>
                    <TableCell><AgingBar item={c} /></TableCell>
                  </TableRow>
                ))}
                {data?.clients.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No task data</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface ClientSlaItem {
  clientId: string;
  companyName: string;
  totalTasks: number;
  overdueCount: number;
  completedOnTime: number;
  totalDoneWithDue: number;
  overdueTaskPct: number;
  completedWithinDuePct: number;
}

function SlaTab({ rangeDays, projectStatus }: { rangeDays: number; projectStatus: ProjectStatusFilter }) {
  const { data, isLoading } = useQuery<{ clients: ClientSlaItem[]; pagination: { total: number; limit: number; offset: number }; range: { startDate: string; endDate: string } }>({
    queryKey: ["/api/reports/v2/client/sla", rangeDays, projectStatus],
    queryFn: async () => {
      const res = await fetch(`/api/reports/v2/client/sla?${buildProjectStatusParams(rangeDays, projectStatus, { limit: "100" })}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  if (isLoading) return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
    </div>
  );

  const range = `${rangeDays}d`;

  function progressColor(pct: number, invert = false) {
    const high = invert ? pct < 20 : pct > 80;
    const mid = invert ? pct < 40 : pct > 60;
    if (high) return "text-green-600 dark:text-green-400";
    if (mid) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Total Tasks</TableHead>
                <TableHead className="min-w-[160px]">Overdue %</TableHead>
                <TableHead className="min-w-[160px]">Completed On-Time %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.clients.map((c) => (
                <TableRow key={c.clientId} data-testid={`row-sla-${c.clientId}`}>
                  <TableCell className="font-medium text-sm"><Link href={getClientReportPath(window.location.pathname, c.clientId)} className="hover:underline text-primary cursor-pointer" data-testid={`link-client-sla-${c.clientId}`}>{c.companyName}</Link></TableCell>
                  <TableCell className="text-sm">
                    <Link href={getClientReportDrilldownPath(window.location.pathname, c.clientId, { range, section: "sla" })} className="text-primary hover:underline">
                      {c.totalTasks}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 min-w-[140px]">
                      <Progress value={c.overdueTaskPct} className="h-1.5 flex-1" />
                      <span className={cn("text-xs font-medium w-10 text-right", progressColor(c.overdueTaskPct, true))}>
                        {Math.round(c.overdueTaskPct)}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 min-w-[140px]">
                      <Progress value={c.completedWithinDuePct} className="h-1.5 flex-1" />
                      <span className={cn("text-xs font-medium w-10 text-right", progressColor(c.completedWithinDuePct))}>
                        {Math.round(c.completedWithinDuePct)}%
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {data?.clients.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">No SLA data</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

interface ClientRiskItem {
  clientId: string;
  companyName: string;
  score: number;
  reasons: string[];
  metrics: {
    totalTasks: number;
    overdueCount: number;
    totalHours: number;
    inactivityDays: number;
    estimatedHours: number;
  };
}

function RiskTab({ rangeDays, projectStatus }: { rangeDays: number; projectStatus: ProjectStatusFilter }) {
  const { data, isLoading } = useQuery<{ flagged: ClientRiskItem[]; totalChecked: number; range: { startDate: string; endDate: string } }>({
    queryKey: ["/api/reports/v2/client/risk", rangeDays, projectStatus],
    queryFn: async () => {
      const res = await fetch(`/api/reports/v2/client/risk?${buildProjectStatusParams(rangeDays, projectStatus)}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  if (isLoading) return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
    </div>
  );

  const range = `${rangeDays}d`;
  const topReasons = useMemo(() => {
    const counts = new Map<string, number>();
    (data?.flagged ?? []).flatMap((c) => c.reasons).forEach((reason) => {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [data?.flagged]);

  function scoreColor(score: number) {
    if (score >= 5) return "bg-red-100 dark:bg-red-900/30 border-red-200 dark:border-red-800";
    if (score >= 3) return "bg-orange-100 dark:bg-orange-900/30 border-orange-200 dark:border-orange-800";
    return "bg-yellow-100 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800";
  }

  function scoreLabel(score: number): { label: string; variant: "destructive" | "default" | "secondary" } {
    if (score >= 5) return { label: "Critical", variant: "destructive" };
    if (score >= 3) return { label: "At Risk", variant: "default" };
    return { label: "Watch", variant: "secondary" };
  }

  return (
    <div className="space-y-4">
      {data && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Activity className="h-4 w-4" />
          <span>Checked {data.totalChecked} clients — {data.flagged.length} flagged for attention</span>
        </div>
      )}
      {topReasons.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Top Client Risk Drivers</CardTitle>
            <CardDescription className="text-xs">Most common reasons clients are being flagged</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-2">
            {topReasons.map(([reason, count]) => (
              <div key={reason} className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm flex items-center justify-between gap-3">
                <span className="truncate">{reason}</span>
                <Badge variant="secondary">{count}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {data?.flagged.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <ShieldAlert className="h-10 w-10 opacity-30" />
          <p className="text-sm font-medium">No risk flags detected</p>
          <p className="text-xs">All clients are within normal engagement ranges</p>
        </div>
      )}

      {data?.flagged.map((c) => {
        const { label, variant } = scoreLabel(c.score);
        return (
          <Card key={c.clientId} className={cn("border", scoreColor(c.score))} data-testid={`risk-card-${c.clientId}`}>
            <CardContent className="p-4">
              <Link href={getClientReportDrilldownPath(window.location.pathname, c.clientId, { range, section: "risk" })} className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-semibold text-sm text-primary" data-testid={`link-client-risk-${c.clientId}`}>{c.companyName}</span>
                    <Badge variant={variant}>{label}</Badge>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3 flex-wrap">
                    <span>{c.metrics.totalTasks} total tasks</span>
                    <span className="text-red-600 dark:text-red-400">{c.metrics.overdueCount} overdue</span>
                    <span>{c.metrics.totalHours}h tracked</span>
                    <span>{c.metrics.inactivityDays}d inactive</span>
                  </div>
                  <div className="space-y-1">
                    {c.reasons.map((reason, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <AlertTriangle className="h-3.5 w-3.5 text-orange-500 shrink-0 mt-0.5" />
                        <span>{reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Link>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ── TYPES ─────────────────────────────────────────────────────────────────────

interface ChiComponentScores {
  overdue: number;
  engagement: number;
  timeOverrun: number;
  slaCompliance: number;
  activity: number;
}

interface ChiClient {
  clientId: string;
  companyName: string;
  overallScore: number;
  healthTier: "Healthy" | "Monitor" | "At Risk" | "Critical";
  componentScores: ChiComponentScores;
  riskFlags: string[];
  rawMetrics: {
    totalTasks: number;
    overdueCount: number;
    completedOnTime: number;
    totalDoneWithDue: number;
    totalHoursInRange: number;
    estimatedHours: number;
    commentCount: number;
    daysSinceLastActivity: number | null;
    activeProjects: number;
  };
}

type ChiSortField = "companyName" | "overallScore" | "overdue" | "engagement" | "timeOverrun" | "slaCompliance" | "activity";
type SortDir = "asc" | "desc";

// ── HEALTH TAB ─────────────────────────────────────────────────────────────────

function chiTierConfig(tier: ChiClient["healthTier"]) {
  switch (tier) {
    case "Healthy":  return { className: "bg-green-500 text-white border-transparent" };
    case "Monitor":  return { className: "bg-blue-500 text-white border-transparent" };
    case "At Risk":  return { className: "bg-orange-500 text-white border-transparent" };
    case "Critical": return { className: "bg-red-500 text-white border-transparent" };
  }
}

function SortIcon({ field, sortBy, sortDir }: { field: string; sortBy: string; sortDir: SortDir }) {
  if (sortBy !== field) return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/50 ml-1 shrink-0" />;
  return sortDir === "asc"
    ? <ChevronUp className="h-3.5 w-3.5 ml-1 shrink-0 text-primary" />
    : <ChevronDown className="h-3.5 w-3.5 ml-1 shrink-0 text-primary" />;
}

function ChiScoreBar({ value, colorClass }: { value: number; colorClass: string }) {
  return (
    <div className="flex items-center gap-1.5 min-w-[80px]">
      <Progress value={value} className={cn("h-1.5 flex-1", colorClass)} />
      <span className="text-xs text-muted-foreground w-7 text-right tabular-nums">{value}</span>
    </div>
  );
}

function HealthTab({ rangeDays }: { rangeDays: number }) {
  const [sortBy, setSortBy] = useState<ChiSortField>("overallScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data, isLoading } = useQuery<{
    clients: ChiClient[];
    pagination: { total: number; limit: number; offset: number };
    range: { startDate: string; endDate: string };
  }>({
    queryKey: ["/api/reports/v2/client/health-index", rangeDays],
    queryFn: async () => {
      const res = await fetch(`/api/reports/v2/client/health-index?${buildDateParams(rangeDays, { limit: "100" })}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  const sorted = useMemo(() => {
    if (!data?.clients) return [];
    return [...data.clients].sort((a, b) => {
      let av: number | string = 0, bv: number | string = 0;
      if (sortBy === "companyName")   { av = a.companyName; bv = b.companyName; }
      else if (sortBy === "overallScore")  { av = a.overallScore; bv = b.overallScore; }
      else if (sortBy === "overdue")       { av = a.componentScores.overdue; bv = b.componentScores.overdue; }
      else if (sortBy === "engagement")    { av = a.componentScores.engagement; bv = b.componentScores.engagement; }
      else if (sortBy === "timeOverrun")   { av = a.componentScores.timeOverrun; bv = b.componentScores.timeOverrun; }
      else if (sortBy === "slaCompliance") { av = a.componentScores.slaCompliance; bv = b.componentScores.slaCompliance; }
      else if (sortBy === "activity")      { av = a.componentScores.activity; bv = b.componentScores.activity; }
      if (typeof av === "string") {
        return sortDir === "asc" ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
      }
      return sortDir === "asc" ? av - (bv as number) : (bv as number) - av;
    });
  }, [data?.clients, sortBy, sortDir]);

  function toggleSort(field: ChiSortField) {
    if (sortBy === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(field); setSortDir("desc"); }
  }

  function Th({ field, children }: { field: ChiSortField; children: React.ReactNode }) {
    return (
      <TableHead
        className="cursor-pointer select-none whitespace-nowrap"
        onClick={() => toggleSort(field)}
        data-testid={`th-chi-${field}`}
      >
        <div className="flex items-center">
          {children}
          <SortIcon field={field} sortBy={sortBy} sortDir={sortDir} />
        </div>
      </TableHead>
    );
  }

  const summary = useMemo(() => {
    if (!data?.clients.length) return null;
    const cls = data.clients;
    return {
      avgScore: Math.round(cls.reduce((s, c) => s + c.overallScore, 0) / cls.length),
      healthy: cls.filter(c => c.healthTier === "Healthy").length,
      critical: cls.filter(c => c.healthTier === "Critical").length,
      withFlags: cls.filter(c => c.riskFlags.length > 0).length,
    };
  }, [data?.clients]);

  const range = `${rangeDays}d`;
  const topFlags = useMemo(() => {
    const counts = new Map<string, number>();
    (data?.clients ?? []).flatMap((c) => c.riskFlags).forEach((flag) => {
      counts.set(flag, (counts.get(flag) ?? 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [data?.clients]);

  if (isLoading) return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
    </div>
  );

  if (!data?.clients.length) {
    return (
      <ReportEmptyState
        icon={HeartPulse}
        title="No client health data in this range"
        description="This tab needs recent client activity, task, time, and SLA signals. Try a wider date range or come back after more client work is logged."
      />
    );
  }

  return (
    <div className="space-y-4">
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard label="Avg CHI Score" value={summary.avgScore} sub="out of 100" icon={<HeartPulse className="h-4 w-4 text-white" />} color="bg-emerald-500" />
          <MetricCard label="Healthy" value={summary.healthy} sub="score ≥ 85" icon={<TrendingUp className="h-4 w-4 text-white" />} color="bg-green-500" />
          <MetricCard label="Critical" value={summary.critical} sub="score < 50" icon={<AlertTriangle className="h-4 w-4 text-white" />} color="bg-red-500" />
          <MetricCard label="With Risk Flags" value={summary.withFlags} sub="one or more flags" icon={<ShieldAlert className="h-4 w-4 text-white" />} color="bg-orange-500" />
        </div>
      )}
      {topFlags.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Most Common Health Flags</CardTitle>
            <CardDescription className="text-xs">Drivers most often pulling client health down</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-2">
            {topFlags.map(([flag, count]) => (
              <div key={flag} className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm flex items-center justify-between gap-3">
                <span className="truncate">{flag}</span>
                <Badge variant="secondary">{count}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <Th field="companyName">Client</Th>
                <Th field="overallScore">CHI Score</Th>
                <TableHead className="text-xs text-muted-foreground">Tier</TableHead>
                <Th field="overdue">Overdue</Th>
                <Th field="engagement">Engagement</Th>
                <Th field="timeOverrun">Time Overrun</Th>
                <Th field="slaCompliance">SLA</Th>
                <Th field="activity">Activity</Th>
                <TableHead className="text-xs text-muted-foreground">Flags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((c) => {
                const { className } = chiTierConfig(c.healthTier);
                return (
                  <TableRow key={c.clientId} data-testid={`row-client-health-${c.clientId}`}>
                    <TableCell>
                      <Link href={getClientReportPath(window.location.pathname, c.clientId)} className="text-sm font-medium hover:underline text-primary cursor-pointer" data-testid={`link-client-health-${c.clientId}`}>{c.companyName}</Link>
                    </TableCell>
                    <TableCell>
                      <Link href={getClientReportDrilldownPath(window.location.pathname, c.clientId, { range, section: "health-index" })}>
                        <span className={cn(
                          "text-base font-bold tabular-nums hover:underline",
                          c.overallScore >= 85 ? "text-green-600 dark:text-green-400" :
                          c.overallScore >= 70 ? "text-blue-600 dark:text-blue-400" :
                          c.overallScore >= 50 ? "text-orange-600 dark:text-orange-400" :
                          "text-red-600 dark:text-red-400"
                        )}>
                          {c.overallScore}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={getClientReportDrilldownPath(window.location.pathname, c.clientId, { range, section: "health-index" })}>
                        <Badge className={cn("text-xs font-medium cursor-pointer hover:opacity-90", className)}>{c.healthTier}</Badge>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={getClientReportDrilldownPath(window.location.pathname, c.clientId, { range, section: "risk" })}>
                        <ChiScoreBar value={c.componentScores.overdue} colorClass="[&>div]:bg-blue-500" />
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={getClientReportDrilldownPath(window.location.pathname, c.clientId, { range, section: "health-index" })}>
                        <ChiScoreBar value={c.componentScores.engagement} colorClass="[&>div]:bg-violet-500" />
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={getClientReportDrilldownPath(window.location.pathname, c.clientId, { range, section: "time" })}>
                        <ChiScoreBar value={c.componentScores.timeOverrun} colorClass="[&>div]:bg-amber-500" />
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={getClientReportDrilldownPath(window.location.pathname, c.clientId, { range, section: "sla" })}>
                        <ChiScoreBar value={c.componentScores.slaCompliance} colorClass="[&>div]:bg-cyan-500" />
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={getClientReportDrilldownPath(window.location.pathname, c.clientId, { range, section: "risk" })}>
                        <ChiScoreBar value={c.componentScores.activity} colorClass="[&>div]:bg-green-500" />
                      </Link>
                    </TableCell>
                    <TableCell>
                      {c.riskFlags.length > 0 ? (
                        <div className="space-y-1" data-testid={`chi-flags-${c.clientId}`}>
                          {c.riskFlags.map((flag, i) => (
                            <div key={i} className="flex items-start gap-1 text-xs text-orange-600 dark:text-orange-400">
                              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                              <span className="leading-tight max-w-[180px]">{flag}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {sorted.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">No client health data found</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── FORECASTS TAB ─────────────────────────────────────────────────────────────

interface ClientRiskTrendItem {
  clientId: string;
  companyName: string;
  currentHealthScore: number;
  priorHealthScore: number;
  predictedHealthScore: number;
  riskTrend: "Improving" | "Stable" | "Worsening";
  clientRisk: "Low" | "Medium" | "High";
  weeklySlope: number;
  explanation: string[];
  metrics: {
    currOpenTasks: number;
    currOverdueTasks: number;
    currHoursLogged: number;
    currCompleted: number;
  };
}

const CLIENT_RISK_COLORS: Record<"Low" | "Medium" | "High", string> = {
  Low: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  Medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  High: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const TREND_CONFIG: Record<"Improving" | "Stable" | "Worsening", { color: string; label: string }> = {
  Improving: { color: "text-emerald-600 dark:text-emerald-400", label: "↑ Improving" },
  Stable: { color: "text-muted-foreground", label: "→ Stable" },
  Worsening: { color: "text-red-600 dark:text-red-400", label: "↓ Worsening" },
};

function ClientConfidenceBadge({ confidence }: { confidence: "Low" | "Medium" | "High" }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs",
        confidence === "High" ? "border-emerald-500 text-emerald-600" :
        confidence === "Medium" ? "border-amber-500 text-amber-600" :
        "border-red-400 text-red-500"
      )}
    >
      {confidence} confidence
    </Badge>
  );
}

function ClientExplanationsPanel({ explanations, dataQualityFlags }: { explanations: string[]; dataQualityFlags: string[] }) {
  if (!explanations.length && !dataQualityFlags.length) return null;
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
      <div className="flex items-center gap-1.5 font-medium text-foreground mb-1">
        <Info className="h-3.5 w-3.5" />
        Model notes
      </div>
      {explanations.map((e, i) => <p key={i}>{e}</p>)}
      {dataQualityFlags.map((f, i) => (
        <p key={`dq-${i}`} className="text-amber-600 dark:text-amber-400">⚠ {f.replace(/_/g, " ")}</p>
      ))}
    </div>
  );
}

function ScoreBar({ current, predicted }: { current: number; predicted: number }) {
  const improving = predicted > current;
  const worsening = predicted < current;
  return (
    <div className="flex items-center gap-1.5 min-w-[100px]">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all",
            current >= 70 ? "bg-emerald-500" : current >= 50 ? "bg-amber-500" : "bg-red-500"
          )}
          style={{ width: `${current}%` }}
        />
      </div>
      <span className="text-xs font-medium w-8 text-right">{current}</span>
      {improving && <span className="text-xs text-emerald-600">→{predicted}</span>}
      {worsening && <span className="text-xs text-red-500">→{predicted}</span>}
      {!improving && !worsening && <span className="text-xs text-muted-foreground">={predicted}</span>}
    </div>
  );
}

function ClientForecastsTab({ horizonWeeks }: { horizonWeeks: number }) {
  const [expandedClient, setExpandedClient] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{
    clients: ClientRiskTrendItem[];
    confidence: "Low" | "Medium" | "High";
    dataQualityFlags: string[];
    explanations: string[];
    horizonWeeks: number;
  }>({
    queryKey: ["/api/reports/v2/forecasting/client-risk-trend", horizonWeeks],
    queryFn: async () => {
      const res = await fetch(`/api/reports/v2/forecasting/client-risk-trend?weeks=${horizonWeeks}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  const highRisk = data?.clients.filter(c => c.clientRisk === "High").length ?? 0;
  const worsening = data?.clients.filter(c => c.riskTrend === "Worsening").length ?? 0;
  const improving = data?.clients.filter(c => c.riskTrend === "Improving").length ?? 0;
  const total = data?.clients.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-red-600">{highRisk}</div>
            <div className="text-xs text-muted-foreground mt-0.5">High risk clients</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-red-500">{worsening}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Worsening trend</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-emerald-600">{improving}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Improving trend</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{total}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Clients analysed</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-sm">Client Risk Trend Forecast</CardTitle>
              <CardDescription className="text-xs">Health score trajectory — predicted {horizonWeeks} weeks forward</CardDescription>
            </div>
            {data && <ClientConfidenceBadge confidence={data.confidence} />}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {!data?.clients.length ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No client data found</p>
          ) : (
            <>
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-center">Current Score</TableHead>
                    <TableHead className="text-center">Trend</TableHead>
                    <TableHead className="text-center">Predicted ({horizonWeeks}w)</TableHead>
                    <TableHead className="text-center">Open</TableHead>
                    <TableHead className="text-center">Overdue</TableHead>
                    <TableHead className="text-center">Risk</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.clients.map(c => (
                    <>
                      <TableRow
                        key={c.clientId}
                        className="cursor-pointer hover:bg-muted/30"
                        onClick={() => setExpandedClient(expandedClient === c.clientId ? null : c.clientId)}
                        data-testid={`forecast-client-row-${c.clientId}`}
                      >
                        <TableCell className="font-medium max-w-[160px]">
                          <Link href={getClientReportDrilldownPath(window.location.pathname, c.clientId, { section: "risk" })} className="truncate block hover:underline text-primary cursor-pointer" data-testid={`link-client-forecast-${c.clientId}`} onClick={(e: React.MouseEvent) => e.stopPropagation()}>{c.companyName}</Link>
                        </TableCell>
                        <TableCell className="text-center">
                          <ScoreBar current={c.currentHealthScore} predicted={c.predictedHealthScore} />
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={cn("text-xs font-medium", TREND_CONFIG[c.riskTrend].color)}>
                            {TREND_CONFIG[c.riskTrend].label}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={cn("font-medium text-sm",
                            c.predictedHealthScore >= 70 ? "text-emerald-600" :
                            c.predictedHealthScore >= 50 ? "text-amber-600" : "text-red-600"
                          )}>
                            {c.predictedHealthScore}
                          </span>
                        </TableCell>
                        <TableCell className="text-center text-sm">
                          <Link href={getClientReportDrilldownPath(window.location.pathname, c.clientId, { section: "projects" })} onClick={(e: React.MouseEvent) => e.stopPropagation()} className="text-primary hover:underline">
                            {c.metrics.currOpenTasks}
                          </Link>
                        </TableCell>
                        <TableCell className="text-center">
                          <Link href={getClientReportDrilldownPath(window.location.pathname, c.clientId, { section: "risk" })} onClick={(e: React.MouseEvent) => e.stopPropagation()} className={cn("hover:underline", c.metrics.currOverdueTasks > 0 ? "text-red-600 font-medium" : "text-primary")}>
                            {c.metrics.currOverdueTasks}
                          </Link>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className={cn("text-xs", CLIENT_RISK_COLORS[c.clientRisk])}>
                            {c.clientRisk}
                          </Badge>
                        </TableCell>
                      </TableRow>
                      {expandedClient === c.clientId && (
                        <TableRow key={`${c.clientId}-exp`} className="bg-muted/20">
                          <TableCell colSpan={7} className="py-2">
                            <div className="text-xs text-muted-foreground space-y-0.5">
                              {c.explanation.map((line, i) => (
                                <p key={i} className={line.startsWith("⚠") ? "text-amber-600 dark:text-amber-400" : ""}>
                                  {line}
                                </p>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Click a row to see the full explanation</p>
            </>
          )}
          {data && (
            <div className="mt-3">
              <ClientExplanationsPanel explanations={data.explanations} dataQualityFlags={data.dataQualityFlags} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────────

export function ClientCommandCenter() {
  const [rangeDays, setRangeDays] = useState(30);
  const [activeTab, setActiveTab] = useState("overview");
  const [horizonWeeks, setHorizonWeeks] = useState<2 | 4 | 8>(4);
  const [projectStatus, setProjectStatus] = useState<ProjectStatusFilter>("all");
  const flags = useFeatureFlags();

  return (
    <ReportCommandCenterLayout
      title="Client Command Center"
      description="Client engagement, time, task load, SLA and risk analysis per client"
      icon={<Building2 className="h-4 w-4" />}
      rangeDays={rangeDays}
      onRangeChange={setRangeDays}
      extraControls={
        <Select value={projectStatus} onValueChange={(value) => setProjectStatus(value as ProjectStatusFilter)}>
          <SelectTrigger className="w-full sm:w-56 shrink-0" data-testid="select-client-command-center-project-status">
            <ArrowUpDown className="h-3.5 w-3.5 mr-1.5 shrink-0" />
            <SelectValue placeholder="Project status" />
          </SelectTrigger>
          <SelectContent>
            {PROJECT_STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value} data-testid={`project-status-option-${option.value}`}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <MobileTabSelect
          tabs={[
            { value: "overview", label: "Overview" },
            { value: "activity", label: "Activity" },
            { value: "time", label: "Time" },
            { value: "tasks", label: "Tasks" },
            { value: "sla", label: "SLA" },
            { value: "risk", label: "Risk" },
            ...(flags.enableClientHealthIndex ? [{ value: "health", label: "Health" }] : []),
            ...(flags.enableForecastingLayer ? [{ value: "forecasts", label: "Forecasts" }] : []),
          ]}
          value={activeTab}
          onValueChange={setActiveTab}
          className="mb-3"
        />
        <div className="hidden md:block">
        <TabsList className="h-9 flex-wrap">
          <TabsTrigger value="overview" className="text-xs gap-1.5" data-testid="tab-client-overview">
            <Users className="h-3.5 w-3.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="activity" className="text-xs gap-1.5" data-testid="tab-client-activity">
            <Activity className="h-3.5 w-3.5" />
            Activity
          </TabsTrigger>
          <TabsTrigger value="time" className="text-xs gap-1.5" data-testid="tab-client-time">
            <Clock className="h-3.5 w-3.5" />
            Time
          </TabsTrigger>
          <TabsTrigger value="tasks" className="text-xs gap-1.5" data-testid="tab-client-tasks">
            <CheckSquare className="h-3.5 w-3.5" />
            Tasks
          </TabsTrigger>
          <TabsTrigger value="sla" className="text-xs gap-1.5" data-testid="tab-client-sla">
            <TrendingUp className="h-3.5 w-3.5" />
            SLA
          </TabsTrigger>
          <TabsTrigger value="risk" className="text-xs gap-1.5" data-testid="tab-client-risk">
            <ShieldAlert className="h-3.5 w-3.5" />
            Risk
          </TabsTrigger>
          {flags.enableClientHealthIndex && (
            <TabsTrigger value="health" className="text-xs gap-1.5" data-testid="tab-client-health">
              <HeartPulse className="h-3.5 w-3.5" />
              Health
            </TabsTrigger>
          )}
          {flags.enableForecastingLayer && (
            <TabsTrigger value="forecasts" className="text-xs gap-1.5" data-testid="tab-client-forecasts">
              <Sparkles className="h-3.5 w-3.5" />
              Forecasts
            </TabsTrigger>
          )}
        </TabsList>
        </div>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab rangeDays={rangeDays} projectStatus={projectStatus} />
        </TabsContent>
        <TabsContent value="activity" className="mt-4">
          <ActivityTab rangeDays={rangeDays} projectStatus={projectStatus} />
        </TabsContent>
        <TabsContent value="time" className="mt-4">
          <TimeTab rangeDays={rangeDays} projectStatus={projectStatus} />
        </TabsContent>
        <TabsContent value="tasks" className="mt-4">
          <TasksTab rangeDays={rangeDays} projectStatus={projectStatus} />
        </TabsContent>
        <TabsContent value="sla" className="mt-4">
          <SlaTab rangeDays={rangeDays} projectStatus={projectStatus} />
        </TabsContent>
        <TabsContent value="risk" className="mt-4">
          <RiskTab rangeDays={rangeDays} projectStatus={projectStatus} />
        </TabsContent>
        {flags.enableClientHealthIndex && (
          <TabsContent value="health" className="mt-4">
            <HealthTab rangeDays={rangeDays} />
          </TabsContent>
        )}
        {flags.enableForecastingLayer && (
          <TabsContent value="forecasts" className="mt-4">
            <Tabs defaultValue="analysis">
              <TabsList className="h-8 mb-4">
                <TabsTrigger value="analysis" className="text-xs gap-1.5" data-testid="tab-client-forecast-analysis">
                  <Sparkles className="h-3.5 w-3.5" />
                  Analysis
                </TabsTrigger>
                {flags.enableForecastSnapshots && (
                  <TabsTrigger value="snapshots" className="text-xs gap-1.5" data-testid="tab-client-forecast-snapshots">
                    <Camera className="h-3.5 w-3.5" />
                    Snapshots
                  </TabsTrigger>
                )}
              </TabsList>
              <TabsContent value="analysis">
                <div className="flex items-center gap-3 mb-4 flex-wrap">
                  <span className="text-sm text-muted-foreground">Forecast horizon:</span>
                  <Select value={String(horizonWeeks)} onValueChange={(v) => setHorizonWeeks(Number(v) as 2 | 4 | 8)}>
                    <SelectTrigger className="w-32 h-8 text-xs" data-testid="client-forecast-horizon-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">2 weeks</SelectItem>
                      <SelectItem value="4">4 weeks</SelectItem>
                      <SelectItem value="8">8 weeks</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <ClientForecastsTab horizonWeeks={horizonWeeks} />
              </TabsContent>
              {flags.enableForecastSnapshots && (
                <TabsContent value="snapshots">
                  <ForecastSnapshotsTab />
                </TabsContent>
              )}
            </Tabs>
          </TabsContent>
        )}
      </Tabs>
    </ReportCommandCenterLayout>
  );
}
