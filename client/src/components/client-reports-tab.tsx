import { useState } from "react";
import type { ReactNode } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowLeft,
  BarChart3,
  CalendarIcon,
  CheckSquare,
  Clock,
  Download,
  FolderKanban,
  AlertTriangle,
  RefreshCw,
  TrendingUp,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ReportCommandCenterLayout,
  buildDateParams,
  type ReportRangeValue,
} from "@/components/reports/report-command-center-layout";
import { fetchReport as fetch } from "@/components/reports/report-fetch";
import { DataPointLabel } from "@/components/data-point-help";
import { DATA_POINT_DEFINITIONS } from "@/lib/data-point-definitions";

interface ClientWorkSummary {
  client: {
    id: string;
    companyName: string;
    displayName: string | null;
    status: string | null;
    stage: string | null;
    createdAt: string;
  };
  totals: {
    rangeHours: number;
    billableHours: number;
    nonBillableHours: number;
    ytdHours: number;
    lifetimeHours: number;
    timeEntries: number;
    activeProjects: number;
    openTasks: number;
    overdueTasks: number;
    completedInRange: number;
    estimatedOpenHours: number;
    budgetHours: number;
    varianceHours: number;
    lastActivityAt: string | null;
    inactivityDays: number | null;
  };
  projects: Array<{
    projectId: string;
    projectName: string;
    status: string;
    openTasks: number;
    overdueTasks: number;
    completedTasks: number;
    completionPercent: number;
    rangeHours: number;
    ytdHours: number;
    lifetimeHours: number;
    estimatedOpenHours: number;
    budgetHours: number;
    budgetVarianceHours: number | null;
    lastActivityAt: string | null;
  }>;
  tasks: Array<{
    taskId: string;
    title: string;
    status: string;
    priority: string;
    dueDate: string | null;
    projectId: string;
    projectName: string;
    estimateHours: number;
    rangeHours: number;
    lifetimeHours: number;
    lastTimeAt: string | null;
  }>;
  contributors: Array<{
    userId: string;
    name: string;
    email: string;
    rangeHours: number;
    entries: number;
  }>;
  recentEntries: Array<{
    id: string;
    title: string | null;
    scope: string;
    startTime: string;
    endTime: string | null;
    durationSeconds: number;
    projectName: string | null;
    taskTitle: string | null;
    userName: string | null;
  }>;
}

