import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Shield,
  FileText,
  Send,
  Flame,
  Database,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { buildHeaders, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface BudgetBurn {
  totalBudgetMinutes: number;
  totalUsedMinutes: number;
  burnPercent: number;
  projectsOverBudget: number;
  totalProjectsWithBudget: number;
}

interface FinancialSummary {
  totalHoursTracked: number;
  billableHours: number;
  nonBillableHours: number;
  billablePercent: number;
  estimatedRevenue: number;
  estimatedCost: number;
  estimatedMargin: number;
  marginPercent: number;
  budgetBurn: BudgetBurn;
}

interface DataIntegrity {
  isClean: boolean;
  issueCount: number;
  criticalCount: number;
  warningCount: number;
}

interface HealthFactor {
  name: string;
  score: number;
  weight: number;
}

interface HealthScore {
  overall: number;
  overdueTaskRatio: number;
  projectCompletionRate: number;
  activeUserRatio: number;
  avgTasksPerUser: number;
  riskLevel: "stable" | "at_risk" | "critical";
  dataIntegrity: DataIntegrity;
  factors: HealthFactor[];
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
  avgCompletionRate: number;
  avgOverdueRatio: number;
  tenantUsersVsAvg: number;
  tenantProjectsVsAvg: number;
  tenantTasksVsAvg: number;
  tenantHoursVsAvg: number;
}

interface NoteItem {
  id: string;
  body: string;
  category: string;
  authorName: string;
  createdAt: string;
}

interface AuditEventItem {
  id: string;
  eventType: string;
  message: string;
  actorName: string | null;
  createdAt: string;
}

interface RiskAckItem {
  id: string;
  projectId: string;
  projectName: string;
  riskLevel: string;
  acknowledgedByName: string | null;
  acknowledgedAt: string;
  mitigationNote: string | null;
}

interface TenancyWarning {
  checkName: string;
  severity: string;
  count: number;
}

interface AdminActions {
  recentNotes: NoteItem[];
  recentAuditEvents: AuditEventItem[];
  riskAcknowledgments: RiskAckItem[];
  tenancyWarnings: TenancyWarning[];
}

interface TenantIntelligenceData {
  tenantId: string;
  tenantName: string;
  tenantStatus: string;
  financial: FinancialSummary;
  health: HealthScore;
  activity: ActivityMetrics;
  benchmark: PlatformBenchmark;
  adminActions: AdminActions;
}

function formatCurrency(amount: number): string {
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}k`;
  return `$${amount.toFixed(0)}`;
}

function formatHours(hours: number): string {
  return `${hours.toFixed(1)}h`;
}

function formatMinutesToHours(mins: number): string {
  return `${(mins / 60).toFixed(1)}h`;
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
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

function riskLabel(level: string): string {
  if (level === "at_risk") return "At Risk";
  if (level === "critical") return "Critical";
  return "Stable";
}

function HealthIndicator({ score, riskLevel }: { score: number; riskLevel: string }) {
  const colorMap: Record<string, string> = {
    stable: "text-green-600 dark:text-green-400",
    at_risk: "text-amber-600 dark:text-amber-400",
    critical: "text-red-600 dark:text-red-400",
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
            "text-xs",
            riskLevel === "critical" && "border-red-300 text-red-600 dark:border-red-700 dark:text-red-400",
            riskLevel === "at_risk" && "border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400",
            riskLevel === "stable" && "border-green-300 text-green-600 dark:border-green-700 dark:text-green-400"
          )}
          data-testid="health-risk-badge"
        >
          {riskLabel(riskLevel)}
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

function InlineNoteForm({ tenantId, onCreated }: { tenantId: string; onCreated: () => void }) {
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("general");
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/v1/super/tenants/${tenantId}/notes`, { body, category });
    },
    onSuccess: () => {
      setBody("");
      setCategory("general");
      toast({ title: "Note added" });
      onCreated();
    },
    onError: () => {
      toast({ title: "Failed to add note", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-2 pt-2 border-t" data-testid="inline-note-form">
      <Textarea
        placeholder="Add a note..."
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="text-xs min-h-[60px] resize-none"
        data-testid="input-note-body"
      />
      <div className="flex items-center gap-2">
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-7 text-xs w-28" data-testid="select-note-category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="general">General</SelectItem>
            <SelectItem value="onboarding">Onboarding</SelectItem>
            <SelectItem value="support">Support</SelectItem>
            <SelectItem value="billing">Billing</SelectItem>
            <SelectItem value="technical">Technical</SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="sm"
          className="h-7 text-xs ml-auto"
          disabled={!body.trim() || mutation.isPending}
          onClick={() => mutation.mutate()}
          data-testid="button-submit-note"
        >
          <Send className="h-3 w-3 mr-1" />
          Add Note
        </Button>
      </div>
    </div>
  );
}

interface TenantOption {
  id: string;
  name: string;
}

export function TenantIntelligencePanel({ tenantId, allTenants = [] }: { tenantId: string; allTenants?: TenantOption[] }) {
  const [expanded, setExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "admin">("overview");
  const [compareTenantId, setCompareTenantId] = useState<string>("");
  const [noteFilter, setNoteFilter] = useState<string>("all");
  const queryClient = useQueryClient();

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

  const { data: compareData } = useQuery<TenantIntelligenceData>({
    queryKey: ["/api/v1/super/tenant-intelligence", compareTenantId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/super/tenant-intelligence/${compareTenantId}`, {
        credentials: "include",
        headers: buildHeaders(),
      });
      if (!res.ok) throw new Error("Failed to fetch comparison tenant");
      return res.json();
    },
    staleTime: 2 * 60_000,
    enabled: !!compareTenantId && compareTenantId !== tenantId && compareTenantId !== "none",
  });

  const handleNoteCreated = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenant-intelligence", tenantId] });
  };

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
          <span>Super Admin Intelligence</span>
          {data && (
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-1.5 py-0 h-4 ml-1",
                data.health.riskLevel === "stable" && "border-green-300 text-green-600 dark:border-green-700 dark:text-green-400",
                data.health.riskLevel === "at_risk" && "border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400",
                data.health.riskLevel === "critical" && "border-red-300 text-red-600 dark:border-red-700 dark:text-red-400"
              )}
              data-testid="badge-health-collapsed"
            >
              {riskLabel(data.health.riskLevel)} ({data.health.overall})
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
            <>
              <div className="flex gap-1 mb-3">
                <button
                  onClick={() => setActiveTab("overview")}
                  className={cn(
                    "text-xs px-3 py-1 rounded-md transition-colors",
                    activeTab === "overview"
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted text-muted-foreground"
                  )}
                  data-testid="tab-overview"
                >
                  Overview
                </button>
                <button
                  onClick={() => setActiveTab("admin")}
                  className={cn(
                    "text-xs px-3 py-1 rounded-md transition-colors",
                    activeTab === "admin"
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted text-muted-foreground"
                  )}
                  data-testid="tab-admin-actions"
                >
                  Admin Actions
                </button>
              </div>

              {activeTab === "overview" && (
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
                          <span className="text-muted-foreground">Revenue (approved)</span>
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
                      {data.financial.budgetBurn.totalProjectsWithBudget > 0 && (
                        <div className="border-t pt-2 space-y-1" data-testid="budget-burn-section">
                          <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                            <Flame className="h-3 w-3" />
                            Budget Burn
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Used / Budget</span>
                            <span className="font-medium">
                              {formatMinutesToHours(data.financial.budgetBurn.totalUsedMinutes)} / {formatMinutesToHours(data.financial.budgetBurn.totalBudgetMinutes)}
                            </span>
                          </div>
                          <Progress
                            value={Math.min(data.financial.budgetBurn.burnPercent, 100)}
                            className={cn("h-1.5", data.financial.budgetBurn.burnPercent > 100 && "[&>div]:bg-red-500")}
                          />
                          <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span>{data.financial.budgetBurn.burnPercent}% consumed</span>
                            {data.financial.budgetBurn.projectsOverBudget > 0 && (
                              <span className="text-red-500 font-medium">
                                {data.financial.budgetBurn.projectsOverBudget} over budget
                              </span>
                            )}
                          </div>
                        </div>
                      )}
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
                        {data.health.factors.map((f) => (
                          <div key={f.name} className="flex items-center gap-2">
                            <span className="text-muted-foreground text-[10px] flex-1 truncate">{f.name}</span>
                            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  f.score >= 70 ? "bg-green-500" : f.score >= 40 ? "bg-amber-500" : "bg-red-500"
                                )}
                                style={{ width: `${f.score}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-medium w-6 text-right">{f.score}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] pt-1 border-t" data-testid="data-integrity-badge">
                        <Database className="h-3 w-3" />
                        <span className="text-muted-foreground">Data Integrity:</span>
                        {data.health.dataIntegrity.isClean ? (
                          <Badge variant="outline" className="text-[9px] h-4 px-1 border-green-300 text-green-600 dark:border-green-700 dark:text-green-400">
                            Clean
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px] h-4 px-1 border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400">
                            {data.health.dataIntegrity.issueCount} issue{data.health.dataIntegrity.issueCount !== 1 ? "s" : ""}
                          </Badge>
                        )}
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
                      {allTenants.length > 1 && (
                        <div className="pb-2 border-b" data-testid="compare-tenant-selector">
                          <Select value={compareTenantId} onValueChange={setCompareTenantId}>
                            <SelectTrigger className="h-7 text-[10px]">
                              <SelectValue placeholder="Compare with..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No comparison</SelectItem>
                              {allTenants
                                .filter((t) => t.id !== tenantId)
                                .map((t) => (
                                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <div className="space-y-1.5 text-xs">
                        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 items-center text-[10px] text-muted-foreground font-medium pb-1 border-b">
                          <span>KPI</span>
                          <span className="text-right w-12">Tenant</span>
                          <span className="text-right w-12">Avg</span>
                          {compareData && <span className="text-right w-12">vs</span>}
                        </div>
                        {[
                          {
                            label: "Completion %",
                            tenant: data.activity.totalTasks > 0
                              ? Math.round((data.activity.completedTasks / data.activity.totalTasks) * 100)
                              : 0,
                            avg: `${data.benchmark.avgCompletionRate}%`,
                            compare: compareData && compareData.activity.totalTasks > 0
                              ? Math.round((compareData.activity.completedTasks / compareData.activity.totalTasks) * 100)
                              : null,
                          },
                          {
                            label: "Overdue %",
                            tenant: data.health.overdueTaskRatio,
                            avg: `${data.benchmark.avgOverdueRatio}%`,
                            compare: compareData ? compareData.health.overdueTaskRatio : null,
                          },
                          {
                            label: "Active Users",
                            tenant: data.activity.activeUsers,
                            avg: Math.round(data.benchmark.avgUsersPerTenant),
                            compare: compareData ? compareData.activity.activeUsers : null,
                          },
                          {
                            label: "Projects",
                            tenant: data.activity.totalProjects,
                            avg: Math.round(data.benchmark.avgProjectsPerTenant),
                            compare: compareData ? compareData.activity.totalProjects : null,
                          },
                          {
                            label: "Hours Logged",
                            tenant: data.financial.totalHoursTracked,
                            avg: data.benchmark.avgHoursPerTenant,
                            compare: compareData ? compareData.financial.totalHoursTracked : null,
                          },
                          {
                            label: "Health Score",
                            tenant: data.health.overall,
                            avg: "—",
                            compare: compareData ? compareData.health.overall : null,
                          },
                        ].map((row) => (
                          <div key={row.label} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 items-center text-xs">
                            <span className="text-muted-foreground text-[10px] truncate">{row.label}</span>
                            <span className="text-right w-12 font-medium">{row.tenant}{row.label.includes("%") ? "%" : ""}</span>
                            <span className="text-right w-12 text-muted-foreground">{row.avg}</span>
                            {compareData && (
                              <span className="text-right w-12 text-muted-foreground">
                                {row.compare !== null ? `${row.compare}${row.label.includes("%") ? "%" : ""}` : "—"}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="pt-2 border-t space-y-1.5">
                        {[
                          { label: "Users", pct: data.benchmark.tenantUsersVsAvg },
                          { label: "Tasks", pct: data.benchmark.tenantTasksVsAvg },
                          { label: "Hours", pct: data.benchmark.tenantHoursVsAvg },
                        ].map((item) => (
                          <div key={item.label} className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">{item.label}</span>
                            <ComparisonBadge pct={item.pct} />
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {activeTab === "admin" && (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="admin-actions-cards">
                  <Card data-testid="card-notes">
                    <CardHeader className="pb-2 pt-4 px-4">
                      <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5" />
                        Tenant Notes
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      <div className="flex gap-1 mb-2 flex-wrap" data-testid="note-category-filter">
                        {["all", "general", "onboarding", "support", "billing", "technical"].map((cat) => (
                          <button
                            key={cat}
                            onClick={() => setNoteFilter(cat)}
                            className={cn(
                              "text-[10px] px-2 py-0.5 rounded-full border transition-colors capitalize",
                              noteFilter === cat
                                ? "bg-primary text-primary-foreground border-primary"
                                : "border-border text-muted-foreground hover:bg-muted"
                            )}
                            data-testid={`filter-note-${cat}`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                      {(() => {
                        const filteredNotes = noteFilter === "all"
                          ? data.adminActions.recentNotes
                          : data.adminActions.recentNotes.filter((n) => n.category === noteFilter);
                        return filteredNotes.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-2">
                            {noteFilter === "all" ? "No notes yet." : `No ${noteFilter} notes.`}
                          </p>
                        ) : (
                          <div className="space-y-2 max-h-48 overflow-y-auto" data-testid="notes-list">
                            {filteredNotes.map((n) => (
                              <div key={n.id} className="text-xs border-b pb-2 last:border-0 last:pb-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <Badge variant="outline" className="text-[9px] h-4 px-1 capitalize">
                                    {n.category}
                                  </Badge>
                                  <span className="text-[10px] text-muted-foreground">{timeAgo(n.createdAt)}</span>
                                </div>
                                <p className="text-xs line-clamp-2">{n.body}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">by {n.authorName}</p>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                      <InlineNoteForm tenantId={tenantId} onCreated={handleNoteCreated} />
                    </CardContent>
                  </Card>

                  <Card data-testid="card-audit-events">
                    <CardHeader className="pb-2 pt-4 px-4">
                      <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                        <Shield className="h-3.5 w-3.5" />
                        Audit Events
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      {data.adminActions.recentAuditEvents.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2">No audit events.</p>
                      ) : (
                        <div className="space-y-2 max-h-56 overflow-y-auto" data-testid="audit-events-list">
                          {data.adminActions.recentAuditEvents.map((a) => (
                            <div key={a.id} className="text-xs border-b pb-2 last:border-0 last:pb-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <Badge variant="outline" className="text-[9px] h-4 px-1">
                                  {a.eventType.replace(/_/g, " ")}
                                </Badge>
                                <span className="text-[10px] text-muted-foreground">{timeAgo(a.createdAt)}</span>
                              </div>
                              <p className="text-xs line-clamp-2">{a.message}</p>
                              {a.actorName && (
                                <p className="text-[10px] text-muted-foreground mt-0.5">by {a.actorName}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card data-testid="card-risk-warnings">
                    <CardHeader className="pb-2 pt-4 px-4">
                      <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Risk & Warnings
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-3">
                      {data.adminActions.tenancyWarnings.length > 0 && (
                        <div data-testid="tenancy-warnings">
                          <p className="text-[10px] font-medium text-muted-foreground mb-1">Tenancy Warnings</p>
                          <div className="space-y-1">
                            {data.adminActions.tenancyWarnings.map((w, i) => (
                              <div key={i} className="flex items-center justify-between text-xs">
                                <span className="truncate">{w.checkName.replace(/_/g, " ")}</span>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-[9px] h-4 px-1 capitalize ml-1",
                                    w.severity === "critical" && "border-red-300 text-red-600",
                                    w.severity === "warning" && "border-amber-300 text-amber-600"
                                  )}
                                >
                                  {w.severity} ({w.count})
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {data.adminActions.riskAcknowledgments.length > 0 ? (
                        <div data-testid="risk-acks-list">
                          <p className="text-[10px] font-medium text-muted-foreground mb-1">Risk Acknowledgments</p>
                          <div className="space-y-2 max-h-36 overflow-y-auto">
                            {data.adminActions.riskAcknowledgments.map((r) => (
                              <div key={r.id} className="text-xs border-b pb-2 last:border-0 last:pb-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className="font-medium truncate">{r.projectName}</span>
                                  <Badge variant="outline" className={cn(
                                    "text-[9px] h-4 px-1 capitalize ml-auto shrink-0",
                                    r.riskLevel === "high" && "border-red-300 text-red-600",
                                    r.riskLevel === "medium" && "border-amber-300 text-amber-600"
                                  )}>
                                    {r.riskLevel}
                                  </Badge>
                                </div>
                                {r.mitigationNote && (
                                  <p className="text-[10px] text-muted-foreground line-clamp-1">{r.mitigationNote}</p>
                                )}
                                <p className="text-[10px] text-muted-foreground">
                                  {r.acknowledgedByName ? `by ${r.acknowledgedByName}` : "System"} - {timeAgo(r.acknowledgedAt)}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No risk acknowledgments.</p>
                      )}
                      {data.adminActions.tenancyWarnings.length === 0 && data.adminActions.riskAcknowledgments.length === 0 && (
                        <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
                          <CheckSquare className="h-3.5 w-3.5" />
                          All clear - no warnings or risks
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
