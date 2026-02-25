import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CLIENT_STAGE_LABELS, type ClientStageType } from "@shared/schema";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const STAGE_COLORS: Record<string, string> = {
  lead: "hsl(var(--muted-foreground))",
  proposal: "hsl(var(--primary))",
  prospect: "hsl(var(--chart-3, 45 93% 47%))",
  content_strategy: "hsl(var(--chart-4, 280 65% 60%))",
  design: "hsl(var(--chart-4, 280 65% 60%))",
  development: "hsl(var(--chart-3, 45 93% 47%))",
  final_testing: "hsl(var(--chart-5, 27 96% 61%))",
  active_maintenance: "hsl(var(--chart-2, 142 71% 45%))",
  active: "hsl(var(--chart-2, 142 71% 45%))",
};

interface ClientAnalyticsData {
  clients: {
    id: string;
    company_name: string;
    stage: string;
    status: string;
    project_count: number;
    active_projects: number;
    task_count: number;
    completed_tasks: number;
    total_hours: number;
    time_entries: number;
    budget_minutes: number;
  }[];
  stageDistribution: { stage: string; count: number }[];
  topClientsByHours: {
    id: string;
    company_name: string;
    hours: number;
    entries: number;
  }[];
  budgetUtilization: {
    id: string;
    company_name: string;
    budget_minutes: number;
    used_minutes: number;
    utilizationPercent: number;
  }[];
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="h-[250px] w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function formatHours(hours: number) {
  if (hours === 0) return "0h";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  return `${hours}h`;
}

function formatMinutesToHours(minutes: number) {
  if (minutes === 0) return "0h";
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours}h`;
}

export default function ClientAnalytics() {
  const { data, isLoading } = useQuery<ClientAnalyticsData>({
    queryKey: ["/api/v1/reports/clients/analytics"],
  });

  if (isLoading || !data) return <LoadingSkeleton />;

  const stageData = data.stageDistribution.map((s) => ({
    name: CLIENT_STAGE_LABELS[s.stage as ClientStageType] || s.stage,
    value: s.count,
    fill: STAGE_COLORS[s.stage] || "#6B7280",
  }));

  const hoursData = data.topClientsByHours.map((c) => ({
    name: c.company_name.length > 15 ? c.company_name.slice(0, 15) + "..." : c.company_name,
    hours: c.hours,
  }));

  const totalClients = data.clients.length;
  const activeClients = data.clients.filter((c) => c.status === "active").length;
  const totalProjects = data.clients.reduce((s, c) => s + c.project_count, 0);
  const totalHours = data.clients.reduce((s, c) => s + c.total_hours, 0);

  return (
    <div className="space-y-6" data-testid="client-analytics">
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card data-testid="metric-total-clients">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Clients</p>
            <p className="text-2xl font-bold">{totalClients}</p>
            <p className="text-xs text-muted-foreground">{activeClients} active</p>
          </CardContent>
        </Card>
        <Card data-testid="metric-total-projects">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Client Projects</p>
            <p className="text-2xl font-bold">{totalProjects}</p>
          </CardContent>
        </Card>
        <Card data-testid="metric-total-hours">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Hours</p>
            <p className="text-2xl font-bold">{formatHours(Math.round(totalHours * 10) / 10)}</p>
          </CardContent>
        </Card>
        <Card data-testid="metric-budget-clients">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Budgeted Clients</p>
            <p className="text-2xl font-bold">{data.budgetUtilization.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Client Stage Distribution</CardTitle>
            <CardDescription>Clients across pipeline stages</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stageData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => percent > 0.05 ? `${name} ${(percent * 100).toFixed(0)}%` : ""}
                    outerRadius={80}
                    dataKey="value"
                  >
                    {stageData.map((entry, index) => (
                      <Cell key={`stage-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Clients by Hours</CardTitle>
            <CardDescription>Most time tracked per client</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              {hoursData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hoursData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" className="text-xs" />
                    <YAxis dataKey="name" type="category" className="text-xs" width={120} />
                    <Tooltip formatter={(value: number) => [`${value}h`, "Hours"]} />
                    <Bar dataKey="hours" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  No time tracking data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {data.budgetUtilization.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Budget Utilization</CardTitle>
            <CardDescription>Time spent vs allocated budget per client</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.budgetUtilization.map((client) => (
                <div key={client.id} className="space-y-1.5" data-testid={`budget-row-${client.id}`}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium truncate max-w-[200px]">{client.company_name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">
                        {formatMinutesToHours(client.used_minutes)} / {formatMinutesToHours(client.budget_minutes)}
                      </span>
                      <Badge
                        variant={client.utilizationPercent > 100 ? "destructive" : client.utilizationPercent > 80 ? "outline" : "secondary"}
                        className="text-xs"
                      >
                        {client.utilizationPercent}%
                      </Badge>
                    </div>
                  </div>
                  <Progress value={Math.min(client.utilizationPercent, 100)} className="h-2" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Client Summary</CardTitle>
          <CardDescription>Comprehensive client metrics overview</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Projects</TableHead>
                <TableHead>Tasks</TableHead>
                <TableHead>Hours</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.clients.map((client) => {
                const completionRate = client.task_count > 0
                  ? Math.round((client.completed_tasks / client.task_count) * 100)
                  : 0;
                return (
                  <TableRow key={client.id} data-testid={`client-row-${client.id}`}>
                    <TableCell>
                      <span className="font-medium">{client.company_name}</span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="text-xs"
                        style={{ borderColor: STAGE_COLORS[client.stage] || "#6B7280" }}
                      >
                        {CLIENT_STAGE_LABELS[client.stage as ClientStageType] || client.stage}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{client.project_count}</span>
                      {client.active_projects > 0 && (
                        <span className="text-xs text-muted-foreground ml-1">({client.active_projects} active)</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{client.task_count}</div>
                      {client.task_count > 0 && (
                        <div className="text-xs text-muted-foreground">{completionRate}% done</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="font-medium text-sm">{formatHours(client.total_hours)}</span>
                    </TableCell>
                  </TableRow>
                );
              })}
              {data.clients.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No client data available
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
