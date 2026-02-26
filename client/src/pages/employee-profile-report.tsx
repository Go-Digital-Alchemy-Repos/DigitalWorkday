import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { 
  ChevronLeft, 
  Users, 
  Clock, 
  CheckSquare, 
  AlertTriangle, 
  TrendingUp,
  Activity,
  Award,
  CalendarRange,
  ShieldAlert,
  Target,
  Sparkles,
  RefreshCw,
  Copy,
  ChevronDown,
  ChevronUp,
  Info,
  Loader2,
  ListChecks,
  Calendar,
  ExternalLink,
} from "lucide-react";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getStorageUrl } from "@/lib/storageUrl";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ProfileData {
  employee: {
    id: string;
    name: string;
    role: string;
    team: string | null;
    avatarUrl: string | null;
    status: "active" | "inactive";
  };
  summary: {
    performanceScore: number;
    performanceTier: string;
    riskLevel: string;
    utilization: number;
    capacityUsage: number;
    completionRate: number;
    overdueRate: number;
  };
  workload: {
    activeTasks: number;
    overdueTasks: number;
    dueSoon: number;
    backlog: number;
    avgCompletionDays: number | null;
  };
  timeTracking: {
    totalHours: number;
    billableHours: number;
    nonBillableHours: number;
    avgHoursPerDay: number;
    estimatedHours: number;
    variance: number;
  };
  capacity: {
    weeklyData: Array<{
      week: string;
      plannedHours: number;
      actualHours: number;
      utilization: number;
      overAllocated: boolean;
    }>;
  };
  riskIndicators: Array<{
    type: string;
    severity: "high" | "medium" | "low";
    description: string;
  }>;
  taskBreakdown: {
    byStatus: Array<{ label: string; value: number }>;
    byPriority: Array<{ label: string; value: number }>;
    byProject: Array<{ label: string; value: number }>;
  };
  trend: {
    weeklyCompletion: Array<{ week: string; count: number }>;
    weeklyTimeTracked: Array<{ week: string; hours: number }>;
  };
  assignedTasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    dueDate: string | null;
    projectId: string | null;
    projectName: string | null;
    estimateMinutes: number | null;
    createdAt: string;
    updatedAt: string;
  }>;
}

interface AiSummaryData {
  cached: boolean;
  headline: string;
  markdown: string;
  wins: string[];
  risks: string[];
  notableChanges: string[];
  recommendedActions: string[];
  confidence: "Low" | "Medium" | "High";
  supportingMetrics: Array<{ metric: string; value: string }>;
  model: string;
  summaryVersion: string;
  generatedAt: string;
  expiresAt: string;
}

