import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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
  ShieldAlert, User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getStorageUrl } from "@/lib/storageUrl";
import { ReportCommandCenterLayout, buildDateParams } from "./report-command-center-layout";

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
      <Card>
        <CardContent className="p-0">
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
                      <span className="text-sm font-medium truncate max-w-[140px]">{userName(e)}</span>
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
        </CardContent>
      </Card>
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
                  <span className="text-sm font-medium">{userName(e)}</span>
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
                  <span className="text-sm font-medium">{userName(e)}</span>
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
                      <span className="font-medium text-sm truncate max-w-[130px] block">{userName(u)}</span>
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
                    <span className="font-semibold text-sm">{userName(u)}</span>
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
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  const { data: teamData } = useQuery<{ employees: Array<{ userId: string; firstName: string | null; lastName: string | null; email: string }> }>({
    queryKey: ["/api/reports/v2/employee/overview", rangeDays],
    queryFn: async () => {
      const res = await fetch(`/api/reports/v2/employee/overview?${buildDateParams(rangeDays, { limit: "100" })}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  const trendsUrl = selectedUserId
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
                <SelectItem value="" data-testid="option-trends-all">All Team</SelectItem>
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

export function EmployeeCommandCenter() {
  const [rangeDays, setRangeDays] = useState(30);
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <ReportCommandCenterLayout
      title="Employee Command Center"
      description="Comprehensive workload, time, capacity, risk and trend analysis per employee"
      icon={<Users className="h-4 w-4" />}
      rangeDays={rangeDays}
      onRangeChange={setRangeDays}
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} data-testid="employee-cc-tabs">
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
        </TabsList>

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
      </Tabs>
    </ReportCommandCenterLayout>
  );
}
