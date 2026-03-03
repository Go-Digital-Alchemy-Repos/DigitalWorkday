import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FolderKanban,
  MessageSquare,
  TrendingDown,
  TrendingUp,
  Activity,
  ArrowRight,
  Flame,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
import { Redirect } from "wouter";
import { ReassignmentSuggestionsCard } from "@/components/reassignment/ReassignmentSuggestionsCard";

interface PmPortfolioProject {
  projectId: string;
  name: string;
  status: string;
  color: string | null;
  clientName: string | null;
  healthScore: number;
  milestoneCompletionPct: number | null;
  burnPercent: number | null;
  isBurnRisk: boolean;
  overdueTasksCount: number;
  tasksInReviewCount: number;
  hasMilestoneOverdue: boolean;
  riskTrend: "stable" | "at_risk" | "critical";
}

interface PmPortfolioSummary {
  totalProjects: number;
  atRiskCount: number;
  burnRiskCount: number;
  avgHealthScore: number;
  totalOverdueTasks: number;
  totalTasksInReview: number;
}

interface PmPortfolioResult {
  projects: PmPortfolioProject[];
  summary: PmPortfolioSummary;
}

type SortKey = "name" | "healthScore" | "burnPercent" | "overdueTasksCount" | "riskTrend" | "milestoneCompletionPct";
type SortDir = "asc" | "desc";

function HealthBar({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-emerald-500"
      : score >= 60
      ? "bg-amber-500"
      : "bg-red-500";
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden min-w-[48px]">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-sm font-medium tabular-nums w-8 shrink-0">{score}</span>
    </div>
  );
}

function RiskBadge({ trend }: { trend: "stable" | "at_risk" | "critical" }) {
  if (trend === "critical") {
    return (
      <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800 gap-1">
        <AlertTriangle className="h-3 w-3" />
        Critical
      </Badge>
    );
  }
  if (trend === "at_risk") {
    return (
      <Badge className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800 gap-1">
        <TrendingDown className="h-3 w-3" />
        At Risk
      </Badge>
    );
  }
  return (
    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800 gap-1">
      <CheckCircle2 className="h-3 w-3" />
      Stable
    </Badge>
  );
}

function SortIcon({ sortKey, current, dir }: { sortKey: SortKey; current: SortKey; dir: SortDir }) {
  if (sortKey !== current) return <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />;
  return dir === "asc"
    ? <ChevronUp className="h-3.5 w-3.5 text-primary" />
    : <ChevronDown className="h-3.5 w-3.5 text-primary" />;
}

