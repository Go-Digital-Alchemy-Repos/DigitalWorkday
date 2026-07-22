import { lazy, Suspense, useState } from "react";
import { Redirect } from "wouter";
import { BarChart3, Building2, FolderKanban, LayoutDashboard, UsersRound } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { hasTenantAdminAccess } from "@shared/roles";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MobileTabSelect } from "@/components/reports/mobile-tab-select";
import { Skeleton } from "@/components/ui/skeleton";
import { SavedReportViews } from "@/components/reports/saved-report-views";

const ReportsHomeV3 = lazy(() => import("@/components/reports/reports-home-v3"));
const DeliveryOperations = lazy(() => import("@/components/reports/delivery-operations"));
const PeopleCapacity = lazy(() => import("@/components/reports/people-capacity"));
const ClientAnalytics = lazy(() => import("@/components/reports/client-analytics"));

type ReportWorkspace = "home" | "delivery" | "people" | "clients";

const WORKSPACES: Array<{ value: ReportWorkspace; label: string; description: string; Icon: typeof LayoutDashboard }> = [
  { value: "home", label: "Overview", description: "Exceptions and reporting confidence", Icon: LayoutDashboard },
  { value: "delivery", label: "Delivery Operations", description: "Projects, tasks, flow, and time", Icon: FolderKanban },
  { value: "people", label: "People & Capacity", description: "Workload, ownership, and capacity", Icon: UsersRound },
  { value: "clients", label: "Clients & Portfolio", description: "Client investment and delivery health", Icon: Building2 },
];

export function reportWorkspaceFromValue(value: string | null): ReportWorkspace {
  if (value === "delivery" || value === "task-analytics" || value === "time") return "delivery";
  if (value === "people" || value === "employee-cc" || value === "workload") return "people";
  if (value === "clients" || value === "client-cc" || value === "client-analytics" || value === "pipeline") return "clients";
  return "home";
}

function initialWorkspace(): ReportWorkspace {
  if (typeof window === "undefined") return "home";
  const value = new URLSearchParams(window.location.search).get("view");
  return reportWorkspaceFromValue(value);
}

export default function ReportsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { user, isLoading } = useAuth();
  const [workspace, setWorkspace] = useState<ReportWorkspace>(initialWorkspace);

  if (isLoading) return <div className="flex h-full items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  if (!hasTenantAdminAccess(user?.role)) return <Redirect to="/" />;

  const active = WORKSPACES.find((item) => item.value === workspace) ?? WORKSPACES[0];
  const changeWorkspace = (value: ReportWorkspace) => {
    setWorkspace(value);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (value === "home") url.searchParams.delete("view"); else url.searchParams.set("view", value);
      url.searchParams.delete("explore");
      url.searchParams.delete("projectId");
      window.history.replaceState({}, "", `${url.pathname}${url.search}`);
    }
  };

  return (
    <div className={embedded ? "space-y-4" : "flex h-full min-h-0 flex-col"} data-testid="reports-page">
      <div className={embedded ? "space-y-4" : "border-b bg-background px-4 py-4 sm:px-6"}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-primary" /><h1 className="text-xl font-semibold">{active.label}</h1></div>
            <p className="mt-1 text-sm text-muted-foreground">{active.description}</p>
          </div>
          <div className="flex items-center gap-2 md:hidden">
            <div className="min-w-0 flex-1"><MobileTabSelect tabs={WORKSPACES.map((item) => ({ value: item.value, label: item.label }))} value={workspace} onValueChange={(value) => changeWorkspace(value as ReportWorkspace)} /></div>
            <SavedReportViews workspace={workspace} />
          </div>
          <div className="hidden items-center gap-2 md:flex"><SavedReportViews workspace={workspace} /><Tabs value={workspace} onValueChange={(value) => changeWorkspace(value as ReportWorkspace)}><TabsList className="h-9 bg-muted/60">{WORKSPACES.map(({ value, label, Icon }) => <TabsTrigger key={value} value={value} className="gap-1.5 px-3"><Icon className="h-3.5 w-3.5" />{label}</TabsTrigger>)}</TabsList></Tabs></div>
        </div>
      </div>

      <div className={embedded ? "min-w-0" : "min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-6"}>
        <div className="mx-auto w-full max-w-[1600px]">
          <Suspense fallback={<ReportLoading />}>
            {workspace === "home" ? <ReportsHomeV3 onNavigate={changeWorkspace} /> : null}
            {workspace === "delivery" ? <DeliveryOperations /> : null}
            {workspace === "people" ? <PeopleCapacity /> : null}
            {workspace === "clients" ? <ClientAnalytics /> : null}
          </Suspense>
        </div>
      </div>
    </div>
  );
}

function ReportLoading() { return <div className="space-y-4"><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24" />)}</div><Skeleton className="h-80" /></div>; }
