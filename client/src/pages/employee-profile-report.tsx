import { useParams, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
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
  Target
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getStorageUrl } from "@/lib/storageUrl";
import { cn } from "@/lib/utils";

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
}

function MetricCard({ title, value, subValue, icon: Icon, description, testId }: { 
  title: string; 
  value: string | number; 
  subValue?: string;
  icon: any;
  description?: string;
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

export default function EmployeeProfileReportPage() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const range = searchParams.get("range") || "30d";

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
      <div className="container max-w-7xl p-6">
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
      case "medium": return "default"; // Amber would be better but shadcn default works
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
                  testId="metric-performance-index"
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
                  title="Utilization" 
                  value={`${data.summary.utilization}%`} 
                  icon={TrendingUp}
                  testId="metric-utilization"
                />
                <MetricCard 
                  title="Capacity" 
                  value={`${data.summary.capacityUsage}%`} 
                  icon={Activity}
                  testId="metric-capacity"
                />
                <MetricCard 
                  title="Total Hours" 
                  value={`${data.timeTracking.totalHours}h`} 
                  icon={Clock}
                  testId="metric-total-hours"
                />
              </div>

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

                {/* Trend Section */}
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
            <div className="container max-w-7xl p-6 text-center">
              <p>Employee profile not found.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
