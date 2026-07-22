import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  CheckSquare,
  Clock,
  ContactRound,
  FolderKanban,
  ListChecks,
  Search,
  TimerReset,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { formatNumber } from "@/lib/utils";
import { DataPointHelp } from "@/components/data-point-help";
import { DATA_POINT_DEFINITIONS } from "@/lib/data-point-definitions";
import {
  nextTableSortState,
  sortTableRows,
  type SortDirection,
  type TableSortState,
} from "@/lib/table-sort";
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
  attentionQueue: Array<{
    type: string;
    severity: "high" | "medium" | "low";
    message: string;
    project: {
      projectId: string;
      projectName: string;
      clientName: string | null;
    };
  }>;
  clients: ClientWorkIntelligenceRow[];
}

type ClientSortField =
  | "companyName"
  | "activeProjects"
  | "openTasks"
  | "overdueTasks"
  | "rangeHours"
  | "ytdHours"
  | "lifetimeHours"
  | "lastActivityAt";

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-40" />
      <div className="grid gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}

function attentionLabel(type: string): string {
  switch (type) {
    case "overdue": return "Overdue";
    case "due_soon": return "Due soon";
    case "unassigned": return "Unassigned";
    case "stale": return "Stale";
    case "high_time_low_progress": return "High time / low progress";
    default: return type.replace(/_/g, " ");
  }
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
  const [sort, setSort] = useState<TableSortState<ClientSortField>>({
    key: "rangeHours",
    direction: "desc",
  });

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
    const filtered = q
      ? rows.filter((client) => client.companyName.toLowerCase().includes(q))
      : rows;

    if (!sort.key) return filtered;
    const key = sort.key;
    return sortTableRows(filtered, (client) => client[key], sort.direction);
  }, [data?.clients, search, sort]);

  const timeLeaders = useMemo(
    () => sortTableRows(data?.clients ?? [], (client) => client.rangeHours, "desc").slice(0, 6),
    [data?.clients],
  );

  const requestSort = (key: ClientSortField, firstDirection: SortDirection = "desc") => {
    setSort((current) => nextTableSortState(current, key, firstDirection));
  };

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
    >
      <div className="space-y-6" data-testid="client-analytics">
        <Card data-testid="card-client-analytics-time-leaders">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              Client Time Leaders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {timeLeaders.map((client) => (
                <Link
                  key={client.clientId}
                  href={getClientReportPath(window.location.pathname, client.clientId)}
                  className="rounded-md border border-border/70 p-3 transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{client.companyName}</p>
                      <p className="text-xs text-muted-foreground">{client.activeProjects} active projects</p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold">{formatHours(client.rangeHours)}</p>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{client.openTasks} open</span>
                    <span>{client.overdueTasks} overdue</span>
                    <span>{formatHours(client.ytdHours)} YTD</span>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

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
            label="Time Investment"
            value={formatHours(data.totals.rangeHours)}
            sub={`${formatHours(data.totals.ytdHours)} YTD, ${formatHours(data.totals.lifetimeHours)} lifetime`}
            icon={<Clock className="h-4 w-4" />}
          />
        </div>

        <Tabs defaultValue="attention" className="w-full" data-testid="tabs-client-analytics-workspace">
          <Card>
            <CardHeader className="pb-3">
              <TabsList className="grid h-auto w-full grid-cols-2 sm:w-[440px]">
                <TabsTrigger value="attention" className="gap-2 py-2" data-testid="tab-client-analytics-attention">
                  <ListChecks className="h-4 w-4" />
                  Attention Queue
                  <Badge variant={data.attentionQueue.length > 0 ? "destructive" : "secondary"} className="ml-1">
                    {data.attentionQueue.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="portfolio" className="gap-2 py-2" data-testid="tab-client-analytics-portfolio">
                  <FolderKanban className="h-4 w-4" />
                  Client Portfolio
                </TabsTrigger>
              </TabsList>
            </CardHeader>

            <TabsContent value="attention" className="mt-0">
              <CardContent>
                {data.attentionQueue.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <CheckSquare className="h-8 w-8 text-muted-foreground" />
                    <p className="mt-3 text-sm font-medium">No client exceptions right now</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Overdue, stale, unassigned, and high-time/low-progress work will appear here.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.attentionQueue.slice(0, 12).map((item, index) => (
                      <Link
                        key={`${item.type}-${item.project.projectId}-${index}`}
                        href={`/projects/${item.project.projectId}`}
                        className="block rounded-md border border-border/70 bg-muted/20 p-3 transition-colors hover:bg-muted/50"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant={item.severity === "high" ? "destructive" : "secondary"}>
                                {attentionLabel(item.type)}
                              </Badge>
                              <span className="truncate text-sm font-medium">{item.project.projectName}</span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">{item.message}</p>
                            {item.project.clientName ? (
                              <p className="mt-1 text-xs text-muted-foreground">{item.project.clientName}</p>
                            ) : null}
                          </div>
                          <span className="shrink-0 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground">Open</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </TabsContent>

            <TabsContent value="portfolio" className="mt-0">
              <CardContent className="space-y-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-base font-medium">Client Portfolio</h3>
                    <p className="text-xs text-muted-foreground">Client-level work, task, and time investment rollups</p>
                  </div>
                  <div className="relative w-full md:w-80">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search clients..."
                      className="pl-9"
                      data-testid="input-client-work-search"
                    />
                  </div>
                </div>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead
                      label="Client"
                      columnLabel="client name"
                      active={sort.key === "companyName"}
                      direction={sort.direction}
                      onSort={() => requestSort("companyName", "asc")}
                      help={<DataPointHelp label="Client" definition={DATA_POINT_DEFINITIONS.client} />}
                      testId="sort-client-work-company"
                    />
                    <SortableTableHead label="Active Projects" columnLabel="active projects" active={sort.key === "activeProjects"} direction={sort.direction} onSort={() => requestSort("activeProjects")} align="right" />
                    <SortableTableHead label="Open Tasks" columnLabel="open tasks" active={sort.key === "openTasks"} direction={sort.direction} onSort={() => requestSort("openTasks")} align="right" />
                    <SortableTableHead label="Overdue" columnLabel="overdue tasks" active={sort.key === "overdueTasks"} direction={sort.direction} onSort={() => requestSort("overdueTasks")} align="right" />
                    <SortableTableHead label="Range Hours" columnLabel="range hours" active={sort.key === "rangeHours"} direction={sort.direction} onSort={() => requestSort("rangeHours")} align="right" testId="sort-client-work-range-hours" />
                    <SortableTableHead label="YTD Hours" columnLabel="year-to-date hours" active={sort.key === "ytdHours"} direction={sort.direction} onSort={() => requestSort("ytdHours")} align="right" />
                    <SortableTableHead label="Lifetime Hours" columnLabel="lifetime hours" active={sort.key === "lifetimeHours"} direction={sort.direction} onSort={() => requestSort("lifetimeHours")} align="right" />
                    <SortableTableHead label="Last Activity" columnLabel="last activity" active={sort.key === "lastActivityAt"} direction={sort.direction} onSort={() => requestSort("lastActivityAt")} />
                    <TableHead className="text-right">CRM</TableHead>
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
                      <TableCell className="text-right">
                        <Button asChild variant="outline" size="sm" data-testid={`button-open-client-crm-${client.clientId}`}>
                          <Link href={`/clients/${client.clientId}`} aria-label={`Open ${client.companyName} in CRM`}>
                            <ContactRound className="mr-1.5 h-3.5 w-3.5" />
                            CRM
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {clients.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                        No clients match the current filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
              </CardContent>
            </TabsContent>
          </Card>
        </Tabs>
      </div>
    </ReportCommandCenterLayout>
  );
}
