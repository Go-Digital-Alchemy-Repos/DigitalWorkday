import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Building2, Clock3, Search, Settings2, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExplorableMetric } from "@/components/reports/explorable-metric";
import { relativeDate } from "@/components/reports/report-shared";

interface TenantRow {
  tenantId: string; tenantName: string; status: string; users: number; enabledUsers: number; activeUsers30d: number;
  admins: number; projects: number; activeProjects: number; openTasks: number; overdueTasks: number;
  completed30d: number; hours30d: number; timeLoggers30d: number; brandingConfigured: boolean; lastActivityAt: string | null;
}

interface PlatformSummary {
  generatedAt: string;
  summary: { tenants: number; activeTenants30d: number; dormantTenants30d: number; activeUsers30d: number; hours30d: number; overdueTasks: number; configurationIssues: number };
  tenants: TenantRow[];
}

type PlatformFilter = "all" | "active" | "dormant" | "overdue" | "configuration";

export default function SuperAdminPlatformReports({ onOpenTenant }: { onOpenTenant?: (tenantId: string) => void }) {
  const [filter, setFilter] = useState<PlatformFilter>("all");
  const [search, setSearch] = useState("");
  const { data, isLoading, isError } = useQuery<PlatformSummary>({ queryKey: ["/api/v1/super/reports/platform-summary"] });
  const tenants = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.tenants ?? []).filter((tenant) => {
      if (query && !tenant.tenantName.toLowerCase().includes(query)) return false;
      const active = tenant.activeUsers30d > 0 || tenant.hours30d > 0 || tenant.completed30d > 0;
      if (filter === "active") return active;
      if (filter === "dormant") return !active;
      if (filter === "overdue") return tenant.overdueTasks > 0;
      if (filter === "configuration") return tenant.admins === 0 || !tenant.brandingConfigured;
      return true;
    });
  }, [data?.tenants, filter, search]);

  if (isLoading) return <div className="space-y-4 p-4 sm:p-6"><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-24" />)}</div><Skeleton className="h-[34rem]" /></div>;
  if (isError || !data) return <p className="m-6 border border-destructive/30 p-8 text-center text-sm text-destructive">Platform operations could not be loaded.</p>;

  return (
    <div className="space-y-4 p-4 sm:p-6" data-testid="platform-operations">
      <div><h2 className="text-lg font-semibold">Platform Operations</h2><p className="text-sm text-muted-foreground">Tenant adoption, activity, configuration, and delivery signals</p></div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        <ExplorableMetric label="Tenants" value={data.summary.tenants} icon={<Building2 className="h-4 w-4" />} onClick={() => setFilter("all")} />
        <ExplorableMetric label="Active tenants, 30d" value={data.summary.activeTenants30d} tone="positive" icon={<Building2 className="h-4 w-4" />} onClick={() => setFilter("active")} />
        <ExplorableMetric label="Dormant tenants, 30d" value={data.summary.dormantTenants30d} tone="warning" icon={<Clock3 className="h-4 w-4" />} onClick={() => setFilter("dormant")} />
        <ExplorableMetric label="Active users, 30d" value={data.summary.activeUsers30d} icon={<UsersRound className="h-4 w-4" />} onClick={() => setFilter("active")} />
        <ExplorableMetric label="Overdue tasks" value={data.summary.overdueTasks} tone="danger" icon={<AlertTriangle className="h-4 w-4" />} onClick={() => setFilter("overdue")} />
        <ExplorableMetric label="Configuration issues" value={data.summary.configurationIssues} tone="warning" icon={<Settings2 className="h-4 w-4" />} onClick={() => setFilter("configuration")} />
      </div>

      <Card>
        <CardHeader className="gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div><CardTitle className="text-base">Tenant comparison</CardTitle><p className="mt-1 text-xs text-muted-foreground">Showing {tenants.length} of {data.summary.tenants} tenants · {data.summary.hours30d.toFixed(1)} platform hours in 30 days</p></div>
          <div className="flex items-center gap-2"><Badge variant="outline" className="capitalize">{filter}</Badge><div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tenants" className="pl-8 sm:w-64" /></div></div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Tenant</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Active users</TableHead><TableHead className="text-right">Projects</TableHead><TableHead className="text-right">Open tasks</TableHead><TableHead className="text-right">Overdue</TableHead><TableHead className="text-right">Hours, 30d</TableHead><TableHead>Configuration</TableHead><TableHead>Last activity</TableHead><TableHead className="w-20"><span className="sr-only">Open</span></TableHead></TableRow></TableHeader>
            <TableBody>{tenants.map((tenant) => <TableRow key={tenant.tenantId}>
              <TableCell className="font-medium">{tenant.tenantName}<span className="block text-xs font-normal text-muted-foreground">{tenant.users} users · {tenant.timeLoggers30d} time loggers</span></TableCell>
              <TableCell><Badge variant={tenant.status === "active" ? "secondary" : "outline"}>{tenant.status}</Badge></TableCell>
              <TableCell className="text-right">{tenant.activeUsers30d}</TableCell><TableCell className="text-right">{tenant.activeProjects}<span className="block text-xs text-muted-foreground">{tenant.projects} total</span></TableCell>
              <TableCell className="text-right">{tenant.openTasks}</TableCell><TableCell className="text-right">{tenant.overdueTasks}</TableCell><TableCell className="text-right">{Number(tenant.hours30d).toFixed(1)}h</TableCell>
              <TableCell>{tenant.admins > 0 && tenant.brandingConfigured ? <Badge variant="secondary">Ready</Badge> : <div className="flex flex-wrap gap-1">{tenant.admins === 0 ? <Badge variant="destructive">No admin</Badge> : null}{!tenant.brandingConfigured ? <Badge variant="outline">No branding</Badge> : null}</div>}</TableCell>
              <TableCell>{relativeDate(tenant.lastActivityAt)}</TableCell><TableCell><Button type="button" variant="outline" size="sm" onClick={() => onOpenTenant?.(tenant.tenantId)}>Explore</Button></TableCell>
            </TableRow>)}</TableBody>
          </Table>
          {tenants.length === 0 ? <p className="py-12 text-center text-sm text-muted-foreground">No tenants match the current filters.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
