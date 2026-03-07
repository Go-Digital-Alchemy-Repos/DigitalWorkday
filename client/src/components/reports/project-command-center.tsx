import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { 
  BarChart3, 
  CheckSquare, 
  Clock, 
  TrendingUp, 
  ShieldAlert,
  AlertTriangle,
  Info
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area,
} from "recharts";
import { cn } from "@/lib/utils";
import { buildHeaders } from "@/lib/queryClient";
import { ReportCommandCenterLayout, buildDateParams } from "./report-command-center-layout";
import { MobileTabSelect } from "./mobile-tab-select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getStorageUrl } from "@/lib/storageUrl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function rfetch(url: string) {
  return fetch(url, { credentials: "include", headers: buildHeaders() });
}

const STATUS_COLORS: Record<string, string> = {
  todo: "hsl(var(--muted-foreground))",
  in_progress: "hsl(var(--primary))",
  in_review: "hsl(var(--chart-4, 280 65% 60%))",
  done: "hsl(var(--chart-2, 142 71% 45%))",
  blocked: "hsl(var(--destructive))",
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "hsl(var(--destructive))",
  high: "hsl(var(--chart-5, 27 96% 61%))",
  medium: "hsl(var(--chart-3, 45 93% 47%))",
  low: "hsl(var(--muted-foreground))",
};

const OVERDUE_LABELS: Record<string, string> = {
  not_overdue: "On Track",
  "1_3_days": "1-3 Days Overdue",
  "4_7_days": "4-7 Days Overdue",
  "1_2_weeks": "1-2 Weeks Overdue",
  over_2_weeks: "2+ Weeks Overdue",
};

const OVERDUE_COLORS: Record<string, string> = {
  not_overdue: "hsl(var(--chart-2, 142 71% 45%))",
  "1_3_days": "hsl(var(--chart-3, 45 93% 47%))",
  "4_7_days": "hsl(var(--chart-5, 27 96% 61%))",
  "1_2_weeks": "hsl(var(--destructive))",
  over_2_weeks: "hsl(var(--destructive))",
};

function formatHours(seconds: number) {
  return (seconds / 3600).toFixed(1) + "h";
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

interface MetricCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  color: string;
  testId?: string;
}