function formatHours(hours: number): string {
  return hours.toFixed(1);
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function SummaryCard({
  title,
  value,
  sub,
  icon,
  testId,
}: {
  title: string;
  value: string | number;
  sub: string;
  icon: ReactNode;
  testId: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

export function ClientReportsTab({ clientId, showBackButton = true }: { clientId: string; showBackButton?: boolean }) {
  const [range, setRange] = useState<ReportRangeValue>("lifetime");
  const [isExporting, setIsExporting] = useState(false);

  const { data: report, isLoading, isError, error, refetch } = useQuery<ClientWorkSummary>({
    queryKey: ["/api/reports/v2/clients", clientId, "work-summary", range],
    queryFn: async () => {
      const res = await fetch(`/api/reports/v2/clients/${clientId}/work-summary?${buildDateParams(range)}`);
      if (!res.ok) throw new Error("Failed to load client report");
      return res.json();
    },
    staleTime: 60_000,
  });

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const response = await fetch(
        `/api/reports/v2/clients/${clientId}/work-summary.csv?${buildDateParams(range)}`,
      );
      if (!response.ok) throw new Error("Failed to export client report");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `client-work-summary-${clientId}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-28" />)}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (isError || !report) {
    return (
      <Alert variant="destructive" data-testid="client-report-error">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Client report unavailable</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
          <span>{error instanceof Error ? error.message : "The report could not be loaded."}</span>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="mr-1 h-4 w-4" />
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-medium">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          Reports
        </h2>
        {showBackButton ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.dispatchEvent(new CustomEvent("navigate-client-tab", { detail: "overview" }))}
            className="text-muted-foreground hover:text-foreground"
            data-testid="button-back-to-overview"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Overview
          </Button>
        ) : null}
      </div>

      <ReportCommandCenterLayout
        title="Client Work Summary"
        description="Time, project, task, and contributor reporting for this client"
        icon={<BarChart3 className="h-5 w-5" />}
        rangeDays={range}
        onRangeChange={setRange}
      >
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryCard
              title="Range Hours"
              value={formatHours(report.totals.rangeHours)}
              sub={`${report.totals.timeEntries} time entries`}
              icon={<Clock className="h-4 w-4 text-muted-foreground" />}
              testId="card-total-hours"
            />
            <SummaryCard
              title="YTD Hours"
              value={formatHours(report.totals.ytdHours)}
              sub="Since January 1"
              icon={<CalendarIcon className="h-4 w-4 text-muted-foreground" />}
              testId="card-ytd-hours"
            />
            <SummaryCard
              title="Lifetime Hours"
              value={formatHours(report.totals.lifetimeHours)}
              sub="Since client/project history began"
              icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
              testId="card-lifetime-hours"
            />
            <SummaryCard
              title="Active Projects"
              value={report.totals.activeProjects}
              sub={`${report.totals.openTasks} open tasks`}
              icon={<FolderKanban className="h-4 w-4 text-muted-foreground" />}
              testId="card-active-projects"
            />
            <SummaryCard
              title="Overdue Tasks"
              value={report.totals.overdueTasks}
              sub={`${report.totals.completedInRange} completed in range`}
              icon={<CheckSquare className="h-4 w-4 text-muted-foreground" />}
              testId="card-overdue-tasks"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Project Investment</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Project</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Range</TableHead>
                        <TableHead className="text-right">YTD</TableHead>
                        <TableHead className="text-right">Lifetime</TableHead>
                        <TableHead className="text-right">Open</TableHead>
                        <TableHead className="text-right">Overdue</TableHead>
                        <TableHead>Progress</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.projects.map((project) => (
                        <TableRow key={project.projectId}>
                          <TableCell>
                            <Link href={`/projects/${project.projectId}`} className="font-medium hover:underline">
                              {project.projectName}
                            </Link>
                          </TableCell>
                          <TableCell><Badge variant="secondary">{project.status}</Badge></TableCell>
                          <TableCell className="text-right">{formatHours(project.rangeHours)}</TableCell>
                          <TableCell className="text-right">{formatHours(project.ytdHours)}</TableCell>
                          <TableCell className="text-right">{formatHours(project.lifetimeHours)}</TableCell>
                          <TableCell className="text-right">{project.openTasks}</TableCell>
                          <TableCell className="text-right">{project.overdueTasks}</TableCell>
                          <TableCell>{project.completionPercent}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Contributors</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {report.contributors.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No contributor time in this range.</p>
                  ) : report.contributors.slice(0, 8).map((contributor) => (
                    <div key={contributor.userId} className="flex items-center justify-between gap-3 rounded-md border border-border/70 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{contributor.name}</p>
                        <p className="text-xs text-muted-foreground">{contributor.entries} entries</p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold">{formatHours(contributor.rangeHours)}h</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Task Investment</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead><DataPointLabel label="Task" definition="Task where this work is tracked." source="tasks" /></TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead className="text-right">Range Hours</TableHead>
                      <TableHead className="text-right">Lifetime</TableHead>
                      <TableHead className="text-right">Estimate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.tasks.slice(0, 100).map((task) => (
                      <TableRow key={task.taskId}>
                        <TableCell className="max-w-80 truncate font-medium">{task.title}</TableCell>
                        <TableCell className="text-muted-foreground">{task.projectName}</TableCell>
                        <TableCell><Badge variant="outline">{task.status}</Badge></TableCell>
                        <TableCell>{task.dueDate ? format(new Date(task.dueDate), "MMM d, yyyy") : "—"}</TableCell>
                        <TableCell className="text-right">{formatHours(task.rangeHours)}</TableCell>
                        <TableCell className="text-right">{formatHours(task.lifetimeHours)}</TableCell>
                        <TableCell className="text-right">{formatHours(task.estimateHours)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-time-entries">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Recent Time Entries</CardTitle>
              {report.totals.timeEntries > 0 && (
                <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={isExporting} data-testid="button-export-csv">
                  <Download className="mr-1 h-4 w-4" />
                  {isExporting ? "Exporting..." : "Export CSV"}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table data-testid="table-time-entries">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Task</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead className="text-right">Duration</TableHead>
                      <TableHead>Scope</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.recentEntries.map((entry) => (
                      <TableRow key={entry.id} data-testid={`row-time-entry-${entry.id}`}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {entry.startTime ? format(new Date(entry.startTime), "MMM d, yyyy") : "—"}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-sm">{entry.title || "Untitled"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{entry.projectName || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{entry.taskTitle || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{entry.userName || "—"}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatDuration(entry.durationSeconds)}</TableCell>
                        <TableCell>
                          <Badge variant={entry.scope === "out_of_scope" ? "default" : "secondary"}>
                            {entry.scope === "out_of_scope" ? "Billable" : "Non-billable"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {report.recentEntries.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                          No time entries recorded for this client in the selected range.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </ReportCommandCenterLayout>
    </div>
  );
}
