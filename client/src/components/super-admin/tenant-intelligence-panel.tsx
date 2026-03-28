import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  ChevronDown,
  ChevronUp,
  DollarSign,
  Heart,
  Activity,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Users,
  FolderKanban,
  CheckSquare,
  Clock,
  Briefcase,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { buildHeaders } from "@/lib/queryClient";

interface FinancialSummary {
  totalHoursTracked: number;
  billableHours: number;
  nonBillableHours: number;
  billablePercent: number;
  estimatedRevenue: number;
  estimatedCost: number;
  estimatedMargin: number;
  marginPercent: number;
}

interface HealthScore {
  overall: number;
  overdueTaskRatio: number;
  projectCompletionRate: number;
  activeUserRatio: number;
  avgTasksPerUser: number;
  riskLevel: "healthy" | "warning" | "critical";
}

interface ActivityMetrics {
  totalUsers: number;
  activeUsers: number;
  totalProjects: number;
  activeProjects: number;
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  totalClients: number;
  totalTimeEntries: number;
  recentTasksCreated7d: number;
  recentTimeEntries7d: number;
}

interface PlatformBenchmark {
  tenantRank: number;
  totalTenants: number;
  avgUsersPerTenant: number;
  avgProjectsPerTenant: number;
  avgTasksPerTenant: number;
  avgHoursPerTenant: number;
  tenantUsersVsAvg: number;
  tenantProjectsVsAvg: number;
  tenantTasksVsAvg: number;
  tenantHoursVsAvg: number;
}

interface TenantIntelligenceData {
  tenantId: string;
  tenantName: string;
  tenantStatus: string;
  financial: FinancialSummary;
  health: HealthScore;
  activity: ActivityMetrics;
  benchmark: PlatformBenchmark;
}

