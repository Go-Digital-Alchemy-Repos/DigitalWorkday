import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2,
  Clock,
  Users,
  FolderKanban,
  AlertTriangle,
  Ticket,
  TrendingUp,
  Building2,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Legend,
} from "recharts";

interface OverviewData {
  tasks: {
    total: number;
    completed: number;
    open: number;
    overdue: number;
    completionRate: number;
  };
  projects: {
    total: number;
    active: number;
    completed: number;
    archived: number;
  };
  time: {
    totalHours: number;
    totalEntries: number;
    activeUsers: number;
  };
  clients: {
    total: number;
    active: number;
  };
  tickets: {
    total: number;
    open: number;
    resolved: number;
  };
  members: {
    total: number;
  };
  trends: {
    tasks: { date: string; created: number; completed: number }[];
    hours: { date: string; hours: number }[];
  };
}

function KpiCard({
  icon,
  label,
  value,
  subtitle,
  variant,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtitle?: string;
  variant?: "default" | "warning" | "success" | "info";
}) {
  const colorClass =
    variant === "warning"
      ? "text-destructive"
      : variant === "success"
        ? "text-green-600 dark:text-green-400"
        : variant === "info"
          ? "text-blue-600 dark:text-blue-400"
          : "";
  return (
    <Card data-testid={`kpi-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className={`text-2xl font-bold ${colorClass}`}>{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
            )}
          </div>
          <div className="shrink-0 text-muted-foreground">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-3 w-20 mb-2" />
              <Skeleton className="h-7 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-[250px] w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-[250px] w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function OverviewDashboard() {
  const { data, isLoading } = useQuery<OverviewData>({
    queryKey: ["/api/v1/reports/overview"],
  });

  if (isLoading || !data) return <LoadingSkeleton />;

  const taskTrend = data.trends.tasks.map((t) => ({
    date: new Date(t.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    Created: t.created,
    Completed: t.completed,
  }));

  const hoursTrend = data.trends.hours.map((h) => ({
    date: new Date(h.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    Hours: h.hours,
  }));

  return (
    <div className="space-y-6" data-testid="overview-dashboard">
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        <KpiCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Total Tasks"
          value={data.tasks.total}
          subtitle={`${data.tasks.completed} completed`}
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Completion Rate"
          value={`${data.tasks.completionRate}%`}
          subtitle={`${data.tasks.open} open`}
          variant="success"
        />
        <KpiCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Overdue Tasks"
          value={data.tasks.overdue}
          variant={data.tasks.overdue > 0 ? "warning" : "default"}
        />
        <KpiCard
          icon={<FolderKanban className="h-4 w-4" />}
          label="Active Projects"
          value={data.projects.active}
          subtitle={`${data.projects.total} total`}
          variant="info"
        />
        <KpiCard
          icon={<Clock className="h-4 w-4" />}
          label="Hours Tracked"
          value={`${data.time.totalHours}h`}
          subtitle={`${data.time.totalEntries} entries`}
        />
        <KpiCard
          icon={<Building2 className="h-4 w-4" />}
          label="Active Clients"
          value={data.clients.active}
          subtitle={`${data.clients.total} total`}
        />
        <KpiCard
          icon={<Ticket className="h-4 w-4" />}
          label="Open Tickets"
          value={data.tickets.open}
          subtitle={`${data.tickets.resolved} resolved`}
          variant={data.tickets.open > 0 ? "warning" : "default"}
        />
        <KpiCard
          icon={<Users className="h-4 w-4" />}
          label="Team Members"
          value={data.members.total}
          subtitle={`${data.time.activeUsers} tracking time`}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Task Activity (30 Days)</CardTitle>
            <CardDescription>Created vs completed tasks over the last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={taskTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis className="text-xs" allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="Created"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary))"
                    fillOpacity={0.1}
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="Completed"
                    stroke="hsl(var(--chart-2, 142 71% 45%))"
                    fill="hsl(var(--chart-2, 142 71% 45%))"
                    fillOpacity={0.1}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hours Tracked (30 Days)</CardTitle>
            <CardDescription>Daily time tracking over the last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hoursTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis className="text-xs" />
                  <Tooltip />
                  <Bar dataKey="Hours" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Projects Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { label: "Active", value: data.projects.active, cssVar: "--chart-2" },
                { label: "Completed", value: data.projects.completed, cssVar: "--primary" },
                { label: "Archived", value: data.projects.archived, cssVar: "--muted-foreground" },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between" data-testid={`overview-projects-${item.label.toLowerCase()}`}>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: `hsl(var(${item.cssVar}))` }} />
                    <span className="text-sm">{item.label}</span>
                  </div>
                  <span className="text-sm font-medium">{item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Task Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { label: "Open", value: data.tasks.open, cssVar: "--primary" },
                { label: "Completed", value: data.tasks.completed, cssVar: "--chart-2" },
                { label: "Overdue", value: data.tasks.overdue, cssVar: "--destructive" },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between" data-testid={`overview-tasks-${item.label.toLowerCase()}`}>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: `hsl(var(${item.cssVar}))` }} />
                    <span className="text-sm">{item.label}</span>
                  </div>
                  <span className="text-sm font-medium">{item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Support Tickets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { label: "Open", value: data.tickets.open, cssVar: "--chart-3" },
                { label: "Resolved", value: data.tickets.resolved, cssVar: "--chart-2" },
                { label: "Total", value: data.tickets.total, cssVar: "--muted-foreground" },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between" data-testid={`overview-tickets-${item.label.toLowerCase()}`}>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: `hsl(var(${item.cssVar}))` }} />
                    <span className="text-sm">{item.label}</span>
                  </div>
                  <span className="text-sm font-medium">{item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
