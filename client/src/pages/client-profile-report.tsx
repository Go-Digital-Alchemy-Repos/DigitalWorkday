import { useParams, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  ChevronLeft,
  Building2,
  Clock,
  CheckSquare,
  AlertTriangle,
  TrendingUp,
  Activity,
  HeartPulse,
  ShieldAlert,
  Target,
  Mail,
  Phone,
  Globe,
  Briefcase,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

interface ClientProfileData {
  client: {
    id: string;
    companyName: string;
    contactName: string | null;
    contactEmail: string | null;
    phone: string | null;
    status: string;
    industry: string | null;
    website: string | null;
    createdAt: string;
  };
  summary: {
    healthScore: number;
    healthTier: string;
    riskLevel: string;
    completionRate: number;
    overdueRate: number;
    slaComplianceRate: number;
    engagementScore: number;
    totalHours: number;
  };
  overview: {
    activeProjects: number;
    openTasks: number;
    overdueTasks: number;
    completedInRange: number;
    totalHours: number;
    lastActivityDate: string | null;
    inactivityDays: number | null;
  };
  activity: {
    tasksCreatedInRange: number;
    commentsInRange: number;
    timeLoggedInRange: number;
  };
  timeTracking: {
    totalHours: number;
    billableHours: number;
    nonBillableHours: number;
    estimatedHours: number;
    variance: number;
  };
  sla: {
    totalTasks: number;
    overdueCount: number;
    overdueTaskPct: number;
    completedOnTime: number;
    totalDoneWithDue: number;
    slaComplianceRate: number;
  };
  taskAging: {
    agingUnder7: number;
    aging7to14: number;
    aging14to30: number;
    agingOver30: number;
  };
  healthIndex: {
    overallScore: number;
    healthTier: string;
    componentScores: {
      overdue: number;
      engagement: number;
      timeOverrun: number;
      slaCompliance: number;
      activity: number;
    };
  } | null;
  riskIndicators: Array<{
    type: string;
    severity: "high" | "medium" | "low";
    description: string;
  }>;
  taskBreakdown: {
    byStatus: Array<{ label: string; value: number }>;
    byPriority: Array<{ label: string; value: number }>;
  };
  topProjects: Array<{
    projectId: string;
    projectName: string;
    projectStatus: string;
    taskCount: number;
    hours: number;
  }>;
}

function MetricCard({ title, value, subValue, icon: Icon, testId }: {
  title: string;
  value: string | number;
  subValue?: string;
  icon: any;
  testId: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subValue && (
          <p className="text-xs text-muted-foreground mt-1">{subValue}</p>
        )}
      </CardContent>
    </Card>
  );
}

function ChiComponentBar({ label, value }: { label: string; value: number }) {
  const colorClass = value >= 80 ? "bg-green-500" : value >= 60 ? "bg-blue-500" : value >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground capitalize">{label}</span>
        <span className="font-medium">{value}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", colorClass)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function AgingBar({ aging }: { aging: ClientProfileData["taskAging"] }) {
  const total = aging.agingUnder7 + aging.aging7to14 + aging.aging14to30 + aging.agingOver30;
  if (total === 0) return <span className="text-xs text-muted-foreground">No open tasks</span>;
  const pct = (n: number) => Math.round((n / total) * 100);
  return (
    <div className="space-y-2">
      <div className="flex h-4 rounded-md overflow-hidden w-full" title={`<7d: ${aging.agingUnder7}, 7-14d: ${aging.aging7to14}, 14-30d: ${aging.aging14to30}, >30d: ${aging.agingOver30}`}>
        {aging.agingUnder7 > 0 && <div className="bg-green-500 flex items-center justify-center text-[9px] text-white font-medium" style={{ width: `${pct(aging.agingUnder7)}%` }}>{aging.agingUnder7}</div>}
        {aging.aging7to14 > 0 && <div className="bg-yellow-500 flex items-center justify-center text-[9px] text-white font-medium" style={{ width: `${pct(aging.aging7to14)}%` }}>{aging.aging7to14}</div>}
        {aging.aging14to30 > 0 && <div className="bg-orange-500 flex items-center justify-center text-[9px] text-white font-medium" style={{ width: `${pct(aging.aging14to30)}%` }}>{aging.aging14to30}</div>}
        {aging.agingOver30 > 0 && <div className="bg-red-500 flex items-center justify-center text-[9px] text-white font-medium" style={{ width: `${pct(aging.agingOver30)}%` }}>{aging.agingOver30}</div>}
      </div>
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-green-500" /> &lt;7d</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-yellow-500" /> 7-14d</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-orange-500" /> 14-30d</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-500" /> &gt;30d</span>
      </div>
    </div>
  );
}