function SummaryCardSkeleton() {
  return (
    <Card>
      <CardContent className="pt-6">
        <Skeleton className="h-4 w-24 mb-2" />
        <Skeleton className="h-8 w-16" />
      </CardContent>
    </Card>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2 mt-4">
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

export default function PmPortfolioDashboard() {
  const { enablePmPortfolioDashboard, enableReassignmentSuggestions } = useFeatureFlags();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("healthScore");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [riskFilter, setRiskFilter] = useState<"all" | "at_risk" | "critical" | "burn">("all");

  const { data, isLoading, isError, refetch, isFetching } = useQuery<PmPortfolioResult>({
    queryKey: ["/api/reports/pm/portfolio"],
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  if (!enablePmPortfolioDashboard) {
    return <Redirect to="/" />;
  }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const projects = data?.projects ?? [];
  const summary = data?.summary;

  const filtered = projects
    .filter((p) => {
      const q = search.toLowerCase();
      if (q && !p.name.toLowerCase().includes(q) && !(p.clientName || "").toLowerCase().includes(q)) {
        return false;
      }
      if (riskFilter === "at_risk") return p.riskTrend === "at_risk";
      if (riskFilter === "critical") return p.riskTrend === "critical";
      if (riskFilter === "burn") return p.isBurnRisk;
      return true;
    })
    .sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;
      switch (sortKey) {
        case "name":
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case "healthScore":
          aVal = a.healthScore;
          bVal = b.healthScore;
          break;
        case "burnPercent":
          aVal = a.burnPercent ?? -1;
          bVal = b.burnPercent ?? -1;
          break;
        case "overdueTasksCount":
          aVal = a.overdueTasksCount;
          bVal = b.overdueTasksCount;
          break;
        case "milestoneCompletionPct":
          aVal = a.milestoneCompletionPct ?? -1;
          bVal = b.milestoneCompletionPct ?? -1;
          break;
        case "riskTrend": {
          const order = { critical: 0, at_risk: 1, stable: 2 };
          aVal = order[a.riskTrend];
          bVal = order[b.riskTrend];
          break;
        }
      }
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="border-b border-border bg-background sticky top-0 z-10 px-3 sm:px-4 lg:px-6 py-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <FolderKanban className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold" data-testid="heading-pm-portfolio">PM Portfolio</h1>
              <p className="text-xs text-muted-foreground">Projects where you are the owner</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-1.5"
            data-testid="button-refresh-portfolio"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex-1 p-3 sm:p-4 lg:p-6 space-y-6">
        {isError && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="pt-6 text-sm text-destructive">
              Failed to load portfolio data. You may not own any projects, or an error occurred.
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => <SummaryCardSkeleton key={i} />)
          ) : (
            <>
              <Card data-testid="card-total-projects">
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <FolderKanban className="h-3.5 w-3.5" />
                    Projects
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4 px-4">
                  <p className="text-2xl font-bold" data-testid="stat-total-projects">{summary?.totalProjects ?? 0}</p>
                </CardContent>
              </Card>

              <Card data-testid="card-health-score">
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5" />
                    Avg Health
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4 px-4">
                  <p
                    className={cn(
                      "text-2xl font-bold",
                      (summary?.avgHealthScore ?? 100) >= 80
                        ? "text-emerald-600 dark:text-emerald-400"
                        : (summary?.avgHealthScore ?? 100) >= 60
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-red-600 dark:text-red-400"
                    )}
                    data-testid="stat-avg-health"
                  >
                    {summary?.avgHealthScore ?? 100}
                  </p>
                </CardContent>
              </Card>

              <Card data-testid="card-at-risk">
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    At Risk
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4 px-4">
                  <p
                    className={cn("text-2xl font-bold", (summary?.atRiskCount ?? 0) > 0 && "text-amber-600 dark:text-amber-400")}
                    data-testid="stat-at-risk"
                  >
                    {summary?.atRiskCount ?? 0}
                  </p>
                </CardContent>
              </Card>

              <Card data-testid="card-burn-risk">
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Flame className="h-3.5 w-3.5" />
                    Burn Risk
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4 px-4">
                  <p
                    className={cn("text-2xl font-bold", (summary?.burnRiskCount ?? 0) > 0 && "text-orange-600 dark:text-orange-400")}
                    data-testid="stat-burn-risk"
                  >
                    {summary?.burnRiskCount ?? 0}
                  </p>
                </CardContent>
              </Card>

              <Card data-testid="card-overdue-tasks">
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Overdue Tasks
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4 px-4">
                  <p
                    className={cn("text-2xl font-bold", (summary?.totalOverdueTasks ?? 0) > 0 && "text-red-600 dark:text-red-400")}
                    data-testid="stat-overdue-tasks"
                  >
                    {summary?.totalOverdueTasks ?? 0}
                  </p>
                </CardContent>
              </Card>

              <Card data-testid="card-in-review">
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5" />
                    In Review
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4 px-4">
                  <p
                    className={cn("text-2xl font-bold", (summary?.totalTasksInReview ?? 0) > 0 && "text-violet-600 dark:text-violet-400")}
                    data-testid="stat-in-review"
                  >
                    {summary?.totalTasksInReview ?? 0}
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-sm font-semibold">Project Portfolio</CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <Input
                  placeholder="Search projects..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 w-48"
                  data-testid="input-portfolio-search"
                />
                <div className="flex items-center gap-1">
                  {(["all", "at_risk", "critical", "burn"] as const).map((f) => (
                    <Button
                      key={f}
                      variant={riskFilter === f ? "default" : "outline"}
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setRiskFilter(f)}
                      data-testid={`filter-${f}`}
                    >
                      {f === "all" ? "All" : f === "at_risk" ? "At Risk" : f === "critical" ? "Critical" : "Burn Risk"}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="px-6 pb-6">
                <TableSkeleton />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <FolderKanban className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm font-medium">No projects found</p>
                <p className="text-xs mt-1">
                  {projects.length === 0
                    ? "You are not the owner of any active projects"
                    : "No projects match your current filters"}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-portfolio">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                        <button
                          className="flex items-center gap-1 hover:text-foreground transition-colors"
                          onClick={() => handleSort("name")}
                          data-testid="sort-name"
                        >
                          Project
                          <SortIcon sortKey="name" current={sortKey} dir={sortDir} />
                        </button>
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">
                        Client
                      </th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">
                        <button
                          className="flex items-center gap-1 hover:text-foreground transition-colors"
                          onClick={() => handleSort("healthScore")}
                          data-testid="sort-health"
                        >
                          Health
                          <SortIcon sortKey="healthScore" current={sortKey} dir={sortDir} />
                        </button>
                      </th>
                      <th className="px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">
                        <button
                          className="flex items-center gap-1 hover:text-foreground transition-colors"
                          onClick={() => handleSort("milestoneCompletionPct")}
                          data-testid="sort-milestones"
                        >
                          Milestones
                          <SortIcon sortKey="milestoneCompletionPct" current={sortKey} dir={sortDir} />
                        </button>
                      </th>
                      <th className="px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">
                        <button
                          className="flex items-center gap-1 hover:text-foreground transition-colors"
                          onClick={() => handleSort("burnPercent")}
                          data-testid="sort-burn"
                        >
                          Burn %
                          <SortIcon sortKey="burnPercent" current={sortKey} dir={sortDir} />
                        </button>
                      </th>
                      <th className="px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">
                        <button
                          className="flex items-center gap-1 hover:text-foreground transition-colors"
                          onClick={() => handleSort("overdueTasksCount")}
                          data-testid="sort-overdue"
                        >
                          Overdue
                          <SortIcon sortKey="overdueTasksCount" current={sortKey} dir={sortDir} />
                        </button>
                      </th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">
                        <button
                          className="flex items-center gap-1 hover:text-foreground transition-colors"
                          onClick={() => handleSort("riskTrend")}
                          data-testid="sort-risk"
                        >
                          Risk
                          <SortIcon sortKey="riskTrend" current={sortKey} dir={sortDir} />
                        </button>
                      </th>
                      <th className="px-4 py-3 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((project) => (
                      <tr
                        key={project.projectId}
                        className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                        data-testid={`row-project-${project.projectId}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className="h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: project.color || "#3B82F6" }}
                            />
                            <span className="font-medium truncate max-w-[160px]" data-testid={`text-project-name-${project.projectId}`}>
                              {project.name}
                            </span>
                            {project.tasksInReviewCount > 0 && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 shrink-0">
                                {project.tasksInReviewCount} review
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell text-xs">
                          {project.clientName || <span className="opacity-50">—</span>}
                        </td>
                        <td className="px-4 py-3 min-w-[120px]">
                          <HealthBar score={project.healthScore} />
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          {project.milestoneCompletionPct !== null ? (
                            <div className="flex items-center gap-2 min-w-[80px]">
                              <Progress value={project.milestoneCompletionPct} className="h-1.5 flex-1" />
                              <span className="text-xs tabular-nums text-muted-foreground w-10 text-right">
                                {project.milestoneCompletionPct}%
                              </span>
                              {project.hasMilestoneOverdue && (
                                <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground opacity-50">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          {project.burnPercent !== null ? (
                            <div className="flex items-center gap-1.5">
                              <span
                                className={cn(
                                  "text-sm font-medium tabular-nums",
                                  project.isBurnRisk
                                    ? "text-red-600 dark:text-red-400"
                                    : project.burnPercent >= 60
                                    ? "text-amber-600 dark:text-amber-400"
                                    : "text-foreground"
                                )}
                                data-testid={`text-burn-${project.projectId}`}
                              >
                                {project.burnPercent}%
                              </span>
                              {project.isBurnRisk && (
                                <Flame className="h-3.5 w-3.5 text-red-500 shrink-0" />
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground opacity-50">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          {project.overdueTasksCount > 0 ? (
                            <span
                              className="text-sm font-medium text-red-600 dark:text-red-400 tabular-nums"
                              data-testid={`text-overdue-${project.projectId}`}
                            >
                              {project.overdueTasksCount}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground opacity-50">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <RiskBadge trend={project.riskTrend} />
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/projects/${project.projectId}`}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              data-testid={`link-project-${project.projectId}`}
                            >
                              <ArrowRight className="h-4 w-4" />
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {enableReassignmentSuggestions && (
          <ReassignmentSuggestionsCard limit={5} />
        )}

        {!isLoading && summary && summary.atRiskCount > 0 && (
          <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                Needs Attention
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {projects
                .filter((p) => p.riskTrend !== "stable")
                .slice(0, 3)
                .map((p) => (
                  <Link key={p.projectId} href={`/projects/${p.projectId}`}>
                    <div
                      className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-md hover:bg-amber-100/70 dark:hover:bg-amber-900/20 transition-colors cursor-pointer"
                      data-testid={`attention-project-${p.projectId}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: p.color || "#3B82F6" }} />
                        <span className="text-sm font-medium truncate">{p.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {p.overdueTasksCount > 0 && (
                          <span className="text-xs text-muted-foreground">{p.overdueTasksCount} overdue</span>
                        )}
                        {p.isBurnRisk && <Flame className="h-3.5 w-3.5 text-red-500" />}
                        {p.hasMilestoneOverdue && <Clock className="h-3.5 w-3.5 text-amber-500" />}
                        {p.tasksInReviewCount > 0 && <MessageSquare className="h-3.5 w-3.5 text-violet-500" />}
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    </div>
                  </Link>
                ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
