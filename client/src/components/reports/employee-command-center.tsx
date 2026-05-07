import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Users, Clock, CheckSquare, AlertTriangle, TrendingUp,
  ChevronUp, ChevronDown, ArrowUpDown, CalendarRange, Activity,
  ShieldAlert, User, Award, Sparkles, FolderKanban, Info, Camera, X,
} from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import { getStorageUrl } from "@/lib/storageUrl";
import { ReportCommandCenterLayout, buildDateParams, getReportRangeLabel, type ReportRangeValue } from "./report-command-center-layout";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
import { ForecastSnapshotsTab } from "./forecast-snapshots-tab";
import { MobileTabSelect } from "./mobile-tab-select";
import { getEmployeeReportDrilldownPath, getEmployeeReportPath } from "./report-paths";
import { ReportEmptyState } from "./report-empty-state";
import { fetchReport as fetch } from "./report-fetch";
import {
  formatComparisonSub,
  MetricCard,
  ReportDataNote,
  reportUserInitials as userInitials,
  reportUserName as userName,
} from "./report-shared";

type SortDir = "asc" | "desc";

type OverviewSortField = "name" | "activeTasksNow" | "overdueCount" | "completedInRange" | "totalHours" | "utilizationPct" | "efficiencyRatio";

function SortIcon({ field, sortBy, sortDir }: { field: string; sortBy: string; sortDir: SortDir }) {
  if (sortBy !== field) return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/50 ml-1 shrink-0" />;
  return sortDir === "asc"
    ? <ChevronUp className="h-3.5 w-3.5 ml-1 shrink-0 text-primary" />
    : <ChevronDown className="h-3.5 w-3.5 ml-1 shrink-0 text-primary" />;
}

interface OverviewEmployee {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  avatarUrl: string | null;
  activeTasksNow: number;
  overdueCount: number;
  completedInRange: number;
  totalHours: number;
  billableHours: number;
  estimatedHours: number;
  utilizationPct: number | null;
  efficiencyRatio: number | null;
  completionRate: number | null;
}

interface EmployeeGroupUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  name?: string | null;
  email: string;
  avatarUrl: string | null;
  role: string;
  isActive?: boolean;
}

function buildEmployeeReportParams(rangeDays: ReportRangeValue, selectedUserIds: string[], extra?: Record<string, string>): string {
  return buildDateParams(rangeDays, {
    ...(selectedUserIds.length > 0 ? { userIds: selectedUserIds.join(",") } : {}),
    ...(extra ?? {}),
  });
}

function formatHours(hours: number): string {
  return `${formatNumber(hours, { maximumFractionDigits: 1 })}h`;
}

