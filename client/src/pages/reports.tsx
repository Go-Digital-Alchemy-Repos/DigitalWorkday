import { useState, lazy, Suspense, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { Redirect } from "wouter";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
import { WorkloadReportsV2 } from "@/components/reports/workload-reports-v2";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  BarChart3, 
  Clock, 
  Users, 
  TrendingUp, 
  ArrowLeft,
  FileText,
  Calendar,
  Target,
  MessageSquare,
  Building2,
  FolderKanban,
  LayoutDashboard,
  CheckSquare,
  PieChart,
} from "lucide-react";
import { ReportsTab } from "@/components/settings/reports-tab";
import { MobileTabSelect } from "@/components/reports/mobile-tab-select";
import { CLIENT_STAGES_ORDERED, CLIENT_STAGE_LABELS, type ClientStageType } from "@shared/schema";
import { cn } from "@/lib/utils";

const MessagesReports = lazy(() => import("@/components/reports/messages-reports"));
const OverviewDashboard = lazy(() => import("@/components/reports/overview-dashboard"));
const TaskAnalytics = lazy(() => import("@/components/reports/task-analytics"));
const ClientAnalytics = lazy(() => import("@/components/reports/client-analytics"));
const EmployeeCommandCenter = lazy(() => import("@/components/reports/employee-command-center").then(m => ({ default: m.EmployeeCommandCenter })));
const ClientCommandCenter = lazy(() => import("@/components/reports/client-command-center").then(m => ({ default: m.ClientCommandCenter })));

type ReportView = "landing" | "overview" | "workload" | "time" | "projects" | "messages" | "pipeline" | "task-analytics" | "client-analytics" | "employee-cc" | "client-cc";

const REPORT_TABS: Array<{ view: Exclude<ReportView, "landing">; label: string; Icon: React.ElementType; flag?: keyof import("@/hooks/use-feature-flags").FeatureFlags }> = [
  { view: "employee-cc",     label: "Employee Command Center", Icon: Users,          flag: "enableEmployeeCommandCenter" },
  { view: "client-cc",       label: "Client Command Center",   Icon: Building2,      flag: "enableClientCommandCenter" },
  { view: "overview",        label: "Overview",                Icon: LayoutDashboard },
  { view: "task-analytics",  label: "Task Analysis",           Icon: CheckSquare },
  { view: "client-analytics",label: "Client Analytics",        Icon: PieChart },
  { view: "workload",        label: "Workload Reports",        Icon: Users },
  { view: "time",            label: "Time Tracking",           Icon: Clock },
  { view: "projects",        label: "Project Analysis",        Icon: Target },
  { view: "messages",        label: "Messages",                Icon: MessageSquare },
  { view: "pipeline",        label: "Client Pipeline",         Icon: Building2 },
];

interface StageSummaryItem {
  stage: string;
  clientCount: number;
  projectCount: number;
}

const STAGE_COLORS: Record<string, string> = {
  lead: "bg-slate-500",
  proposal: "bg-blue-500",
  content_strategy: "bg-indigo-500",
  design: "bg-violet-500",
  development: "bg-amber-500",
  final_testing: "bg-orange-500",
  active_maintenance: "bg-green-500",
};

const STAGE_TEXT_COLORS: Record<string, string> = {
  lead: "text-slate-600 dark:text-slate-400",
  proposal: "text-blue-600 dark:text-blue-400",
  content_strategy: "text-indigo-600 dark:text-indigo-400",
  design: "text-violet-600 dark:text-violet-400",
  development: "text-amber-600 dark:text-amber-400",
  final_testing: "text-orange-600 dark:text-orange-400",
  active_maintenance: "text-green-600 dark:text-green-400",
};

interface ReportCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  color: string;
}