export default function ClientProfileReportPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const range = searchParams.get("range") || "30d";

  const { data, isLoading, error, refetch } = useQuery<ClientProfileData>({
    queryKey: ["/api/reports/v2/client", clientId, "profile", range],
    queryFn: async () => {
      const res = await fetch(
        `/api/reports/v2/client/${clientId}/profile?range=${range}`,
        { credentials: "include" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Request failed: ${res.status}`);
      }
      return res.json();
    },
    enabled: !!clientId,
  });

  const handleRangeChange = (value: string) => {
    setLocation(`/reports/clients/${clientId}?range=${value}`);
  };

  if (error) {
    return (
      <div className="container max-w-7xl p-3 sm:p-4 lg:p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load client profile. Please try again.
            <Button variant="outline" size="sm" onClick={() => refetch()} className="ml-4" data-testid="button-retry-profile">
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const getHealthColor = (tier: string) => {
    switch (tier.toLowerCase()) {
      case "healthy": return "bg-green-500 hover:bg-green-600";
      case "monitor": return "bg-blue-500 hover:bg-blue-600";
      case "at risk": return "bg-amber-500 hover:bg-amber-600";
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
      case "high": return "destructive" as const;
      case "medium": return "default" as const;
      case "low": return "secondary" as const;
      default: return "outline" as const;
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
            <h1 className="text-xl font-bold hidden sm:block">Client Intelligence Profile</h1>
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
              <Card data-testid="card-profile-header">
                <CardContent className="p-6">
                  <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center">
                    <Avatar className="h-20 w-20 border-2 border-muted" data-testid="avatar-client">
                      <AvatarFallback className="text-xl bg-primary/10 text-primary">
                        {data.client.companyName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 space-y-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h2 className="text-2xl font-bold" data-testid="text-client-name">{data.client.companyName}</h2>
                        <Badge variant={data.client.status === "active" ? "default" : "secondary"}>
                          {data.client.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                        {data.client.industry && (
                          <span className="flex items-center gap-1" data-testid="text-client-industry">
                            <Briefcase className="h-3.5 w-3.5" />
                            {data.client.industry}
                          </span>
                        )}
                        {data.client.contactName && (
                          <span data-testid="text-client-contact">{data.client.contactName}</span>
                        )}
                        {data.client.contactEmail && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3.5 w-3.5" />
                            {data.client.contactEmail}
                          </span>
                        )}
                        {data.client.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3.5 w-3.5" />
                            {data.client.phone}
                          </span>
                        )}
                        {data.client.website && (
                          <span className="flex items-center gap-1">
                            <Globe className="h-3.5 w-3.5" />
                            {data.client.website}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      <div className="flex flex-col gap-1 items-start sm:items-end">
                        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Health Index</span>
                        <Badge className={cn("text-sm py-1 px-3 text-white", getHealthColor(data.summary.healthTier))} data-testid="badge-health">
                          {data.summary.healthTier} ({data.summary.healthScore})
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

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                <MetricCard
                  title="Health Score"
                  value={data.summary.healthScore}
                  subValue="out of 100"
                  icon={HeartPulse}
                  testId="metric-health-score"
                />
                <MetricCard
                  title="Completion Rate"
                  value={`${data.summary.completionRate}%`}
                  icon={CheckSquare}
                  testId="metric-completion-rate"
                />
                <MetricCard
                  title="Overdue Rate"
                  value={`${data.summary.overdueRate}%`}
                  icon={AlertTriangle}
                  testId="metric-overdue-rate"
                />
                <MetricCard
                  title="SLA Compliance"
                  value={`${data.summary.slaComplianceRate}%`}
                  icon={Target}
                  testId="metric-sla-compliance"
                />
                <MetricCard
                  title="Engagement"
                  value={`${data.summary.engagementScore}%`}
                  icon={TrendingUp}
                  testId="metric-engagement"
                />
                <MetricCard
                  title="Total Hours"
                  value={`${data.summary.totalHours}h`}
                  icon={Clock}
                  testId="metric-total-hours"
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card data-testid="section-workload">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <CheckSquare className="h-5 w-5 text-primary" />
                      Workload Overview
                    </CardTitle>
                    <CardDescription>Current task volume and completion efficiency</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-4 gap-4">
                      <div className="text-center p-3 bg-muted/50 rounded-lg">
                        <p className="text-2xl font-bold" data-testid="text-active-projects">{data.overview.activeProjects}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">Projects</p>
                      </div>
                      <div className="text-center p-3 bg-muted/50 rounded-lg">
                        <p className="text-2xl font-bold" data-testid="text-open-tasks">{data.overview.openTasks}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">Open</p>
                      </div>
                      <div className="text-center p-3 bg-muted/50 rounded-lg">
                        <p className="text-2xl font-bold text-destructive" data-testid="text-overdue-tasks">{data.overview.overdueTasks}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">Overdue</p>
                      </div>
                      <div className="text-center p-3 bg-muted/50 rounded-lg">
                        <p className="text-2xl font-bold text-green-600" data-testid="text-completed">{data.overview.completedInRange}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">Completed</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-sm font-semibold">Task Aging Distribution</h4>
                      <AgingBar aging={data.taskAging} />
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-sm font-semibold">Breakdown by Status</h4>
                      <div className="space-y-2">
                        {data.taskBreakdown.byStatus.map((item) => (
                          <div key={item.label} className="flex items-center gap-2">
                            <span className="text-xs w-24 truncate capitalize">{item.label}</span>
                            <Progress
                              value={(item.value / Math.max(data.overview.openTasks + data.overview.completedInRange, 1)) * 100}
                              className="h-2 flex-1"
                            />
                            <span className="text-xs font-medium w-8 text-right">{item.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card data-testid="section-time">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Clock className="h-5 w-5 text-primary" />
                      Time Tracking Analysis
                    </CardTitle>
                    <CardDescription>Hours logged and estimation accuracy</CardDescription>
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
                        <span className="text-muted-foreground">Non-Billable Time</span>
                        <span className="font-medium" data-testid="text-non-billable-hours">{data.timeTracking.nonBillableHours}h</span>
                      </div>
                      <div className="flex justify-between items-center text-sm border-t pt-3">
                        <span className="text-muted-foreground">Tasks Created (in range)</span>
                        <span className="font-medium">{data.activity.tasksCreatedInRange}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm border-t pt-3">
                        <span className="text-muted-foreground">Comments (in range)</span>
                        <span className="font-medium">{data.activity.commentsInRange}</span>
                      </div>
                      {data.overview.inactivityDays !== null && (
                        <div className="flex justify-between items-center text-sm border-t pt-3">
                          <span className="text-muted-foreground">Days Since Last Activity</span>
                          <span className={cn("font-medium", data.overview.inactivityDays > 14 ? "text-destructive" : "")}>
                            {data.overview.inactivityDays}d
                          </span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card data-testid="section-sla">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Target className="h-5 w-5 text-primary" />
                      SLA Compliance
                    </CardTitle>
                    <CardDescription>On-time delivery and overdue metrics</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 border rounded-lg space-y-2">
                        <p className="text-xs text-muted-foreground">On-Time Completion</p>
                        <p className={cn("text-3xl font-bold", data.sla.slaComplianceRate >= 80 ? "text-green-600" : data.sla.slaComplianceRate >= 60 ? "text-amber-600" : "text-destructive")} data-testid="text-sla-rate">
                          {data.sla.slaComplianceRate}%
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {data.sla.completedOnTime} of {data.sla.totalDoneWithDue} tasks with due date
                        </p>
                      </div>
                      <div className="p-4 border rounded-lg space-y-2">
                        <p className="text-xs text-muted-foreground">Overdue Task Rate</p>
                        <p className={cn("text-3xl font-bold", data.sla.overdueTaskPct > 30 ? "text-destructive" : data.sla.overdueTaskPct > 15 ? "text-amber-600" : "text-green-600")} data-testid="text-overdue-pct">
                          {data.sla.overdueTaskPct}%
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {data.sla.overdueCount} overdue of {data.sla.totalTasks} total
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">On-Time Delivery</span>
                        <span className="font-medium">{data.sla.slaComplianceRate}%</span>
                      </div>
                      <Progress value={data.sla.slaComplianceRate} className="h-2" />
                    </div>
                  </CardContent>
                </Card>

                {data.healthIndex && (
                  <Card data-testid="section-health-index">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <HeartPulse className="h-5 w-5 text-primary" />
                        Health Index Breakdown
                      </CardTitle>
                      <CardDescription>Component scores driving the overall CHI score</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <p className={cn(
                            "text-4xl font-bold",
                            data.healthIndex.overallScore >= 85 ? "text-green-600" :
                            data.healthIndex.overallScore >= 70 ? "text-blue-600" :
                            data.healthIndex.overallScore >= 50 ? "text-amber-600" : "text-red-600"
                          )} data-testid="text-chi-score">
                            {data.healthIndex.overallScore}
                          </p>
                          <Badge className={cn("mt-1 text-white", getHealthColor(data.healthIndex.healthTier))}>
                            {data.healthIndex.healthTier}
                          </Badge>
                        </div>
                        <div className="flex-1 space-y-3">
                          <ChiComponentBar label="Overdue (25%)" value={data.healthIndex.componentScores.overdue} />
                          <ChiComponentBar label="Engagement (20%)" value={data.healthIndex.componentScores.engagement} />
                          <ChiComponentBar label="Time Overrun (20%)" value={data.healthIndex.componentScores.timeOverrun} />
                          <ChiComponentBar label="SLA Compliance (20%)" value={data.healthIndex.componentScores.slaCompliance} />
                          <ChiComponentBar label="Activity (15%)" value={data.healthIndex.componentScores.activity} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card data-testid="section-risk">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <ShieldAlert className="h-5 w-5 text-primary" />
                      Active Risk Indicators
                    </CardTitle>
                    <CardDescription>Automated flags identifying potential issues</CardDescription>
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
                        <p className="text-xs text-muted-foreground">Client is within healthy engagement thresholds.</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card data-testid="section-projects">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-primary" />
                      Top Projects
                    </CardTitle>
                    <CardDescription>Top 10 projects by task volume</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {data.topProjects.length > 0 ? (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Project</TableHead>
                              <TableHead className="text-center">Status</TableHead>
                              <TableHead className="text-center">Tasks</TableHead>
                              <TableHead className="text-right">Hours</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {data.topProjects.map((p) => (
                              <TableRow key={p.projectId}>
                                <TableCell className="font-medium text-sm max-w-[200px] truncate">{p.projectName}</TableCell>
                                <TableCell className="text-center">
                                  <Badge variant={p.projectStatus === "active" ? "default" : "secondary"} className="text-[10px]">
                                    {p.projectStatus}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-center text-sm">{p.taskCount}</TableCell>
                                <TableCell className="text-right text-sm">{p.hours}h</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-10 text-center">
                        <Building2 className="h-10 w-10 text-muted-foreground opacity-20" />
                        <p className="text-sm text-muted-foreground mt-2">No project data available</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {data.taskBreakdown.byPriority.length > 0 && (
                <Card data-testid="section-priority">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-primary" />
                      Task Priority Distribution
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {data.taskBreakdown.byPriority.map((item) => (
                        <div key={item.label} className="flex items-center gap-2">
                          <span className="text-xs w-24 truncate capitalize">{item.label || "none"}</span>
                          <Progress
                            value={(item.value / Math.max(data.taskBreakdown.byPriority[0]?.value, 1)) * 100}
                            className="h-2 flex-1"
                          />
                          <span className="text-xs font-medium w-8 text-right">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <div className="container max-w-7xl p-3 sm:p-4 lg:p-6 text-center">
              <p>Client profile not found.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
