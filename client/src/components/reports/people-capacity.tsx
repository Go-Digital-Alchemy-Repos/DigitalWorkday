import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, Clock3, Gauge, Pencil, Search, TimerReset, UserRoundCheck, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { ReportCommandCenterLayout, buildDateParams, type ReportRangeValue } from "./report-command-center-layout";
import { ReportExplorer } from "./report-explorer";
import { ExplorableMetric } from "./explorable-metric";
import { ReportDataNote } from "./report-shared";
import { fetchReport as fetch } from "./report-fetch";
import { useReportRangeState } from "./use-report-range-state";

interface PersonRow {
  userId: string; firstName: string | null; lastName: string | null; email: string;
  weeklyCapacityHours: number; capacityHours: number; plannedHours: number; loggedHours: number;
  plannedLoadPct: number | null; timeCoveragePct: number | null; activeTasks: number; overdueTasks: number;
  completedInRange: number; projectCount: number; estimateCoveragePct: number;
  projectIds: string[];
  loadState: "overloaded" | "underallocated" | "balanced" | "unknown";
}

interface PeopleData {
  metadata: { definitions: Record<string, string> };
  summary: { people: number; capacityHours: number; plannedHours: number; loggedHours: number; plannedLoadPct: number | null; timeCoveragePct: number | null; overdueTasks: number; overloadedPeople: number; unassignedTasks: number; estimateCoveragePct: number };
  people: PersonRow[];
}

type ExplorerSelection = { metric: string; title: string; description: string };

export default function PeopleCapacity() {
  const [range, setRange] = useReportRangeState(30);
  const [search, setSearch] = useState("");
  const [loadFilter, setLoadFilter] = useState<"all" | PersonRow["loadState"]>("all");
  const [explorer, setExplorer] = useState<ExplorerSelection | null>(null);
  const [editing, setEditing] = useState<PersonRow | null>(null);
  const projectId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("projectId") : null;
  const rangeQuery = buildDateParams(range);
  const { data, isLoading, isError } = useQuery<PeopleData>({
    queryKey: ["/api/reports/v3/people", range],
    queryFn: async () => {
      const response = await fetch(`/api/reports/v3/people?${rangeQuery}`);
      if (!response.ok) throw new Error("Failed to load people capacity");
      return response.json();
    },
  });

  const people = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.people ?? []).filter((person) => {
      if (projectId && !person.projectIds.includes(projectId)) return false;
      if (loadFilter !== "all" && person.loadState !== loadFilter) return false;
      return !query || displayName(person).toLowerCase().includes(query) || person.email.toLowerCase().includes(query);
    });
  }, [data?.people, loadFilter, projectId, search]);

  if (isLoading) return <PeopleSkeleton />;
  if (isError || !data) return <PeopleError />;

  return (
    <ReportCommandCenterLayout title="People & Capacity" description="Planned workload, configured capacity, logged-time coverage, and delivery ownership" icon={<UsersRound className="h-5 w-5" />} rangeDays={range} onRangeChange={setRange} extraControls={projectId ? <Button asChild variant="outline" size="sm"><Link href="/reports?view=people">Clear project filter</Link></Button> : undefined}>
      <div className="space-y-4" data-testid="people-capacity">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
          <ExplorableMetric label="People" value={data.summary.people} icon={<UsersRound className="h-4 w-4" />} onClick={() => setExplorer({ metric: "all", title: "Reporting team", description: "Active internal workspace members" })} />
          <ExplorableMetric label="Capacity" value={`${data.summary.capacityHours.toFixed(1)}h`} detail="Configured working capacity" icon={<Gauge className="h-4 w-4" />} onClick={() => setExplorer({ metric: "all", title: "Team capacity", description: "Capacity by employee for the selected range" })} />
          <ExplorableMetric label="Planned load" value={`${data.summary.plannedLoadPct ?? 0}%`} detail={`${data.summary.plannedHours.toFixed(1)}h estimated`} tone={data.summary.plannedLoadPct && data.summary.plannedLoadPct > 110 ? "danger" : "neutral"} icon={<UserRoundCheck className="h-4 w-4" />} onClick={() => setExplorer({ metric: "all", title: "Planned workload", description: "Open estimated work relative to configured capacity" })} />
          <ExplorableMetric label="Logged time" value={`${data.summary.loggedHours.toFixed(1)}h`} detail={`${data.summary.timeCoveragePct ?? 0}% time coverage`} definition={data.metadata.definitions.timeCoverage} icon={<Clock3 className="h-4 w-4" />} onClick={() => setExplorer({ metric: "all", title: "Time coverage", description: "Logged hours relative to configured capacity" })} />
          <ExplorableMetric label="Overloaded" value={data.summary.overloadedPeople} tone="danger" icon={<AlertTriangle className="h-4 w-4" />} onClick={() => setExplorer({ metric: "overloaded", title: "Overloaded people", description: "Planned work above 110% of configured capacity" })} />
          <ExplorableMetric label="Unassigned" value={data.summary.unassignedTasks} tone="warning" icon={<TimerReset className="h-4 w-4" />} onClick={() => window.location.assign(`/reports?view=delivery&explore=unassigned`)} />
        </div>

        <ReportDataNote title="Capacity model" items={["Capacity uses weekday-adjusted member settings", "Planned load uses open task estimates", `${data.summary.estimateCoveragePct}% estimate coverage`, "Logged time is shown as coverage, not performance"]} />

        <Card>
          <CardHeader className="gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
            <div><CardTitle className="text-base">Team allocation</CardTitle><p className="mt-1 text-xs text-muted-foreground">Expand from team-level pressure into each employee’s work</p></div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employees" className="pl-8 sm:w-56" /></div>
              <div className="flex gap-1">{(["all", "overloaded", "balanced", "underallocated"] as const).map((state) => <Button key={state} type="button" size="sm" variant={loadFilter === state ? "default" : "outline"} onClick={() => setLoadFilter(state)}>{state === "all" ? "All" : state === "underallocated" ? "Available" : state[0].toUpperCase() + state.slice(1)}</Button>)}</div>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Load</TableHead><TableHead className="text-right">Capacity</TableHead><TableHead className="text-right">Planned</TableHead><TableHead className="text-right">Logged</TableHead><TableHead className="text-right">Projects</TableHead><TableHead className="text-right">Open</TableHead><TableHead className="text-right">Overdue</TableHead><TableHead className="w-12"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
              <TableBody>{people.map((person) => <TableRow key={person.userId}>
                <TableCell><Link href={`/reports/employees/${person.userId}`} className="font-medium hover:underline">{displayName(person)}</Link><span className="block text-xs text-muted-foreground">{person.email}</span></TableCell>
                <TableCell className="min-w-36"><div className="mb-1 flex items-center justify-between text-xs"><LoadBadge state={person.loadState} /><span>{person.plannedLoadPct ?? 0}%</span></div><Progress value={Math.min(person.plannedLoadPct ?? 0, 100)} className="h-1.5" /></TableCell>
                <TableCell className="text-right">{person.capacityHours.toFixed(1)}h<span className="block text-xs text-muted-foreground">{person.weeklyCapacityHours}h/week</span></TableCell>
                <TableCell className="text-right">{person.plannedHours.toFixed(1)}h<span className="block text-xs text-muted-foreground">{person.estimateCoveragePct}% estimated</span></TableCell>
                <TableCell className="text-right">{person.loggedHours.toFixed(1)}h<span className="block text-xs text-muted-foreground">{person.timeCoveragePct ?? 0}% coverage</span></TableCell>
                <TableCell className="text-right">{person.projectCount}</TableCell><TableCell className="text-right">{person.activeTasks}</TableCell><TableCell className="text-right">{person.overdueTasks}</TableCell>
                <TableCell><Button type="button" variant="ghost" size="icon" title="Edit weekly capacity" onClick={() => setEditing(person)}><Pencil className="h-4 w-4" /><span className="sr-only">Edit {displayName(person)} capacity</span></Button></TableCell>
              </TableRow>)}</TableBody>
            </Table>
            {people.length === 0 ? <p className="py-12 text-center text-sm text-muted-foreground">No employees match the current filters.</p> : null}
          </CardContent>
        </Card>
      </div>
      {explorer ? <ReportExplorer open onOpenChange={(open) => !open && setExplorer(null)} resource="employees" metric={explorer.metric} title={explorer.title} description={explorer.description} rangeQuery={rangeQuery} /> : null}
      {editing ? <CapacityDialog person={editing} onClose={() => setEditing(null)} /> : null}
    </ReportCommandCenterLayout>
  );
}

