import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, Clock, ListChecks, Target, UsersRound, ListTodo } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { hasProjectManagerDashboardAccess } from "@shared/roles";
import { fetchReport as fetch } from "./report-fetch";

interface ProjectWorkSummary {
  totals: {
    rangeHours: number;
    lifetimeHours: number;
    completionPercent: number;
    openTasks: number;
    overdueTasks: number;
    estimatedTotalHours: number;
    budgetHours: number;
    budgetVarianceHours: number | null;
  };
  contributors: Array<{ userId: string }>;
}

export function ProjectWorkSummaryStrip({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const canView = hasProjectManagerDashboardAccess(user?.role);
  const { data } = useQuery<ProjectWorkSummary>({
    queryKey: ["/api/reports/v2/projects", projectId, "work-summary", "30d"],
    queryFn: async () => {
      const response = await fetch(`/api/reports/v2/projects/${projectId}/work-summary?range=30d`);
      if (!response.ok) throw new Error("Failed to load project work summary");
      return response.json();
    },
    enabled: canView && Boolean(projectId),
    staleTime: 60_000,
  });

  if (!canView || !data) return null;
  const metrics = [
    { label: "30-day hours", value: `${data.totals.rangeHours.toFixed(1)}h`, icon: Clock, explore: "time" },
    { label: "Lifetime hours", value: `${data.totals.lifetimeHours.toFixed(1)}h`, icon: Target, explore: "time" },
    { label: "Progress", value: `${data.totals.completionPercent}%`, icon: ListChecks, explore: "tasks" },
    { label: "Open tasks", value: String(data.totals.openTasks), icon: ListTodo, explore: "open" },
    { label: "Overdue", value: String(data.totals.overdueTasks), icon: AlertTriangle, explore: "overdue" },
    { label: "Contributors", value: String(data.contributors.length), icon: UsersRound, explore: "contributors" },
  ];

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden border-y border-border/70 bg-border/70 sm:grid-cols-3 xl:grid-cols-6" data-testid="project-work-summary-strip">
      {metrics.map(({ label, value, icon: Icon, explore }) => (
        <Link key={label} href={explore === "contributors" ? `/reports?view=people&projectId=${projectId}` : `/reports?view=delivery&projectId=${projectId}&explore=${explore}`} className="flex min-w-0 items-center gap-3 bg-background px-4 py-3 transition-colors hover:bg-muted/50 lg:px-6">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">{label}</p>
            <p className="text-sm font-semibold">{value}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
