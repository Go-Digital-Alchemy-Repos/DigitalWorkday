import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  AlertTriangle,
  CalendarClock,
  CheckSquare,
  Clock,
  FolderKanban,
  Gauge,
  ListChecks,
  Search,
  TrendingUp,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader, PageShell, EmptyState, ErrorState, LoadingState } from "@/components/layout";
import {
  ReportCommandCenterLayout,
  buildDateParams,
  type ReportRangeValue,
} from "@/components/reports/report-command-center-layout";
import { fetchReport as fetch } from "@/components/reports/report-fetch";
import { useAuth } from "@/lib/auth";
import { hasProjectManagerDashboardAccess } from "@shared/roles";
import { cn, formatNumber } from "@/lib/utils";
import { getClientReportPath } from "@/components/reports/report-paths";

interface PmPortfolioProject {
  projectId: string;
  projectName: string;
  status: string;
  clientId: string | null;
  clientName: string | null;
  openTasks: number;
  overdueTasks: number;
  dueSoonTasks: number;
  unassignedTasks: number;
  completionPercent: number;
  rangeHours: number;
  ytdHours: number;
  lifetimeHours: number;
  estimatedOpenHours: number;
  budgetHours: number;
  varianceHours: number;
  budgetVarianceHours: number | null;
  lastActivityAt: string | null;
  inactivityDays: number | null;
  riskReasons: string[];
}

interface PmPortfolioReport {
  totals: {
    activeProjects: number;
    projectsAtRisk: number;
    overdueTasks: number;
    dueSoonTasks: number;
    unassignedTasks: number;
    rangeHours: number;
    ytdHours: number;
    lifetimeHours: number;
  };
  attentionQueue: Array<{
    type: string;
    severity: "high" | "medium" | "low";
    message: string;
    project: PmPortfolioProject;
  }>;
  projects: PmPortfolioProject[];
  clients: Array<{
    clientId: string;
    companyName: string;
    activeProjects: number;
    openTasks: number;
    overdueTasks: number;
    rangeHours: number;
    ytdHours: number;
    lifetimeHours: number;
    lastActivityAt: string | null;
    inactivityDays: number | null;
  }>;
}

function hours(value: number): string {
  return `${formatNumber(value, { maximumFractionDigits: 1 })}h`;
}

function attentionLabel(type: string): string {
  switch (type) {
    case "overdue": return "Overdue";
    case "due_soon": return "Due Soon";
    case "unassigned": return "Unassigned";
    case "stale": return "Stale";
    case "high_time_low_progress": return "High Time";
    default: return type.replace(/_/g, " ");
  }
}

