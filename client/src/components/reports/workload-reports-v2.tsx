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
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Users, Clock, CheckSquare, AlertTriangle, TrendingUp,
  ChevronUp, ChevronDown, ArrowUpDown, User, FolderKanban,
  ShieldAlert, CalendarRange, Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getStorageUrl } from "@/lib/storageUrl";

interface DateRange {
  label: string;
  days: number;
}

const DATE_RANGES: DateRange[] = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 14 days", days: 14 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 60 days", days: 60 },
  { label: "Last 90 days", days: 90 },
];

function buildDateRange(days: number) {
  const end = new Date();
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  };
}

function buildQueryParams(rangeDays: number, extra?: Record<string, string>) {
  const { startDate, endDate } = buildDateRange(rangeDays);
  const params = new URLSearchParams({ startDate, endDate, ...(extra ?? {}) });
  return params.toString();
}

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
type SortField = "name" | "activeTasksNow" | "overdueCount" | "completedCount" | "totalHours" | "efficiencyRatio" | "overdueRate";

interface TeamMember {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  avatarUrl: string | null;
  activeTasksNow: number;
  overdueCount: number;
  completedCount: number;
  dueSoonCount: number;
  totalHours: number;
  estimatedHours: number;
  efficiencyRatio: number | null;
  overdueRate: number;
}

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

function SortIcon({ field, sortBy, sortDir }: { field: SortField; sortBy: SortField; sortDir: SortDir }) {
  if (sortBy !== field) return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/50 ml-1 shrink-0" />;
  return sortDir === "asc"
    ? <ChevronUp className="h-3.5 w-3.5 ml-1 shrink-0 text-primary" />
    : <ChevronDown className="h-3.5 w-3.5 ml-1 shrink-0 text-primary" />;
}

