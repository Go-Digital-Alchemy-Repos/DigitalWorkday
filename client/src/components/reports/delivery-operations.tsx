import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, Ban, CheckCircle2, Clock3, FolderKanban, ListTodo, Search, TimerReset, UsersRound } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { ReportCommandCenterLayout, buildDateParams, type ReportRangeValue } from "./report-command-center-layout";
import { ReportExplorer } from "./report-explorer";
import { ExplorableMetric } from "./explorable-metric";
import { ReportDataNote, relativeDate } from "./report-shared";
import { fetchReport as fetch } from "./report-fetch";
import { useReportRangeState } from "./use-report-range-state";

interface ProjectRollup {
  projectId: string; projectName: string; status: string; clientName: string | null;
  openTasks: number; overdueTasks: number; dueSoonTasks: number; unassignedTasks: number;
  completionPercent: number; rangeHours: number; lifetimeHours: number; estimatedTotalHours: number;
  budgetHours: number; budgetVarianceHours: number | null; lastActivityAt: string | null;
  inactivityDays: number | null; riskReasons: string[];
}

interface DeliveryData {
  metadata: { definitions: Record<string, string> };
  snapshot: { activeProjects: number; projectsAtRisk: number; overdueTasks: number; dueSoonTasks: number; unassignedTasks: number; rangeHours: number; ytdHours: number };
  flow: { created: number; completed: number; reopened: number; blockedNow: number; buckets: Array<{ date: string; created: number; completed: number; reopened: number; hours: number }> };
  comparison: { rangeHoursDelta: number; createdDelta: number; completedDelta: number; reopenedDelta: number };
  coverage: { estimatePct: number; budgetPct: number };
  attentionQueue: Array<{ type: string; severity: string; message: string; project: ProjectRollup }>;
  projects: ProjectRollup[];
}

type ExplorerSelection = { resource: "projects" | "tasks" | "time-entries"; metric: string; title: string; description: string };