function KpiCard({
  label,
  value,
  sub,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  sub: string;
  icon: ReactNode;
  tone?: "neutral" | "risk" | "warn" | "good";
}) {
  return (
    <Card className={cn(
      "border-border/70 bg-card/90",
      tone === "risk" && "border-destructive/25 bg-destructive/[0.04]",
      tone === "warn" && "border-amber-500/25 bg-amber-500/[0.05]",
      tone === "good" && "border-emerald-500/25 bg-emerald-500/[0.05]",
    )}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
          </div>
          <div className="rounded-md border border-border/70 bg-background p-2 text-muted-foreground">
            {icon}
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

export default function PmDashboardPage() {
  const { user } = useAuth();
  const [range, setRange] = useState<ReportRangeValue>(30);
  const [search, setSearch] = useState("");
  const canAccess = hasProjectManagerDashboardAccess(user?.role);

  const { data, isLoading, isError, refetch } = useQuery<PmPortfolioReport>({
    queryKey: ["/api/reports/v2/pm/portfolio", range],
    queryFn: async () => {
      const res = await fetch(`/api/reports/v2/pm/portfolio?${buildDateParams(range)}`);
      if (!res.ok) throw new Error("Failed to load PM portfolio");
      return res.json();
    },
    enabled: canAccess,
    staleTime: 60_000,
  });

  const filteredProjects = useMemo(() => {
    const projects = data?.projects ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((project) =>
      project.projectName.toLowerCase().includes(q) ||
      (project.clientName ?? "").toLowerCase().includes(q)
    );
  }, [data?.projects, search]);

  if (!canAccess) {
    return (
      <PageShell className="max-w-7xl mx-auto">
        <ErrorState title="Access denied" error={new Error("Project Manager access required")} />
      </PageShell>
    );
  }

  return (
    <PageShell className="max-w-7xl mx-auto">
      <PageHeader
        title="PM Command Center"
        subtitle="Portfolio health, time investment, and work that needs PM attention"
        icon={<Gauge className="h-6 w-6" />}
      />

      <ReportCommandCenterLayout
        title="PM Command Center"
        description="Portfolio health, time investment, and PM attention queue"
        icon={<Gauge className="h-5 w-5" />}
        rangeDays={range}
        onRangeChange={setRange}
      >
        {isLoading ? (
          <LoadingState type="table" rows={6} />
        ) : isError || !data ? (
          <ErrorState
            title="Failed to load PM command center"
            error={new Error("The portfolio report could not be loaded.")}
            onRetry={() => refetch()}
          />
        ) : (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                label="Active Projects"
                value={data.totals.activeProjects}
                sub="Projects currently moving across the tenant"
                icon={<FolderKanban className="h-4 w-4" />}
                tone="good"
              />
              <KpiCard
                label="Projects At Risk"
                value={data.totals.projectsAtRisk}
                sub="Overdue, stale, over budget, or high-time/low-progress"
                icon={<AlertTriangle className="h-4 w-4" />}
                tone={data.totals.projectsAtRisk > 0 ? "risk" : "neutral"}
              />
              <KpiCard
                label="Due Soon"
                value={data.totals.dueSoonTasks}
                sub="Open tasks due in the next 7 days"
                icon={<CalendarClock className="h-4 w-4" />}
                tone="warn"
              />
              <KpiCard
                label="Hours This Range"
                value={hours(data.totals.rangeHours)}
                sub={`${hours(data.totals.ytdHours)} year to date`}
                icon={<Clock className="h-4 w-4" />}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ListChecks className="h-4 w-4" />
                    Attention Queue
                    <Badge variant={data.attentionQueue.length > 0 ? "destructive" : "secondary"}>
                      {data.attentionQueue.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.attentionQueue.length === 0 ? (
                    <EmptyState
                      icon={<CheckSquare className="h-8 w-8" />}
                      title="No PM exceptions right now"
                      description="Overdue, stale, unassigned, and high-time/low-progress work will appear here."
                    />
                  ) : (
                    <div className="space-y-2">
                      {data.attentionQueue.slice(0, 12).map((item, index) => (
                        <Link
                          key={`${item.type}-${item.project.projectId}-${index}`}
                          href={`/projects/${item.project.projectId}`}
                          className="block rounded-md border border-border/70 bg-muted/20 p-3 transition-colors hover:bg-muted/50"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant={item.severity === "high" ? "destructive" : "secondary"}>
                                  {attentionLabel(item.type)}
                                </Badge>
                                <span className="truncate text-sm font-medium">{item.project.projectName}</span>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">{item.message}</p>
                              {item.project.clientName ? (
                                <p className="mt-1 text-xs text-muted-foreground">{item.project.clientName}</p>
                              ) : null}
                            </div>
                            <Button variant="ghost" size="sm" className="shrink-0">Open</Button>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TrendingUp className="h-4 w-4" />
                    Time Investment
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-md border border-border/70 p-3">
                      <p className="text-xs text-muted-foreground">Selected Range</p>
                      <p className="mt-1 text-2xl font-semibold">{hours(data.totals.rangeHours)}</p>
                    </div>
                    <div className="rounded-md border border-border/70 p-3">
                      <p className="text-xs text-muted-foreground">Year To Date</p>
                      <p className="mt-1 text-2xl font-semibold">{hours(data.totals.ytdHours)}</p>
                    </div>
                    <div className="rounded-md border border-border/70 p-3">
                      <p className="text-xs text-muted-foreground">Lifetime</p>
                      <p className="mt-1 text-2xl font-semibold">{hours(data.totals.lifetimeHours)}</p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-md border border-border/70 p-3">
                      <p className="text-xs text-muted-foreground">Overdue Tasks</p>
                      <p className="mt-1 text-xl font-semibold text-destructive">{data.totals.overdueTasks}</p>
                    </div>
                    <div className="rounded-md border border-border/70 p-3">
                      <p className="text-xs text-muted-foreground">Unassigned Tasks</p>
                      <p className="mt-1 text-xl font-semibold">{data.totals.unassignedTasks}</p>
                    </div>
                    <div className="rounded-md border border-border/70 p-3">
                      <p className="text-xs text-muted-foreground">Portfolio Rows</p>
                      <p className="mt-1 text-xl font-semibold">{data.projects.length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="gap-3 pb-3 md:flex-row md:items-center md:justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FolderKanban className="h-4 w-4" />
                  Portfolio
                </CardTitle>
                <div className="relative w-full md:w-80">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search projects or clients..."
                    className="pl-9"
                    data-testid="input-pm-portfolio-search"
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Project</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Hours</TableHead>
                        <TableHead className="text-right">YTD</TableHead>
                        <TableHead>Progress</TableHead>
                        <TableHead className="text-right">Open</TableHead>
                        <TableHead className="text-right">Overdue</TableHead>
                        <TableHead>Last Activity</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredProjects.map((project) => (
                        <TableRow key={project.projectId}>
                          <TableCell>
                            <Link href={`/projects/${project.projectId}`} className="font-medium hover:underline">
                              {project.projectName}
                            </Link>
                            {project.riskReasons.length > 0 ? (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {project.riskReasons.slice(0, 3).map((reason) => (
                                  <Badge key={reason} variant="outline" className="text-xs">
                                    {reason.replace(/_/g, " ")}
                                  </Badge>
                                ))}
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            {project.clientId ? (
                              <Link href={getClientReportPath(window.location.pathname, project.clientId)} className="hover:underline">
                                {project.clientName ?? "Client"}
                              </Link>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={project.status === "active" ? "default" : "secondary"}>{project.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right">{hours(project.rangeHours)}</TableCell>
                          <TableCell className="text-right">{hours(project.ytdHours)}</TableCell>
                          <TableCell className="min-w-36">
                            <div className="flex items-center gap-2">
                              <Progress value={project.completionPercent} className="h-2" />
                              <span className="w-10 text-xs text-muted-foreground">{project.completionPercent}%</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{project.openTasks}</TableCell>
                          <TableCell className="text-right">
                            {project.overdueTasks > 0 ? (
                              <Badge variant="destructive">{project.overdueTasks}</Badge>
                            ) : (
                              "0"
                            )}
                          </TableCell>
                          <TableCell>
                            {project.lastActivityAt
                              ? format(new Date(project.lastActivityAt), "MMM d, yyyy")
                              : <span className="text-muted-foreground">-</span>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4" />
                  Client Time Leaders
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {data.clients?.slice(0, 6).map((client) => (
                    <Link
                      key={client.clientId}
                      href={getClientReportPath(window.location.pathname, client.clientId)}
                      className="rounded-md border border-border/70 p-3 transition-colors hover:bg-muted/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{client.companyName}</p>
                          <p className="text-xs text-muted-foreground">{client.activeProjects} active projects</p>
                        </div>
                        <p className="shrink-0 text-sm font-semibold">{hours(client.rangeHours)}</p>
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{client.openTasks} open</span>
                        <span>{client.overdueTasks} overdue</span>
                        <span>{hours(client.ytdHours)} YTD</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </ReportCommandCenterLayout>
    </PageShell>
  );
}