function ReportCard({ icon, title, description, onClick, color }: ReportCardProps) {
  return (
    <Card 
      className="cursor-pointer hover-elevate active-elevate-2 transition-all"
      onClick={onClick}
      data-testid={`card-report-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <CardHeader className="pb-2">
        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${color}`}>
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <CardTitle className="text-lg mb-1">{title}</CardTitle>
        <CardDescription className="text-sm">
          {description}
        </CardDescription>
      </CardContent>
    </Card>
  );
}

function PipelineReport() {
  const { data: stageSummary, isLoading } = useQuery<StageSummaryItem[]>({
    queryKey: ["/api/v1/clients/stages/summary"],
  });

  const totalClients = useMemo(() => {
    if (!stageSummary) return 0;
    return stageSummary.reduce((sum, s) => sum + s.clientCount, 0);
  }, [stageSummary]);

  const totalProjects = useMemo(() => {
    if (!stageSummary) return 0;
    return stageSummary.reduce((sum, s) => sum + s.projectCount, 0);
  }, [stageSummary]);

  const stageMap = useMemo(() => {
    const map: Record<string, StageSummaryItem> = {};
    if (stageSummary) {
      stageSummary.forEach((s) => { map[s.stage] = s; });
    }
    return map;
  }, [stageSummary]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-3 w-20 mb-2" />
                <Skeleton className="h-7 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-48 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="pipeline-report">
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card data-testid="metric-total-clients">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Clients</p>
            <p className="text-2xl font-semibold">{totalClients}</p>
          </CardContent>
        </Card>
        <Card data-testid="metric-total-projects">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Projects</p>
            <p className="text-2xl font-semibold">{totalProjects}</p>
          </CardContent>
        </Card>
        <Card data-testid="metric-stages-used">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Active Stages</p>
            <p className="text-2xl font-semibold">
              {stageSummary?.filter(s => s.clientCount > 0).length || 0}
              <span className="text-sm text-muted-foreground font-normal"> / {CLIENT_STAGES_ORDERED.length}</span>
            </p>
          </CardContent>
        </Card>
        <Card data-testid="metric-avg-per-stage">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Avg Clients/Stage</p>
            <p className="text-2xl font-semibold">
              {totalClients > 0 ? (totalClients / CLIENT_STAGES_ORDERED.length).toFixed(1) : 0}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Pipeline Distribution</CardTitle>
          <CardDescription>Visual breakdown of clients across pipeline stages</CardDescription>
        </CardHeader>
        <CardContent>
          {(() => {
            const activeStages = CLIENT_STAGES_ORDERED.filter(s => (stageMap[s]?.clientCount || 0) > 0);
            return (
              <div className="flex h-4 rounded-full overflow-hidden bg-muted mb-6">
                {activeStages.map((stage) => {
                  const count = stageMap[stage]?.clientCount || 0;
                  const pct = totalClients > 0 ? (count / totalClients) * 100 : 0;
                  return (
                    <div
                      key={stage}
                      className={cn(STAGE_COLORS[stage], "transition-all duration-300")}
                      style={{ width: `${pct}%`, minWidth: activeStages.length > 1 ? "4px" : undefined }}
                      title={`${CLIENT_STAGE_LABELS[stage]}: ${count} (${pct.toFixed(1)}%)`}
                      data-testid={`report-pipeline-segment-${stage}`}
                    />
                  );
                })}
              </div>
            );
          })()}

          <div className="space-y-3">
            {CLIENT_STAGES_ORDERED.map((stage) => {
              const data = stageMap[stage];
              const count = data?.clientCount || 0;
              const projects = data?.projectCount || 0;
              const pct = totalClients > 0 ? (count / totalClients) * 100 : 0;

              return (
                <div key={stage} className="flex items-center gap-3 flex-wrap" data-testid={`report-stage-row-${stage}`}>
                  <span className={cn("h-3 w-3 rounded-full shrink-0", STAGE_COLORS[stage])} />
                  <span className="text-sm font-medium w-40 shrink-0">{CLIENT_STAGE_LABELS[stage]}</span>

                  <div className="flex-1 min-w-[120px] h-6 bg-muted rounded-md overflow-hidden relative">
                    {pct > 0 && (
                      <div
                        className={cn(STAGE_COLORS[stage], "h-full rounded-md transition-all duration-500 opacity-80")}
                        style={{ width: `${pct}%` }}
                      />
                    )}
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-foreground">
                      {count} client{count !== 1 ? "s" : ""} ({pct.toFixed(0)}%)
                    </span>
                  </div>

                  <div className="flex items-center gap-1 text-xs text-muted-foreground w-24 shrink-0 justify-end">
                    <FolderKanban className="h-3 w-3" />
                    <span>{projects} project{projects !== 1 ? "s" : ""}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Stage Details</CardTitle>
            <CardDescription>Clients and projects per stage</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {CLIENT_STAGES_ORDERED.map((stage) => {
                const data = stageMap[stage];
                const count = data?.clientCount || 0;
                const projects = data?.projectCount || 0;

                return (
                  <div key={stage} className="flex items-center justify-between gap-2 py-2 border-b last:border-b-0" data-testid={`report-stage-detail-${stage}`}>
                    <div className="flex items-center gap-2">
                      <span className={cn("h-2 w-2 rounded-full", STAGE_COLORS[stage])} />
                      <span className="text-sm">{CLIENT_STAGE_LABELS[stage]}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className={cn("text-xs", STAGE_TEXT_COLORS[stage])}>
                        {count} client{count !== 1 ? "s" : ""}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{projects} proj.</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pipeline Health</CardTitle>
            <CardDescription>Distribution insights</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {(() => {
                const earlyStages = ["lead", "proposal"];
                const midStages = ["content_strategy", "design", "development"];
                const lateStages = ["final_testing", "active_maintenance"];

                const earlyCount = earlyStages.reduce((sum, s) => sum + (stageMap[s]?.clientCount || 0), 0);
                const midCount = midStages.reduce((sum, s) => sum + (stageMap[s]?.clientCount || 0), 0);
                const lateCount = lateStages.reduce((sum, s) => sum + (stageMap[s]?.clientCount || 0), 0);

                const groups = [
                  { label: "Early Pipeline", description: "Lead & Proposal", count: earlyCount, color: "text-blue-600 dark:text-blue-400" },
                  { label: "Mid Pipeline", description: "Strategy, Design & Development", count: midCount, color: "text-violet-600 dark:text-violet-400" },
                  { label: "Late Pipeline", description: "Testing & Maintenance", count: lateCount, color: "text-green-600 dark:text-green-400" },
                ];

                return groups.map((group) => (
                  <div key={group.label} className="flex items-center justify-between gap-3" data-testid={`report-pipeline-health-${group.label.toLowerCase().replace(/\s+/g, '-')}`}>
                    <div>
                      <p className="font-medium">{group.label}</p>
                      <p className="text-xs text-muted-foreground">{group.description}</p>
                    </div>
                    <div className="text-right">
                      <p className={cn("text-lg font-semibold", group.color)}>{group.count}</p>
                      <p className="text-xs text-muted-foreground">
                        {totalClients > 0 ? `${((group.count / totalClients) * 100).toFixed(0)}%` : "0%"}
                      </p>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const { user, isLoading } = useAuth();
  const [currentView, setCurrentView] = useState<ReportView>("landing");
  const flags = useFeatureFlags();

  const isAdmin = user?.role === "admin";
  const isSuperUser = user?.role === "super_user";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAdmin && !isSuperUser) {
    return <Redirect to="/" />;
  }

  const reportCategories = [
    ...(flags.enableEmployeeCommandCenter ? [{
      icon: <Users className="h-6 w-6 text-white" />,
      title: "Employee Command Center",
      description: "Comprehensive workload, time, capacity, risk and trend analysis per employee",
      view: "employee-cc" as ReportView,
      color: "bg-blue-600",
    }] : []),
    ...(flags.enableClientCommandCenter ? [{
      icon: <Building2 className="h-6 w-6 text-white" />,
      title: "Client Command Center",
      description: "Client engagement, time, task load, SLA and risk analysis per client",
      view: "client-cc" as ReportView,
      color: "bg-violet-600",
    }] : []),
    {
      icon: <LayoutDashboard className="h-6 w-6 text-white" />,
      title: "Overview",
      description: "Executive dashboard with KPIs across tasks, projects, time, clients, and tickets",
      view: "overview" as ReportView,
      color: "bg-slate-700",
    },
    {
      icon: <CheckSquare className="h-6 w-6 text-white" />,
      title: "Task Analytics",
      description: "Completion rates, overdue analysis, priority & status distribution, assignee workload",
      view: "task-analytics" as ReportView,
      color: "bg-emerald-500",
    },
    {
      icon: <PieChart className="h-6 w-6 text-white" />,
      title: "Client Analytics",
      description: "Client profitability, budget utilization, project metrics, and activity breakdown",
      view: "client-analytics" as ReportView,
      color: "bg-rose-500",
    },
    {
      icon: <Users className="h-6 w-6 text-white" />,
      title: "Workload Reports",
      description: "View task distribution and workload across your team members with completion metrics",
      view: "workload" as ReportView,
      color: "bg-blue-500",
    },
    {
      icon: <Clock className="h-6 w-6 text-white" />,
      title: "Time Tracking",
      description: "Analyze time entries by project, employee, and date range with detailed breakdowns",
      view: "time" as ReportView,
      color: "bg-green-500",
    },
    {
      icon: <Target className="h-6 w-6 text-white" />,
      title: "Project Analytics",
      description: "Project progress, budget utilization, and milestone tracking across all projects",
      view: "projects" as ReportView,
      color: "bg-purple-500",
    },
    {
      icon: <MessageSquare className="h-6 w-6 text-white" />,
      title: "Messages",
      description: "Response times, resolution rates, overdue threads, and conversation volume by client",
      view: "messages" as ReportView,
      color: "bg-amber-500",
    },
    {
      icon: <Building2 className="h-6 w-6 text-white" />,
      title: "Client Pipeline",
      description: "Stage breakdown, pipeline distribution, and client progression through your workflow stages",
      view: "pipeline" as ReportView,
      color: "bg-indigo-500",
    },
  ];

  if (currentView === "landing") {
    return (
      <ScrollArea className="h-full">
        <div className="container max-w-7xl p-3 sm:p-6">
          <div className="flex items-center gap-3 mb-4 sm:mb-6">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <BarChart3 className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">Reports & Analytics</h1>
              <p className="text-muted-foreground text-xs sm:text-sm">
                Comprehensive insights into time tracking, workload, and project performance
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 mb-6 sm:mb-8">
            {reportCategories.map((category) => (
              <ReportCard
                key={category.title}
                icon={category.icon}
                title={category.title}
                description={category.description}
                onClick={() => setCurrentView(category.view)}
                color={category.color}
              />
            ))}
          </div>

          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Quick Stats
              </CardTitle>
              <CardDescription>
                Overview of your organization's key metrics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">
                Select a report category above to view detailed analytics and export options.
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    );
  }

  const getViewTitle = () => {
    switch (currentView) {
      case "employee-cc": return "Employee Command Center";
      case "client-cc": return "Client Command Center";
      case "overview": return "Overview Dashboard";
      case "task-analytics": return "Task Analytics";
      case "client-analytics": return "Client Analytics";
      case "workload": return "Workload Reports";
      case "time": return "Time Tracking Reports";
      case "projects": return "Project Analytics";
      case "messages": return "Messages Reports";
      case "pipeline": return "Client Pipeline";
      default: return "Reports";
    }
  };

  const getViewDescription = () => {
    switch (currentView) {
      case "employee-cc": return "Workload, time, capacity, risk and trend analysis per employee";
      case "client-cc": return "Client engagement, time, task load, SLA and risk analysis per client";
      case "overview": return "Executive KPIs and trends across your entire organization";
      case "task-analytics": return "Task completion rates, overdue analysis, and distribution metrics";
      case "client-analytics": return "Client profitability, budget utilization, and activity breakdown";
      case "messages": return "Response times, SLA compliance, and conversation analytics";
      case "pipeline": return "Pipeline stage distribution and client progression";
      default: return "Detailed analytics and exportable reports";
    }
  };

  const getViewIcon = () => {
    switch (currentView) {
      case "employee-cc": return <Users className="h-5 w-5 text-primary" />;
      case "client-cc": return <Building2 className="h-5 w-5 text-primary" />;
      case "overview": return <LayoutDashboard className="h-5 w-5 text-primary" />;
      case "task-analytics": return <CheckSquare className="h-5 w-5 text-primary" />;
      case "client-analytics": return <PieChart className="h-5 w-5 text-primary" />;
      case "messages": return <MessageSquare className="h-5 w-5 text-primary" />;
      case "pipeline": return <Building2 className="h-5 w-5 text-primary" />;
      default: return <BarChart3 className="h-5 w-5 text-primary" />;
    }
  };

  return (
    <ScrollArea className="h-full">
      <div className="container max-w-7xl p-3 sm:p-4 lg:p-6">
        <div className="mb-4 sm:mb-6">
          <div className="flex items-center gap-2 mb-2 sm:mb-3">
            <button
              onClick={() => setCurrentView("landing")}
              data-testid="button-back-to-reports"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors min-h-[44px] sm:min-h-0"
            >
              <ArrowLeft className="h-3 w-3" />
              All Reports
            </button>
          </div>
          <div className="flex items-center gap-3 mb-3 sm:mb-4">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              {getViewIcon()}
            </div>
            <div>
              <h1 className="text-xl font-bold leading-tight">{getViewTitle()}</h1>
              <p className="text-muted-foreground text-xs">{getViewDescription()}</p>
            </div>
          </div>
          <MobileTabSelect
            tabs={REPORT_TABS.filter(tab => !tab.flag || flags[tab.flag]).map(tab => ({
              value: tab.view,
              label: tab.label,
            }))}
            value={currentView}
            onValueChange={(v) => setCurrentView(v as ReportView)}
          />
          <div className="hidden md:flex items-center border-b overflow-x-auto">
            {REPORT_TABS.filter(tab => !tab.flag || flags[tab.flag]).map((tab) => {
              const isActive = currentView === tab.view;
              return (
                <button
                  key={tab.view}
                  onClick={() => setCurrentView(tab.view)}
                  data-testid={`tab-report-${tab.view}`}
                  className={cn(
                    "flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors shrink-0",
                    isActive
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40"
                  )}
                >
                  <tab.Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <Suspense
          fallback={
            <div className="space-y-4">
              <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <Skeleton className="h-3 w-20 mb-2" />
                      <Skeleton className="h-7 w-16" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          }
        >
          {currentView === "employee-cc" && flags.enableEmployeeCommandCenter ? (
            <EmployeeCommandCenter />
          ) : currentView === "client-cc" && flags.enableClientCommandCenter ? (
            <ClientCommandCenter />
          ) : currentView === "overview" ? (
            <OverviewDashboard />
          ) : currentView === "task-analytics" ? (
            <TaskAnalytics />
          ) : currentView === "client-analytics" ? (
            <ClientAnalytics />
          ) : currentView === "messages" ? (
            <MessagesReports />
          ) : currentView === "pipeline" ? (
            <PipelineReport />
          ) : currentView === "workload" && flags?.reportWorkloadV2 ? (
            <WorkloadReportsV2 />
          ) : (
            <ReportsTab defaultTab={currentView === "workload" ? "workload" : currentView === "time" ? "time" : undefined} />
          )}
        </Suspense>
      </div>
    </ScrollArea>
  );
}
