import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, BarChart3, Clock3, FolderKanban, ListTodo, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ExplorableMetric } from "./explorable-metric";
import { fetchReport as fetch } from "./report-fetch";

interface HomeData {
  delivery: { activeProjects: number; projectsAtRisk: number; overdueTasks: number; rangeHours: number };
  people: { people: number; overloadedPeople: number; plannedLoadPct: number | null; loggedHours: number };
  attentionQueue: Array<{ type: string; severity: string; message: string; project: { projectId: string; projectName: string; clientName: string | null } }>;
  coverage: { estimatePct: number; budgetPct: number };
}

export default function ReportsHomeV3({ onNavigate }: { onNavigate: (view: "delivery" | "people" | "clients") => void }) {
  const { data, isLoading, isError } = useQuery<HomeData>({
    queryKey: ["/api/reports/v3/home", "30d"],
    queryFn: async () => {
      const response = await fetch("/api/reports/v3/home?range=30d");
      if (!response.ok) throw new Error("Failed to load report home");
      return response.json();
    },
  });
  if (isLoading) return <div className="space-y-4"><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24" />)}</div><Skeleton className="h-80" /></div>;
  if (isError || !data) return <p className="border border-destructive/30 p-8 text-center text-sm text-destructive">The reporting overview could not be loaded.</p>;

  return (
    <div className="space-y-4" data-testid="reports-home-v3">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <ExplorableMetric label="Projects at risk" value={data.delivery.projectsAtRisk} tone="warning" icon={<AlertTriangle className="h-4 w-4" />} onClick={() => onNavigate("delivery")} />
        <ExplorableMetric label="Overdue tasks" value={data.delivery.overdueTasks} tone="danger" icon={<ListTodo className="h-4 w-4" />} onClick={() => onNavigate("delivery")} />
        <ExplorableMetric label="Hours, last 30 days" value={`${data.delivery.rangeHours.toFixed(1)}h`} icon={<Clock3 className="h-4 w-4" />} onClick={() => onNavigate("delivery")} />
        <ExplorableMetric label="People overloaded" value={data.people.overloadedPeople} tone="danger" icon={<UsersRound className="h-4 w-4" />} onClick={() => onNavigate("people")} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2"><CardTitle className="text-base">Management exceptions</CardTitle><Button variant="ghost" size="sm" onClick={() => onNavigate("delivery")}>Open delivery</Button></CardHeader>
          <CardContent className="p-3 pt-0">
            {data.attentionQueue.length ? data.attentionQueue.map((item, index) => <Link key={`${item.project.projectId}-${item.type}-${index}`} href={`/projects/${item.project.projectId}`} className="flex items-start gap-3 border-b px-2 py-3 last:border-0 hover:bg-muted/50"><AlertTriangle className={`mt-0.5 h-4 w-4 ${item.severity === "high" ? "text-destructive" : "text-amber-600"}`} /><span className="min-w-0"><span className="block truncate text-sm font-medium">{item.project.projectName}</span><span className="block text-xs text-muted-foreground">{item.message}{item.project.clientName ? ` · ${item.project.clientName}` : ""}</span></span></Link>) : <p className="py-12 text-center text-sm text-muted-foreground">No management exceptions right now.</p>}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card><CardHeader className="pb-2"><CardTitle className="text-base">Reporting confidence</CardTitle></CardHeader><CardContent className="space-y-4"><Coverage label="Open tasks estimated" value={data.coverage.estimatePct} /><Coverage label="Active projects budgeted" value={data.coverage.budgetPct} /><div className="border-t pt-3 text-xs text-muted-foreground"><p>Snapshot and flow metrics are calculated separately.</p><p className="mt-1">All supporting records are tenant-scoped.</p></div></CardContent></Card>
          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" className="h-auto flex-col gap-2 py-4" onClick={() => onNavigate("delivery")}><FolderKanban className="h-5 w-5" />Delivery</Button>
            <Button variant="outline" className="h-auto flex-col gap-2 py-4" onClick={() => onNavigate("people")}><UsersRound className="h-5 w-5" />People</Button>
            <Button variant="outline" className="h-auto flex-col gap-2 py-4" onClick={() => onNavigate("clients")}><BarChart3 className="h-5 w-5" />Clients</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Coverage({ label, value }: { label: string; value: number }) { return <div><div className="mb-1 flex justify-between text-xs"><span>{label}</span><span className="font-medium">{value}%</span></div><Progress value={value} className="h-1.5" /></div>; }
