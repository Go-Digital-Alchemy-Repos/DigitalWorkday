import { useState, lazy, Suspense } from "react";
import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  BarChart3, 
  Clock, 
  Users, 
  ArrowLeft,
  FileText,
  MessageSquare,
  Building2,
} from "lucide-react";
import { MobileTabSelect } from "@/components/reports/mobile-tab-select";
import { cn } from "@/lib/utils";

const ProjectCommandCenter = lazy(() => import("@/components/reports/project-command-center").then(m => ({ default: m.ProjectCommandCenter })));
const MessagesReports = lazy(() => import("@/components/reports/messages-reports").then(m => ({ default: m.MessagesReports })));
const EmployeeCommandCenter = lazy(() => import("@/components/reports/employee-command-center").then(m => ({ default: m.EmployeeCommandCenter })));
const ClientCommandCenter = lazy(() => import("@/components/reports/client-command-center").then(m => ({ default: m.ClientCommandCenter })));
const TimeWorkloadCommandCenter = lazy(() => import("@/components/reports/time-workload-command-center").then(m => ({ default: m.TimeWorkloadCommandCenter })));

type ReportView = "landing" | "time-workload-cc" | "project-cc" | "messages" | "employee-cc" | "client-cc";

const REPORT_TABS: Array<{ view: Exclude<ReportView, "landing">; label: string; Icon: React.ElementType; flag?: keyof import("@/hooks/use-feature-flags").FeatureFlags }> = [
  { view: "project-cc",        label: "Project Command Center",         Icon: BarChart3 },
  { view: "employee-cc",       label: "Employee Command Center",        Icon: Users,         flag: "enableEmployeeCommandCenter" },
  { view: "client-cc",         label: "Client Command Center",          Icon: Building2,     flag: "enableClientCommandCenter" },
  { view: "time-workload-cc",  label: "Time & Workload Command Center", Icon: Clock },
  { view: "messages",          label: "Messages",                       Icon: MessageSquare },
];


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


export default function ReportsPage() {
  const { user, isLoading } = useAuth();
  const [currentView, setCurrentView] = useState<ReportView>("landing");
  const flags = useFeatureFlags();

  const canAccessReports = 
    user?.role === "super_user" || 
    user?.role === "tenant_owner" || 
    (user?.role === "admin" && (user as any)?.isProjectManager === true);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!canAccessReports) {
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
      icon: <BarChart3 className="h-6 w-6 text-white" />,
      title: "Project Command Center",
      description: "Complete project health: progress, tasks, time, milestones and risk scoring",
      view: "project-cc" as ReportView,
      color: "bg-indigo-600",
    },
    {
      icon: <Clock className="h-6 w-6 text-white" />,
      title: "Time & Workload Command Center",
      description: "Unified time tracking, workload distribution, capacity planning and risk analysis across your team",
      view: "time-workload-cc" as ReportView,
      color: "bg-teal-600",
    },
    {
      icon: <MessageSquare className="h-6 w-6 text-white" />,
      title: "Messages",
      description: "Response times, resolution rates, overdue threads, and conversation volume by client",
      view: "messages" as ReportView,
      color: "bg-amber-500",
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
      case "employee-cc":      return "Employee Command Center";
      case "client-cc":        return "Client Command Center";
      case "project-cc":       return "Project Command Center";
      case "time-workload-cc": return "Time & Workload Command Center";
      case "messages":         return "Messages Reports";
      default:                 return "Reports";
    }
  };

  const getViewDescription = () => {
    switch (currentView) {
      case "employee-cc":      return "Workload, time, capacity, risk and trend analysis per employee";
      case "client-cc":        return "Client engagement, time, task load, SLA and risk analysis per client";
      case "project-cc":       return "Project health, task metrics, time distribution, and risk scoring";
      case "time-workload-cc": return "Unified time tracking, workload distribution, capacity planning and risk analysis";
      case "messages":         return "Response times, SLA compliance, and conversation analytics";
      default:                 return "Detailed analytics and exportable reports";
    }
  };

  const getViewIcon = () => {
    switch (currentView) {
      case "employee-cc":      return <Users className="h-5 w-5 text-primary" />;
      case "client-cc":        return <Building2 className="h-5 w-5 text-primary" />;
      case "project-cc":       return <BarChart3 className="h-5 w-5 text-primary" />;
      case "time-workload-cc": return <Clock className="h-5 w-5 text-primary" />;
      case "messages":         return <MessageSquare className="h-5 w-5 text-primary" />;
      default:                 return <BarChart3 className="h-5 w-5 text-primary" />;
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
          ) : currentView === "project-cc" ? (
            <ProjectCommandCenter />
          ) : currentView === "time-workload-cc" ? (
            <TimeWorkloadCommandCenter />
          ) : currentView === "messages" ? (
            <MessagesReports />
          ) : null}
        </Suspense>
      </div>
    </ScrollArea>
  );
}
