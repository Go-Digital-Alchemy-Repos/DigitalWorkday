import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, Building2, ShieldAlert, Activity, CheckSquare, Clock, TrendingUp, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReportCommandCenterLayout, buildDateParams } from "./report-command-center-layout";

interface MetricCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  color: string;
}

function MetricCard({ label, value, sub, icon, color }: MetricCardProps) {
  return (
    <Card>
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

function relativeDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "1 day ago";
  return `${diff} days ago`;
}

interface ClientOverviewItem {
  clientId: string;
  companyName: string;
  activeProjects: number;
  openTasks: number;
  overdueTasks: number;
  totalHours: number;
  billableHours: number;
  lastActivityDate: string | null;
  engagementScore: number;
  completedInRange: number;
}

function OverviewTab({ rangeDays }: { rangeDays: number }) {
  const { data, isLoading } = useQuery<{ clients: ClientOverviewItem[]; pagination: { total: number; limit: number; offset: number }; range: { startDate: string; endDate: string } }>({
    queryKey: ["/api/reports/v2/client/overview", rangeDays],
    queryFn: async () => {
      const res = await fetch(`/api/reports/v2/client/overview?${buildDateParams(rangeDays, { limit: "100" })}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  const totals = useMemo(() => {
    if (!data?.clients) return null;
    const clients = data.clients;
    return {
      totalClients: clients.length,
      totalOpenTasks: clients.reduce((s, c) => s + c.openTasks, 0),
      totalHours: Math.round(clients.reduce((s, c) => s + c.totalHours, 0) * 10) / 10,
      avgEngagement: clients.length > 0 ? Math.round(clients.reduce((s, c) => s + c.engagementScore, 0) / clients.length) : 0,
    };
  }, [data?.clients]);

  if (isLoading) return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
    </div>
  );

  function engagementBadgeVariant(score: number): "default" | "secondary" | "destructive" {
    if (score >= 70) return "default";
    if (score >= 40) return "secondary";
    return "destructive";
  }

  return (
    <div className="space-y-4">
      {totals && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard label="Total Clients" value={totals.totalClients} icon={<Users className="h-4 w-4 text-white" />} color="bg-blue-500" />
          <MetricCard label="Open Tasks" value={totals.totalOpenTasks} icon={<CheckSquare className="h-4 w-4 text-white" />} color="bg-violet-500" />
          <MetricCard label="Hours Tracked" value={`${totals.totalHours}h`} icon={<Clock className="h-4 w-4 text-white" />} color="bg-green-500" />
          <MetricCard label="Avg Engagement" value={`${totals.avgEngagement}%`} icon={<TrendingUp className="h-4 w-4 text-white" />} color="bg-orange-500" />
        </div>
      )}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Active Projects</TableHead>
                <TableHead>Open Tasks</TableHead>
                <TableHead>Overdue</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead>Last Activity</TableHead>
                <TableHead>Engagement</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.clients.map((c) => (
                <TableRow key={c.clientId} data-testid={`row-client-${c.clientId}`}>
                  <TableCell className="font-medium text-sm">{c.companyName}</TableCell>
                  <TableCell className="text-sm">{c.activeProjects}</TableCell>
                  <TableCell className="text-sm">{c.openTasks}</TableCell>
                  <TableCell>
                    <span className={cn("text-sm font-medium", c.overdueTasks > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                      {c.overdueTasks}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{c.totalHours}h</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{relativeDate(c.lastActivityDate)}</TableCell>
                  <TableCell>
                    <Badge variant={engagementBadgeVariant(c.engagementScore)} data-testid={`engagement-${c.clientId}`}>
                      {c.engagementScore}%
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {data?.clients.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">No clients found</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

interface ClientActivityItem {
  clientId: string;
  companyName: string;
  tasksCreatedInRange: number;
  timeLoggedInRange: number;
  commentsInRange: number;
  inactivityDays: number;
}

function ActivityTab({ rangeDays }: { rangeDays: number }) {
  const { data, isLoading } = useQuery<{ clients: ClientActivityItem[]; pagination: { total: number; limit: number; offset: number }; range: { startDate: string; endDate: string } }>({
    queryKey: ["/api/reports/v2/client/activity", rangeDays],
    queryFn: async () => {
      const res = await fetch(`/api/reports/v2/client/activity?${buildDateParams(rangeDays, { limit: "100" })}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  if (isLoading) return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
    </div>
  );

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Tasks Created</TableHead>
              <TableHead>Hours Logged</TableHead>
              <TableHead>Comments</TableHead>
              <TableHead>Inactivity Days</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.clients.map((c) => (
              <TableRow key={c.clientId} data-testid={`row-activity-${c.clientId}`}>
                <TableCell className="font-medium text-sm">{c.companyName}</TableCell>
                <TableCell className="text-sm">{c.tasksCreatedInRange}</TableCell>
                <TableCell className="text-sm">{Math.round(c.timeLoggedInRange * 10) / 10}h</TableCell>
                <TableCell className="text-sm">{c.commentsInRange}</TableCell>
                <TableCell>
                  <span className={cn("text-sm font-medium", c.inactivityDays > 14 ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                    {c.inactivityDays}d
                  </span>
                </TableCell>
              </TableRow>
            ))}
            {data?.clients.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No activity data</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

interface ClientTimeItem {
  clientId: string;
  companyName: string;
  totalHours: number;
  billableHours: number;
  nonBillableHours: number;
  estimatedHours: number;
  varianceHours: number;
}

function TimeTab({ rangeDays }: { rangeDays: number }) {
  const { data, isLoading } = useQuery<{ clients: ClientTimeItem[]; pagination: { total: number; limit: number; offset: number }; range: { startDate: string; endDate: string } }>({
    queryKey: ["/api/reports/v2/client/time", rangeDays],
    queryFn: async () => {
      const res = await fetch(`/api/reports/v2/client/time?${buildDateParams(rangeDays, { limit: "100" })}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  if (isLoading) return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
    </div>
  );

  function formatVariance(v: number) {
    if (v === 0) return "0h";
    return v > 0 ? `+${v.toFixed(1)}h` : `${v.toFixed(1)}h`;
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Total Hrs</TableHead>
              <TableHead>Billable</TableHead>
              <TableHead>Non-Bill</TableHead>
              <TableHead>Estimated</TableHead>
              <TableHead>Variance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.clients.map((c) => (
              <TableRow key={c.clientId} data-testid={`row-time-${c.clientId}`}>
                <TableCell className="font-medium text-sm">{c.companyName}</TableCell>
                <TableCell className="text-sm">{c.totalHours}h</TableCell>
                <TableCell className="text-sm">{c.billableHours}h</TableCell>
                <TableCell className="text-sm">{c.nonBillableHours}h</TableCell>
                <TableCell className="text-sm">{c.estimatedHours}h</TableCell>
                <TableCell>
                  <span className={cn("text-sm font-medium", c.varianceHours > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400")}>
                    {formatVariance(c.varianceHours)}
                  </span>
                </TableCell>
              </TableRow>
            ))}
            {data?.clients.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No time data</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

interface ClientTaskItem {
  clientId: string;
  companyName: string;
  openTaskCount: number;
  overdueCount: number;
  completedInRange: number;
  agingUnder7: number;
  aging7To14: number;
  aging14To30: number;
  agingOver30: number;
}

function TasksTab({ rangeDays }: { rangeDays: number }) {
  const { data, isLoading } = useQuery<{ clients: ClientTaskItem[]; pagination: { total: number; limit: number; offset: number }; range: { startDate: string; endDate: string } }>({
    queryKey: ["/api/reports/v2/client/tasks", rangeDays],
    queryFn: async () => {
      const res = await fetch(`/api/reports/v2/client/tasks?${buildDateParams(rangeDays, { limit: "100" })}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  if (isLoading) return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
    </div>
  );

  function AgingBar({ item }: { item: ClientTaskItem }) {
    const total = item.agingUnder7 + item.aging7To14 + item.aging14To30 + item.agingOver30;
    if (total === 0) return <span className="text-xs text-muted-foreground">—</span>;
    const pct = (n: number) => Math.round((n / total) * 100);
    return (
      <div className="flex h-3 rounded-sm overflow-hidden w-[120px]" title={`<7d: ${item.agingUnder7}, 7-14d: ${item.aging7To14}, 14-30d: ${item.aging14To30}, >30d: ${item.agingOver30}`}>
        {item.agingUnder7 > 0 && <div className="bg-green-500" style={{ width: `${pct(item.agingUnder7)}%` }} />}
        {item.aging7To14 > 0 && <div className="bg-yellow-500" style={{ width: `${pct(item.aging7To14)}%` }} />}
        {item.aging14To30 > 0 && <div className="bg-orange-500" style={{ width: `${pct(item.aging14To30)}%` }} />}
        {item.agingOver30 > 0 && <div className="bg-red-500" style={{ width: `${pct(item.agingOver30)}%` }} />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-green-500" /> &lt;7d</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-yellow-500" /> 7–14d</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-orange-500" /> 14–30d</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-red-500" /> &gt;30d</span>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Open</TableHead>
                <TableHead>Overdue</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Aging</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.clients.map((c) => (
                <TableRow key={c.clientId} data-testid={`row-tasks-${c.clientId}`}>
                  <TableCell className="font-medium text-sm">{c.companyName}</TableCell>
                  <TableCell className="text-sm">{c.openTaskCount}</TableCell>
                  <TableCell>
                    <span className={cn("text-sm font-medium", c.overdueCount > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                      {c.overdueCount}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-green-600 dark:text-green-400 font-medium">{c.completedInRange}</TableCell>
                  <TableCell><AgingBar item={c} /></TableCell>
                </TableRow>
              ))}
              {data?.clients.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No task data</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

interface ClientSlaItem {
  clientId: string;
  companyName: string;
  totalTasks: number;
  overdueCount: number;
  completedOnTime: number;
  totalDoneWithDue: number;
  overdueTaskPct: number;
  completedWithinDuePct: number;
}

function SlaTab({ rangeDays }: { rangeDays: number }) {
  const { data, isLoading } = useQuery<{ clients: ClientSlaItem[]; pagination: { total: number; limit: number; offset: number }; range: { startDate: string; endDate: string } }>({
    queryKey: ["/api/reports/v2/client/sla", rangeDays],
    queryFn: async () => {
      const res = await fetch(`/api/reports/v2/client/sla?${buildDateParams(rangeDays, { limit: "100" })}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  if (isLoading) return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
    </div>
  );

  function progressColor(pct: number, invert = false) {
    const high = invert ? pct < 20 : pct > 80;
    const mid = invert ? pct < 40 : pct > 60;
    if (high) return "text-green-600 dark:text-green-400";
    if (mid) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Total Tasks</TableHead>
              <TableHead className="min-w-[160px]">Overdue %</TableHead>
              <TableHead className="min-w-[160px]">Completed On-Time %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.clients.map((c) => (
              <TableRow key={c.clientId} data-testid={`row-sla-${c.clientId}`}>
                <TableCell className="font-medium text-sm">{c.companyName}</TableCell>
                <TableCell className="text-sm">{c.totalTasks}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 min-w-[140px]">
                    <Progress value={c.overdueTaskPct} className="h-1.5 flex-1" />
                    <span className={cn("text-xs font-medium w-10 text-right", progressColor(c.overdueTaskPct, true))}>
                      {Math.round(c.overdueTaskPct)}%
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 min-w-[140px]">
                    <Progress value={c.completedWithinDuePct} className="h-1.5 flex-1" />
                    <span className={cn("text-xs font-medium w-10 text-right", progressColor(c.completedWithinDuePct))}>
                      {Math.round(c.completedWithinDuePct)}%
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {data?.clients.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">No SLA data</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

interface ClientRiskItem {
  clientId: string;
  companyName: string;
  score: number;
  reasons: string[];
  metrics: {
    totalTasks: number;
    overdueCount: number;
    totalHours: number;
    inactivityDays: number;
    estimatedHours: number;
  };
}

function RiskTab({ rangeDays }: { rangeDays: number }) {
  const { data, isLoading } = useQuery<{ flagged: ClientRiskItem[]; totalChecked: number; range: { startDate: string; endDate: string } }>({
    queryKey: ["/api/reports/v2/client/risk", rangeDays],
    queryFn: async () => {
      const res = await fetch(`/api/reports/v2/client/risk?${buildDateParams(rangeDays)}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  if (isLoading) return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
    </div>
  );

  function scoreColor(score: number) {
    if (score >= 5) return "bg-red-100 dark:bg-red-900/30 border-red-200 dark:border-red-800";
    if (score >= 3) return "bg-orange-100 dark:bg-orange-900/30 border-orange-200 dark:border-orange-800";
    return "bg-yellow-100 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800";
  }

  function scoreLabel(score: number): { label: string; variant: "destructive" | "default" | "secondary" } {
    if (score >= 5) return { label: "Critical", variant: "destructive" };
    if (score >= 3) return { label: "At Risk", variant: "default" };
    return { label: "Watch", variant: "secondary" };
  }

  return (
    <div className="space-y-4">
      {data && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Activity className="h-4 w-4" />
          <span>Checked {data.totalChecked} clients — {data.flagged.length} flagged for attention</span>
        </div>
      )}

      {data?.flagged.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <ShieldAlert className="h-10 w-10 opacity-30" />
          <p className="text-sm font-medium">No risk flags detected</p>
          <p className="text-xs">All clients are within normal engagement ranges</p>
        </div>
      )}

      {data?.flagged.map((c) => {
        const { label, variant } = scoreLabel(c.score);
        return (
          <Card key={c.clientId} className={cn("border", scoreColor(c.score))} data-testid={`risk-card-${c.clientId}`}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-semibold text-sm">{c.companyName}</span>
                    <Badge variant={variant}>{label}</Badge>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3 flex-wrap">
                    <span>{c.metrics.totalTasks} total tasks</span>
                    <span className="text-red-600 dark:text-red-400">{c.metrics.overdueCount} overdue</span>
                    <span>{c.metrics.totalHours}h tracked</span>
                    <span>{c.metrics.inactivityDays}d inactive</span>
                  </div>
                  <div className="space-y-1">
                    {c.reasons.map((reason, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <AlertTriangle className="h-3.5 w-3.5 text-orange-500 shrink-0 mt-0.5" />
                        <span>{reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export function ClientCommandCenter() {
  const [rangeDays, setRangeDays] = useState(30);
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <ReportCommandCenterLayout
      title="Client Command Center"
      description="Client engagement, time, task load, SLA and risk analysis per client"
      icon={<Building2 className="h-4 w-4" />}
      rangeDays={rangeDays}
      onRangeChange={setRangeDays}
    >
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-9 flex-wrap">
          <TabsTrigger value="overview" className="text-xs gap-1.5" data-testid="tab-client-overview">
            <Users className="h-3.5 w-3.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="activity" className="text-xs gap-1.5" data-testid="tab-client-activity">
            <Activity className="h-3.5 w-3.5" />
            Activity
          </TabsTrigger>
          <TabsTrigger value="time" className="text-xs gap-1.5" data-testid="tab-client-time">
            <Clock className="h-3.5 w-3.5" />
            Time
          </TabsTrigger>
          <TabsTrigger value="tasks" className="text-xs gap-1.5" data-testid="tab-client-tasks">
            <CheckSquare className="h-3.5 w-3.5" />
            Tasks
          </TabsTrigger>
          <TabsTrigger value="sla" className="text-xs gap-1.5" data-testid="tab-client-sla">
            <TrendingUp className="h-3.5 w-3.5" />
            SLA
          </TabsTrigger>
          <TabsTrigger value="risk" className="text-xs gap-1.5" data-testid="tab-client-risk">
            <ShieldAlert className="h-3.5 w-3.5" />
            Risk
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab rangeDays={rangeDays} />
        </TabsContent>
        <TabsContent value="activity" className="mt-4">
          <ActivityTab rangeDays={rangeDays} />
        </TabsContent>
        <TabsContent value="time" className="mt-4">
          <TimeTab rangeDays={rangeDays} />
        </TabsContent>
        <TabsContent value="tasks" className="mt-4">
          <TasksTab rangeDays={rangeDays} />
        </TabsContent>
        <TabsContent value="sla" className="mt-4">
          <SlaTab rangeDays={rangeDays} />
        </TabsContent>
        <TabsContent value="risk" className="mt-4">
          <RiskTab rangeDays={rangeDays} />
        </TabsContent>
      </Tabs>
    </ReportCommandCenterLayout>
  );
}
