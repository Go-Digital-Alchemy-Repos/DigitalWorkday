import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, AreaChart, Area, Legend
} from "recharts";
import {
  Users, Clock, AlertTriangle, TrendingUp, Activity,
  CheckCircle2, BarChart3, ShieldAlert, Zap, User,
  ChevronUp, ChevronDown, ArrowUpDown
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ReportCommandCenterLayout, buildDateParams } from "./report-command-center-layout";
import { MobileTabSelect } from "./mobile-tab-select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getStorageUrl } from "@/lib/storageUrl";
import { buildHeaders } from "@/lib/queryClient";

async function rfetch(url: string) {
  const res = await fetch(url, { credentials: "include", headers: buildHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch ${url}`);
  return res.json();
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

function formatHours(seconds: number): string {
  return (seconds / 3600).toFixed(1) + "h";
}

function formatPct(n: number): string {
  return n.toFixed(1) + "%";
}

function getUtilColor(pct: number): string {
  if (pct > 100) return "bg-red-500 text-white";
  if (pct > 80) return "bg-orange-500 text-white";
  if (pct > 50) return "bg-green-500 text-white";
  return "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300";
}

const RISK_COLORS: Record<string, string> = {
  critical: "bg-red-600 text-white",
  high: "bg-red-500 text-white",
  medium: "bg-orange-500 text-white",
  low: "bg-yellow-500 text-black",
};

function MetricCard({ label, value, sub, icon, color, testId }: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  color: string;
  testId?: string;
}) {
  return (
    <Card data-testid={testId}>
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

function SortIcon({ field, sortBy, sortDir }: { field: string; sortBy: string; sortDir: "asc" | "desc" }) {
  if (sortBy !== field) return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/50 ml-1 shrink-0" />;
  return sortDir === "asc"
    ? <ChevronUp className="h-3.5 w-3.5 ml-1 shrink-0 text-primary" />
    : <ChevronDown className="h-3.5 w-3.5 ml-1 shrink-0 text-primary" />;
}

// Overview Tab
function OverviewTab({ rangeDays }: { rangeDays: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/reports/v2/workload/team", { rangeDays }],
    queryFn: () => rfetch(`/api/reports/v2/workload/team?${buildDateParams(rangeDays)}`),
  });

  const totals = useMemo(() => {
    if (!data?.team) return null;
    const team = data.team;
    return {
      activeTasks: team.reduce((s: number, m: any) => s + m.activeTasksNow, 0),
      overdueTasks: team.reduce((s: number, m: any) => s + m.overdueCount, 0),
      totalHours: team.reduce((s: number, m: any) => s + m.totalHours, 0),
      avgUtilization: team.length > 0
        ? team.reduce((s: number, m: any) => s + (m.utilizationPct || 0), 0) / team.length
        : 0
    };
  }, [data]);

  if (isLoading) return <Skeleton className="h-[400px] w-full" />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label="Active Tasks"
          value={totals?.activeTasks || 0}
          icon={<Activity className="h-4 w-4 text-white" />}
          color="bg-blue-500"
          testId="metric-active-tasks"
        />
        <MetricCard
          label="Overdue Tasks"
          value={totals?.overdueTasks || 0}
          icon={<AlertTriangle className="h-4 w-4 text-white" />}
          color="bg-red-500"
          testId="metric-overdue-tasks"
        />
        <MetricCard
          label="Total Hours"
          value={formatHours(totals?.totalHours || 0)}
          icon={<Clock className="h-4 w-4 text-white" />}
          color="bg-green-500"
          testId="metric-total-hours"
        />
        <MetricCard
          label="Team Utilization"
          value={formatPct(totals?.avgUtilization || 0)}
          icon={<TrendingUp className="h-4 w-4 text-white" />}
          color="bg-violet-500"
          testId="metric-utilization"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Employee Performance</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Overdue</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead>Efficiency</TableHead>
                <TableHead>Overdue Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.team?.map((m: any) => (
                <TableRow key={m.userId} data-testid={`row-employee-${m.userId}`}>
                  <TableCell className="font-medium">{userName(m)}</TableCell>
                  <TableCell>{m.activeTasksNow}</TableCell>
                  <TableCell className={m.overdueCount > 0 ? "text-red-500" : ""}>{m.overdueCount}</TableCell>
                  <TableCell>{m.completedCount}</TableCell>
                  <TableCell>{formatHours(m.totalHours)}</TableCell>
                  <TableCell>{m.efficiencyRatio ? formatPct(m.efficiencyRatio * 100) : "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={m.overdueRate} className="h-1.5 w-12" />
                      <span className="text-xs">{formatPct(m.overdueRate)}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// Workload Tab
function WorkloadTab({ rangeDays }: { rangeDays: number }) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const { data: teamData, isLoading: teamLoading } = useQuery({
    queryKey: ["/api/reports/v2/workload/team", { rangeDays }],
    queryFn: () => rfetch(`/api/reports/v2/workload/team?${buildDateParams(rangeDays)}`),
  });

  const { data: userData, isLoading: userLoading } = useQuery({
    queryKey: ["/api/reports/v2/workload/users", selectedUserId, rangeDays],
    queryFn: () => rfetch(`/api/reports/v2/workload/users/${selectedUserId}?${buildDateParams(rangeDays)}`),
    enabled: !!selectedUserId,
  });

  if (teamLoading) return <Skeleton className="h-[400px] w-full" />;

  if (selectedUserId && userData) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setSelectedUserId(null)}
          className="text-sm text-primary hover:underline flex items-center gap-1 mb-2"
          data-testid="button-back-to-list"
        >
          ← Back to List
        </button>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Daily Trend (Completed vs Hours)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={userData.dailyTrend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="completedTasks" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.1} />
                  <Area type="monotone" dataKey="hoursTracked" stackId="2" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.1} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Top Projects by Hours</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={userData.topProjects} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="projectName" type="category" tick={{ fontSize: 10 }} width={100} />
                  <Tooltip />
                  <Bar dataKey="hoursTracked" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-red-500">Overdue Tasks</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Due Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userData.overdueTaskSample.map((t: any) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-sm">{t.title}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{t.projectName}</TableCell>
                    <TableCell className="text-sm text-red-500">{new Date(t.dueDate).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
                {userData.overdueTaskSample.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-4">No overdue tasks</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Active</TableHead>
              <TableHead>Overdue</TableHead>
              <TableHead>Completed</TableHead>
              <TableHead>Hours</TableHead>
              <TableHead>Efficiency</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teamData?.team?.map((m: any) => (
              <TableRow key={m.userId}>
                <TableCell className="font-medium">{userName(m)}</TableCell>
                <TableCell>{m.activeTasksNow}</TableCell>
                <TableCell className={m.overdueCount > 0 ? "text-red-500" : ""}>{m.overdueCount}</TableCell>
                <TableCell>{m.completedCount}</TableCell>
                <TableCell>{formatHours(m.totalHours)}</TableCell>
                <TableCell>{m.efficiencyRatio ? formatPct(m.efficiencyRatio * 100) : "—"}</TableCell>
                <TableCell>
                  <button
                    onClick={() => setSelectedUserId(m.userId)}
                    className="text-xs text-primary hover:underline"
                    data-testid={`button-view-details-${m.userId}`}
                  >
                    View Details
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// Capacity Tab
function CapacityTab({ rangeDays }: { rangeDays: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/reports/v2/workload/capacity", { rangeDays }],
    queryFn: () => rfetch(`/api/reports/v2/workload/capacity?${buildDateParams(rangeDays)}`),
  });

  if (isLoading) return <Skeleton className="h-[400px] w-full" />;

  const weeks = data?.users?.[0]?.weeks?.map((w: any) => w.weekStart) || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Weekly Capacity Grid</CardTitle>
        <CardDescription>Utilization percentage by employee and week.</CardDescription>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left p-3 font-medium text-muted-foreground w-40">Employee</th>
              {weeks.map((w: string) => (
                <th key={w} className="text-center p-2 font-medium text-muted-foreground text-xs whitespace-nowrap">
                  {new Date(w).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data?.users?.map((u: any) => (
              <tr key={u.userId} className="border-b last:border-0">
                <td className="p-3 font-medium">{userName(u)}</td>
                {u.weeks.map((w: any) => (
                  <td key={w.weekStart} className="p-1">
                    <div
                      className={cn(
                        "h-10 flex flex-col items-center justify-center rounded-md text-[10px] font-bold",
                        getUtilColor(w.utilizationPct || 0)
                      )}
                      data-testid={`capacity-cell-${u.userId}-${w.weekStart}`}
                    >
                      <span>{w.actualHours}h</span>
                      <span>{w.utilizationPct}%</span>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

// Time Tab
function TimeTab({ rangeDays }: { rangeDays: number }) {
  const dateParams = buildDateParams(rangeDays);
  
  const summaryQuery = useQuery({
    queryKey: ["/api/reports/v2/time/summary", { rangeDays }],
    queryFn: () => rfetch(`/api/reports/v2/time/summary?${dateParams}`),
  });

  const byProjectQuery = useQuery({
    queryKey: ["/api/reports/v2/time/by-project", { rangeDays }],
    queryFn: () => rfetch(`/api/reports/v2/time/by-project?${dateParams}`),
  });

  const byUserQuery = useQuery({
    queryKey: ["/api/reports/v2/time/by-user", { rangeDays }],
    queryFn: () => rfetch(`/api/reports/v2/time/by-user?${dateParams}`),
  });

  const trendQuery = useQuery({
    queryKey: ["/api/reports/v2/time/trend", { rangeDays }],
    queryFn: () => rfetch(`/api/reports/v2/time/trend?${dateParams}`),
  });

  if (summaryQuery.isLoading || byProjectQuery.isLoading || byUserQuery.isLoading || trendQuery.isLoading) {
    return <Skeleton className="h-[400px] w-full" />;
  }

  const summary = summaryQuery.data;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Total Hours" value={formatHours(summary?.totalSeconds || 0)} icon={<Clock className="h-4 w-4 text-white" />} color="bg-blue-500" />
        <MetricCard label="Billable Hours" value={formatHours(summary?.billableSeconds || 0)} icon={<Zap className="h-4 w-4 text-white" />} color="bg-green-500" />
        <MetricCard label="Non-Billable" value={formatHours(summary?.nonBillableSeconds || 0)} icon={<AlertTriangle className="h-4 w-4 text-white" />} color="bg-gray-500" />
        <MetricCard label="Active Users" value={summary?.userCount || 0} icon={<Users className="h-4 w-4 text-white" />} color="bg-violet-500" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Top Projects</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={byProjectQuery.data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="totalSeconds" name="Seconds" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Daily Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={trendQuery.data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Area type="monotone" dataKey="totalSeconds" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} />
                <Area type="monotone" dataKey="billableSeconds" stroke="#10b981" fill="#10b981" fillOpacity={0.1} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Time by User</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead>Billable %</TableHead>
                <TableHead>Entries</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byUserQuery.data?.map((u: any) => (
                <TableRow key={u.userId}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell>{formatHours(u.duration)}</TableCell>
                  <TableCell>{formatPct((u.billableSeconds / u.duration) * 100)}</TableCell>
                  <TableCell>{u.entries}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// Risk Tab
function RiskTab({ rangeDays }: { rangeDays: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/reports/v2/workload/risk", { rangeDays }],
    queryFn: () => rfetch(`/api/reports/v2/workload/risk?${buildDateParams(rangeDays)}`),
  });

  if (isLoading) return <Skeleton className="h-[400px] w-full" />;

  const summary = data?.summary || { critical: 0, high: 0, medium: 0, low: 0 };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Badge className={cn("px-3 py-1", RISK_COLORS.critical)}>Critical: {summary.critical}</Badge>
        <Badge className={cn("px-3 py-1", RISK_COLORS.high)}>High: {summary.high}</Badge>
        <Badge className={cn("px-3 py-1", RISK_COLORS.medium)}>Medium: {summary.medium}</Badge>
        <Badge className={cn("px-3 py-1", RISK_COLORS.low)}>Low: {summary.low}</Badge>
      </div>

      <div className="grid gap-3">
        {data?.flagged?.map((f: any) => (
          <Card key={f.userId} data-testid={`card-risk-${f.userId}`}>
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={getStorageUrl(f.avatarUrl) || ""} />
                  <AvatarFallback>{userInitials(f)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold text-sm">{userName(f)}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {f.reasons.map((r: string, idx: number) => (
                      <Badge key={idx} variant="outline" className="text-[10px] py-0">{r}</Badge>
                    ))}
                  </div>
                </div>
              </div>
              <Badge className={cn("uppercase text-[10px]", RISK_COLORS[f.riskLevel] || RISK_COLORS.low)}>
                {f.riskLevel}
              </Badge>
            </CardContent>
          </Card>
        ))}
        {data?.flagged?.length === 0 && (
          <div className="text-center py-12 text-muted-foreground border rounded-lg bg-muted/20">
            <ShieldAlert className="h-10 w-10 mx-auto opacity-20 mb-2" />
            <p>No employees flagged for risk in this period</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function TimeWorkloadCommandCenter() {
  const [activeTab, setActiveTab] = useState("overview");
  const [rangeDays, setRangeDays] = useState(30);

  const tabs = [
    { value: "overview", label: "Overview" },
    { value: "workload", label: "Workload" },
    { value: "capacity", label: "Capacity" },
    { value: "time", label: "Time" },
    { value: "risk", label: "Risk" },
  ];

  return (
    <ReportCommandCenterLayout
      title="Time & Workload Command Center"
      description="Consolidated view of team performance, workload capacity, tracked time, and risk flags."
      icon={<Clock className="h-5 w-5" />}
      rangeDays={rangeDays}
      onRangeChange={setRangeDays}
    >
      <div className="space-y-4">
        <MobileTabSelect
          tabs={tabs}
          value={activeTab}
          onValueChange={setActiveTab}
        />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="hidden md:flex w-fit">
            {tabs.map(t => (
              <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
            ))}
          </TabsList>

          <div className="mt-4">
            <TabsContent value="overview">
              <OverviewTab rangeDays={rangeDays} />
            </TabsContent>
            <TabsContent value="workload">
              <WorkloadTab rangeDays={rangeDays} />
            </TabsContent>
            <TabsContent value="capacity">
              <CapacityTab rangeDays={rangeDays} />
            </TabsContent>
            <TabsContent value="time">
              <TimeTab rangeDays={rangeDays} />
            </TabsContent>
            <TabsContent value="risk">
              <RiskTab rangeDays={rangeDays} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </ReportCommandCenterLayout>
  );
}