function formatCurrency(amount: number): string {
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}k`;
  return `$${amount.toFixed(0)}`;
}

function formatHours(hours: number): string {
  return `${hours.toFixed(1)}h`;
}

function ComparisonBadge({ pct }: { pct: number }) {
  if (pct === 0) return null;
  const isAbove = pct > 100;
  const diff = Math.abs(pct - 100);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full",
        isAbove
          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
          : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
      )}
      data-testid="comparison-badge"
    >
      {isAbove ? (
        <TrendingUp className="h-2.5 w-2.5" />
      ) : (
        <TrendingDown className="h-2.5 w-2.5" />
      )}
      {diff}% {isAbove ? "above" : "below"} avg
    </span>
  );
}

function HealthIndicator({ score, riskLevel }: { score: number; riskLevel: string }) {
  const colorMap: Record<string, string> = {
    healthy: "text-green-600 dark:text-green-400",
    warning: "text-amber-600 dark:text-amber-400",
    critical: "text-red-600 dark:text-red-400",
  };
  const bgMap: Record<string, string> = {
    healthy: "bg-green-500",
    warning: "bg-amber-500",
    critical: "bg-red-500",
  };
  return (
    <div className="flex items-center gap-3" data-testid="health-indicator">
      <div className="relative h-16 w-16">
        <svg className="h-16 w-16 -rotate-90" viewBox="0 0 36 36">
          <circle
            cx="18" cy="18" r="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="text-muted/30"
          />
          <circle
            cx="18" cy="18" r="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeDasharray={`${(score / 100) * 88} 88`}
            strokeLinecap="round"
            className={colorMap[riskLevel] || colorMap.healthy}
          />
        </svg>
        <span className={cn("absolute inset-0 flex items-center justify-center text-sm font-bold", colorMap[riskLevel] || colorMap.healthy)}>
          {score}
        </span>
      </div>
      <div>
        <Badge
          variant="outline"
          className={cn(
            "capitalize text-xs",
            riskLevel === "critical" && "border-red-300 text-red-600 dark:border-red-700 dark:text-red-400",
            riskLevel === "warning" && "border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400",
            riskLevel === "healthy" && "border-green-300 text-green-600 dark:border-green-700 dark:text-green-400"
          )}
          data-testid="health-risk-badge"
        >
          {riskLevel}
        </Badge>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  icon,
  testId,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  testId?: string;
}) {
  return (
    <div className="flex items-center gap-2" data-testid={testId}>
      <div className="w-7 h-7 rounded-md bg-muted/50 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground truncate">{label}</p>
        <p className="text-sm font-semibold leading-none">{value}</p>
      </div>
    </div>
  );
}

export function TenantIntelligencePanel({ tenantId }: { tenantId: string }) {
  const [expanded, setExpanded] = useState(true);

  const { data, isLoading, error } = useQuery<TenantIntelligenceData>({
    queryKey: ["/api/v1/super/tenant-intelligence", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/super/tenant-intelligence/${tenantId}`, {
        credentials: "include",
        headers: buildHeaders(),
      });
      if (!res.ok) throw new Error("Failed to fetch tenant intelligence");
      return res.json();
    },
    staleTime: 2 * 60_000,
    enabled: !!tenantId,
  });

  if (error) {
    return (
      <div className="border-b px-4 sm:px-6 py-2 text-xs text-muted-foreground" data-testid="tenant-intelligence-error">
        Unable to load tenant intelligence data.
      </div>
    );
  }

  return (
    <div className="border-b" data-testid="tenant-intelligence-panel">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 sm:px-6 py-2.5 hover:bg-muted/30 transition-colors"
        data-testid="button-toggle-intelligence"
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <BarChart3 className="h-4 w-4 text-primary" />
          <span>Tenant Intelligence</span>
          {data && (
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-1.5 py-0 h-4 capitalize ml-1",
                data.health.riskLevel === "healthy" && "border-green-300 text-green-600 dark:border-green-700 dark:text-green-400",
                data.health.riskLevel === "warning" && "border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400",
                data.health.riskLevel === "critical" && "border-red-300 text-red-600 dark:border-red-700 dark:text-red-400"
              )}
              data-testid="badge-health-collapsed"
            >
              {data.health.riskLevel} ({data.health.overall})
            </Badge>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="px-4 sm:px-6 pb-4">
          {isLoading ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-44 w-full rounded-lg" />
              ))}
            </div>
          ) : data ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" data-testid="intelligence-cards">
              <Card data-testid="card-financial">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5" />
                    Financial Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xl font-bold" data-testid="text-revenue">
                      {formatCurrency(data.financial.estimatedRevenue)}
                    </span>
                    <span className={cn(
                      "text-xs font-medium",
                      data.financial.marginPercent >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                    )}>
                      {data.financial.marginPercent}% margin
                    </span>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Revenue</span>
                      <span className="font-medium">{formatCurrency(data.financial.estimatedRevenue)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Cost</span>
                      <span className="font-medium">{formatCurrency(data.financial.estimatedCost)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-1">
                      <span className="text-muted-foreground">Margin</span>
                      <span className={cn("font-medium", data.financial.estimatedMargin >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
                        {formatCurrency(data.financial.estimatedMargin)}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                      <span>Billable: {data.financial.billablePercent}%</span>
                      <span>{formatHours(data.financial.totalHoursTracked)} total</span>
                    </div>
                    <Progress value={data.financial.billablePercent} className="h-1.5" />
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-health">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Heart className="h-3.5 w-3.5" />
                    Health Score
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  <HealthIndicator score={data.health.overall} riskLevel={data.health.riskLevel} />
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Overdue Ratio</span>
                      <span className={cn("font-medium", data.health.overdueTaskRatio > 15 ? "text-red-500" : "")}>
                        {data.health.overdueTaskRatio}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Project Completion</span>
                      <span className="font-medium">{data.health.projectCompletionRate}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Active User Ratio</span>
                      <span className="font-medium">{data.health.activeUserRatio}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Avg Tasks/User</span>
                      <span className="font-medium">{data.health.avgTasksPerUser}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-activity">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5" />
                    Activity Metrics
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                    <MiniStat
                      label="Users"
                      value={`${data.activity.activeUsers}/${data.activity.totalUsers}`}
                      icon={<Users className="h-3.5 w-3.5 text-muted-foreground" />}
                      testId="stat-users"
                    />
                    <MiniStat
                      label="Projects"
                      value={`${data.activity.activeProjects}/${data.activity.totalProjects}`}
                      icon={<FolderKanban className="h-3.5 w-3.5 text-muted-foreground" />}
                      testId="stat-projects"
                    />
                    <MiniStat
                      label="Completed"
                      value={data.activity.completedTasks}
                      icon={<CheckSquare className="h-3.5 w-3.5 text-green-500" />}
                      testId="stat-completed"
                    />
                    <MiniStat
                      label="Overdue"
                      value={data.activity.overdueTasks}
                      icon={<AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
                      testId="stat-overdue"
                    />
                    <MiniStat
                      label="Clients"
                      value={data.activity.totalClients}
                      icon={<Briefcase className="h-3.5 w-3.5 text-muted-foreground" />}
                      testId="stat-clients"
                    />
                    <MiniStat
                      label="Time Entries"
                      value={data.activity.totalTimeEntries}
                      icon={<Clock className="h-3.5 w-3.5 text-muted-foreground" />}
                      testId="stat-time-entries"
                    />
                  </div>
                  <div className="mt-3 pt-2.5 border-t text-[10px] text-muted-foreground">
                    Last 7 days: {data.activity.recentTasksCreated7d} tasks created, {data.activity.recentTimeEntries7d} time entries
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-benchmark">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <BarChart3 className="h-3.5 w-3.5" />
                    Platform Comparison
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2.5">
                  {data.benchmark.tenantRank > 0 && (
                    <div className="text-center pb-2 border-b">
                      <span className="text-lg font-bold" data-testid="text-rank">
                        #{data.benchmark.tenantRank}
                      </span>
                      <span className="text-[10px] text-muted-foreground ml-1">
                        of {data.benchmark.totalTenants} tenants
                      </span>
                    </div>
                  )}
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Users</span>
                      <ComparisonBadge pct={data.benchmark.tenantUsersVsAvg} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Projects</span>
                      <ComparisonBadge pct={data.benchmark.tenantProjectsVsAvg} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Tasks</span>
                      <ComparisonBadge pct={data.benchmark.tenantTasksVsAvg} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Hours</span>
                      <ComparisonBadge pct={data.benchmark.tenantHoursVsAvg} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
