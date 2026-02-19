import { useState, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Clock,
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  Timer,
  ShieldAlert,
  TrendingUp,
  Users,
} from "lucide-react";

const MessagesCharts = lazy(() => import("./messages-charts"));

interface MessagesReportData {
  period: { days: number; since: string };
  summary: {
    total: number;
    open: number;
    closed: number;
    overdue: number;
    avgFirstResponseMinutes: number | null;
    avgResolutionMinutes: number | null;
    respondedCount: number;
    resolvedCount: number;
  };
  openByPriority: Record<string, number>;
  volumeByClient: {
    clientId: string;
    clientName: string;
    total: number;
    open: number;
    closed: number;
  }[];
  dailyTrend: {
    date: string;
    created: number;
    responded: number;
    resolved: number;
    avgResponseMinutes: number | null;
  }[];
}

function formatDuration(minutes: number | null): string {
  if (minutes === null) return "N/A";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

function MetricCard({
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
  variant?: "default" | "warning" | "success";
}) {
  return (
    <Card data-testid={`metric-card-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className={`text-2xl font-bold ${variant === "warning" ? "text-destructive" : variant === "success" ? "text-green-600 dark:text-green-400" : ""}`}>
              {value}
            </p>
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

function ChartSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-60" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-[280px] w-full" />
      </CardContent>
    </Card>
  );
}

export default function MessagesReports() {
  const [days, setDays] = useState("30");

  const { data, isLoading } = useQuery<MessagesReportData>({
    queryKey: ["/api/crm/messages/reports", { days }],
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-[140px]" />
        </div>
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-3 w-20 mb-2" />
                <Skeleton className="h-7 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { summary, openByPriority } = data;
  const totalOpen = Object.values(openByPriority).reduce((a, b) => a + Number(b), 0);

  return (
    <div className="space-y-6" data-testid="messages-reports-container">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">
            Threads created in the last {days} days ({summary.total} total). Open/overdue reflect current state.
          </p>
        </div>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-[140px]" data-testid="select-report-period">
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

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          icon={<Timer className="h-5 w-5" />}
          label="Avg First Response"
          value={formatDuration(summary.avgFirstResponseMinutes)}
          subtitle={`${summary.respondedCount} responded`}
        />
        <MetricCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          label="Avg Resolution"
          value={formatDuration(summary.avgResolutionMinutes)}
          subtitle={`${summary.resolvedCount} resolved`}
          variant="success"
        />
        <MetricCard
          icon={<MessageSquare className="h-5 w-5" />}
          label="Open Threads"
          value={totalOpen}
          subtitle={`of ${summary.total} total`}
        />
        <MetricCard
          icon={<ShieldAlert className="h-5 w-5" />}
          label="Overdue Threads"
          value={summary.overdue}
          subtitle={totalOpen > 0 ? `${Math.round((summary.overdue / totalOpen) * 100)}% of open` : undefined}
          variant={summary.overdue > 0 ? "warning" : "default"}
        />
        <MetricCard
          icon={<AlertTriangle className="h-5 w-5" />}
          label="High/Urgent Open"
          value={Number(openByPriority.high || 0) + Number(openByPriority.urgent || 0)}
          subtitle={`${openByPriority.urgent || 0} urgent`}
          variant={Number(openByPriority.urgent || 0) > 0 ? "warning" : "default"}
        />
        <MetricCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Closed"
          value={summary.closed}
          subtitle={summary.total > 0 ? `${Math.round((summary.closed / summary.total) * 100)}% rate` : undefined}
          variant="success"
        />
      </div>

      <Card data-testid="card-open-by-priority">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Open Threads by Priority</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 flex-wrap">
            {(["urgent", "high", "normal", "low"] as const).map((p) => {
              const val = Number(openByPriority[p] || 0);
              return (
                <div key={p} className="flex items-center gap-1.5">
                  <Badge
                    variant={p === "urgent" ? "destructive" : "outline"}
                    className="capitalize"
                    data-testid={`badge-priority-${p}`}
                  >
                    {p}: {val}
                  </Badge>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Suspense
        fallback={
          <div className="grid gap-6 lg:grid-cols-2">
            <ChartSkeleton />
            <ChartSkeleton />
            <ChartSkeleton />
          </div>
        }
      >
        <MessagesCharts
          volumeByClient={data.volumeByClient}
          dailyTrend={data.dailyTrend}
          openByPriority={openByPriority}
        />
      </Suspense>
    </div>
  );
}