function CapacityDialog({ person, onClose }: { person: PersonRow; onClose: () => void }) {
  const [hours, setHours] = useState(String(person.weeklyCapacityHours));
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/reports/v3/people/${person.userId}/capacity`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ weeklyCapacityHours: Number(hours) }) });
      if (!response.ok) throw new Error("Failed to update capacity");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/reports/v3/people"] }); toast({ title: "Capacity updated" }); onClose(); },
    onError: () => toast({ title: "Capacity could not be updated", variant: "destructive" }),
  });
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent><DialogHeader><DialogTitle>Weekly capacity</DialogTitle><DialogDescription>Set the normal weekly working capacity for {displayName(person)}.</DialogDescription></DialogHeader><div className="space-y-2"><Label htmlFor="weekly-capacity">Hours per week</Label><Input id="weekly-capacity" type="number" min="1" max="100" step="0.5" value={hours} onChange={(event) => setHours(event.target.value)} /></div><DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !Number(hours)}>Save</Button></DialogFooter></DialogContent></Dialog>;
}

function LoadBadge({ state }: { state: PersonRow["loadState"] }) { return <Badge variant={state === "overloaded" ? "destructive" : "outline"}>{state === "underallocated" ? "Available" : state[0].toUpperCase() + state.slice(1)}</Badge>; }
function displayName(person: Pick<PersonRow, "firstName" | "lastName" | "email">) { return [person.firstName, person.lastName].filter(Boolean).join(" ") || person.email; }
function PeopleSkeleton() { return <div className="space-y-4"><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-24" />)}</div><Skeleton className="h-[32rem]" /></div>; }
function PeopleError() { return <div className="border border-destructive/30 p-8 text-center"><TimerReset className="mx-auto h-6 w-6 text-destructive" /><p className="mt-2 font-medium">Could not load people and capacity</p><p className="text-sm text-muted-foreground">Refresh the page to try again.</p></div>; }