function EmployeeGroupFilter({
  selectedUserIds,
  onSelectedUserIdsChange,
}: {
  selectedUserIds: string[];
  onSelectedUserIdsChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selectedSet = useMemo(() => new Set(selectedUserIds), [selectedUserIds]);

  const { data: users = [], isLoading } = useQuery<EmployeeGroupUser[]>({
    queryKey: ["/api/users"],
    enabled: open || selectedUserIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const reportUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter((u) => u.isActive !== false && ["admin", "project_manager", "employee"].includes(u.role))
      .filter((u) => {
        if (!q) return true;
        return [userName(u), u.email, u.role].some((v) => v.toLowerCase().includes(q));
      })
      .sort((a, b) => userName(a).localeCompare(userName(b)));
  }, [search, users]);

  const selectedUsers = useMemo(() => {
    return users
      .filter((u) => selectedSet.has(u.id))
      .sort((a, b) => userName(a).localeCompare(userName(b)));
  }, [selectedSet, users]);

  function toggleUser(userId: string) {
    if (selectedSet.has(userId)) {
      onSelectedUserIdsChange(selectedUserIds.filter((id) => id !== userId));
      return;
    }
    onSelectedUserIdsChange([...selectedUserIds, userId]);
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 h-9" data-testid="button-employee-group-filter">
            <Users className="h-3.5 w-3.5" />
            {selectedUserIds.length > 0 ? `${selectedUserIds.length} selected` : "All employees"}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[28rem] max-w-[calc(100vw-2rem)] p-0">
          <div className="p-2 border-b">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search employees..."
              className="h-8"
              data-testid="input-search-employee-group"
            />
          </div>
          <div className="border-b px-3 py-1.5 text-xs text-muted-foreground">
            {isLoading ? "Loading employees..." : `${reportUsers.length} employee${reportUsers.length === 1 ? "" : "s"}`}
          </div>
          <ScrollArea className="max-h-[min(70vh,640px)]">
            <div className="p-1">
              {isLoading ? (
                <div className="px-2 py-4 text-sm text-muted-foreground">Loading employees...</div>
              ) : reportUsers.length === 0 ? (
                <div className="px-2 py-4 text-sm text-muted-foreground">No employees found</div>
              ) : (
                reportUsers.map((u) => {
                  const selected = selectedSet.has(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      className={cn("w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover-elevate", selected && "bg-primary/5")}
                      onClick={() => toggleUser(u.id)}
                      data-testid={`button-toggle-report-employee-${u.id}`}
                    >
                      <Checkbox checked={selected} aria-hidden className="pointer-events-none" />
                      <Avatar className="h-6 w-6">
                        {u.avatarUrl && <AvatarImage src={getStorageUrl(u.avatarUrl)} alt={userName(u)} />}
                        <AvatarFallback className="text-[10px]">{userInitials(u)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{userName(u)}</div>
                        <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>
          {selectedUserIds.length > 0 && (
            <div className="border-t p-2">
              <Button variant="ghost" size="sm" className="w-full h-8" onClick={() => onSelectedUserIdsChange([])} data-testid="button-clear-employee-group">
                Clear selection
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
      {selectedUsers.slice(0, 3).map((u) => (
        <Badge key={u.id} variant="secondary" className="gap-1 max-w-40">
          <span className="truncate">{userName(u)}</span>
          <button type="button" onClick={() => toggleUser(u.id)} className="rounded hover:bg-background/80" aria-label={`Remove ${userName(u)}`}>
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      {selectedUsers.length > 3 && <Badge variant="outline">+{formatNumber(selectedUsers.length - 3)}</Badge>}
    </div>
  );
}

function OverviewTab({ rangeDays, selectedUserIds }: { rangeDays: ReportRangeValue; selectedUserIds: string[] }) {
  const [sortBy, setSortBy] = useState<OverviewSortField>("overdueCount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data, isLoading } = useQuery<{
    employees: OverviewEmployee[];
    summary?: {
      current: {
        activeTasks: number;
        overdueTasks: number;
        totalHours: number;
        avgUtilization: number;
      };
      prior: {
        activeTasks: number;
        overdueTasks: number;
        totalHours: number;
        avgUtilization: number;
      };
    };
    pagination: { total: number; limit: number; offset: number };
    range: { startDate: string; endDate: string };
  }>({
    queryKey: ["/api/reports/v2/employee/overview", rangeDays, selectedUserIds],
    queryFn: async () => {
      const res = await fetch(`/api/reports/v2/employee/overview?${buildEmployeeReportParams(rangeDays, selectedUserIds, { limit: "100" })}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  const totals = useMemo(() => {
    if (data?.summary) {
      return {
        activeTasks: data.summary.current.activeTasks,
        overdueTasks: data.summary.current.overdueTasks,
        totalHours: data.summary.current.totalHours,
        avgUtilization: data.summary.current.avgUtilization,
        prior: data.summary.prior,
      };
    }
    if (!data?.employees) return null;
    const emps = data.employees;
    return {
      activeTasks: emps.reduce((s, e) => s + e.activeTasksNow, 0),
      overdueTasks: emps.reduce((s, e) => s + e.overdueCount, 0),
      totalHours: Math.round(emps.reduce((s, e) => s + e.totalHours, 0) * 10) / 10,
      avgUtilization: emps.length > 0
        ? Math.round(emps.filter(e => e.utilizationPct !== null).reduce((s, e) => s + (e.utilizationPct ?? 0), 0) / Math.max(emps.filter(e => e.utilizationPct !== null).length, 1))
        : 0,
      prior: null,
    };
  }, [data?.employees, data?.summary]);

  const sorted = useMemo(() => {
    if (!data?.employees) return [];
    return [...data.employees].sort((a, b) => {
      let av: number | string = 0, bv: number | string = 0;
      if (sortBy === "name") { av = userName(a); bv = userName(b); }
      else if (sortBy === "activeTasksNow") { av = a.activeTasksNow; bv = b.activeTasksNow; }
      else if (sortBy === "overdueCount") { av = a.overdueCount; bv = b.overdueCount; }
      else if (sortBy === "completedInRange") { av = a.completedInRange; bv = b.completedInRange; }
      else if (sortBy === "totalHours") { av = a.totalHours; bv = b.totalHours; }
      else if (sortBy === "utilizationPct") { av = a.utilizationPct ?? -1; bv = b.utilizationPct ?? -1; }
      else if (sortBy === "efficiencyRatio") { av = a.efficiencyRatio ?? -1; bv = b.efficiencyRatio ?? -1; }
      if (typeof av === "string") {
        return sortDir === "asc" ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
      }
      return sortDir === "asc" ? av - (bv as number) : (bv as number) - av;
    });
  }, [data?.employees, sortBy, sortDir]);

  const exceptionRows = useMemo(() => {
    if (!data?.employees) return { overloaded: [], lowCompliance: [] } as const;
    const overloaded = [...data.employees]
      .filter((e) => e.overdueCount > 0 || (e.utilizationPct ?? 0) >= 100)
      .sort((a, b) => {
        const overdueDelta = b.overdueCount - a.overdueCount;
        if (overdueDelta !== 0) return overdueDelta;
        return (b.utilizationPct ?? 0) - (a.utilizationPct ?? 0);
      })
      .slice(0, 5);
    const lowCompliance = [...data.employees]
      .filter((e) => e.activeTasksNow > 0 && e.totalHours <= 0)
      .sort((a, b) => b.activeTasksNow - a.activeTasksNow)
      .slice(0, 5);
    return { overloaded, lowCompliance };
  }, [data?.employees]);

  function toggleSort(field: OverviewSortField) {
    if (sortBy === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(field); setSortDir("desc"); }
  }

  function Th({ field, children }: { field: OverviewSortField; children: React.ReactNode }) {
    return (
      <TableHead
        className="cursor-pointer select-none whitespace-nowrap"
        onClick={() => toggleSort(field)}
        data-testid={`th-overview-${field}`}
      >
        <div className="flex items-center">
          {children}
          <SortIcon field={field} sortBy={sortBy} sortDir={sortDir} />
        </div>
      </TableHead>
    );
  }

  if (isLoading) return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
    </div>
  );

  const range = getReportRangeLabel(rangeDays);

  return (
    <div className="space-y-4">
      {totals && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard
            label="Active Tasks Now"
            value={totals.activeTasks}
            sub="Current snapshot"
            icon={<CheckSquare className="h-4 w-4 text-white" />}
            color="bg-blue-500"
            definition="Open, non-cancelled tenant work currently assigned to reportable users. Personal tasks are excluded."
            source="tasks + task assignees"
          />
          <MetricCard
            label="Overdue Now"
            value={totals.overdueTasks}
            sub="Current snapshot"
            icon={<AlertTriangle className="h-4 w-4 text-white" />}
            color="bg-red-500"
            definition="Assigned open work with a due date earlier than now. Personal tasks are excluded."
            source="tasks + task assignees"
          />
          <MetricCard
            label="Hours Tracked"
            value={`${totals.totalHours}h`}
            sub={totals.prior ? formatComparisonSub(totals.totalHours, totals.prior.totalHours, "h") : undefined}
            icon={<Clock className="h-4 w-4 text-white" />}
            color="bg-violet-500"
            definition="Sum of tracked time entries started inside the selected range."
            source="time entries"
          />
          <MetricCard
            label="Avg Utilization"
            value={`${totals.avgUtilization}%`}
            sub={totals.prior ? formatComparisonSub(totals.avgUtilization, totals.prior.avgUtilization, "%") : undefined}
            icon={<TrendingUp className="h-4 w-4 text-white" />}
            color="bg-green-500"
            definition="Average tracked hours divided by an 8-hour workday baseline for the selected date range."
            source="time entries"
          />
        </div>
      )}
      {(exceptionRows.overloaded.length > 0 || exceptionRows.lowCompliance.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Overloaded Or Overdue
              </CardTitle>
              <CardDescription className="text-xs">Highest-risk employees in the current window</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {exceptionRows.overloaded.length === 0 ? (
                <p className="text-sm text-muted-foreground">No overloaded employees right now.</p>
              ) : exceptionRows.overloaded.map((e) => (
                <Link
                  key={e.userId}
                  href={getEmployeeReportDrilldownPath(window.location.pathname, e.userId, { range, section: "risk" })}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2 hover:bg-muted/60"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{userName(e)}</p>
                    <p className="text-xs text-muted-foreground">{formatNumber(e.overdueCount)} overdue, {formatNumber(e.activeTasksNow)} active</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-red-600 dark:text-red-400">{formatNumber(e.overdueCount)}</p>
                    <p className="text-xs text-muted-foreground">{e.utilizationPct ?? 0}% util</p>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" />
                Active Work, No Time Logged
              </CardTitle>
              <CardDescription className="text-xs">Employees with active tasks but no tracked time in range</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {exceptionRows.lowCompliance.length === 0 ? (
                <p className="text-sm text-muted-foreground">No low-compliance employees in this range.</p>
              ) : exceptionRows.lowCompliance.map((e) => (
                <Link
                  key={e.userId}
                  href={getEmployeeReportDrilldownPath(window.location.pathname, e.userId, { range, section: "time" })}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2 hover:bg-muted/60"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{userName(e)}</p>
                    <p className="text-xs text-muted-foreground">{formatNumber(e.activeTasksNow)} active tasks</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">0h</p>
                    <p className="text-xs text-muted-foreground">tracked</p>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
      <div className="md:hidden space-y-3">
        {sorted.map((e) => (
          <Card key={e.userId} data-testid={`card-employee-overview-mobile-${e.userId}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarImage src={getStorageUrl(e.avatarUrl) ?? ""} alt={userName(e)} />
                  <AvatarFallback className="text-xs">{userInitials(e)}</AvatarFallback>
                </Avatar>
                <Link href={getEmployeeReportPath(window.location.pathname, e.userId)} className="text-sm font-semibold truncate hover:underline text-primary cursor-pointer">
                  {userName(e)}
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Active</span>
                  <Link href={getEmployeeReportDrilldownPath(window.location.pathname, e.userId, { range, section: "workload" })} className="font-medium text-primary hover:underline">
                    {formatNumber(e.activeTasksNow)}
                  </Link>
                </div>
                <div>
                  <span className="text-muted-foreground">Overdue</span>
                  <Link
                    href={getEmployeeReportDrilldownPath(window.location.pathname, e.userId, { range, section: "risk" })}
                    className={cn("font-medium hover:underline", e.overdueCount > 0 ? "text-red-600 dark:text-red-400" : "text-primary")}
                  >
                    {formatNumber(e.overdueCount)}
                  </Link>
                </div>
                <div>
                  <span className="text-muted-foreground">Completed</span>
                  <Link href={getEmployeeReportDrilldownPath(window.location.pathname, e.userId, { range, section: "assigned-tasks" })} className="font-medium text-green-600 hover:underline dark:text-green-400">
                    {formatNumber(e.completedInRange)}
                  </Link>
                </div>
                <div>
                  <span className="text-muted-foreground">Hours</span>
                  <Link href={getEmployeeReportDrilldownPath(window.location.pathname, e.userId, { range, section: "time" })} className="font-medium text-primary hover:underline">
                    {formatHours(e.totalHours)}
                  </Link>
                </div>
              </div>
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Utilization</span>
                  <span>{e.utilizationPct ?? 0}%</span>
                </div>
                <Progress value={e.utilizationPct ?? 0} className="h-1.5" />
              </div>
            </CardContent>
          </Card>
        ))}
        {sorted.length === 0 && (
          <p className="text-center text-muted-foreground text-sm py-8">No employee data found</p>
        )}
      </div>

      <div className="hidden md:block">
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <Th field="name">Employee</Th>
                    <Th field="activeTasksNow">Active</Th>
                    <Th field="overdueCount">Overdue</Th>
                    <Th field="completedInRange">Completed</Th>
                    <Th field="totalHours">Hours</Th>
                    <Th field="utilizationPct">Utilization%</Th>
                    <Th field="efficiencyRatio">Efficiency</Th>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((e) => (
                    <TableRow key={e.userId} data-testid={`row-employee-overview-${e.userId}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7 shrink-0">
                            <AvatarImage src={getStorageUrl(e.avatarUrl) ?? ""} alt={userName(e)} />
                            <AvatarFallback className="text-xs">{userInitials(e)}</AvatarFallback>
                          </Avatar>
                          <Link href={getEmployeeReportPath(window.location.pathname, e.userId)} className="text-sm font-medium truncate max-w-[140px] hover:underline text-primary cursor-pointer">
                            {userName(e)}
                          </Link>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        <Link href={getEmployeeReportDrilldownPath(window.location.pathname, e.userId, { range, section: "workload" })} className="text-primary hover:underline">
                          {formatNumber(e.activeTasksNow)}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={getEmployeeReportDrilldownPath(window.location.pathname, e.userId, { range, section: "risk" })}
                          className={cn("text-sm font-medium hover:underline", e.overdueCount > 0 ? "text-red-600 dark:text-red-400" : "text-primary")}
                        >
                          {formatNumber(e.overdueCount)}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-green-600 dark:text-green-400 font-medium">
                        <Link href={getEmployeeReportDrilldownPath(window.location.pathname, e.userId, { range, section: "assigned-tasks" })} className="hover:underline">
                          {formatNumber(e.completedInRange)}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">
                        <Link href={getEmployeeReportDrilldownPath(window.location.pathname, e.userId, { range, section: "time" })} className="text-primary hover:underline">
                          {formatHours(e.totalHours)}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-[80px]">
                          <Progress value={e.utilizationPct ?? 0} className="h-1.5 flex-1" />
                          <Link href={getEmployeeReportDrilldownPath(window.location.pathname, e.userId, { range, section: "capacity" })} className="text-xs text-primary w-10 text-right hover:underline">
                            {e.utilizationPct ?? 0}%
                          </Link>
                        </div>
                      </TableCell>
                      <TableCell>
                        {e.efficiencyRatio !== null ? (
                          <Link href={getEmployeeReportDrilldownPath(window.location.pathname, e.userId, { range, section: "time" })}>
                            <Badge variant={e.efficiencyRatio > 1.2 ? "destructive" : e.efficiencyRatio > 0.8 ? "default" : "secondary"} className="cursor-pointer hover:opacity-90">
                              {(e.efficiencyRatio * 100).toFixed(0)}%
                            </Badge>
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {sorted.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">No employee data found</TableCell>
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

interface WorkloadEmployee {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  assignedCount: number;
  dueSoonCount: number;
  overdueCount: number;
  avgCompletionDays: number | null;
  backlogCount: number;
}

function WorkloadTab({ rangeDays, selectedUserIds }: { rangeDays: ReportRangeValue; selectedUserIds: string[] }) {
  const { data, isLoading } = useQuery<{
    employees: WorkloadEmployee[];
    pagination: { total: number };
    range: { startDate: string; endDate: string };
  }>({
    queryKey: ["/api/reports/v2/employee/workload", rangeDays, selectedUserIds],
    queryFn: async () => {
      const res = await fetch(`/api/reports/v2/employee/workload?${buildEmployeeReportParams(rangeDays, selectedUserIds, { limit: "100" })}`);
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

  const range = getReportRangeLabel(rangeDays);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Time By Employee</CardTitle>
        <CardDescription className="text-xs">Billable means out-of-scope client work; all other tracked scopes are treated as non-billable here.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Assigned</TableHead>
                <TableHead>Due Soon</TableHead>
                <TableHead>Overdue</TableHead>
                <TableHead>Avg Completion Days</TableHead>
                <TableHead>Backlog</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.employees ?? []).map((e) => (
                <TableRow key={e.userId} data-testid={`row-employee-workload-${e.userId}`}>
                  <TableCell>
                    <Link href={getEmployeeReportPath(window.location.pathname, e.userId)} className="text-sm font-medium hover:underline text-primary cursor-pointer">
                      {userName(e)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">
                    <Link href={getEmployeeReportDrilldownPath(window.location.pathname, e.userId, { range, section: "workload" })} className="text-primary hover:underline">
                      {formatNumber(e.assignedCount)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {e.dueSoonCount > 0 ? (
                      <Link href={getEmployeeReportDrilldownPath(window.location.pathname, e.userId, { range, section: "workload" })}>
                        <Badge variant="secondary" className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 cursor-pointer hover:opacity-90">
                          {formatNumber(e.dueSoonCount)}
                        </Badge>
                      </Link>
                    ) : (
                      <span className="text-sm text-muted-foreground">{formatNumber(e.dueSoonCount)}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={getEmployeeReportDrilldownPath(window.location.pathname, e.userId, { range, section: "risk" })}
                      className={cn("text-sm font-medium hover:underline", e.overdueCount > 0 ? "text-red-600 dark:text-red-400" : "text-primary")}
                    >
                      {formatNumber(e.overdueCount)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {e.avgCompletionDays !== null ? (
                      <Link href={getEmployeeReportDrilldownPath(window.location.pathname, e.userId, { range, section: "assigned-tasks" })} className="text-primary hover:underline">
                        {`${Math.round(e.avgCompletionDays * 10) / 10}d`}
                      </Link>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    {e.backlogCount >= 5 ? (
                      <Link href={getEmployeeReportDrilldownPath(window.location.pathname, e.userId, { range, section: "workload" })}>
                        <Badge variant="destructive" className="cursor-pointer hover:opacity-90">{formatNumber(e.backlogCount)}</Badge>
                      </Link>
                    ) : e.backlogCount >= 3 ? (
                      <Link href={getEmployeeReportDrilldownPath(window.location.pathname, e.userId, { range, section: "workload" })}>
                        <Badge variant="default" className="bg-orange-500 cursor-pointer hover:opacity-90">{formatNumber(e.backlogCount)}</Badge>
                      </Link>
                    ) : (
                      <Link href={getEmployeeReportDrilldownPath(window.location.pathname, e.userId, { range, section: "workload" })} className="text-sm text-primary hover:underline">
                        {formatNumber(e.backlogCount)}
                      </Link>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {(data?.employees ?? []).length === 0 && !isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No workload data found</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

interface TimeEmployee {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  totalHours: number;
  billableHours: number;
  nonBillableHours: number;
  avgHoursPerDay: number;
  estimatedHours: number;
  varianceHours: number;
}

function TimeTab({ rangeDays, selectedUserIds }: { rangeDays: ReportRangeValue; selectedUserIds: string[] }) {
  const { data, isLoading } = useQuery<{
    employees: TimeEmployee[];
    pagination: { total: number };
    range: { startDate: string; endDate: string };
  }>({
    queryKey: ["/api/reports/v2/employee/time", rangeDays, selectedUserIds],
    queryFn: async () => {
      const res = await fetch(`/api/reports/v2/employee/time?${buildEmployeeReportParams(rangeDays, selectedUserIds, { limit: "100" })}`);
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

  const range = getReportRangeLabel(rangeDays);

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Total Hrs</TableHead>
                <TableHead>Billable</TableHead>
                <TableHead>Non-Bill</TableHead>
                <TableHead>Avg/Day</TableHead>
                <TableHead>Est Hrs</TableHead>
                <TableHead>Variance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.employees ?? []).map((e) => (
                <TableRow key={e.userId} data-testid={`row-employee-time-${e.userId}`}>
                  <TableCell>
                    <Link href={getEmployeeReportPath(window.location.pathname, e.userId)} className="text-sm font-medium hover:underline text-primary cursor-pointer">
                      {userName(e)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    <Link href={getEmployeeReportDrilldownPath(window.location.pathname, e.userId, { range, section: "time" })} className="text-primary hover:underline">
                      {formatHours(e.totalHours)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1 min-w-[80px]">
                      <Link href={getEmployeeReportDrilldownPath(window.location.pathname, e.userId, { range, section: "time" })} className="text-sm text-primary hover:underline">
                        {formatHours(e.billableHours)}
                      </Link>
                      {e.totalHours > 0 && (
                        <Progress value={Math.round(e.billableHours / e.totalHours * 100)} className="h-1" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    <Link href={getEmployeeReportDrilldownPath(window.location.pathname, e.userId, { range, section: "time" })} className="text-primary hover:underline">
                      {formatHours(e.nonBillableHours)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    <Link href={getEmployeeReportDrilldownPath(window.location.pathname, e.userId, { range, section: "time" })} className="text-primary hover:underline">
                      {formatHours(e.avgHoursPerDay)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    <Link href={getEmployeeReportDrilldownPath(window.location.pathname, e.userId, { range, section: "time" })} className="text-primary hover:underline">
                      {formatHours(e.estimatedHours)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={getEmployeeReportDrilldownPath(window.location.pathname, e.userId, { range, section: "time" })}
                      className={cn(
                        "text-sm font-medium hover:underline",
                        e.varianceHours > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                      )}
                    >
                      {e.varianceHours > 0 ? "+" : ""}{formatHours(e.varianceHours)}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {(data?.employees ?? []).length === 0 && !isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">No time data found</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function CapacityTab({ rangeDays, selectedUserIds }: { rangeDays: ReportRangeValue; selectedUserIds: string[] }) {
  const { data, isLoading } = useQuery<{
    users: Array<{
      userId: string;
      firstName: string | null;
      lastName: string | null;
      email: string;
      weeks: Array<{
        weekStart: string;
        plannedHours: number;
        actualHours: number;
        utilizationPct: number | null;
        overAllocated: boolean;
      }>;
    }>;
    range: { startDate: string; endDate: string };
  }>({
    queryKey: ["/api/reports/v2/employee/capacity", rangeDays, selectedUserIds],
    queryFn: async () => {
      const res = await fetch(`/api/reports/v2/employee/capacity?${buildEmployeeReportParams(rangeDays, selectedUserIds)}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  if (isLoading) return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
    </div>
  );

  if (!data?.users.length) return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
      <CalendarRange className="h-10 w-10 opacity-30" />
      <p className="text-sm">No capacity data available</p>
    </div>
  );

  const range = getReportRangeLabel(rangeDays);

  const weeks = data.users[0]?.weeks.map(w => w.weekStart) ?? [];

  function utilizationColor(pct: number | null) {
    if (pct === null) return "bg-muted text-muted-foreground";
    if (pct > 100) return "bg-red-500 text-white";
    if (pct > 80) return "bg-orange-500 text-white";
    if (pct > 50) return "bg-green-500 text-white";
    return "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300";
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Weekly Capacity Grid</CardTitle>
          <CardDescription className="text-xs">
            Actual hours tracked per week. Color: blue = low, green = moderate (50–80%), orange = busy (80–100%), red = overloaded (&gt;100% of 40h).
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <p className="text-xs text-muted-foreground md:hidden px-3 pt-2 pb-1">Scroll to see all weeks</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-medium text-muted-foreground w-40">Employee</th>
                  {weeks.map((w) => (
                    <th key={w} className="text-center p-2 font-medium text-muted-foreground text-xs whitespace-nowrap min-w-[90px]">
                      {new Date(w).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.userId} className="border-b last:border-0">
                    <td className="p-3">
                      <Link href={getEmployeeReportPath(window.location.pathname, u.userId)} className="font-medium text-sm truncate max-w-[130px] block hover:underline text-primary cursor-pointer">
                        {userName(u)}
                      </Link>
                    </td>
                    {u.weeks.map((w) => (
                      <td key={w.weekStart} className="p-2 text-center">
                        <div
                          className={cn(
                            "inline-flex flex-col items-center px-2 py-1 rounded-md text-xs font-medium min-w-[60px]",
                            utilizationColor(w.utilizationPct)
                          )}
                          title={`${formatHours(w.actualHours)} tracked, ${formatHours(w.plannedHours)} planned`}
                          data-testid={`capacity-cell-${u.userId}-${w.weekStart}`}
                        >
                          <span>{formatHours(w.actualHours)}</span>
                          {w.utilizationPct !== null && (
                            <Link href={getEmployeeReportDrilldownPath(window.location.pathname, u.userId, { range, section: "capacity" })} className="opacity-80 hover:underline">
                              {formatNumber(w.utilizationPct)}%
                            </Link>
                          )}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function RiskTab({ rangeDays, selectedUserIds }: { rangeDays: ReportRangeValue; selectedUserIds: string[] }) {
  const { data, isLoading } = useQuery<{
    flagged: Array<{
      userId: string;
      firstName: string | null;
      lastName: string | null;
      email: string;
      avatarUrl: string | null;
      reasons: string[];
      score: number;
      metrics: {
        activeTasks: number;
        overdueCount: number;
        totalHours: number;
        avgHoursPerWeek: number;
        overdueRate: number;
      };
    }>;
    totalChecked: number;
    range: { startDate: string; endDate: string };
  }>({
    queryKey: ["/api/reports/v2/employee/risk", rangeDays, selectedUserIds],
    queryFn: async () => {
      const res = await fetch(`/api/reports/v2/employee/risk?${buildEmployeeReportParams(rangeDays, selectedUserIds)}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  const range = getReportRangeLabel(rangeDays);
  const topReasons = useMemo(() => {
    const counts = new Map<string, number>();
    (data?.flagged ?? []).flatMap((u) => u.reasons).forEach((reason) => {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [data?.flagged]);

  if (isLoading) return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
    </div>
  );

  function scoreColor(score: number) {
    if (score >= 5) return "bg-red-100 dark:bg-red-900/30 border-red-200 dark:border-red-800";
    if (score >= 3) return "bg-orange-100 dark:bg-orange-900/30 border-orange-200 dark:border-orange-800";
    return "bg-yellow-100 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800";
  }

  function scoreLabel(score: number) {
    if (score >= 5) return { label: "Critical", variant: "destructive" as const };
    if (score >= 3) return { label: "At Risk", variant: "default" as const };
    return { label: "Watch", variant: "secondary" as const };
  }

  return (
    <div className="space-y-4">
      <ReportDataNote
        items={[
          "Risk checks active task load, overdue rate, time compliance, and stale backlog.",
          "Personal tasks are excluded.",
          "Thresholds are directional signals, not payroll or performance decisions.",
        ]}
      />
      {data && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Activity className="h-4 w-4" />
          <span>Checked {formatNumber(data.totalChecked)} employees — {formatNumber(data.flagged.length)} flagged for attention</span>
        </div>
      )}
      {topReasons.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Top Risk Drivers</CardTitle>
            <CardDescription className="text-xs">Most common reasons employees are being flagged</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-2">
            {topReasons.map(([reason, count]) => (
              <div key={reason} className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm flex items-center justify-between gap-3">
                <span className="truncate">{reason}</span>
                <Badge variant="secondary">{formatNumber(count)}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {data?.flagged.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <ShieldAlert className="h-10 w-10 opacity-30" />
          <p className="text-sm font-medium">No risk flags detected</p>
          <p className="text-xs">All employees look within normal workload ranges</p>
        </div>
      )}

      {data?.flagged.map((u) => {
        const { label, variant } = scoreLabel(u.score);
        return (
          <Card key={u.userId} className={cn("border", scoreColor(u.score))} data-testid={`risk-card-employee-${u.userId}`}>
            <CardContent className="p-4">
              <Link href={getEmployeeReportDrilldownPath(window.location.pathname, u.userId, { range, section: "risk" })} className="flex items-start gap-3">
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarImage src={getStorageUrl(u.avatarUrl) ?? ""} alt={userName(u)} />
                  <AvatarFallback className="text-xs">{userInitials(u)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="font-semibold text-sm text-primary">
                      {userName(u)}
                    </span>
                    <Badge variant={variant}>{label}</Badge>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3 flex-wrap">
                    <span>{formatNumber(u.metrics.activeTasks)} active</span>
                    <span className="text-red-600 dark:text-red-400">{formatNumber(u.metrics.overdueCount)} overdue ({formatNumber(u.metrics.overdueRate)}%)</span>
                    <span>{formatHours(u.metrics.totalHours)} tracked</span>
                    <span>{formatHours(u.metrics.avgHoursPerWeek)}/week avg</span>
                  </div>
                  <div className="space-y-1">
                    {u.reasons.map((reason, i) => (
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

interface TrendWeek {
  weekStart: string;
  completedTasks: number;
  hoursTracked: number;
}

function TrendsTab({ rangeDays, selectedUserIds }: { rangeDays: ReportRangeValue; selectedUserIds: string[] }) {
  const [selectedUserId, setSelectedUserId] = useState<string>("__all__");

  const { data: teamData } = useQuery<{ employees: Array<{ userId: string; firstName: string | null; lastName: string | null; email: string }> }>({
    queryKey: ["/api/reports/v2/employee/overview", rangeDays, selectedUserIds, "trend-options"],
    queryFn: async () => {
      const res = await fetch(`/api/reports/v2/employee/overview?${buildEmployeeReportParams(rangeDays, selectedUserIds, { limit: "100" })}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  const trendParams = buildEmployeeReportParams(
    rangeDays,
    selectedUserId && selectedUserId !== "__all__" ? [selectedUserId] : selectedUserIds,
  );
  const trendsUrl = selectedUserId && selectedUserId !== "__all__"
    ? `/api/reports/v2/employee/trends?${trendParams}&userId=${selectedUserId}`
    : `/api/reports/v2/employee/trends?${trendParams}`;

  const { data, isLoading } = useQuery<{
    weeks: TrendWeek[];
    userId: string | null;
    range: { startDate: string; endDate: string };
  }>({
    queryKey: ["/api/reports/v2/employee/trends", rangeDays, selectedUserIds, selectedUserId],
    queryFn: async () => {
      const res = await fetch(trendsUrl);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <User className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="w-64" data-testid="select-trends-employee">
                <SelectValue placeholder="All Team" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__" data-testid="option-trends-all">
                  {selectedUserIds.length > 0 ? "Selected Group" : "All Team"}
                </SelectItem>
                {(teamData?.employees ?? []).map((e) => (
                  <SelectItem key={e.userId} value={e.userId} data-testid={`option-trends-${e.userId}`}>
                    {userName(e)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {data && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Weekly Trends</CardTitle>
            <CardDescription className="text-xs">Completed tasks and hours tracked per week</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={data.weeks.map(w => ({ ...w, week: w.weekStart.slice(5, 10) }))}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ fontSize: 12 }}
                  labelFormatter={(l) => `Week of: ${l}`}
                />
                <Line type="monotone" dataKey="completedTasks" stroke="#10b981" strokeWidth={2} dot={false} name="Completed Tasks" />
                <Line type="monotone" dataKey="hoursTracked" stroke="#8b5cf6" strokeWidth={2} dot={false} name="Hours Tracked" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── TYPES ─────────────────────────────────────────────────────────────────────

interface ComponentScores {
  completion: number;
  overdue: number;
  utilization: number;
  efficiency: number;
  compliance: number;
}

interface EpiEmployee {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  avatarUrl: string | null;
  overallScore: number;
  performanceTier: "High" | "Stable" | "Needs Attention" | "Critical";
  componentScores: ComponentScores;
  riskFlags: string[];
  rawMetrics: {
    activeTasks: number;
    overdueCount: number;
    completedInRange: number;
    totalHours: number;
    estimatedHours: number;
    loggedDays: number;
    daysInRange: number;
    utilizationPct: number | null;
    efficiencyRatio: number | null;
    completionRate: number | null;
    overdueRate: number | null;
    timeCompliancePct: number;
  };
}

type EpiSortField = "name" | "overallScore" | "completion" | "overdue" | "utilization" | "efficiency" | "compliance";

// ── PERFORMANCE TAB ────────────────────────────────────────────────────────────

function tierConfig(tier: EpiEmployee["performanceTier"]) {
  switch (tier) {
    case "High":             return { label: "High",             variant: "default" as const,      className: "bg-green-500 text-white border-transparent" };
    case "Stable":           return { label: "Stable",           variant: "secondary" as const,    className: "bg-blue-500 text-white border-transparent" };
    case "Needs Attention":  return { label: "Needs Attention",  variant: "default" as const,      className: "bg-orange-500 text-white border-transparent" };
    case "Critical":         return { label: "Critical",         variant: "destructive" as const,  className: "" };
  }
}

function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Progress value={value} className={cn("h-1.5 flex-1", color)} />
      <span className="text-xs text-muted-foreground w-7 text-right tabular-nums">{formatNumber(value)}</span>
    </div>
  );
}

function PerformanceTab({ rangeDays, selectedUserIds }: { rangeDays: ReportRangeValue; selectedUserIds: string[] }) {
  const [sortBy, setSortBy] = useState<EpiSortField>("overallScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data, isLoading } = useQuery<{
    employees: EpiEmployee[];
    pagination: { total: number; limit: number; offset: number };
    range: { startDate: string; endDate: string };
  }>({
    queryKey: ["/api/reports/v2/employee/performance", rangeDays, selectedUserIds],
    queryFn: async () => {
      const res = await fetch(`/api/reports/v2/employee/performance?${buildEmployeeReportParams(rangeDays, selectedUserIds, { limit: "100" })}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  const sorted = useMemo(() => {
    if (!data?.employees) return [];
    return [...data.employees].sort((a, b) => {
      let av: number | string = 0, bv: number | string = 0;
      if (sortBy === "name")         { av = userName(a); bv = userName(b); }
      else if (sortBy === "overallScore")  { av = a.overallScore; bv = b.overallScore; }
      else if (sortBy === "completion")    { av = a.componentScores.completion; bv = b.componentScores.completion; }
      else if (sortBy === "overdue")       { av = a.componentScores.overdue; bv = b.componentScores.overdue; }
      else if (sortBy === "utilization")   { av = a.componentScores.utilization; bv = b.componentScores.utilization; }
      else if (sortBy === "efficiency")    { av = a.componentScores.efficiency; bv = b.componentScores.efficiency; }
      else if (sortBy === "compliance")    { av = a.componentScores.compliance; bv = b.componentScores.compliance; }
      if (typeof av === "string") {
        return sortDir === "asc" ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
      }
      return sortDir === "asc" ? av - (bv as number) : (bv as number) - av;
    });
  }, [data?.employees, sortBy, sortDir]);

  function toggleSort(field: EpiSortField) {
    if (sortBy === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(field); setSortDir("desc"); }
  }

  function Th({ field, children }: { field: EpiSortField; children: React.ReactNode }) {
    return (
      <TableHead
        className="cursor-pointer select-none whitespace-nowrap"
        onClick={() => toggleSort(field)}
        data-testid={`th-perf-${field}`}
      >
        <div className="flex items-center">
          {children}
          <SortIcon field={field} sortBy={sortBy} sortDir={sortDir} />
        </div>
      </TableHead>
    );
  }

  const teamAvg = useMemo(() => {
    if (!data?.employees.length) return null;
    const emps = data.employees;
    return {
      score: Math.round(emps.reduce((s, e) => s + e.overallScore, 0) / emps.length),
      high: emps.filter(e => e.performanceTier === "High").length,
      critical: emps.filter(e => e.performanceTier === "Critical").length,
      atRisk: emps.filter(e => e.riskFlags.length > 0).length,
    };
  }, [data?.employees]);

  const range = getReportRangeLabel(rangeDays);

  if (isLoading) return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
    </div>
  );

  if (!data?.employees.length) {
    return (
      <ReportEmptyState
        icon={Award}
        title="No performance data in this range"
        description="This tab needs completed work, tracked time, and current task context to score performance. Try a wider date range or come back after more activity is logged."
      />
    );
  }

  return (
    <div className="space-y-4">
      {teamAvg && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard
            label="Team Avg EPI Score"
            value={teamAvg.score}
            sub="out of 100"
            icon={<Award className="h-4 w-4 text-white" />}
            color="bg-violet-500"
            definition="Composite score from completion, overdue rate, utilization, estimate efficiency, and time compliance."
            source="tasks + time entries"
          />
          <MetricCard
            label="High Performers"
            value={teamAvg.high}
            sub="score ≥ 85"
            icon={<TrendingUp className="h-4 w-4 text-white" />}
            color="bg-green-500"
            definition="Employees whose EPI score is at or above 85 for the selected range."
            source="employee performance index"
          />
          <MetricCard
            label="Critical"
            value={teamAvg.critical}
            sub="score < 50"
            icon={<AlertTriangle className="h-4 w-4 text-white" />}
            color="bg-red-500"
            definition="Employees whose EPI score is below 50 for the selected range."
            source="employee performance index"
          />
          <MetricCard
            label="With Risk Flags"
            value={teamAvg.atRisk}
            sub="one or more flags"
            icon={<ShieldAlert className="h-4 w-4 text-white" />}
            color="bg-orange-500"
            definition="Employees with one or more generated risk flags from the EPI engine."
            source="employee performance index"
          />
        </div>
      )}
      <ReportDataNote
        title="EPI Methodology"
        items={[
          "Score blends completion, overdue rate, utilization, estimate efficiency, and time compliance.",
          "PMs, admins, and employees are included.",
          "Scores depend on estimates and tracked time quality.",
        ]}
      />

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <Th field="name">Employee</Th>
                <Th field="overallScore">EPI Score</Th>
                <TableHead className="text-xs text-muted-foreground">Tier</TableHead>
                <Th field="completion">Completion</Th>
                <Th field="overdue">Overdue</Th>
                <Th field="utilization">Utilization</Th>
                <Th field="efficiency">Efficiency</Th>
                <Th field="compliance">Compliance</Th>
                <TableHead className="text-xs text-muted-foreground">Flags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((e) => {
                const { label, className } = tierConfig(e.performanceTier);
                return (
                  <TableRow key={e.userId} data-testid={`row-employee-perf-${e.userId}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-7 w-7 shrink-0">
                          <AvatarImage src={getStorageUrl(e.avatarUrl) ?? ""} alt={userName(e)} />
                          <AvatarFallback className="text-xs">{userInitials(e)}</AvatarFallback>
                        </Avatar>
                        <Link href={getEmployeeReportPath(window.location.pathname, e.userId)} className="text-sm font-medium truncate max-w-[130px] hover:underline text-primary cursor-pointer">
                          {userName(e)}
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Link href={getEmployeeReportDrilldownPath(window.location.pathname, e.userId, { range, section: "risk" })}>
                        <span className={cn(
                          "text-base font-bold tabular-nums hover:underline",
                          e.overallScore >= 85 ? "text-green-600 dark:text-green-400" :
                          e.overallScore >= 70 ? "text-blue-600 dark:text-blue-400" :
                          e.overallScore >= 50 ? "text-orange-600 dark:text-orange-400" :
                          "text-red-600 dark:text-red-400"
                        )}>
                          {formatNumber(e.overallScore)}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={getEmployeeReportDrilldownPath(window.location.pathname, e.userId, { range, section: "risk" })}>
                        <Badge className={cn("text-xs font-medium cursor-pointer hover:opacity-90", className)}>{label}</Badge>
                      </Link>
                    </TableCell>
                    <TableCell className="min-w-[90px]">
                      <Link href={getEmployeeReportDrilldownPath(window.location.pathname, e.userId, { range, section: "assigned-tasks" })}>
                        <ScoreBar value={e.componentScores.completion} color="[&>div]:bg-blue-500" />
                      </Link>
                    </TableCell>
                    <TableCell className="min-w-[90px]">
                      <Link href={getEmployeeReportDrilldownPath(window.location.pathname, e.userId, { range, section: "risk" })}>
                        <ScoreBar value={e.componentScores.overdue} color="[&>div]:bg-green-500" />
                      </Link>
                    </TableCell>
                    <TableCell className="min-w-[90px]">
                      <Link href={getEmployeeReportDrilldownPath(window.location.pathname, e.userId, { range, section: "capacity" })}>
                        <ScoreBar value={e.componentScores.utilization} color="[&>div]:bg-violet-500" />
                      </Link>
                    </TableCell>
                    <TableCell className="min-w-[90px]">
                      <Link href={getEmployeeReportDrilldownPath(window.location.pathname, e.userId, { range, section: "time" })}>
                        <ScoreBar value={e.componentScores.efficiency} color="[&>div]:bg-amber-500" />
                      </Link>
                    </TableCell>
                    <TableCell className="min-w-[90px]">
                      <Link href={getEmployeeReportDrilldownPath(window.location.pathname, e.userId, { range, section: "time" })}>
                        <ScoreBar value={e.componentScores.compliance} color="[&>div]:bg-cyan-500" />
                      </Link>
                    </TableCell>
                    <TableCell>
                      {e.riskFlags.length > 0 ? (
                        <div className="space-y-1" data-testid={`perf-flags-${e.userId}`}>
                          {e.riskFlags.map((flag, i) => (
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
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">No performance data found</TableCell>
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

interface CapacityOverloadUser {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  weeks: {
    weekStart: string;
    availableHours: number;
    historicalAvgHours: number;
    dueEstimatedHours: number;
    predictedHours: number;
    predictedUtilizationPct: number;
    overloadRisk: "Low" | "Medium" | "High";
    explanation: string[];
  }[];
}

interface ProjectRisk {
  projectId: string;
  projectName: string;
  dueDate: string | null;
  weeksUntilDue: number | null;
  openTaskCount: number;
  overdueCount: number;
  openEstimatedHours: number;
  throughputPerWeek: number;
  predictedWeeksToClear: number;
  deadlineRisk: "Low" | "Medium" | "High";
  explanation: string[];
}

const RISK_COLORS: Record<"Low" | "Medium" | "High", string> = {
  Low: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  Medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  High: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const CAPACITY_CELL_COLORS: Record<"Low" | "Medium" | "High" | "none", string> = {
  none: "bg-muted/30 text-muted-foreground",
  Low: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  Medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  High: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

function ConfidenceBadge({ confidence }: { confidence: "Low" | "Medium" | "High" }) {
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

function ExplanationsPanel({ explanations, dataQualityFlags }: { explanations: string[]; dataQualityFlags: string[] }) {
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

function ForecastsTab({ horizonWeeks, selectedUserIds }: { horizonWeeks: number; selectedUserIds: string[] }) {
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);

  const { data: capData, isLoading: capLoading } = useQuery<{
    users: CapacityOverloadUser[];
    confidence: "Low" | "Medium" | "High";
    dataQualityFlags: string[];
    explanations: string[];
    horizonWeeks: number;
  }>({
    queryKey: ["/api/reports/v2/forecasting/capacity-overload", horizonWeeks],
    queryFn: async () => {
      const res = await fetch(`/api/reports/v2/forecasting/capacity-overload?weeks=${horizonWeeks}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: projData, isLoading: projLoading } = useQuery<{
    projects: ProjectRisk[];
    confidence: "Low" | "Medium" | "High";
    dataQualityFlags: string[];
    explanations: string[];
  }>({
    queryKey: ["/api/reports/v2/forecasting/project-deadline-risk", horizonWeeks],
    queryFn: async () => {
      const res = await fetch(`/api/reports/v2/forecasting/project-deadline-risk?weeks=${horizonWeeks}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const formatWeekLabel = (w: string) => {
    const d = new Date(w);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const capacityUsers = useMemo(() => {
    if (!capData?.users) return [];
    if (selectedUserIds.length === 0) return capData.users;
    const selected = new Set(selectedUserIds);
    return capData.users.filter((u) => selected.has(u.userId));
  }, [capData?.users, selectedUserIds]);

  const highRiskUsers = capacityUsers.filter(u => u.weeks.some(w => w.overloadRisk === "High")).length;
  const mediumRiskUsers = capacityUsers.filter(u => u.weeks.some(w => w.overloadRisk === "Medium") && !u.weeks.some(w => w.overloadRisk === "High")).length;
  const highRiskProjects = projData?.projects.filter(p => p.deadlineRisk === "High").length ?? 0;

  if (capLoading || projLoading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-red-600">{formatNumber(highRiskUsers)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">High overload risk</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-amber-600">{formatNumber(mediumRiskUsers)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Medium overload risk</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-red-600">{formatNumber(highRiskProjects)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Projects at deadline risk</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{formatNumber(horizonWeeks)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Forecast horizon (weeks)</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-sm">Capacity Overload Forecast</CardTitle>
              <CardDescription className="text-xs">Predicted hours per employee per week</CardDescription>
            </div>
            {capData && <ConfidenceBadge confidence={capData.confidence} />}
          </div>
        </CardHeader>
        <CardContent className="pt-0 overflow-x-auto">
          {!capacityUsers.length ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No employee data found</p>
          ) : (
            <>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 font-medium min-w-[160px]">Employee</th>
                    {capacityUsers[0]?.weeks.map(w => (
                      <th key={w.weekStart} className="text-center py-2 px-2 font-medium min-w-[80px]">
                        {formatWeekLabel(w.weekStart)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {capacityUsers.map(u => (
                    <>
                      <tr
                        key={u.userId}
                        className="border-b border-border/50 hover:bg-muted/30 cursor-pointer"
                        onClick={() => setExpandedUser(expandedUser === u.userId ? null : u.userId)}
                        data-testid={`forecast-capacity-row-${u.userId}`}
                      >
                        <td className="py-2 px-3 font-medium">
                          <Link
                            href={getEmployeeReportPath(window.location.pathname, u.userId)}
                            className="hover:underline text-primary cursor-pointer"
                            onClick={(e: React.MouseEvent) => e.stopPropagation()}
                            data-testid={`link-forecast-employee-${u.userId}`}
                          >
                            {u.firstName || u.lastName ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() : u.email}
                          </Link>
                        </td>
                        {u.weeks.map(w => (
                          <td key={w.weekStart} className="py-1.5 px-1 text-center">
                            <div className={cn(
                              "rounded px-2 py-1 text-xs font-medium mx-auto w-fit",
                              CAPACITY_CELL_COLORS[w.predictedHours > 0 ? w.overloadRisk : "none"]
                            )}>
                              {w.predictedHours > 0 ? formatHours(w.predictedHours) : "—"}
                            </div>
                          </td>
                        ))}
                      </tr>
                      {expandedUser === u.userId && (
                        <tr key={`${u.userId}-exp`} className="bg-muted/20">
                          <td colSpan={(u.weeks.length || 0) + 1} className="px-3 py-2">
                            <div className="space-y-1">
                              {u.weeks.map(w => (
                                <div key={w.weekStart} className="text-xs text-muted-foreground">
                                  <span className="font-medium text-foreground">{formatWeekLabel(w.weekStart)}:</span>{" "}
                                  {w.explanation.join(" • ")}
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground mt-2">Click a row to see explanations</p>
            </>
          )}
          {capData && (
            <div className="mt-3">
              <ExplanationsPanel explanations={capData.explanations} dataQualityFlags={capData.dataQualityFlags} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-sm">Project Deadline Risk</CardTitle>
              <CardDescription className="text-xs">Based on throughput vs. remaining backlog</CardDescription>
            </div>
            {projData && <ConfidenceBadge confidence={projData.confidence} />}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {!projData?.projects.length ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No active projects found</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead className="text-center">Due</TableHead>
                    <TableHead className="text-center">Open</TableHead>
                    <TableHead className="text-center">Overdue</TableHead>
                    <TableHead className="text-center">Throughput/wk</TableHead>
                    <TableHead className="text-center">Weeks to Clear</TableHead>
                    <TableHead className="text-center">Risk</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projData.projects.map(p => (
                    <>
                      <TableRow
                        key={p.projectId}
                        className="cursor-pointer hover:bg-muted/30"
                        onClick={() => setExpandedProject(expandedProject === p.projectId ? null : p.projectId)}
                        data-testid={`forecast-project-row-${p.projectId}`}
                      >
                        <TableCell className="font-medium max-w-[160px] truncate">
                          <div className="flex items-center gap-1.5">
                            <FolderKanban className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            {p.projectName}
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-xs">
                          {p.dueDate ? (
                            <span className={p.weeksUntilDue !== null && p.weeksUntilDue < 0 ? "text-red-600 font-medium" : ""}>
                              {new Date(p.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                              {p.weeksUntilDue !== null && (
                                <span className="text-muted-foreground ml-1">
                                  ({p.weeksUntilDue < 0 ? "past" : `${formatNumber(Math.round(p.weeksUntilDue))}w`})
                                </span>
                              )}
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-center">{formatNumber(p.openTaskCount)}</TableCell>
                        <TableCell className="text-center">
                          <span className={p.overdueCount > 0 ? "text-red-600 font-medium" : ""}>{formatNumber(p.overdueCount)}</span>
                        </TableCell>
                        <TableCell className="text-center">{formatNumber(p.throughputPerWeek, { maximumFractionDigits: 1 })}</TableCell>
                        <TableCell className="text-center">{formatNumber(p.predictedWeeksToClear, { maximumFractionDigits: 1 })}</TableCell>
                        <TableCell className="text-center">
                          <Badge className={cn("text-xs", RISK_COLORS[p.deadlineRisk])}>
                            {p.deadlineRisk}
                          </Badge>
                        </TableCell>
                      </TableRow>
                      {expandedProject === p.projectId && (
                        <TableRow key={`${p.projectId}-exp`} className="bg-muted/20">
                          <TableCell colSpan={7} className="text-xs text-muted-foreground py-2">
                            {p.explanation.join(" • ")}
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {projData && (
            <div className="mt-3">
              <ExplanationsPanel explanations={projData.explanations} dataQualityFlags={projData.dataQualityFlags} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────────

export function EmployeeCommandCenter() {
  const [rangeDays, setRangeDays] = useState<ReportRangeValue>(30);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("overview");
  const [horizonWeeks, setHorizonWeeks] = useState<2 | 4 | 8>(4);
  const flags = useFeatureFlags();

  return (
    <ReportCommandCenterLayout
      title="Employee Command Center"
      description="Comprehensive workload, time, capacity, risk and trend analysis per employee"
      icon={<Users className="h-4 w-4" />}
      rangeDays={rangeDays}
      onRangeChange={setRangeDays}
      extraControls={
        <EmployeeGroupFilter
          selectedUserIds={selectedUserIds}
          onSelectedUserIdsChange={setSelectedUserIds}
        />
      }
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} data-testid="employee-cc-tabs">
        <MobileTabSelect
          tabs={[
            { value: "overview", label: "Overview" },
            { value: "workload", label: "Workload" },
            { value: "time", label: "Time" },
            { value: "capacity", label: "Capacity" },
            { value: "risk", label: "Risk" },
            { value: "trends", label: "Trends" },
            ...(flags.enableEmployeePerformanceIndex ? [{ value: "performance", label: "Performance" }] : []),
            ...(flags.enableForecastingLayer ? [{ value: "forecasts", label: "Forecasts" }] : []),
          ]}
          value={activeTab}
          onValueChange={setActiveTab}
          className="mb-3"
        />
        <div className="hidden md:block">
        <TabsList className="h-9 flex-wrap">
          <TabsTrigger value="overview" className="text-xs gap-1.5" data-testid="tab-employee-overview">
            <Users className="h-3.5 w-3.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="workload" className="text-xs gap-1.5" data-testid="tab-employee-workload">
            <CheckSquare className="h-3.5 w-3.5" />
            Workload
          </TabsTrigger>
          <TabsTrigger value="time" className="text-xs gap-1.5" data-testid="tab-employee-time">
            <Clock className="h-3.5 w-3.5" />
            Time
          </TabsTrigger>
          <TabsTrigger value="capacity" className="text-xs gap-1.5" data-testid="tab-employee-capacity">
            <CalendarRange className="h-3.5 w-3.5" />
            Capacity
          </TabsTrigger>
          <TabsTrigger value="risk" className="text-xs gap-1.5" data-testid="tab-employee-risk">
            <ShieldAlert className="h-3.5 w-3.5" />
            Risk
          </TabsTrigger>
          <TabsTrigger value="trends" className="text-xs gap-1.5" data-testid="tab-employee-trends">
            <TrendingUp className="h-3.5 w-3.5" />
            Trends
          </TabsTrigger>
          {flags.enableEmployeePerformanceIndex && (
            <TabsTrigger value="performance" className="text-xs gap-1.5" data-testid="tab-employee-performance">
              <Award className="h-3.5 w-3.5" />
              Performance
            </TabsTrigger>
          )}
          {flags.enableForecastingLayer && (
            <TabsTrigger value="forecasts" className="text-xs gap-1.5" data-testid="tab-employee-forecasts">
              <Sparkles className="h-3.5 w-3.5" />
              Forecasts
            </TabsTrigger>
          )}
        </TabsList>
        </div>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab rangeDays={rangeDays} selectedUserIds={selectedUserIds} />
        </TabsContent>
        <TabsContent value="workload" className="mt-4">
          <WorkloadTab rangeDays={rangeDays} selectedUserIds={selectedUserIds} />
        </TabsContent>
        <TabsContent value="time" className="mt-4">
          <TimeTab rangeDays={rangeDays} selectedUserIds={selectedUserIds} />
        </TabsContent>
        <TabsContent value="capacity" className="mt-4">
          <CapacityTab rangeDays={rangeDays} selectedUserIds={selectedUserIds} />
        </TabsContent>
        <TabsContent value="risk" className="mt-4">
          <RiskTab rangeDays={rangeDays} selectedUserIds={selectedUserIds} />
        </TabsContent>
        <TabsContent value="trends" className="mt-4">
          <TrendsTab rangeDays={rangeDays} selectedUserIds={selectedUserIds} />
        </TabsContent>
        {flags.enableEmployeePerformanceIndex && (
          <TabsContent value="performance" className="mt-4">
            <PerformanceTab rangeDays={rangeDays} selectedUserIds={selectedUserIds} />
          </TabsContent>
        )}
        {flags.enableForecastingLayer && (
          <TabsContent value="forecasts" className="mt-4">
            <Tabs defaultValue="analysis">
              <TabsList className="h-8 mb-4">
                <TabsTrigger value="analysis" className="text-xs gap-1.5" data-testid="tab-forecast-analysis">
                  <Sparkles className="h-3.5 w-3.5" />
                  Analysis
                </TabsTrigger>
                {flags.enableForecastSnapshots && (
                  <TabsTrigger value="snapshots" className="text-xs gap-1.5" data-testid="tab-forecast-snapshots">
                    <Camera className="h-3.5 w-3.5" />
                    Snapshots
                  </TabsTrigger>
                )}
              </TabsList>
              <TabsContent value="analysis">
                <div className="flex items-center gap-3 mb-4 flex-wrap">
                  <span className="text-sm text-muted-foreground">Forecast horizon:</span>
                  <Select value={String(horizonWeeks)} onValueChange={(v) => setHorizonWeeks(Number(v) as 2 | 4 | 8)}>
                    <SelectTrigger className="w-32 h-8 text-xs" data-testid="forecast-horizon-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">2 weeks</SelectItem>
                      <SelectItem value="4">4 weeks</SelectItem>
                      <SelectItem value="8">8 weeks</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <ForecastsTab horizonWeeks={horizonWeeks} selectedUserIds={selectedUserIds} />
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
