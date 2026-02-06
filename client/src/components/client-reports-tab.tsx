import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Clock,
  TrendingUp,
  FileText,
  DollarSign,
  Download,
  CalendarIcon,
} from "lucide-react";
import { format } from "date-fns";

const CHART_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16"];

interface ClientMetrics {
  totalHours: number;
  billableHours: number;
  totalTimeEntries: number;
  revenueEstimate: number | null;
  hoursByProject: {
    projectId: string;
    projectName: string;
    totalHours: number;
    billableHours: number;
    entryCount: number;
  }[];
  hoursByEmployee: {
    userId: string;
    userName: string;
    totalHours: number;
    billableHours: number;
    entryCount: number;
  }[];
  recentEntries: {
    id: string;
    title: string | null;
    scope: string;
    startTime: string;
    endTime: string | null;
    durationSeconds: number;
    projectName: string | null;
    userName: string | null;
  }[];
}

function formatHours(hours: number): string {
  return hours.toFixed(1);
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function ClientReportsTab({ clientId }: { clientId: string }) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const queryParams = new URLSearchParams();
  if (dateFrom) queryParams.set("from", dateFrom);
  if (dateTo) queryParams.set("to", dateTo);
  const qs = queryParams.toString();
  const metricsPath = `/api/crm/clients/${clientId}/metrics${qs ? `?${qs}` : ""}`;

  const { data: metrics, isLoading } = useQuery<ClientMetrics>({
    queryKey: [metricsPath],
  });

  const handleExportCSV = () => {
    if (!metrics?.recentEntries.length) return;
    const headers = ["Date", "Title", "Project", "Employee", "Duration", "Scope"];
    const rows = metrics.recentEntries.map((e) => [
      e.startTime ? format(new Date(e.startTime), "yyyy-MM-dd HH:mm") : "",
      e.title || "Untitled",
      e.projectName || "",
      e.userName || "",
      formatDuration(e.durationSeconds),
      e.scope === "in_scope" ? "Billable" : "Non-billable",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map(v => `"${v}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `client-time-entries-${clientId}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const nonBillableHours = (metrics?.totalHours ?? 0) - (metrics?.billableHours ?? 0);
  const billablePercent = metrics?.totalHours
    ? Math.round(((metrics.billableHours) / metrics.totalHours) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">From</label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-40"
            data-testid="input-date-from"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">To</label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-40"
            data-testid="input-date-to"
          />
        </div>
        {(dateFrom || dateTo) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setDateFrom(""); setDateTo(""); }}
            data-testid="button-clear-dates"
          >
            Clear
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="grid-summary-cards">
        <Card data-testid="card-total-hours">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Hours</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-hours">
              {formatHours(metrics?.totalHours ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              across {metrics?.totalTimeEntries ?? 0} entries
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-billable-hours">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Billable Hours</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-billable-hours">
              {formatHours(metrics?.billableHours ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {billablePercent}% of total
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-nonbillable-hours">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Non-Billable</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-nonbillable-hours">
              {formatHours(nonBillableHours)}
            </div>
            <p className="text-xs text-muted-foreground">
              {100 - billablePercent}% of total
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-revenue-estimate">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue Est.</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground" data-testid="text-revenue-estimate">
              {metrics?.revenueEstimate != null ? `$${metrics.revenueEstimate.toFixed(2)}` : "N/A"}
            </div>
            <p className="text-xs text-muted-foreground">
              {metrics?.revenueEstimate != null ? "based on rate" : "no billing rate set"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card data-testid="card-hours-by-project">
          <CardHeader>
            <CardTitle className="text-base">Hours by Project</CardTitle>
          </CardHeader>
          <CardContent>
            {metrics?.hoursByProject.length ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={metrics.hoursByProject.map((p) => ({
                    name: p.projectName.length > 20
                      ? p.projectName.substring(0, 18) + "..."
                      : p.projectName,
                    Billable: Number(p.billableHours.toFixed(1)),
                    "Non-Billable": Number((p.totalHours - p.billableHours).toFixed(1)),
                  }))}
                  layout="vertical"
                  margin={{ left: 10, right: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" className="text-xs fill-muted-foreground" />
                  <YAxis dataKey="name" type="category" width={120} className="text-xs fill-muted-foreground" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px" }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Bar dataKey="Billable" stackId="a" fill={CHART_COLORS[0]} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Non-Billable" stackId="a" fill={CHART_COLORS[2]} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm" data-testid="text-no-project-data">
                No project data for the selected period
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-hours-by-employee">
          <CardHeader>
            <CardTitle className="text-base">Hours by Employee</CardTitle>
          </CardHeader>
          <CardContent>
            {metrics?.hoursByEmployee.length ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={metrics.hoursByEmployee.map((e) => ({
                    name: e.userName.length > 20
                      ? e.userName.substring(0, 18) + "..."
                      : e.userName,
                    Billable: Number(e.billableHours.toFixed(1)),
                    "Non-Billable": Number((e.totalHours - e.billableHours).toFixed(1)),
                  }))}
                  layout="vertical"
                  margin={{ left: 10, right: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" className="text-xs fill-muted-foreground" />
                  <YAxis dataKey="name" type="category" width={120} className="text-xs fill-muted-foreground" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px" }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Bar dataKey="Billable" stackId="a" fill={CHART_COLORS[1]} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Non-Billable" stackId="a" fill={CHART_COLORS[2]} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm" data-testid="text-no-employee-data">
                No employee data for the selected period
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-time-entries">
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">Recent Time Entries</CardTitle>
          {(metrics?.recentEntries.length ?? 0) > 0 && (
            <Button variant="outline" size="sm" onClick={handleExportCSV} data-testid="button-export-csv">
              <Download className="h-4 w-4 mr-1" />
              Export CSV
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {metrics?.recentEntries.length ? (
            <div className="overflow-x-auto">
              <Table data-testid="table-time-entries">
                <TableHeader>
                  <TableRow>
                    <TableHead data-testid="header-date">Date</TableHead>
                    <TableHead data-testid="header-title">Title</TableHead>
                    <TableHead data-testid="header-project">Project</TableHead>
                    <TableHead data-testid="header-employee">Employee</TableHead>
                    <TableHead className="text-right" data-testid="header-duration">Duration</TableHead>
                    <TableHead data-testid="header-scope">Scope</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.recentEntries.map((entry) => (
                    <TableRow key={entry.id} data-testid={`row-time-entry-${entry.id}`}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {entry.startTime
                          ? format(new Date(entry.startTime), "MMM d, yyyy")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">
                        {entry.title || "Untitled"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {entry.projectName || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {entry.userName || "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm font-mono">
                        {formatDuration(entry.durationSeconds)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={entry.scope === "in_scope" ? "default" : "secondary"}>
                          {entry.scope === "in_scope" ? "Billable" : "Non-billable"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center text-muted-foreground text-sm" data-testid="text-no-time-entries">
              No time entries recorded for this client
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
