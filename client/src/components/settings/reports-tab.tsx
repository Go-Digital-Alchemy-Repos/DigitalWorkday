import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import { Download, Clock, FolderKanban, CheckSquare, TrendingUp, Users } from "lucide-react";
import type { Project, TimeEntry } from "@shared/schema";

const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];

export function ReportsTab() {
  const [dateRange, setDateRange] = useState("this-month");
  const [groupBy, setGroupBy] = useState("week");

  const { data: timeEntries } = useQuery<TimeEntry[]>({
    queryKey: ["/api/time-entries"],
  });

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: timeSummary } = useQuery<any>({
    queryKey: ["/api/time-entries/summary", { groupBy }],
  });

  const totalHours = timeEntries?.reduce((acc, entry) => acc + (entry.duration || 0), 0) || 0;
  const totalMinutes = Math.round(totalHours / 60);
  const displayHours = Math.floor(totalMinutes / 60);
  const displayMinutes = totalMinutes % 60;

  const projectHours = projects?.map((project) => {
    const projectEntries = timeEntries?.filter((e) => e.projectId === project.id) || [];
    const hours = projectEntries.reduce((acc, e) => acc + (e.duration || 0), 0) / 3600;
    return {
      name: project.name.slice(0, 15),
      hours: Math.round(hours * 10) / 10,
      color: project.color || COLORS[0],
    };
  }).filter((p) => p.hours > 0) || [];

  const weeklyData = [
    { name: "Mon", hours: 6.5 },
    { name: "Tue", hours: 8.2 },
    { name: "Wed", hours: 7.8 },
    { name: "Thu", hours: 5.4 },
    { name: "Fri", hours: 7.1 },
    { name: "Sat", hours: 0 },
    { name: "Sun", hours: 0 },
  ];

  const handleExportCSV = () => {
    const headers = ["Date", "Project", "Description", "Duration (hours)"];
    const rows = timeEntries?.map((entry) => [
      entry.date ? new Date(entry.date).toLocaleDateString() : "",
      projects?.find((p) => p.id === entry.projectId)?.name || "",
      entry.description || "",
      ((entry.duration || 0) / 3600).toFixed(2),
    ]) || [];

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `time-report-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-[180px]" data-testid="select-date-range">
            <SelectValue placeholder="Select range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="this-week">This Week</SelectItem>
            <SelectItem value="last-week">Last Week</SelectItem>
            <SelectItem value="this-month">This Month</SelectItem>
            <SelectItem value="last-month">Last Month</SelectItem>
            <SelectItem value="this-year">This Year</SelectItem>
          </SelectContent>
        </Select>

        <Select value={groupBy} onValueChange={setGroupBy}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Group by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Day</SelectItem>
            <SelectItem value="week">Week</SelectItem>
            <SelectItem value="month">Month</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" onClick={handleExportCSV} data-testid="button-export-csv">
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Hours</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{displayHours}h {displayMinutes}m</div>
            <p className="text-xs text-muted-foreground">
              {timeEntries?.length || 0} time entries
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
            <FolderKanban className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {projects?.filter((p) => p.status === "active").length || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              of {projects?.length || 0} total projects
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Daily Hours</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {weeklyData.filter((d) => d.hours > 0).length > 0
                ? (weeklyData.reduce((a, b) => a + b.hours, 0) / weeklyData.filter((d) => d.hours > 0).length).toFixed(1)
                : "0"}
              h
            </div>
            <p className="text-xs text-muted-foreground">
              based on work days
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Projects Tracked</CardTitle>
            <CheckSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{projectHours.length}</div>
            <p className="text-xs text-muted-foreground">
              with time logged
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="time-tracking" className="space-y-4">
        <TabsList>
          <TabsTrigger value="time-tracking">Time Tracking</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="productivity">Productivity</TabsTrigger>
        </TabsList>

        <TabsContent value="time-tracking" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Hours Trend</CardTitle>
                <CardDescription>Daily hours over the selected period</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={weeklyData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="hours"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={{ fill: "hsl(var(--primary))" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Hours by Project</CardTitle>
                <CardDescription>Distribution across projects</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={projectHours.slice(0, 6)}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip />
                      <Bar dataKey="hours" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="projects" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Project Summary</CardTitle>
              <CardDescription>Overview of all projects</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Hours Logged</TableHead>
                    <TableHead>Team</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects?.slice(0, 10).map((project) => {
                    const hours = projectHours.find((p) => p.name.startsWith(project.name.slice(0, 15)))?.hours || 0;
                    return (
                      <TableRow key={project.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div
                              className="h-3 w-3 rounded-sm"
                              style={{ backgroundColor: project.color || COLORS[0] }}
                            />
                            <span className="font-medium">{project.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={project.status === "active" ? "default" : "secondary"}>
                            {project.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{hours}h</TableCell>
                        <TableCell className="text-muted-foreground">-</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="productivity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Productivity Metrics</CardTitle>
              <CardDescription>Team performance overview</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Productivity metrics will be available once more task data is collected.</p>
                <p className="text-sm mt-2">Track task completions and time to see productivity insights.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