export default function DeliveryOperations() {
  const [range, setRange] = useReportRangeState(30);
  const [search, setSearch] = useState("");
  const [riskOnly, setRiskOnly] = useState(false);
  const projectId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("projectId") : null;
  const [explorer, setExplorer] = useState<ExplorerSelection | null>(() => initialExplorer());
  const rangeQuery = buildDateParams(range);
  const { data, isLoading, isError } = useQuery<DeliveryData>({
    queryKey: ["/api/reports/v3/delivery", range],
    queryFn: async () => {
      const response = await fetch(`/api/reports/v3/delivery?${rangeQuery}`);
      if (!response.ok) throw new Error("Failed to load delivery operations");
      return response.json();
    },
  });

  const projects = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.projects ?? []).filter((project) => {
      if (projectId && project.projectId !== projectId) return false;
      if (riskOnly && project.riskReasons.length === 0) return false;
      return !query || project.projectName.toLowerCase().includes(query) || project.clientName?.toLowerCase().includes(query);
    });
  }, [data?.projects, projectId, riskOnly, search]);

  if (isLoading) return <DeliverySkeleton />;
  if (isError || !data) return <ReportError label="delivery operations" />;

  const openExplorer = (selection: ExplorerSelection) => setExplorer(selection);

  return (
    <ReportCommandCenterLayout title="Delivery Operations" description="Project health, task flow, time investment, and delivery exceptions" icon={<FolderKanban className="h-5 w-5" />} rangeDays={range} onRangeChange={setRange} extraControls={projectId ? <Button asChild variant="outline" size="sm"><Link href="/reports?view=delivery">Clear project filter</Link></Button> : undefined}>
      <div className="space-y-4" data-testid="delivery-operations">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
          <ExplorableMetric label="Active projects" value={data.snapshot.activeProjects} icon={<FolderKanban className="h-4 w-4" />} onClick={() => openExplorer({ resource: "projects", metric: "all", title: "Active projects", description: "Current project portfolio" })} />
          <ExplorableMetric label="At risk" value={data.snapshot.projectsAtRisk} tone="warning" icon={<AlertTriangle className="h-4 w-4" />} onClick={() => openExplorer({ resource: "projects", metric: "at_risk", title: "Projects at risk", description: "Projects with overdue, stale, budget, or progress exceptions" })} />
          <ExplorableMetric label="Overdue tasks" value={data.snapshot.overdueTasks} tone="danger" definition={data.metadata.definitions.overdueTasks} icon={<ListTodo className="h-4 w-4" />} onClick={() => openExplorer({ resource: "tasks", metric: "overdue", title: "Overdue tasks", description: "Open tasks past their due date" })} />
          <ExplorableMetric label="Blocked" value={data.flow.blockedNow} tone="danger" icon={<Ban className="h-4 w-4" />} onClick={() => openExplorer({ resource: "tasks", metric: "blocked", title: "Blocked tasks", description: "Tasks currently blocked" })} />
          <ExplorableMetric label="Unassigned" value={data.snapshot.unassignedTasks} tone="warning" icon={<UsersRound className="h-4 w-4" />} onClick={() => openExplorer({ resource: "tasks", metric: "unassigned", title: "Unassigned work", description: "Open tasks without an assignee" })} />
          <ExplorableMetric label="Hours this range" value={`${data.snapshot.rangeHours.toFixed(1)}h`} detail={`${signed(data.comparison.rangeHoursDelta)}h vs prior · ${data.snapshot.ytdHours.toFixed(1)}h YTD`} icon={<Clock3 className="h-4 w-4" />} onClick={() => openExplorer({ resource: "time-entries", metric: "all", title: "Tracked time", description: "Time entries inside the selected range" })} />
        </div>

        <ReportDataNote title="Data confidence" items={[`${data.coverage.estimatePct}% of open tasks estimated`, `${data.coverage.budgetPct}% of active projects budgeted`, "Current-state and in-range metrics are calculated separately"]} />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Delivery flow</CardTitle></CardHeader>
            <CardContent>
              <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span><strong className="text-foreground">{data.flow.created}</strong> created ({signed(data.comparison.createdDelta)})</span>
                <span><strong className="text-foreground">{data.flow.completed}</strong> completed ({signed(data.comparison.completedDelta)})</span>
                <span><strong className="text-foreground">{data.flow.reopened}</strong> reopened ({signed(data.comparison.reopenedDelta)})</span>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.flow.buckets}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11 }} minTickGap={28} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip labelFormatter={(value) => new Date(value).toLocaleDateString()} />
                    <Area type="monotone" dataKey="created" name="Created" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.08} strokeWidth={2} />
                    <Area type="monotone" dataKey="completed" name="Completed" stroke="hsl(var(--chart-2))" fill="hsl(var(--chart-2))" fillOpacity={0.08} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Needs attention</CardTitle></CardHeader>
            <CardContent className="space-y-1 p-3 pt-0">
              {data.attentionQueue.slice(0, 8).map((item, index) => (
                <Link key={`${item.type}-${item.project.projectId}-${index}`} href={`/projects/${item.project.projectId}`} className="flex items-start gap-3 border-b px-2 py-2.5 last:border-0 hover:bg-muted/50">
                  <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${item.severity === "high" ? "text-destructive" : "text-amber-600"}`} />
                  <span className="min-w-0"><span className="block truncate text-sm font-medium">{item.project.projectName}</span><span className="block text-xs text-muted-foreground">{item.message}</span></span>
                </Link>
              ))}
              {data.attentionQueue.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No delivery exceptions right now.</p> : null}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
            <div><CardTitle className="text-base">Project portfolio</CardTitle><p className="mt-1 text-xs text-muted-foreground">Explore delivery, investment, and risk in one table</p></div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search projects or clients" className="pl-8 sm:w-64" /></div>
              <Button type="button" variant={riskOnly ? "default" : "outline"} onClick={() => setRiskOnly((value) => !value)}><AlertTriangle className="mr-2 h-4 w-4" />At risk</Button>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Project</TableHead><TableHead>Health</TableHead><TableHead>Progress</TableHead><TableHead className="text-right">Hours</TableHead><TableHead className="text-right">Estimate</TableHead><TableHead className="text-right">Budget variance</TableHead><TableHead className="text-right">Open</TableHead><TableHead className="text-right">Overdue</TableHead><TableHead>Activity</TableHead></TableRow></TableHeader>
              <TableBody>{projects.map((project) => <TableRow key={project.projectId}>
                <TableCell><Link href={`/projects/${project.projectId}`} className="font-medium hover:underline">{project.projectName}</Link><span className="block text-xs text-muted-foreground">{project.clientName ?? "No client"}</span></TableCell>
                <TableCell>{project.riskReasons.length ? <Badge variant="destructive">Needs attention</Badge> : <Badge variant="secondary"><CheckCircle2 className="mr-1 h-3 w-3" />On track</Badge>}</TableCell>
                <TableCell className="min-w-32"><div className="mb-1 flex justify-between text-xs"><span>{project.completionPercent}%</span></div><Progress value={project.completionPercent} className="h-1.5" /></TableCell>
                <TableCell className="text-right">{project.lifetimeHours.toFixed(1)}h<span className="block text-xs text-muted-foreground">{project.rangeHours.toFixed(1)}h range</span></TableCell>
                <TableCell className="text-right">{project.estimatedTotalHours ? `${project.estimatedTotalHours.toFixed(1)}h` : "—"}</TableCell>
                <TableCell className="text-right">{project.budgetVarianceHours == null ? "—" : <span className={project.budgetVarianceHours > 0 ? "text-destructive" : "text-emerald-700"}>{project.budgetVarianceHours > 0 ? "+" : ""}{project.budgetVarianceHours.toFixed(1)}h</span>}</TableCell>
                <TableCell className="text-right">{project.openTasks}</TableCell><TableCell className="text-right">{project.overdueTasks}</TableCell><TableCell>{relativeDate(project.lastActivityAt)}</TableCell>
              </TableRow>)}</TableBody>
            </Table>
            {projects.length === 0 ? <p className="py-12 text-center text-sm text-muted-foreground">No projects match the current filters.</p> : null}
          </CardContent>
        </Card>
      </div>
      {explorer ? <ReportExplorer open onOpenChange={(open) => !open && setExplorer(null)} resource={explorer.resource} metric={explorer.metric} title={explorer.title} description={explorer.description} rangeQuery={rangeQuery} extraQuery={projectId ? `projectId=${encodeURIComponent(projectId)}` : ""} /> : null}
    </ReportCommandCenterLayout>
  );
}

function shortDate(value: string) { return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
function signed(value: number) { return value > 0 ? `+${value}` : String(value); }
function initialExplorer(): ExplorerSelection | null {
  if (typeof window === "undefined") return null;
  const explore = new URLSearchParams(window.location.search).get("explore");
  if (explore === "time") return { resource: "time-entries", metric: "all", title: "Project time", description: "Time entries supporting this project metric" };
  if (explore === "overdue") return { resource: "tasks", metric: "overdue", title: "Project overdue tasks", description: "Overdue tasks for this project" };
  if (explore === "open" || explore === "tasks") return { resource: "tasks", metric: "open", title: "Project open tasks", description: "Open tasks for this project" };
  if (explore === "unassigned") return { resource: "tasks", metric: "unassigned", title: "Unassigned work", description: "Open tasks without an assignee" };
  return null;
}
function DeliverySkeleton() { return <div className="space-y-4"><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div><Skeleton className="h-72" /><Skeleton className="h-96" /></div>; }
function ReportError({ label }: { label: string }) { return <div className="border border-destructive/30 p-8 text-center"><TimerReset className="mx-auto h-6 w-6 text-destructive" /><p className="mt-2 font-medium">Could not load {label}</p><p className="text-sm text-muted-foreground">Refresh the page to try again.</p></div>; }