function TeamOverviewTab({ rangeDays }: { rangeDays: number }) {
  const [sortBy, setSortBy] = useState<SortField>("overdueCount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data, isLoading } = useQuery<{
    team: TeamMember[];
    pagination: { total: number };
    range: { startDate: string; endDate: string };
  }>({
    queryKey: ["/api/reports/v2/workload/team", rangeDays],
    queryFn: async () => {
      const res = await fetch(`/api/reports/v2/workload/team?${buildQueryParams(rangeDays, { limit: "100" })}`);
      if (!res.ok) throw new Error("Failed to load team data");
      return res.json();
    },
  });

  const totals = useMemo(() => {
    if (!data?.team) return null;
    return {
      activeTasks: data.team.reduce((s, m) => s + m.activeTasksNow, 0),
      overdueTasks: data.team.reduce((s, m) => s + m.overdueCount, 0),
      completedTasks: data.team.reduce((s, m) => s + m.completedCount, 0),
      totalHours: Math.round(data.team.reduce((s, m) => s + m.totalHours, 0) * 10) / 10,
    };
  }, [data?.team]);

  const sorted = useMemo(() => {
    if (!data?.team) return [];
    return [...data.team].sort((a, b) => {
      let av: number | string = 0, bv: number | string = 0;
      if (sortBy === "name") { av = userName(a); bv = userName(b); }
      else if (sortBy === "activeTasksNow") { av = a.activeTasksNow; bv = b.activeTasksNow; }
      else if (sortBy === "overdueCount") { av = a.overdueCount; bv = b.overdueCount; }
      else if (sortBy === "completedCount") { av = a.completedCount; bv = b.completedCount; }
      else if (sortBy === "totalHours") { av = a.totalHours; bv = b.totalHours; }
      else if (sortBy === "efficiencyRatio") { av = a.efficiencyRatio ?? -1; bv = b.efficiencyRatio ?? -1; }
      else if (sortBy === "overdueRate") { av = a.overdueRate; bv = b.overdueRate; }
      if (typeof av === "string") {
        return sortDir === "asc" ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
      }
      return sortDir === "asc" ? av - (bv as number) : (bv as number) - av;
    });
  }, [data?.team, sortBy, sortDir]);

  function toggleSort(field: SortField) {
    if (sortBy === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(field); setSortDir("desc"); }
  }

  function Th({ field, children }: { field: SortField; children: React.ReactNode }) {
    return (
      <TableHead
        className="cursor-pointer select-none whitespace-nowrap"
        onClick={() => toggleSort(field)}
        data-testid={`th-${field}`}
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
          <MetricCard label="Active Tasks" value={totals.activeTasks} icon={<CheckSquare className="h-4 w-4 text-white" />} color="bg-blue-500" />
          <MetricCard label="Overdue Tasks" value={totals.overdueTasks} icon={<AlertTriangle className="h-4 w-4 text-white" />} color="bg-red-500" />
          <MetricCard label="Completed (Range)" value={totals.completedTasks} icon={<TrendingUp className="h-4 w-4 text-white" />} color="bg-green-500" />
          <MetricCard label="Hours Tracked" value={`${totals.totalHours}h`} icon={<Clock className="h-4 w-4 text-white" />} color="bg-violet-500" />
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
                <Th field="completedCount">Completed</Th>
                <Th field="totalHours">Hours</Th>
                <Th field="efficiencyRatio">Efficiency</Th>
                <Th field="overdueRate">Overdue %</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((m) => (
                <TableRow key={m.userId} data-testid={`row-team-${m.userId}`}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarImage src={getStorageUrl(m.avatarUrl) ?? ""} alt={userName(m)} />
                        <AvatarFallback className="text-xs">{userInitials(m)}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium truncate max-w-[140px]">{userName(m)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm font-medium">{m.activeTasksNow}</TableCell>
                  <TableCell>
                    <span className={cn("text-sm font-medium", m.overdueCount > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                      {m.overdueCount}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-green-600 dark:text-green-400 font-medium">{m.completedCount}</TableCell>
                  <TableCell className="text-sm">{m.totalHours}h</TableCell>
                  <TableCell>
                    {m.efficiencyRatio !== null ? (
                      <Badge variant={m.efficiencyRatio > 1.2 ? "destructive" : m.efficiencyRatio > 0.8 ? "default" : "secondary"}>
                        {(m.efficiencyRatio * 100).toFixed(0)}%
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 min-w-[80px]">
                      <Progress value={m.overdueRate} className="h-1.5 flex-1" />
                      <span className="text-xs text-muted-foreground w-8 text-right">{m.overdueRate}%</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {sorted.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">No team members found</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function EmployeeDetailTab({ rangeDays }: { rangeDays: number }) {
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  const { data: teamData } = useQuery<{ team: TeamMember[] }>({
    queryKey: ["/api/reports/v2/workload/team", rangeDays],
    queryFn: async () => {
      const res = await fetch(`/api/reports/v2/workload/team?${buildQueryParams(rangeDays, { limit: "100" })}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data, isLoading } = useQuery<{
    user: { id: string; firstName: string | null; lastName: string | null; email: string; avatarUrl: string | null };
    summary: { activeTasksNow: number; overdueCount: number; completedCount: number; totalHours: number; dueSoonCount: number };
    dailyTrend: Array<{ day: string; completedTasks: number; hoursTracked: number }>;
    topProjects: Array<{ projectId: string; projectName: string; hoursTracked: number; taskCount: number }>;
    overdueTaskSample: Array<{ id: string; title: string; dueDate: string; priority: string; projectName: string }>;
  }>({
    queryKey: ["/api/reports/v2/workload/users", selectedUserId, rangeDays],
    queryFn: async () => {
      const res = await fetch(`/api/reports/v2/workload/users/${selectedUserId}?${buildQueryParams(rangeDays)}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!selectedUserId,
  });

  const PRIORITY_COLORS: Record<string, string> = {
    urgent: "text-red-600 dark:text-red-400",
    high: "text-orange-600 dark:text-orange-400",
    medium: "text-yellow-600 dark:text-yellow-400",
    low: "text-blue-600 dark:text-blue-400",
    none: "text-muted-foreground",
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <User className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="w-64" data-testid="select-employee">
                <SelectValue placeholder="Select an employee…" />
              </SelectTrigger>
              <SelectContent>
                {teamData?.team.map((m) => (
                  <SelectItem key={m.userId} value={m.userId} data-testid={`option-employee-${m.userId}`}>
                    {userName(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!teamData && <Skeleton className="h-9 w-64" />}
          </div>
        </CardContent>
      </Card>

      {!selectedUserId && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <User className="h-10 w-10 opacity-30" />
          <p className="text-sm">Select an employee to view their workload details</p>
        </div>
      )}

      {selectedUserId && isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      )}

      {data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard label="Active Tasks" value={data.summary.activeTasksNow} icon={<CheckSquare className="h-4 w-4 text-white" />} color="bg-blue-500" />
            <MetricCard label="Overdue" value={data.summary.overdueCount} icon={<AlertTriangle className="h-4 w-4 text-white" />} color="bg-red-500" />
            <MetricCard label="Completed" value={data.summary.completedCount} sub="in range" icon={<TrendingUp className="h-4 w-4 text-white" />} color="bg-green-500" />
            <MetricCard label="Hours Tracked" value={`${data.summary.totalHours}h`} sub="in range" icon={<Clock className="h-4 w-4 text-white" />} color="bg-violet-500" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Daily Activity</CardTitle>
                <CardDescription className="text-xs">Tasks completed & hours tracked per day</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={data.dailyTrend.map(d => ({ ...d, day: d.day.slice(5, 10) }))}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ fontSize: 12 }}
                      labelFormatter={(l) => `Date: ${l}`}
                    />
                    <Line type="monotone" dataKey="completedTasks" stroke="#10b981" strokeWidth={2} dot={false} name="Completed" />
                    <Line type="monotone" dataKey="hoursTracked" stroke="#8b5cf6" strokeWidth={2} dot={false} name="Hours" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Top Projects</CardTitle>
                <CardDescription className="text-xs">By hours tracked in range</CardDescription>
              </CardHeader>
              <CardContent>
                {data.topProjects.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No project data in range</p>
                ) : (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={data.topProjects} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis dataKey="projectName" type="category" tick={{ fontSize: 10 }} width={90} />
                      <Tooltip contentStyle={{ fontSize: 12 }} />
                      <Bar dataKey="hoursTracked" fill="#3b82f6" name="Hours" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {data.overdueTaskSample.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  Overdue Tasks
                </CardTitle>
                <CardDescription className="text-xs">Tasks past their due date</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.overdueTaskSample.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 p-2 rounded-md border bg-muted/30" data-testid={`overdue-task-${t.id}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{t.title}</p>
                        {t.projectName && <p className="text-xs text-muted-foreground">{t.projectName}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={cn("text-xs font-medium capitalize", PRIORITY_COLORS[t.priority] ?? "text-muted-foreground")}>
                          {t.priority}
                        </span>
                        <Badge variant="destructive" className="text-xs">
                          {new Date(t.dueDate).toLocaleDateString()}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function CapacityPlanningTab({ rangeDays }: { rangeDays: number }) {
  const { data, isLoading } = useQuery<{
    users: Array<{
      userId: string;
      firstName: string | null;
      lastName: string | null;
      email: string;
      weeks: Array<{
        weekStart: string;
        estimatedHours: number;
        actualHours: number;
        utilizationPct: number | null;
      }>;
    }>;
    range: { startDate: string; endDate: string };
  }>({
    queryKey: ["/api/reports/v2/workload/capacity", rangeDays],
    queryFn: async () => {
      const res = await fetch(`/api/reports/v2/workload/capacity?${buildQueryParams(rangeDays)}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
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
                          title={`${w.actualHours}h tracked, ${w.estimatedHours}h estimated`}
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

function RiskFlagsTab({ rangeDays }: { rangeDays: number }) {
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
    queryKey: ["/api/reports/v2/workload/risk", rangeDays],
    queryFn: async () => {
      const res = await fetch(`/api/reports/v2/workload/risk?${buildQueryParams(rangeDays)}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
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
          <span>Checked {data.totalChecked} team members — {data.flagged.length} flagged for attention</span>
        </div>
      )}

      {data?.flagged.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <ShieldAlert className="h-10 w-10 opacity-30" />
          <p className="text-sm font-medium">No risk flags detected</p>
          <p className="text-xs">All team members look within normal workload ranges</p>
        </div>
      )}

      {data?.flagged.map((u) => {
        const { label, variant } = scoreLabel(u.score);
        return (
          <Card key={u.userId} className={cn("border", scoreColor(u.score))} data-testid={`risk-card-${u.userId}`}>
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

export function WorkloadReportsV2() {
  const [rangeDays, setRangeDays] = useState(30);
  const [tab, setTab] = useState("team");

  return (
    <div className="space-y-4" data-testid="workload-reports-v2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Workload Reports V2
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Server-side aggregations — date range, efficiency, and risk analysis</p>
        </div>
        <Select value={String(rangeDays)} onValueChange={(v) => setRangeDays(Number(v))}>
          <SelectTrigger className="w-44" data-testid="select-date-range">
            <CalendarRange className="h-3.5 w-3.5 mr-1.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATE_RANGES.map((r) => (
              <SelectItem key={r.days} value={String(r.days)} data-testid={`range-option-${r.days}`}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-9">
          <TabsTrigger value="team" className="text-xs gap-1.5" data-testid="tab-workload-team">
            <Users className="h-3.5 w-3.5" />
            Team Overview
          </TabsTrigger>
          <TabsTrigger value="employee" className="text-xs gap-1.5" data-testid="tab-workload-employee">
            <User className="h-3.5 w-3.5" />
            Employee Detail
          </TabsTrigger>
          <TabsTrigger value="capacity" className="text-xs gap-1.5" data-testid="tab-workload-capacity">
            <FolderKanban className="h-3.5 w-3.5" />
            Capacity Planning
          </TabsTrigger>
          <TabsTrigger value="risk" className="text-xs gap-1.5" data-testid="tab-workload-risk">
            <ShieldAlert className="h-3.5 w-3.5" />
            Risk Flags
          </TabsTrigger>
        </TabsList>

        <TabsContent value="team" className="mt-4">
          <TeamOverviewTab rangeDays={rangeDays} />
        </TabsContent>
        <TabsContent value="employee" className="mt-4">
          <EmployeeDetailTab rangeDays={rangeDays} />
        </TabsContent>
        <TabsContent value="capacity" className="mt-4">
          <CapacityPlanningTab rangeDays={rangeDays} />
        </TabsContent>
        <TabsContent value="risk" className="mt-4">
          <RiskFlagsTab rangeDays={rangeDays} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
