import { useMemo, useState } from "react";
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
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import {
  ReportCommandCenterLayout,
  buildDateParams,
  type ReportRangeValue,
} from "@/components/reports/report-command-center-layout";
import { fetchReport as fetch } from "@/components/reports/report-fetch";
import { DataPointHelp } from "@/components/data-point-help";
import {
  nextTableSortState,
  sortTableRows,
  type SortDirection,
  type TableSortState,
} from "@/lib/table-sort";

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

type ProjectSortField = "projectName" | "status" | "rangeHours" | "ytdHours" | "lifetimeHours" | "openTasks" | "overdueTasks" | "completionPercent";
type TaskSortField = "title" | "projectName" | "status" | "dueDate" | "rangeHours" | "lifetimeHours" | "estimateHours";
type EntrySortField = "startTime" | "title" | "projectName" | "taskTitle" | "userName" | "durationSeconds" | "scope";

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
  const [projectSort, setProjectSort] = useState<TableSortState<ProjectSortField>>({ key: "rangeHours", direction: "desc" });
  const [taskSort, setTaskSort] = useState<TableSortState<TaskSortField>>({ key: "rangeHours", direction: "desc" });
  const [entrySort, setEntrySort] = useState<TableSortState<EntrySortField>>({ key: "startTime", direction: "desc" });

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

  const sortedProjects = useMemo(() => {
    const rows = report?.projects ?? [];
    if (!projectSort.key) return rows;
    const key = projectSort.key;
    return sortTableRows(rows, (row) => row[key], projectSort.direction);
  }, [projectSort, report?.projects]);

  const sortedTasks = useMemo(() => {
    const rows = report?.tasks ?? [];
    if (!taskSort.key) return rows;
    const key = taskSort.key;
    return sortTableRows(rows, (row) => row[key], taskSort.direction);
  }, [report?.tasks, taskSort]);

  const sortedEntries = useMemo(() => {
    const rows = report?.recentEntries ?? [];
    if (!entrySort.key) return rows;
    const key = entrySort.key;
    return sortTableRows(rows, (row) => row[key], entrySort.direction);
  }, [entrySort, report?.recentEntries]);

  const requestProjectSort = (key: ProjectSortField, firstDirection: SortDirection = "desc") => {
    setProjectSort((current) => nextTableSortState(current, key, firstDirection));
  };
  const requestTaskSort = (key: TaskSortField, firstDirection: SortDirection = "desc") => {
    setTaskSort((current) => nextTableSortState(current, key, firstDirection));
  };
  const requestEntrySort = (key: EntrySortField, firstDirection: SortDirection = "desc") => {
    setEntrySort((current) => nextTableSortState(current, key, firstDirection));
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
          Client Intelligence
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
        title="Client Intelligence Report"
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
                        <SortableTableHead label="Project" columnLabel="project name" active={projectSort.key === "projectName"} direction={projectSort.direction} onSort={() => requestProjectSort("projectName", "asc")} />
                        <SortableTableHead label="Status" columnLabel="project status" active={projectSort.key === "status"} direction={projectSort.direction} onSort={() => requestProjectSort("status", "asc")} />
                        <SortableTableHead label="Range" columnLabel="range hours" active={projectSort.key === "rangeHours"} direction={projectSort.direction} onSort={() => requestProjectSort("rangeHours")} align="right" testId="sort-client-project-range" />
                        <SortableTableHead label="YTD" columnLabel="year-to-date hours" active={projectSort.key === "ytdHours"} direction={projectSort.direction} onSort={() => requestProjectSort("ytdHours")} align="right" />
                        <SortableTableHead label="Lifetime" columnLabel="lifetime hours" active={projectSort.key === "lifetimeHours"} direction={projectSort.direction} onSort={() => requestProjectSort("lifetimeHours")} align="right" />
                        <SortableTableHead label="Open" columnLabel="open tasks" active={projectSort.key === "openTasks"} direction={projectSort.direction} onSort={() => requestProjectSort("openTasks")} align="right" />
                        <SortableTableHead label="Overdue" columnLabel="overdue tasks" active={projectSort.key === "overdueTasks"} direction={projectSort.direction} onSort={() => requestProjectSort("overdueTasks")} align="right" />
                        <SortableTableHead label="Progress" columnLabel="project progress" active={projectSort.key === "completionPercent"} direction={projectSort.direction} onSort={() => requestProjectSort("completionPercent")} />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedProjects.map((project) => (
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
                      <SortableTableHead label="Task" columnLabel="task name" active={taskSort.key === "title"} direction={taskSort.direction} onSort={() => requestTaskSort("title", "asc")} help={<DataPointHelp label="Task" definition="Task where this work is tracked." source="tasks" />} />
                      <SortableTableHead label="Project" columnLabel="project name" active={taskSort.key === "projectName"} direction={taskSort.direction} onSort={() => requestTaskSort("projectName", "asc")} />
                      <SortableTableHead label="Status" columnLabel="task status" active={taskSort.key === "status"} direction={taskSort.direction} onSort={() => requestTaskSort("status", "asc")} />
                      <SortableTableHead label="Due" columnLabel="due date" active={taskSort.key === "dueDate"} direction={taskSort.direction} onSort={() => requestTaskSort("dueDate")} />
                      <SortableTableHead label="Range Hours" columnLabel="range hours" active={taskSort.key === "rangeHours"} direction={taskSort.direction} onSort={() => requestTaskSort("rangeHours")} align="right" testId="sort-client-task-range" />
                      <SortableTableHead label="Lifetime" columnLabel="lifetime hours" active={taskSort.key === "lifetimeHours"} direction={taskSort.direction} onSort={() => requestTaskSort("lifetimeHours")} align="right" />
                      <SortableTableHead label="Estimate" columnLabel="estimated hours" active={taskSort.key === "estimateHours"} direction={taskSort.direction} onSort={() => requestTaskSort("estimateHours")} align="right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedTasks.slice(0, 100).map((task) => (
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
                      <SortableTableHead label="Date" columnLabel="entry date" active={entrySort.key === "startTime"} direction={entrySort.direction} onSort={() => requestEntrySort("startTime")} />
                      <SortableTableHead label="Title" columnLabel="entry title" active={entrySort.key === "title"} direction={entrySort.direction} onSort={() => requestEntrySort("title", "asc")} />
                      <SortableTableHead label="Project" columnLabel="project name" active={entrySort.key === "projectName"} direction={entrySort.direction} onSort={() => requestEntrySort("projectName", "asc")} />
                      <SortableTableHead label="Task" columnLabel="task name" active={entrySort.key === "taskTitle"} direction={entrySort.direction} onSort={() => requestEntrySort("taskTitle", "asc")} />
                      <SortableTableHead label="Employee" columnLabel="employee name" active={entrySort.key === "userName"} direction={entrySort.direction} onSort={() => requestEntrySort("userName", "asc")} />
                      <SortableTableHead label="Duration" columnLabel="duration" active={entrySort.key === "durationSeconds"} direction={entrySort.direction} onSort={() => requestEntrySort("durationSeconds")} align="right" />
                      <SortableTableHead label="Scope" columnLabel="billing scope" active={entrySort.key === "scope"} direction={entrySort.direction} onSort={() => requestEntrySort("scope", "asc")} />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedEntries.map((entry) => (
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