function MetricCard({ label, value, sub, icon, color, testId }: MetricCardProps) {
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

// --- Tab Components ---

interface ProjectOverviewData {
  summary: {
    totalProjects: number;
    activeProjects: number;
    completedProjects: number;
    pausedProjects: number;
    totalHours: number;
    totalTasks: number;
    overdueTasks: number;
  };
  projects: {
    project_id: string;
    project_name: string;
    project_color: string;
    status: string;
    client_name: string;
    team_name: string;
    total_tasks: number;
    completed_tasks: number;
    open_tasks: number;
    overdue_tasks: number;
    in_progress_tasks: number;
    completion_rate: number;
    total_hours: number;
    budget_minutes: number;
    budget_used_minutes: number;
    budget_utilization_pct: number;
  }[];
  statusDistribution: { status: string; count: number }[];
}

function OverviewTab({ rangeDays }: { rangeDays: number }) {
  const { data, isLoading } = useQuery<ProjectOverviewData>({
    queryKey: ["/api/reports/v2/project/overview", buildDateParams(rangeDays)],
    queryFn: async () => {
      const res = await rfetch(`/api/reports/v2/project/overview?${buildDateParams(rangeDays)}`);
      if (!res.ok) throw new Error("Failed to fetch overview");
      return res.json();
    },
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-[400px] w-full rounded-lg" />
      </div>
    );
  }

  const pieData = data.statusDistribution.map((s) => ({
    name: s.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    value: s.count,
    fill: STATUS_COLORS[s.status] || "hsl(var(--muted-foreground))",
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label="Active Projects"
          value={data.summary.activeProjects}
          icon={<TrendingUp className="h-4 w-4 text-white" />}
          color="bg-blue-500"
          testId="metric-active-projects"
        />
        <MetricCard
          label="Completed Projects"
          value={data.summary.completedProjects}
          icon={<CheckSquare className="h-4 w-4 text-white" />}
          color="bg-green-500"
          testId="metric-completed-projects"
        />
        <MetricCard
          label="Total Hours"
          value={formatHours(data.summary.totalHours)}
          icon={<Clock className="h-4 w-4 text-white" />}
          color="bg-violet-500"
          testId="metric-total-hours"
        />
        <MetricCard
          label="Overdue Tasks"
          value={data.summary.overdueTasks}
          icon={<AlertTriangle className="h-4 w-4 text-white" />}
          color="bg-red-500"
          testId="metric-overdue-tasks"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Project Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Completion</TableHead>
                    <TableHead>Tasks</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Budget</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.projects.map((p) => (
                    <TableRow key={p.project_id} data-testid={`row-project-${p.project_id}`}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: p.project_color || "hsl(var(--primary))" }}
                          />
                          <Link href={`/projects/${p.project_id}`} className="hover:underline text-primary truncate max-w-[150px]">
                            {p.project_name}
                          </Link>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {p.status.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground truncate max-w-[100px]">
                        {p.client_name || "—"}
                      </TableCell>
                      <TableCell className="min-w-[120px]">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px]">
                            <span>{p.completion_rate}%</span>
                          </div>
                          <Progress value={p.completion_rate} className="h-1.5" />
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex gap-1.5">
                          <span className="text-muted-foreground" title="Open">{p.open_tasks}</span>
                          <span className="text-green-600 font-medium" title="Done">{p.completed_tasks}</span>
                          <span className="text-red-500 font-medium" title="Overdue">{p.overdue_tasks}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {formatHours(p.total_hours)}
                      </TableCell>
                      <TableCell className="min-w-[100px]">
                        {p.budget_minutes > 0 ? (
                          <div className="space-y-1">
                            <Progress 
                              value={p.budget_utilization_pct} 
                              className={cn(
                                "h-1.5",
                                p.budget_utilization_pct > 90 ? "bg-red-100 dark:bg-red-900/30 [&>div]:bg-red-500" :
                                p.budget_utilization_pct > 70 ? "bg-amber-100 dark:bg-amber-900/30 [&>div]:bg-amber-500" :
                                "[&>div]:bg-green-500"
                              )}
                            />
                            <div className="text-[10px] text-muted-foreground text-right">
                              {p.budget_utilization_pct.toFixed(0)}%
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface TaskAnalyticsData {
  statusDistribution: { status: string; count: number }[];
  priorityDistribution: { priority: string; count: number }[];
  overdueBuckets: { bucket: string; count: number }[];
  createdVsCompleted: { date: string; created: number; completed: number }[];
  completionByProject: {
    project_id: string;
    project_name: string;
    project_color: string;
    total: number;
    completed: number;
    completion_rate: number;
  }[];
  assigneeDistribution: {
    user_id: string;
    name: string;
    avatar_url: string | null;
    total_tasks: number;
    completed: number;
    open: number;
    overdue: number;
  }[];
}

function TasksTab() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useQuery<TaskAnalyticsData>({
    queryKey: ["/api/v1/reports/tasks/analytics", { days }],
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[300px] w-full" />
          ))}
        </div>
      </div>
    );
  }

  const trend = data.createdVsCompleted.map((t) => ({
    date: new Date(t.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    Created: t.created,
    Completed: t.completed,
  }));

  const statusData = data.statusDistribution.map((s) => ({
    name: s.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    value: s.count,
    fill: STATUS_COLORS[s.status] || "#94A3B8",
  }));

  const priorityData = data.priorityDistribution.map((p) => ({
    name: p.priority.charAt(0).toUpperCase() + p.priority.slice(1),
    value: p.count,
    fill: PRIORITY_COLORS[p.priority] || "#6B7280",
  }));

  const overdueData = data.overdueBuckets
    .filter((b) => b.bucket !== "not_overdue")
    .map((b) => ({
      name: OVERDUE_LABELS[b.bucket] || b.bucket,
      count: b.count,
      fill: OVERDUE_COLORS[b.bucket] || "#EF4444",
    }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-[150px]" data-testid="select-task-period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="14">Last 14 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="60">Last 60 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tasks Created vs Completed</CardTitle>
          <CardDescription>Trend over the selected period</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis className="text-xs" allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="Created" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.1} strokeWidth={2} />
                <Area type="monotone" dataKey="Completed" stroke="hsl(var(--chart-2, 142 71% 45%))" fill="hsl(var(--chart-2, 142 71% 45%))" fillOpacity={0.1} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status Distribution</CardTitle>
            <CardDescription>Tasks by current status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    dataKey="value"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`status-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Priority Distribution</CardTitle>
            <CardDescription>Tasks by priority level</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={priorityData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" className="text-xs" allowDecimals={false} />
                  <YAxis dataKey="name" type="category" className="text-xs" width={60} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {priorityData.map((entry, index) => (
                      <Cell key={`priority-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {overdueData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Overdue Analysis</CardTitle>
            <CardDescription>Distribution of overdue tasks by severity</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={overdueData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" className="text-xs" tick={{ fontSize: 10 }} />
                  <YAxis className="text-xs" allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {overdueData.map((entry, index) => (
                      <Cell key={`overdue-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Completion by Project</CardTitle>
            <CardDescription>Task completion rate per active project</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.completionByProject.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-4">No project data available</p>
              )}
              {data.completionByProject.map((project) => (
                <div key={project.project_id} className="space-y-1.5" data-testid={`project-completion-${project.project_id}`}>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: project.project_color || "#3B82F6" }}
                      />
                      <span className="font-medium truncate max-w-[180px]">{project.project_name}</span>
                    </div>
                    <span className="text-muted-foreground">
                      {project.completed}/{project.total} ({project.completion_rate}%)
                    </span>
                  </div>
                  <Progress value={project.completion_rate} className="h-2" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Task Load by Assignee</CardTitle>
            <CardDescription>Top assignees by task count</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.assigneeDistribution.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-4">No assignee data available</p>
              )}
              {data.assigneeDistribution.map((assignee) => (
                <div key={assignee.user_id} className="flex items-center gap-3" data-testid={`assignee-row-${assignee.user_id}`}>
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={getStorageUrl(assignee.avatar_url)} />
                    <AvatarFallback>{getInitials(assignee.name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{assignee.name}</div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{assignee.total_tasks} tasks</span>
                      <span>·</span>
                      <span className="text-green-600 dark:text-green-400">{assignee.completed} done</span>
                      {assignee.overdue > 0 && (
                        <>
                          <span>·</span>
                          <span className="text-destructive">{assignee.overdue} overdue</span>
                        </>
                      )}
                    </div>
                  </div>
                  <Badge variant={assignee.overdue > 0 ? "destructive" : "secondary"} className="text-xs">
                    {assignee.open} open
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface ProjectTimeData {
  byProject: {
    project_id: string;
    project_name: string;
    project_color: string;
    total_seconds: number;
    billable_seconds: number;
    non_billable_seconds: number;
    user_count: number;
  }[];
  weeklyTrend: { week: string; total_seconds: number }[];
  summary: {
    totalSeconds: number;
    billableSeconds: number;
    nonBillableSeconds: number;
    projectCount: number;
  };
}

function TimeTab({ rangeDays }: { rangeDays: number }) {
  const { data, isLoading } = useQuery<ProjectTimeData>({
    queryKey: ["/api/reports/v2/project/time", buildDateParams(rangeDays)],
    queryFn: async () => {
      const res = await rfetch(`/api/reports/v2/project/time?${buildDateParams(rangeDays)}`);
      if (!res.ok) throw new Error("Failed to fetch time data");
      return res.json();
    },
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-[400px] w-full rounded-lg" />
      </div>
    );
  }

  const barData = data.byProject.slice(0, 10).map((p) => ({
    name: p.project_name,
    hours: Math.round((p.total_seconds / 3600) * 10) / 10,
    fill: p.project_color || "hsl(var(--primary))",
  }));

  const trendData = data.weeklyTrend.map((t) => ({
    week: t.week,
    hours: Math.round((t.total_seconds / 3600) * 10) / 10,
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <MetricCard
          label="Total Hours"
          value={formatHours(data.summary.totalSeconds)}
          icon={<Clock className="h-4 w-4 text-white" />}
          color="bg-blue-500"
          testId="metric-total-hours"
        />
        <MetricCard
          label="Billable Hours"
          value={formatHours(data.summary.billableSeconds)}
          icon={<Clock className="h-4 w-4 text-white" />}
          color="bg-green-500"
          testId="metric-billable-hours"
        />
        <MetricCard
          label="Non-Billable"
          value={formatHours(data.summary.nonBillableSeconds)}
          icon={<Clock className="h-4 w-4 text-white" />}
          color="bg-muted-foreground"
          testId="metric-non-billable-hours"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top 10 Projects by Hours</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis type="number" className="text-xs" />
                  <YAxis dataKey="name" type="category" className="text-xs" width={100} />
                  <Tooltip />
                  <Bar dataKey="hours" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Weekly Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="week" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip />
                  <Area type="monotone" dataKey="hours" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.1} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Total Hours</TableHead>
                <TableHead>Billable %</TableHead>
                <TableHead>Team Members</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.byProject.map((p) => (
                <TableRow key={p.project_id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: p.project_color || "hsl(var(--primary))" }}
                      />
                      {p.project_name}
                    </div>
                  </TableCell>
                  <TableCell>{formatHours(p.total_seconds)}</TableCell>
                  <TableCell>
                    {p.total_seconds > 0 
                      ? ((p.billable_seconds / p.total_seconds) * 100).toFixed(0) + "%" 
                      : "0%"}
                  </TableCell>
                  <TableCell>{p.user_count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

interface ProjectMilestoneData {
  byProject: {
    project_id: string;
    project_name: string;
    project_color: string;
    total: number;
    completed: number;
    in_progress: number;
    overdue: number;
    milestones: { id: string; name: string; status: string; due_date: string | null }[];
  }[];
  summary: {
    total: number;
    completed: number;
    overdue: number;
  };
}

function ProgressTab({ rangeDays }: { rangeDays: number }) {
  const overviewQuery = useQuery<ProjectOverviewData>({
    queryKey: ["/api/reports/v2/project/overview", buildDateParams(rangeDays)],
    queryFn: async () => {
      const res = await rfetch(`/api/reports/v2/project/overview?${buildDateParams(rangeDays)}`);
      if (!res.ok) throw new Error("Failed to fetch overview");
      return res.json();
    },
  });

  const milestoneQuery = useQuery<ProjectMilestoneData>({
    queryKey: ["/api/reports/v2/project/milestones"],
    queryFn: async () => {
      const res = await rfetch(`/api/reports/v2/project/milestones`);
      if (!res.ok) throw new Error("Failed to fetch milestones");
      return res.json();
    },
  });

  if (overviewQuery.isLoading || milestoneQuery.isLoading || !overviewQuery.data || !milestoneQuery.data) {
    return <Skeleton className="h-[500px] w-full" />;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project Completion Rates</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {overviewQuery.data.projects.map((p) => (
              <div key={p.project_id} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: p.project_color || "#3B82F6" }}
                    />
                    <span className="font-medium truncate max-w-[250px]">{p.project_name}</span>
                  </div>
                  <span className="text-muted-foreground">
                    {p.completion_rate}%
                  </span>
                </div>
                <Progress value={p.completion_rate} className="h-2" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Milestone Status</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>In Progress</TableHead>
                <TableHead>Overdue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {milestoneQuery.data.byProject.map((p) => (
                <TableRow key={p.project_id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: p.project_color || "hsl(var(--primary))" }}
                      />
                      {p.project_name}
                    </div>
                  </TableCell>
                  <TableCell>{p.total}</TableCell>
                  <TableCell className="text-green-600">{p.completed}</TableCell>
                  <TableCell className="text-blue-600">{p.in_progress}</TableCell>
                  <TableCell className="text-red-600 font-bold">{p.overdue}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

interface ProjectRiskData {
  projects: {
    project_id: string;
    project_name: string;
    project_color: string;
    status: string;
    risk_score: number;
    risk_level: "low" | "medium" | "high" | "critical";
    risk_factors: string[];
  }[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

function RiskTab({ rangeDays }: { rangeDays: number }) {
  const { data, isLoading } = useQuery<ProjectRiskData>({
    queryKey: ["/api/reports/v2/project/risk", buildDateParams(rangeDays)],
    queryFn: async () => {
      const res = await rfetch(`/api/reports/v2/project/risk?${buildDateParams(rangeDays)}`);
      if (!res.ok) throw new Error("Failed to fetch risk data");
      return res.json();
    },
  });

  if (isLoading || !data) {
    return <Skeleton className="h-[400px] w-full" />;
  }

  const getLevelColor = (level: string) => {
    switch (level) {
      case "critical": return "destructive";
      case "high": return "destructive";
      case "medium": return "outline"; // Amber would be better, but use outline for high contrast
      default: return "secondary";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Badge variant="destructive" className="px-3 py-1">Critical: {data.summary.critical}</Badge>
        <Badge variant="destructive" className="px-3 py-1 bg-red-400">High: {data.summary.high}</Badge>
        <Badge variant="outline" className="px-3 py-1 border-amber-500 text-amber-500">Medium: {data.summary.medium}</Badge>
        <Badge variant="secondary" className="px-3 py-1">Low: {data.summary.low}</Badge>
      </div>

      <div className="space-y-3">
        {data.projects.length === 0 ? (
          <div className="text-center py-12 border rounded-lg bg-muted/20">
            <Info className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground">No at-risk projects identified</p>
          </div>
        ) : (
          data.projects.map((p) => (
            <Card key={p.project_id} className="hover-elevate">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: p.project_color || "hsl(var(--primary))" }}
                      />
                      <h4 className="font-semibold">{p.project_name}</h4>
                      <Badge variant={getLevelColor(p.risk_level)} className="capitalize text-[10px] h-5">
                        {p.risk_level}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {p.risk_factors.map((f, i) => (
                        <Badge key={i} variant="secondary" className="text-[10px] font-normal">
                          {f}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground mb-1">Risk Score</div>
                    <div className={cn(
                      "text-2xl font-bold",
                      p.risk_score > 75 ? "text-red-600" : 
                      p.risk_score > 50 ? "text-red-400" :
                      p.risk_score > 25 ? "text-amber-500" :
                      "text-green-600"
                    )}>
                      {p.risk_score}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

// --- Main Export ---

export function ProjectCommandCenter() {
  const [activeTab, setActiveTab] = useState("overview");
  const [rangeDays, setRangeDays] = useState(30);

  const tabs = [
    { value: "overview", label: "Overview", icon: BarChart3 },
    { value: "tasks", label: "Tasks", icon: CheckSquare },
    { value: "time", label: "Time", icon: Clock },
    { value: "progress", label: "Progress", icon: TrendingUp },
    { value: "risk", label: "Risk", icon: ShieldAlert },
  ];

  return (
    <ReportCommandCenterLayout
      title="Project Command Center"
      description="Holistic view of project health, tasks, time, and risks."
      icon={<BarChart3 className="h-6 w-6" />}
      rangeDays={rangeDays}
      onRangeChange={setRangeDays}
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <MobileTabSelect
          tabs={tabs}
          value={activeTab}
          onValueChange={setActiveTab}
        />
        
        <TabsList className="hidden md:flex w-full justify-start border-b rounded-none h-auto p-0 bg-transparent gap-6">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-2 py-3 gap-2"
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-0">
          <OverviewTab rangeDays={rangeDays} />
        </TabsContent>
        <TabsContent value="tasks" className="mt-0">
          <TasksTab />
        </TabsContent>
        <TabsContent value="time" className="mt-0">
          <TimeTab rangeDays={rangeDays} />
        </TabsContent>
        <TabsContent value="progress" className="mt-0">
          <ProgressTab rangeDays={rangeDays} />
        </TabsContent>
        <TabsContent value="risk" className="mt-0">
          <RiskTab rangeDays={rangeDays} />
        </TabsContent>
      </Tabs>
    </ReportCommandCenterLayout>
  );
}
