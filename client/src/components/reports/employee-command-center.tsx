import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  ShieldAlert, User, Award, Sparkles, FolderKanban, Info, Camera,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getStorageUrl } from "@/lib/storageUrl";
import { ReportCommandCenterLayout, buildDateParams } from "./report-command-center-layout";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
import { ForecastSnapshotsTab } from "./forecast-snapshots-tab";
import { MobileTabSelect } from "./mobile-tab-select";

function userName(u: { firstName?: string | null; lastName?: string | null; email: string }) {
  if (u.firstName || u.lastName) return `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  return u.email;
}

function userInitials(u: { firstName?: string | null; lastName?: string | null; email: string }) {
  if (u.firstName && u.lastName) return `${u.firstName[0]}${u.lastName[0]}`.toUpperCase();
  if (u.firstName) return u.firstName[0].toUpperCase();
  return u.email[0].toUpperCase();
}

type SortDir = "asc" | "desc";

function MetricCard({ label, value, sub, icon, color }: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  color: string;
}) {
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

function OverviewTab({ rangeDays }: { rangeDays: number }) {
  const [sortBy, setSortBy] = useState<OverviewSortField>("overdueCount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data, isLoading } = useQuery<{
    employees: OverviewEmployee[];
    pagination: { total: number; limit: number; offset: number };
    range: { startDate: string; endDate: string };
  }>({
    queryKey: ["/api/reports/v2/employee/overview", rangeDays],
    queryFn: async () => {
      const res = await fetch(`/api/reports/v2/employee/overview?${buildDateParams(rangeDays, { limit: "100" })}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  const totals = useMemo(() => {
    if (!data?.employees) return null;
    const emps = data.employees;
    return {
      activeTasks: emps.reduce((s, e) => s + e.activeTasksNow, 0),
      overdueTasks: emps.reduce((s, e) => s + e.overdueCount, 0),
      totalHours: Math.round(emps.reduce((s, e) => s + e.totalHours, 0) * 10) / 10,
      avgUtilization: emps.length > 0
        ? Math.round(emps.filter(e => e.utilizationPct !== null).reduce((s, e) => s + (e.utilizationPct ?? 0), 0) / Math.max(emps.filter(e => e.utilizationPct !== null).length, 1))
        : 0,
    };
  }, [data?.employees]);

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

  return (
    <div className="space-y-4">
      {totals && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard label="Total Active Tasks" value={totals.activeTasks} icon={<CheckSquare className="h-4 w-4 text-white" />} color="bg-blue-500" />
          <MetricCard label="Total Overdue" value={totals.overdueTasks} icon={<AlertTriangle className="h-4 w-4 text-white" />} color="bg-red-500" />
          <MetricCard label="Hours Tracked" value={`${totals.totalHours}h`} icon={<Clock className="h-4 w-4 text-white" />} color="bg-violet-500" />
          <MetricCard label="Avg Utilization" value={`${totals.avgUtilization}%`} icon={<TrendingUp className="h-4 w-4 text-white" />} color="bg-green-500" />
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
                <Link href={`/reports/employees/${e.userId}`} className="text-sm font-semibold truncate hover:underline text-primary cursor-pointer">
                  {userName(e)}
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Active</span>
                  <p className="font-medium">{e.activeTasksNow}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Overdue</span>
                  <p className={cn("font-medium", e.overdueCount > 0 ? "text-red-600 dark:text-red-400" : "")}>{e.overdueCount}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Completed</span>
                  <p className="font-medium text-green-600 dark:text-green-400">{e.completedInRange}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Hours</span>
                  <p className="font-medium">{e.totalHours}h</p>
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
                          <Link href={`/reports/employees/${e.userId}`} className="text-sm font-medium truncate max-w-[140px] hover:underline text-primary cursor-pointer">
                            {userName(e)}
                          </Link>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-medium">{e.activeTasksNow}</TableCell>
                      <TableCell>
                        <span className={cn("text-sm font-medium", e.overdueCount > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                          {e.overdueCount}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-green-600 dark:text-green-400 font-medium">{e.completedInRange}</TableCell>
                      <TableCell className="text-sm">{e.totalHours}h</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-[80px]">
                          <Progress value={e.utilizationPct ?? 0} className="h-1.5 flex-1" />
                          <span className="text-xs text-muted-foreground w-10 text-right">{e.utilizationPct ?? 0}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {e.efficiencyRatio !== null ? (
                          <Badge variant={e.efficiencyRatio > 1.2 ? "destructive" : e.efficiencyRatio > 0.8 ? "default" : "secondary"}>
                            {(e.efficiencyRatio * 100).toFixed(0)}%
                          </Badge>
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

function WorkloadTab({ rangeDays }: { rangeDays: number }) {
  const { data, isLoading } = useQuery<{
    employees: WorkloadEmployee[];
    pagination: { total: number };
    range: { startDate: string; endDate: string };
  }>({
    queryKey: ["/api/reports/v2/employee/workload", rangeDays],
    queryFn: async () => {
      const res = await fetch(`/api/reports/v2/employee/workload?${buildDateParams(rangeDays, { limit: "100" })}`);
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

  return (
    <Card>
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
                    <Link href={`/reports/employees/${e.userId}`} className="text-sm font-medium hover:underline text-primary cursor-pointer">
                      {userName(e)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{e.assignedCount}</TableCell>
                  <TableCell>
                    {e.dueSoonCount > 0 ? (
                      <Badge variant="secondary" className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300">
                        {e.dueSoonCount}
                      </Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">{e.dueSoonCount}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className={cn("text-sm font-medium", e.overdueCount > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                      {e.overdueCount}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {e.avgCompletionDays !== null ? `${Math.round(e.avgCompletionDays * 10) / 10}d` : "—"}
                  </TableCell>
                  <TableCell>
                    {e.backlogCount >= 5 ? (
                      <Badge variant="destructive">{e.backlogCount}</Badge>
                    ) : e.backlogCount >= 3 ? (
                      <Badge variant="default" className="bg-orange-500">{e.backlogCount}</Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">{e.backlogCount}</span>
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

function TimeTab({ rangeDays }: { rangeDays: number }) {
  const { data, isLoading } = useQuery<{
    employees: TimeEmployee[];
    pagination: { total: number };
    range: { startDate: string; endDate: string };
  }>({
    queryKey: ["/api/reports/v2/employee/time", rangeDays],
    queryFn: async () => {
      const res = await fetch(`/api/reports/v2/employee/time?${buildDateParams(rangeDays, { limit: "100" })}`);
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
                    <Link href={`/reports/employees/${e.userId}`} className="text-sm font-medium hover:underline text-primary cursor-pointer">
                      {userName(e)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm font-medium">{e.totalHours}h</TableCell>
                  <TableCell>
                    <div className="space-y-1 min-w-[80px]">
                      <span className="text-sm">{e.billableHours}h</span>
                      {e.totalHours > 0 && (
                        <Progress value={Math.round(e.billableHours / e.totalHours * 100)} className="h-1" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{e.nonBillableHours}h</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{e.avgHoursPerDay}h</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{e.estimatedHours}h</TableCell>
                  <TableCell>
                    <span className={cn(
                      "text-sm font-medium",
                      e.varianceHours > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                    )}>
                      {e.varianceHours > 0 ? "+" : ""}{e.varianceHours}h
                    </span>
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

function CapacityTab({ rangeDays }: { rangeDays: number }) {
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
    queryKey: ["/api/reports/v2/employee/capacity", rangeDays],
    queryFn: async () => {
      const res = await fetch(`/api/reports/v2/employee/capacity?${buildDateParams(rangeDays)}`);
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
                      <Link href={`/reports/employees/${u.userId}`} className="font-medium text-sm truncate max-w-[130px] block hover:underline text-primary cursor-pointer">
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
                          title={`${w.actualHours}h tracked, ${w.plannedHours}h planned`}
                          data-testid={`capacity-cell-${u.userId}-${w.weekStart}`}
                        >
                          <span>{w.actualHours}h</span>
                          {w.utilizationPct !== null && (
                            <span className="opacity-80">{w.utilizationPct}%</span>
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

function RiskTab({ rangeDays }: { rangeDays: number }) {
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
    queryKey: ["/api/reports/v2/employee/risk", rangeDays],
    queryFn: async () => {
      const res = await fetch(`/api/reports/v2/employee/risk?${buildDateParams(rangeDays)}`);
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
      {data && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Activity className="h-4 w-4" />
          <span>Checked {data.totalChecked} employees — {data.flagged.length} flagged for attention</span>
        </div>
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
              <div className="flex items-start gap-3">
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarImage src={getStorageUrl(u.avatarUrl) ?? ""} alt={userName(u)} />
                  <AvatarFallback className="text-xs">{userInitials(u)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <Link href={`/reports/employees/${u.userId}`} className="font-semibold text-sm hover:underline text-primary cursor-pointer">
                      {userName(u)}
                    </Link>
                    <Badge variant={variant}>{label}</Badge>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3 flex-wrap">
                    <span>{u.metrics.activeTasks} active</span>
                    <span className="text-red-600 dark:text-red-400">{u.metrics.overdueCount} overdue ({u.metrics.overdueRate}%)</span>
                    <span>{u.metrics.totalHours}h tracked</span>
                    <span>{u.metrics.avgHoursPerWeek}h/week avg</span>
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
              </div>
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

function TrendsTab({ rangeDays }: { rangeDays: number }) {
  const [selectedUserId, setSelectedUserId] = useState<string>("__all__");

  const { data: teamData } = useQuery<{ employees: Array<{ userId: string; firstName: string | null; lastName: string | null; email: string }> }>({
    queryKey: ["/api/reports/v2/employee/overview", rangeDays],
    queryFn: async () => {
      const res = await fetch(`/api/reports/v2/employee/overview?${buildDateParams(rangeDays, { limit: "100" })}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  const trendsUrl = selectedUserId && selectedUserId !== "__all__"
    ? `/api/reports/v2/employee/trends?${buildDateParams(rangeDays)}&userId=${selectedUserId}`
    : `/api/reports/v2/employee/trends?${buildDateParams(rangeDays)}`;

  const { data, isLoading } = useQuery<{
    weeks: TrendWeek[];
    userId: string | null;
    range: { startDate: string; endDate: string };
  }>({
    queryKey: ["/api/reports/v2/employee/trends", rangeDays, selectedUserId],
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
                <SelectItem value="__all__" data-testid="option-trends-all">All Team</SelectItem>
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
      <span className="text-xs text-muted-foreground w-7 text-right tabular-nums">{value}</span>
    </div>
  );
}

function PerformanceTab({ rangeDays }: { rangeDays: number }) {
  const [sortBy, setSortBy] = useState<EpiSortField>("overallScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data, isLoading } = useQuery<{
    employees: EpiEmployee[];
    pagination: { total: number; limit: number; offset: number };
    range: { startDate: string; endDate: string };
  }>({
    queryKey: ["/api/reports/v2/employee/performance", rangeDays],
    queryFn: async () => {
      const res = await fetch(`/api/reports/v2/employee/performance?${buildDateParams(rangeDays, { limit: "100" })}`);
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

  if (isLoading) return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
    </div>
  );

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
          />
          <MetricCard
            label="High Performers"
            value={teamAvg.high}
            sub="score ≥ 85"
            icon={<TrendingUp className="h-4 w-4 text-white" />}
            color="bg-green-500"
          />
          <MetricCard
            label="Critical"
            value={teamAvg.critical}
            sub="score < 50"
            icon={<AlertTriangle className="h-4 w-4 text-white" />}
            color="bg-red-500"
          />
          <MetricCard
            label="With Risk Flags"
            value={teamAvg.atRisk}
            sub="one or more flags"
            icon={<ShieldAlert className="h-4 w-4 text-white" />}
            color="bg-orange-500"
          />
        </div>
      )}

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
                        <Link href={`/reports/employees/${e.userId}`} className="text-sm font-medium truncate max-w-[130px] hover:underline text-primary cursor-pointer">
                          {userName(e)}
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={cn(
                        "text-base font-bold tabular-nums",
                        e.overallScore >= 85 ? "text-green-600 dark:text-green-400" :
                        e.overallScore >= 70 ? "text-blue-600 dark:text-blue-400" :
                        e.overallScore >= 50 ? "text-orange-600 dark:text-orange-400" :
                        "text-red-600 dark:text-red-400"
                      )}>
                        {e.overallScore}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("text-xs font-medium", className)}>{label}</Badge>
                    </TableCell>
                    <TableCell className="min-w-[90px]">
                      <ScoreBar value={e.componentScores.completion} color="[&>div]:bg-blue-500" />
                    </TableCell>
                    <TableCell className="min-w-[90px]">
                      <ScoreBar value={e.componentScores.overdue} color="[&>div]:bg-green-500" />
                    </TableCell>
                    <TableCell className="min-w-[90px]">
                      <ScoreBar value={e.componentScores.utilization} color="[&>div]:bg-violet-500" />
                    </TableCell>
                    <TableCell className="min-w-[90px]">
                      <ScoreBar value={e.componentScores.efficiency} color="[&>div]:bg-amber-500" />
                    </TableCell>
                    <TableCell className="min-w-[90px]">
                      <ScoreBar value={e.componentScores.compliance} color="[&>div]:bg-cyan-500" />
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

function ForecastsTab({ horizonWeeks }: { horizonWeeks: number }) {
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

  const highRiskUsers = capData?.users.filter(u => u.weeks.some(w => w.overloadRisk === "High")).length ?? 0;
  const mediumRiskUsers = capData?.users.filter(u => u.weeks.some(w => w.overloadRisk === "Medium") && !u.weeks.some(w => w.overloadRisk === "High")).length ?? 0;
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
            <div className="text-2xl font-bold text-red-600">{highRiskUsers}</div>
            <div className="text-xs text-muted-foreground mt-0.5">High overload risk</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-amber-600">{mediumRiskUsers}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Medium overload risk</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-red-600">{highRiskProjects}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Projects at deadline risk</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{horizonWeeks}</div>
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
          {!capData?.users.length ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No employee data found</p>
          ) : (
            <>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 font-medium min-w-[160px]">Employee</th>
                    {capData.users[0]?.weeks.map(w => (
                      <th key={w.weekStart} className="text-center py-2 px-2 font-medium min-w-[80px]">
                        {formatWeekLabel(w.weekStart)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {capData.users.map(u => (
                    <>
                      <tr
                        key={u.userId}
                        className="border-b border-border/50 hover:bg-muted/30 cursor-pointer"
                        onClick={() => setExpandedUser(expandedUser === u.userId ? null : u.userId)}
                        data-testid={`forecast-capacity-row-${u.userId}`}
                      >
                        <td className="py-2 px-3 font-medium">
                          {u.firstName || u.lastName ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() : u.email}
                        </td>
                        {u.weeks.map(w => (
                          <td key={w.weekStart} className="py-1.5 px-1 text-center">
                            <div className={cn(
                              "rounded px-2 py-1 text-xs font-medium mx-auto w-fit",
                              CAPACITY_CELL_COLORS[w.predictedHours > 0 ? w.overloadRisk : "none"]
                            )}>
                              {w.predictedHours > 0 ? `${w.predictedHours}h` : "—"}
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
                                  ({p.weeksUntilDue < 0 ? "past" : `${Math.round(p.weeksUntilDue)}w`})
                                </span>
                              )}
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-center">{p.openTaskCount}</TableCell>
                        <TableCell className="text-center">
                          <span className={p.overdueCount > 0 ? "text-red-600 font-medium" : ""}>{p.overdueCount}</span>
                        </TableCell>
                        <TableCell className="text-center">{p.throughputPerWeek}</TableCell>
                        <TableCell className="text-center">{p.predictedWeeksToClear}</TableCell>
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
  const [rangeDays, setRangeDays] = useState(30);
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
          <OverviewTab rangeDays={rangeDays} />
        </TabsContent>
        <TabsContent value="workload" className="mt-4">
          <WorkloadTab rangeDays={rangeDays} />
        </TabsContent>
        <TabsContent value="time" className="mt-4">
          <TimeTab rangeDays={rangeDays} />
        </TabsContent>
        <TabsContent value="capacity" className="mt-4">
          <CapacityTab rangeDays={rangeDays} />
        </TabsContent>
        <TabsContent value="risk" className="mt-4">
          <RiskTab rangeDays={rangeDays} />
        </TabsContent>
        <TabsContent value="trends" className="mt-4">
          <TrendsTab rangeDays={rangeDays} />
        </TabsContent>
        {flags.enableEmployeePerformanceIndex && (
          <TabsContent value="performance" className="mt-4">
            <PerformanceTab rangeDays={rangeDays} />
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
                <ForecastsTab horizonWeeks={horizonWeeks} />
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
