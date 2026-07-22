import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Building2, Clock, FolderKanban, Search, TimerReset } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber } from "@/lib/utils";
import { DataPointLabel } from "@/components/data-point-help";
import { DATA_POINT_DEFINITIONS } from "@/lib/data-point-definitions";
import {
  ReportCommandCenterLayout,
  buildDateParams,
  type ReportRangeValue,
} from "./report-command-center-layout";
import { fetchReport as fetch } from "./report-fetch";
import { getClientReportPath } from "./report-paths";

interface ClientWorkIntelligenceRow {
  clientId: string;
  companyName: string;
  activeProjects: number;
  openTasks: number;
  overdueTasks: number;
  rangeHours: number;
  ytdHours: number;
  lifetimeHours: number;
  lastActivityAt: string | null;
  inactivityDays: number | null;
}

interface ClientWorkIntelligenceData {
  totals: {
    activeProjects: number;
    projectsAtRisk: number;
    overdueTasks: number;
    rangeHours: number;
    ytdHours: number;
    lifetimeHours: number;
  };
  clients: ClientWorkIntelligenceRow[];
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}

function formatHours(hours: number) {
  if (hours === 0) return "0h";
  if (hours < 1) return `${formatNumber(Math.round(hours * 60))}m`;
  return `${formatNumber(hours, { maximumFractionDigits: 1 })}h`;
}

function MetricCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string | number;
  sub: string;
  icon: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{value}</p>
          </div>
          <div className="rounded-md border border-border/70 bg-background p-2 text-muted-foreground">
            {icon}
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

export default function ClientAnalytics() {
  const [range, setRange] = useState<ReportRangeValue>("ytd");
  const [search, setSearch] = useState("");

  const { data, isLoading, isError } = useQuery<ClientWorkIntelligenceData>({
    queryKey: ["/api/reports/v2/pm/portfolio", "client-work-intelligence", range],
    queryFn: async () => {
      const res = await fetch(`/api/reports/v2/pm/portfolio?${buildDateParams(range)}`);
      if (!res.ok) throw new Error("Failed to load client work intelligence");
      return res.json();
    },
    staleTime: 60_000,
  });

  const clients = useMemo(() => {
    const rows = data?.clients ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((client) => client.companyName.toLowerCase().includes(q));
  }, [data?.clients, search]);

  if (isLoading) return <LoadingSkeleton />;

  if (isError || !data) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Client work intelligence is unavailable right now.
        </CardContent>
      </Card>
    );
  }

  const totalClients = data.clients.length;
  const atRiskClients = data.clients.filter((client) => client.overdueTasks > 0 || (client.inactivityDays ?? 0) >= 14).length;
  const totalOpenTasks = data.clients.reduce((sum, client) => sum + client.openTasks, 0);

  return (
    <ReportCommandCenterLayout
      title="Client Work Intelligence"
      description="Client-level work, task, and time investment rollups"
      icon={<Building2 className="h-5 w-5" />}
      rangeDays={range}
      onRangeChange={setRange}
      extraControls={
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search clients..."
            className="pl-9"
            data-testid="input-client-work-search"
          />
        </div>
      }
    >
      <div className="space-y-6" data-testid="client-analytics">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Clients"
            value={formatNumber(totalClients)}
            sub={`${formatNumber(atRiskClients)} with overdue or stale work`}
            icon={<Building2 className="h-4 w-4" />}
          />
          <MetricCard
            label="Active Projects"
            value={formatNumber(data.totals.activeProjects)}
            sub="Active client projects across the tenant"
            icon={<FolderKanban className="h-4 w-4" />}
          />
          <MetricCard
            label="Open Tasks"
            value={formatNumber(totalOpenTasks)}
            sub={`${formatNumber(data.totals.overdueTasks)} overdue tasks`}
            icon={<AlertTriangle className="h-4 w-4" />}
          />
          <MetricCard
            label="Hours"
            value={formatHours(data.totals.rangeHours)}
            sub={`${formatHours(data.totals.ytdHours)} YTD, ${formatHours(data.totals.lifetimeHours)} lifetime`}
            icon={<Clock className="h-4 w-4" />}
          />
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Client Work Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead><DataPointLabel label="Client" definition={DATA_POINT_DEFINITIONS.client} /></TableHead>
                    <TableHead className="text-right">Active Projects</TableHead>
                    <TableHead className="text-right">Open Tasks</TableHead>
                    <TableHead className="text-right">Overdue</TableHead>
                    <TableHead className="text-right">Range Hours</TableHead>
                    <TableHead className="text-right">YTD Hours</TableHead>
                    <TableHead className="text-right">Lifetime Hours</TableHead>
                    <TableHead>Last Activity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((client) => (
                    <TableRow key={client.clientId} data-testid={`client-work-row-${client.clientId}`}>
                      <TableCell>
                        <Link href={getClientReportPath(window.location.pathname, client.clientId)} className="font-medium hover:underline">
                          {client.companyName}
                        </Link>
                        {(client.inactivityDays ?? 0) >= 14 ? (
                          <div className="mt-1">
                            <Badge variant="outline" className="text-xs">
                              <TimerReset className="mr-1 h-3 w-3" />
                              {client.inactivityDays}d inactive
                            </Badge>
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">{formatNumber(client.activeProjects)}</TableCell>
                      <TableCell className="text-right">{formatNumber(client.openTasks)}</TableCell>
                      <TableCell className="text-right">
                        {client.overdueTasks > 0 ? (
                          <Badge variant="destructive">{formatNumber(client.overdueTasks)}</Badge>
                        ) : (
                          "0"
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatHours(client.rangeHours)}</TableCell>
                      <TableCell className="text-right">{formatHours(client.ytdHours)}</TableCell>
                      <TableCell className="text-right">{formatHours(client.lifetimeHours)}</TableCell>
                      <TableCell>
                        {client.lastActivityAt
                          ? new Date(client.lastActivityAt).toLocaleDateString()
                          : <span className="text-muted-foreground">No activity</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                  {clients.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                        No clients match the current filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </ReportCommandCenterLayout>
  );
}