function MetricCard({ title, value, subValue, icon: Icon, iconColor, description, testId }: { 
  title: string; 
  value: string | number; 
  subValue?: string;
  icon: any;
  iconColor?: string;
  description?: string;
  testId: string;
}) {
  const colorMap: Record<string, { bg: string; text: string }> = {
    blue: { bg: "bg-blue-500/10", text: "text-blue-500" },
    green: { bg: "bg-green-500/10", text: "text-green-500" },
    red: { bg: "bg-red-500/10", text: "text-red-500" },
    amber: { bg: "bg-amber-500/10", text: "text-amber-500" },
    purple: { bg: "bg-purple-500/10", text: "text-purple-500" },
    orange: { bg: "bg-orange-500/10", text: "text-orange-500" },
    cyan: { bg: "bg-cyan-500/10", text: "text-cyan-500" },
  };
  const colors = colorMap[iconColor || "blue"] || colorMap.blue;

  return (
    <Card data-testid={testId}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className={cn("h-8 w-8 rounded-full flex items-center justify-center shrink-0", colors.bg)}>
          <Icon className={cn("h-4 w-4", colors.text)} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subValue && (
          <p className="text-xs text-muted-foreground mt-1">
            {subValue}
          </p>
        )}
        {description && (
          <p className="text-xs text-muted-foreground mt-1">
            {description}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function AiSummaryCard({ employeeId, days }: { employeeId: string; days: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showMetrics, setShowMetrics] = useState(false);

  const queryKey = ["/api/v1/ai/employee", employeeId, "summary", days];

  const { data, isLoading, error } = useQuery<AiSummaryData>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/ai/employee/${employeeId}/summary?days=${days}`,
        { credentials: "include" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const err = Object.assign(new Error(body.error || `Request failed: ${res.status}`), { code: body.code });
        throw err;
      }
      return res.json();
    },
    enabled: !!employeeId,
    retry: false,
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/v1/ai/employee/${employeeId}/summary/refresh?days=${days}`
      );
      return res.json();
    },
    onSuccess: (newData) => {
      queryClient.setQueryData(queryKey, newData);
      toast({ title: "AI summary refreshed" });
    },
    onError: (err: any) => {
      toast({
        title: "Failed to refresh summary",
        description: err?.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const handleCopy = () => {
    if (!data?.markdown) return;
    navigator.clipboard.writeText(data.markdown).then(() => {
      toast({ title: "Summary copied to clipboard" });
    });
  };

  const confidenceColor = (c: string) => {
    if (c === "High") return "bg-green-500";
    if (c === "Low") return "bg-amber-500";
    return "bg-blue-500";
  };

  const generatedAt = data?.generatedAt
    ? new Date(data.generatedAt).toLocaleString()
    : null;

  if (isLoading) {
    return (
      <Card data-testid="section-ai-summary">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary animate-pulse" />
            AI Summary
          </CardTitle>
          <CardDescription>Generating performance insights...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    const err = error as any;
    const msg = err?.message || err?.error || "Failed to generate AI summary.";
    const code = err?.code || "";
    const isRateLimit = code === "RATE_LIMITED" || msg.toLowerCase().includes("limit");
    const isNotConfigured = code === "FEATURE_DISABLED" || code === "AI_DISABLED" || msg.toLowerCase().includes("not configured") || msg.toLowerCase().includes("not enabled");
    return (
      <Card data-testid="section-ai-summary">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-muted-foreground" />
            AI Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant={isRateLimit || isNotConfigured ? "default" : "destructive"}>
            <Info className="h-4 w-4" />
            <AlertTitle>{isNotConfigured ? "AI Not Configured" : isRateLimit ? "Rate Limit Reached" : "Summary Unavailable"}</AlertTitle>
            <AlertDescription className="text-sm">{msg}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <Card data-testid="section-ai-summary">
      <CardHeader>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Summary
              {data.cached && (
                <Badge variant="outline" className="text-[10px] px-1.5 h-4 font-normal">cached</Badge>
              )}
            </CardTitle>
            <CardDescription className="mt-1">
              Grounded in aggregated metrics only — no task or message content.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              disabled={!data.markdown}
              data-testid="button-ai-copy"
              className="h-8 gap-1.5"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
              data-testid="button-ai-refresh"
              className="h-8 gap-1.5"
            >
              {refreshMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <p className="font-medium text-sm leading-relaxed" data-testid="text-ai-headline">
              {data.headline}
            </p>
          </div>
          <Badge className={cn("text-white text-[10px] shrink-0 mt-0.5", confidenceColor(data.confidence))} data-testid="badge-ai-confidence">
            {data.confidence} confidence
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {data.wins.length > 0 && (
            <div className="space-y-2" data-testid="section-ai-wins">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-green-600 dark:text-green-400">Key Wins</h4>
              <ul className="space-y-1.5">
                {data.wins.map((win, i) => (
                  <li key={i} className="text-sm flex gap-2">
                    <span className="text-green-500 shrink-0 mt-0.5">✓</span>
                    <span>{win}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.risks.length > 0 && (
            <div className="space-y-2" data-testid="section-ai-risks">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-destructive">Risks</h4>
              <ul className="space-y-1.5">
                {data.risks.map((risk, i) => (
                  <li key={i} className="text-sm flex gap-2">
                    <span className="text-destructive shrink-0 mt-0.5">!</span>
                    <span>{risk}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {data.notableChanges.length > 0 && (
          <div className="space-y-2" data-testid="section-ai-changes">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notable Changes</h4>
            <ul className="space-y-1.5">
              {data.notableChanges.map((change, i) => (
                <li key={i} className="text-sm flex gap-2">
                  <span className="text-blue-500 shrink-0 mt-0.5">→</span>
                  <span>{change}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.recommendedActions.length > 0 && (
          <div className="space-y-2 border-t pt-4" data-testid="section-ai-actions">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-primary">Recommended Actions</h4>
            <ul className="space-y-1.5">
              {data.recommendedActions.map((action, i) => (
                <li key={i} className="text-sm flex gap-2">
                  <span className="font-bold text-primary shrink-0 mt-0.5">{i + 1}.</span>
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="border-t pt-3 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" data-testid="button-ai-basis">
                  <Info className="h-3 w-3" />
                  What is this based on?
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>AI Summary Data Sources</DialogTitle>
                  <DialogDescription>
                    This summary is generated from aggregated metrics only. No task titles, message contents, or client names are included.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Data sources used:</p>
                  <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                    <li>Employee Performance Index (EPI) score and tier</li>
                    <li>Task completion rate and overdue rate</li>
                    <li>Workload pressure metrics (active, overdue, backlog)</li>
                    <li>Time tracking totals and daily averages</li>
                    <li>Weekly capacity utilization percentages</li>
                    <li>Automated risk flags</li>
                  </ul>
                  {data.supportingMetrics.length > 0 && (
                    <>
                      <p className="text-sm font-medium pt-2">Supporting metrics used in this summary:</p>
                      <div className="space-y-1">
                        {data.supportingMetrics.map((m, i) => (
                          <div key={i} className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{m.metric}</span>
                            <span className="font-medium">{m.value}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  <p className="text-xs text-muted-foreground border-t pt-2">
                    Model: {data.model} · Version: {data.summaryVersion}
                  </p>
                </div>
              </DialogContent>
            </Dialog>

            <button
              onClick={() => setShowMetrics(!showMetrics)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-ai-toggle-metrics"
            >
              {showMetrics ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {showMetrics ? "Hide" : "Show"} supporting metrics
            </button>
          </div>

          {generatedAt && (
            <span className="text-xs text-muted-foreground">
              Updated {generatedAt}
            </span>
          )}
        </div>

        {showMetrics && data.supportingMetrics.length > 0 && (
          <div className="rounded-lg bg-muted/50 p-3 space-y-1.5" data-testid="section-ai-supporting-metrics">
            {data.supportingMetrics.map((m, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="text-muted-foreground">{m.metric}</span>
                <span className="font-medium">{m.value}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function EmployeeProfileReportPage() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const range = searchParams.get("range") || "30d";
  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;

  const { data, isLoading, error, refetch } = useQuery<ProfileData>({
    queryKey: ["/api/reports/v2/employee", employeeId, "profile", range],
    queryFn: async () => {
      const res = await fetch(
        `/api/reports/v2/employee/${employeeId}/profile?range=${range}`,
        { credentials: "include" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Request failed: ${res.status}`);
      }
      return res.json();
    },
    enabled: !!employeeId,
  });

  const handleRangeChange = (value: string) => {
    setLocation(`/reports/employees/${employeeId}?range=${value}`);
  };

  if (error) {
    return (
      <div className="container max-w-7xl p-3 sm:p-4 lg:p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load employee profile. Please try again.
            <Button variant="outline" size="sm" onClick={() => refetch()} className="ml-4" data-testid="button-retry-profile">
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const getPerformanceColor = (tier: string) => {
    switch (tier.toLowerCase()) {
      case "high": return "bg-green-500 hover:bg-green-600";
      case "stable": return "bg-blue-500 hover:bg-blue-600";
      case "needs attention": return "bg-amber-500 hover:bg-amber-600";
      case "critical": return "bg-red-500 hover:bg-red-600";
      default: return "bg-slate-500";
    }
  };

  const getRiskColor = (level: string) => {
    switch (level.toLowerCase()) {
      case "healthy": return "bg-green-500";
      case "at risk": return "bg-amber-500";
      case "critical": return "bg-red-500";
      default: return "bg-slate-500";
    }
  };

  const getSeverityVariant = (severity: string) => {
    switch (severity.toLowerCase()) {
      case "high": return "destructive";
      case "medium": return "default";
      case "low": return "secondary";
      default: return "outline";
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="border-b bg-background/95 backdrop-blur shrink-0">
        <div className="container max-w-7xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/reports">
              <Button variant="ghost" size="sm" className="gap-1" data-testid="button-back-to-reports">
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>
            </Link>
            <h1 className="text-xl font-bold hidden sm:block">Employee Intelligence Profile</h1>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Report Range:</span>
            <Select value={range} onValueChange={handleRangeChange}>
              <SelectTrigger className="w-[140px]" data-testid="select-range">
                <SelectValue placeholder="Select range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="container max-w-7xl space-y-6">
          {isLoading ? (
            <>
              <Skeleton className="h-[120px] w-full" />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-[100px] w-full" />
                ))}
              </div>
              <Skeleton className="h-[200px] w-full" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Skeleton className="h-[300px] w-full" />
                <Skeleton className="h-[300px] w-full" />
              </div>
            </>
          ) : data ? (
            <>
              {/* Header Card */}
              <Card data-testid="card-profile-header">
                <CardContent className="p-6">
                  <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center">
                    <Avatar className="h-20 w-20 border-2 border-muted" data-testid="avatar-employee">
                      <AvatarImage src={getStorageUrl(data.employee.avatarUrl) ?? ""} alt={data.employee.name} />
                      <AvatarFallback className="text-xl">
                        {data.employee.name.split(" ").map(n => n[0]).join("").toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h2 className="text-2xl font-bold" data-testid="text-employee-name">{data.employee.name}</h2>
                        <Badge variant={data.employee.status === "active" ? "default" : "secondary"}>
                          {data.employee.status}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        <span data-testid="text-employee-role">{data.employee.role}</span>
                        {data.employee.team && (
                          <>
                            <span className="text-muted-foreground/30">•</span>
                            <span data-testid="text-employee-team">{data.employee.team}</span>
                          </>
                        )}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      <div className="flex flex-col gap-1 items-start sm:items-end">
                        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Performance Index</span>
                        <Badge className={cn("text-sm py-1 px-3", getPerformanceColor(data.summary.performanceTier))} data-testid="badge-performance">
                          {data.summary.performanceTier} ({data.summary.performanceScore})
                        </Badge>
                      </div>
                      <div className="flex flex-col gap-1 items-start sm:items-end">
                        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Risk Status</span>
                        <Badge className={cn("text-sm py-1 px-3 text-white", getRiskColor(data.summary.riskLevel))} data-testid="badge-risk">
                          {data.summary.riskLevel}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Summary Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                <MetricCard 
                  title="Performance Index" 
                  value={data.summary.performanceScore} 
                  icon={Award}
                  iconColor="purple"
                  testId="metric-performance-index"
                />
                <MetricCard 
                  title="Completion Rate" 
                  value={`${data.summary.completionRate}%`} 
                  icon={CheckSquare}
                  iconColor="green"
                  testId="metric-completion-rate"
                />
                <MetricCard 
                  title="Overdue Rate" 
                  value={`${data.summary.overdueRate}%`} 
                  icon={AlertTriangle}
                  iconColor="red"
                  testId="metric-overdue-rate"
                />
                <MetricCard 
                  title="Utilization" 
                  value={`${data.summary.utilization}%`} 
                  icon={TrendingUp}
                  iconColor="blue"
                  testId="metric-utilization"
                />
                <MetricCard 
                  title="Capacity" 
                  value={`${data.summary.capacityUsage}%`} 
                  icon={Activity}
                  iconColor="amber"
                  testId="metric-capacity"
                />
                <MetricCard 
                  title="Total Hours" 
                  value={`${data.timeTracking.totalHours}h`} 
                  icon={Clock}
                  iconColor="cyan"
                  testId="metric-total-hours"
                />
              </div>

              {/* AI Summary Card */}
              {employeeId && (
                <AiSummaryCard employeeId={employeeId} days={days} />
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Workload Section */}
                <Card data-testid="section-workload">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <CheckSquare className="h-5 w-5 text-primary" />
                      Workload Distribution
                    </CardTitle>
                    <CardDescription>Current task volume and completion efficiency</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-4 gap-4">
                      <div className="text-center p-3 bg-muted/50 rounded-lg">
                        <p className="text-2xl font-bold" data-testid="text-active-tasks">{data.workload.activeTasks}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">Active</p>
                      </div>
                      <div className="text-center p-3 bg-muted/50 rounded-lg">
                        <p className="text-2xl font-bold text-destructive" data-testid="text-overdue-tasks">{data.workload.overdueTasks}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">Overdue</p>
                      </div>
                      <div className="text-center p-3 bg-muted/50 rounded-lg">
                        <p className="text-2xl font-bold text-amber-600" data-testid="text-due-soon">{data.workload.dueSoon}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">Due Soon</p>
                      </div>
                      <div className="text-center p-3 bg-muted/50 rounded-lg">
                        <p className="text-2xl font-bold" data-testid="text-backlog">{data.workload.backlog}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">Backlog</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-sm font-semibold">Breakdown by Status</h4>
                      <div className="space-y-2">
                        {data.taskBreakdown.byStatus.map((item) => (
                          <div key={item.label} className="flex items-center gap-2">
                            <span className="text-xs w-24 truncate capitalize">{item.label}</span>
                            <Progress 
                              value={(item.value / Math.max(data.workload.activeTasks + data.summary.overdueRate, 1)) * 100} 
                              className="h-2 flex-1" 
                            />
                            <span className="text-xs font-medium w-8 text-right">{item.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Time Tracking Section */}
                <Card data-testid="section-time">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Clock className="h-5 w-5 text-primary" />
                      Time Tracking Analysis
                    </CardTitle>
                    <CardDescription>Billable efficiency and estimation accuracy</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 border rounded-lg space-y-1">
                        <p className="text-xs text-muted-foreground">Billable Ratio</p>
                        <div className="flex items-end justify-between">
                          <p className="text-2xl font-bold" data-testid="text-billable-hours">{data.timeTracking.billableHours}h</p>
                          <p className="text-sm text-muted-foreground pb-1">/ {data.timeTracking.totalHours}h</p>
                        </div>
                        <Progress value={(data.timeTracking.billableHours / Math.max(data.timeTracking.totalHours, 1)) * 100} className="h-1.5" />
                      </div>
                      <div className="p-4 border rounded-lg space-y-1">
                        <p className="text-xs text-muted-foreground">Estimation Variance</p>
                        <p className={cn("text-2xl font-bold", data.timeTracking.variance > 0 ? "text-destructive" : "text-green-600")} data-testid="text-time-variance">
                          {data.timeTracking.variance > 0 ? "+" : ""}{data.timeTracking.variance}h
                        </p>
                        <p className="text-[10px] text-muted-foreground">vs {data.timeTracking.estimatedHours}h estimated</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Avg. Hours per Work Day</span>
                        <span className="font-medium" data-testid="text-avg-hours-day">{data.timeTracking.avgHoursPerDay}h</span>
                      </div>
                      <div className="flex justify-between items-center text-sm border-t pt-3">
                        <span className="text-muted-foreground">Non-Billable Internal Time</span>
                        <span className="font-medium" data-testid="text-non-billable-hours">{data.timeTracking.nonBillableHours}h</span>
                      </div>
                      <div className="flex justify-between items-center text-sm border-t pt-3">
                        <span className="text-muted-foreground">Estimated Remaining Work</span>
                        <span className="font-medium">{data.timeTracking.estimatedHours}h</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Assigned Tasks Section */}
              <Card data-testid="section-assigned-tasks">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ListChecks className="h-5 w-5 text-primary" />
                    Assigned Tasks
                  </CardTitle>
                  <CardDescription>All non-archived tasks currently assigned to this employee ({data.assignedTasks?.length ?? 0} tasks)</CardDescription>
                </CardHeader>
                <CardContent>
                  {data.assignedTasks && data.assignedTasks.length > 0 ? (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Task</TableHead>
                            <TableHead>Project</TableHead>
                            <TableHead className="text-center">Status</TableHead>
                            <TableHead className="text-center">Priority</TableHead>
                            <TableHead className="text-center">Due Date</TableHead>
                            <TableHead className="text-right">Estimate</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.assignedTasks.map((task) => {
                            const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && !["done", "cancelled"].includes(task.status);
                            return (
                              <TableRow key={task.id} data-testid={`row-task-${task.id}`}>
                                <TableCell className="font-medium max-w-[300px]">
                                  <Link
                                    href={task.projectId ? `/projects/${task.projectId}` : "#"}
                                    className="hover:underline text-primary truncate block"
                                    data-testid={`link-task-${task.id}`}
                                  >
                                    {task.title}
                                  </Link>
                                </TableCell>
                                <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                                  {task.projectName || "—"}
                                </TableCell>
                                <TableCell className="text-center">
                                  <Badge
                                    variant={task.status === "done" ? "default" : task.status === "cancelled" ? "secondary" : "outline"}
                                    className={cn(
                                      "text-[10px] capitalize",
                                      task.status === "done" && "bg-green-600 hover:bg-green-700 text-white",
                                      task.status === "in_progress" && "border-blue-500 text-blue-600",
                                      task.status === "in_review" && "border-purple-500 text-purple-600"
                                    )}
                                    data-testid={`badge-status-${task.id}`}
                                  >
                                    {task.status.replace(/_/g, " ")}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-center">
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "text-[10px] capitalize",
                                      task.priority === "urgent" && "border-red-500 text-red-600",
                                      task.priority === "high" && "border-orange-500 text-orange-600",
                                      task.priority === "medium" && "border-amber-500 text-amber-600",
                                      task.priority === "low" && "border-gray-400 text-gray-500"
                                    )}
                                    data-testid={`badge-priority-${task.id}`}
                                  >
                                    {task.priority}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-center">
                                  {task.dueDate ? (
                                    <span className={cn("text-sm", isOverdue && "text-destructive font-medium")} data-testid={`text-due-${task.id}`}>
                                      {new Date(task.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                                      {isOverdue && " ⚠"}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground text-sm">—</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right text-sm text-muted-foreground">
                                  {task.estimateMinutes != null ? `${Math.round(task.estimateMinutes / 60 * 10) / 10}h` : "—"}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-10 text-center space-y-2">
                      <ListChecks className="h-10 w-10 text-muted-foreground opacity-20" />
                      <p className="text-sm font-medium">No assigned tasks</p>
                      <p className="text-xs text-muted-foreground">This employee has no active tasks assigned.</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Capacity Section */}
              <Card data-testid="section-capacity">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CalendarRange className="h-5 w-5 text-primary" />
                    Weekly Capacity & Utilization
                  </CardTitle>
                  <CardDescription>Historical trend of planned vs actual work hours (40h baseline)</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Week Starting</TableHead>
                          <TableHead className="text-center">Planned Hours</TableHead>
                          <TableHead className="text-center">Actual Tracked</TableHead>
                          <TableHead className="text-center">Utilization</TableHead>
                          <TableHead className="text-right">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.capacity.weeklyData.map((week) => (
                          <TableRow key={week.week}>
                            <TableCell className="font-medium">{week.week}</TableCell>
                            <TableCell className="text-center">{week.plannedHours}h</TableCell>
                            <TableCell className="text-center">{week.actualHours}h</TableCell>
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-2">
                                <span className={cn(
                                  "inline-block w-2.5 h-2.5 rounded-full",
                                  week.utilization > 100 ? "bg-red-500" : 
                                  week.utilization > 80 ? "bg-amber-500" : "bg-green-500"
                                )} />
                                {week.utilization}%
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              {week.overAllocated ? (
                                <Badge variant="destructive">Over-Allocated</Badge>
                              ) : (
                                <Badge variant="outline">Optimal</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                        {data.capacity.weeklyData.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                              No capacity data for the selected range.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Risk Section */}
                <Card data-testid="section-risk">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <ShieldAlert className="h-5 w-5 text-primary" />
                      Active Risk Indicators
                    </CardTitle>
                    <CardDescription>Automated flags identifying potential burnout or slippage</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {data.riskIndicators.length > 0 ? (
                      <div className="space-y-4">
                        {data.riskIndicators.map((risk, i) => (
                          <div key={i} className="flex gap-3 p-3 border rounded-lg bg-muted/30">
                            <AlertTriangle className={cn(
                              "h-5 w-5 shrink-0",
                              risk.severity === "high" ? "text-destructive" : "text-amber-500"
                            )} />
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-sm">{risk.type}</span>
                                <Badge variant={getSeverityVariant(risk.severity)} className="text-[10px] px-1.5 h-4">
                                  {risk.severity.toUpperCase()}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">{risk.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-10 text-center space-y-2">
                        <Activity className="h-10 w-10 text-green-500 opacity-20" />
                        <p className="text-sm font-medium">No active risk flags</p>
                        <p className="text-xs text-muted-foreground">Employee is performing within healthy thresholds.</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Project Focus Section */}
                <Card data-testid="section-trend">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-primary" />
                      Project Focus
                    </CardTitle>
                    <CardDescription>Top 10 projects by task volume</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {data.taskBreakdown.byProject.length > 0 ? (
                      <div className="space-y-4">
                        {data.taskBreakdown.byProject.map((item) => (
                          <div key={item.label} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="font-medium truncate pr-4">{item.label}</span>
                              <span className="text-muted-foreground">{item.value} tasks</span>
                            </div>
                            <Progress 
                              value={(item.value / Math.max(data.taskBreakdown.byProject[0]?.value, 1)) * 100} 
                              className="h-1.5" 
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-10 text-center">
                        <Target className="h-10 w-10 text-muted-foreground opacity-20" />
                        <p className="text-sm text-muted-foreground mt-2">No project data available</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <div className="container max-w-7xl p-3 sm:p-4 lg:p-6 text-center">
              <p>Employee profile not found.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
