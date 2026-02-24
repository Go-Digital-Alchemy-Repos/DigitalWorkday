import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { getStorageUrl } from "@/lib/storageUrl";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  Legend,
} from "recharts";

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

function getInitials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="h-[250px] w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function TaskAnalytics() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useQuery<TaskAnalyticsData>({
    queryKey: ["/api/v1/reports/tasks/analytics", { days }],
  });

  if (isLoading || !data) return <LoadingSkeleton />;

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
    <div className="space-y-6" data-testid="task-analytics">
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
