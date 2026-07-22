import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ExternalLink, ListFilter } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchReport as fetch } from "./report-fetch";

type ExploreResource = "projects" | "tasks" | "time-entries" | "employees";

interface ExploreResponse {
  rows: Array<Record<string, any>>;
  total?: number;
  hasMore?: boolean;
}

export function ReportExplorer({
  open,
  onOpenChange,
  resource,
  metric,
  title,
  description,
  rangeQuery,
  extraQuery = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resource: ExploreResource;
  metric: string;
  title: string;
  description?: string;
  rangeQuery: string;
  extraQuery?: string;
}) {
  const { data, isLoading, isError } = useQuery<ExploreResponse>({
    queryKey: ["/api/reports/v3/details", resource, metric, rangeQuery, extraQuery],
    queryFn: async () => {
      const response = await fetch(`/api/reports/v3/details/${resource}?${rangeQuery}&metric=${encodeURIComponent(metric)}&limit=100${extraQuery ? `&${extraQuery}` : ""}`);
      if (!response.ok) throw new Error("Failed to load supporting records");
      return response.json();
    },
    enabled: open,
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full p-0 sm:max-w-3xl">
        <SheetHeader className="border-b px-5 py-4 pr-12">
          <SheetTitle className="flex items-center gap-2"><ListFilter className="h-4 w-4" />{title}</SheetTitle>
          <SheetDescription>{description ?? "Records supporting the selected metric"}</SheetDescription>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-92px)]">
          <div className="p-5">
            {isLoading ? <ExplorerSkeleton /> : isError ? (
              <p className="py-12 text-center text-sm text-destructive">Supporting records could not be loaded.</p>
            ) : data?.rows.length ? (
              <ExplorerTable resource={resource} rows={data.rows} />
            ) : (
              <div className="py-16 text-center">
                <p className="font-medium">No matching records</p>
                <p className="mt-1 text-sm text-muted-foreground">Nothing currently supports this metric and filter.</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function ExplorerSkeleton() {
  return <div className="space-y-3">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-10 w-full" />)}</div>;
}

function ExplorerTable({ resource, rows }: { resource: ExploreResource; rows: Array<Record<string, any>> }) {
  if (resource === "projects") {
    return (
      <Table>
        <TableHeader><TableRow><TableHead>Project</TableHead><TableHead>Client</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Open</TableHead><TableHead className="text-right">Overdue</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map((row) => <TableRow key={row.projectId}>
          <TableCell><Link className="inline-flex items-center gap-1 font-medium hover:underline" href={`/projects/${row.projectId}`}>{row.projectName}<ExternalLink className="h-3 w-3" /></Link></TableCell>
          <TableCell>{row.clientName ?? "No client"}</TableCell><TableCell><Badge variant="outline">{row.status}</Badge></TableCell>
          <TableCell className="text-right">{row.openTasks}</TableCell><TableCell className="text-right">{row.overdueTasks}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
    );
  }
  if (resource === "employees") {
    return (
      <Table>
        <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead className="text-right">Capacity</TableHead><TableHead className="text-right">Planned</TableHead><TableHead className="text-right">Logged</TableHead><TableHead className="text-right">Overdue</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map((row) => <TableRow key={row.userId}>
          <TableCell><Link className="inline-flex items-center gap-1 font-medium hover:underline" href={`/reports/employees/${row.userId}`}>{displayName(row)}<ExternalLink className="h-3 w-3" /></Link></TableCell>
          <TableCell className="text-right">{row.capacityHours}h</TableCell><TableCell className="text-right">{row.plannedHours}h</TableCell>
          <TableCell className="text-right">{row.loggedHours}h</TableCell><TableCell className="text-right">{row.overdueTasks}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
    );
  }
  if (resource === "tasks") {
    return (
      <Table>
        <TableHeader><TableRow><TableHead>Task</TableHead><TableHead>Project</TableHead><TableHead>Status</TableHead><TableHead>Due</TableHead><TableHead className="text-right">Assignees</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map((row) => <TableRow key={row.id}>
          <TableCell className="max-w-64 truncate font-medium">{row.title}</TableCell>
          <TableCell>{row.projectId ? <Link className="hover:underline" href={`/projects/${row.projectId}`}>{row.projectName}</Link> : "No project"}</TableCell>
          <TableCell><Badge variant="outline">{String(row.status).replace(/_/g, " ")}</Badge></TableCell>
          <TableCell>{formatDate(row.dueDate)}</TableCell><TableCell className="text-right">{row.assigneeCount}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
    );
  }
  return (
    <Table>
      <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Entry</TableHead><TableHead>Project</TableHead><TableHead>Employee</TableHead><TableHead className="text-right">Hours</TableHead></TableRow></TableHeader>
      <TableBody>{rows.map((row) => <TableRow key={row.id}>
        <TableCell>{formatDate(row.startTime)}</TableCell><TableCell className="max-w-64 truncate font-medium">{row.title || row.taskTitle || "Time entry"}</TableCell>
        <TableCell>{row.projectName ?? "Unallocated"}</TableCell><TableCell>{row.userName}</TableCell>
        <TableCell className="text-right">{(Number(row.durationSeconds) / 3600).toFixed(1)}h</TableCell>
      </TableRow>)}</TableBody>
    </Table>
  );
}

function displayName(row: Record<string, any>) {
  return [row.firstName, row.lastName].filter(Boolean).join(" ") || row.email;
}

function formatDate(value: unknown) {
  if (!value) return "—";
  return new Date(String(value)).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
