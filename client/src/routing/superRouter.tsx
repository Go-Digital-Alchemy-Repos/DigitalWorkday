import { lazy, Suspense, useEffect, useState } from "react";
import { Switch, Route, Redirect } from "wouter";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { SuperSidebar } from "@/components/super-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { NotificationCenter } from "@/components/notification-center";
import { ErrorBoundary } from "@/components/error-boundary";
import { SuperRouteGuard } from "./guards";
import { SkipLink } from "@/components/skip-link";
import { PageSkeleton } from "@/components/skeletons/page-skeleton";
import { trackChunkLoad } from "@/lib/perf";
import { TaskDrawerProvider } from "@/lib/task-drawer-context";
import { ReportContextProvider } from "@/contexts/report-context";
import { setActingTenantId } from "@/lib/queryClient";

const SuperAdminPage = lazy(trackChunkLoad("SuperAdmin", () => import("@/pages/super-admin")));
const SuperAdminDashboardPage = lazy(trackChunkLoad("SuperDashboard", () => import("@/pages/super-admin-dashboard")));
const SuperAdminReportsPage = lazy(trackChunkLoad("SuperReports", () => import("@/pages/super-admin-reports")));
const SuperAdminSettingsPage = lazy(trackChunkLoad("SuperSettings", () => import("@/pages/super-admin-settings")));
const SuperAdminStatusPage = lazy(trackChunkLoad("SuperStatus", () => import("@/pages/super-admin-status")));
const SuperAdminDocsPage = lazy(trackChunkLoad("SuperDocs", () => import("@/pages/super-admin-docs")));
const SuperAdminDocsCoveragePage = lazy(trackChunkLoad("SuperDocsCoverage", () => import("@/pages/super-admin-docs-coverage")));
const SuperChatMonitoringPage = lazy(trackChunkLoad("SuperChat", () => import("@/pages/super-chat-monitoring")));
const SuperAdminUsersPage = lazy(trackChunkLoad("SuperUsers", () => import("@/pages/super-admin-users")));
const SuperAdminRetentionPage = lazy(trackChunkLoad("SuperRetention", () => import("@/pages/super-admin-retention")));
const UserProfilePage = lazy(trackChunkLoad("SuperProfile", () => import("@/pages/user-profile")));
const EmployeeProfileReportPage = lazy(trackChunkLoad("SuperEmployeeReport", () => import("@/pages/employee-profile-report")));
const ClientProfileReportPage = lazy(trackChunkLoad("SuperClientReport", () => import("@/pages/client-profile-report")));

const SUPER_REPORTS_TENANT_KEY = "superReports_tenantId";

function SuperReportDrilldownRoute({ component: Component }: { component: React.ComponentType }) {
  const [selectedTenantId] = useState(() => {
    const tenantId = sessionStorage.getItem(SUPER_REPORTS_TENANT_KEY);
    if (tenantId) {
      setActingTenantId(tenantId);
    }
    return tenantId;
  });

  useEffect(() => {
    if (selectedTenantId) {
      setActingTenantId(selectedTenantId);
    }
  }, [selectedTenantId]);

  return (
    <ReportContextProvider isSuperAdmin>
      <TaskDrawerProvider>
        <Component />
      </TaskDrawerProvider>
    </ReportContextProvider>
  );
}

function SuperEmployeeReportRoute() {
  return <SuperReportDrilldownRoute component={EmployeeProfileReportPage} />;
}

function SuperClientReportRoute() {
  return <SuperReportDrilldownRoute component={ClientProfileReportPage} />;
}

function SuperAdminRouter() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Switch>
        <Route path="/super-admin/dashboard">
          {() => <SuperRouteGuard component={SuperAdminDashboardPage} />}
        </Route>
        <Route path="/super-admin/profile">
          {() => <SuperRouteGuard component={UserProfilePage} />}
        </Route>
        <Route path="/super-admin/tenants">
          {() => <SuperRouteGuard component={SuperAdminPage} />}
        </Route>
        <Route path="/super-admin/reports/employees/:employeeId">
          {() => <SuperRouteGuard component={SuperEmployeeReportRoute} />}
        </Route>
        <Route path="/super-admin/reports/clients/:clientId">
          {() => <SuperRouteGuard component={SuperClientReportRoute} />}
        </Route>
        <Route path="/super-admin/reports">
          {() => <SuperRouteGuard component={SuperAdminReportsPage} />}
        </Route>
        <Route path="/super-admin/settings">
          {() => <SuperRouteGuard component={SuperAdminSettingsPage} />}
        </Route>
        <Route path="/super-admin/retention">
          {() => <SuperRouteGuard component={SuperAdminRetentionPage} />}
        </Route>
        <Route path="/super-admin/status">
          {() => <SuperRouteGuard component={SuperAdminStatusPage} />}
        </Route>
        <Route path="/super-admin/docs">
          {() => <SuperRouteGuard component={SuperAdminDocsPage} />}
        </Route>
        <Route path="/super-admin/docs-coverage">
          {() => <SuperRouteGuard component={SuperAdminDocsCoveragePage} />}
        </Route>
        <Route path="/super-admin/chat">
          {() => <SuperRouteGuard component={SuperChatMonitoringPage} />}
        </Route>
        <Route path="/super-admin/users">
          {() => <SuperRouteGuard component={SuperAdminUsersPage} />}
        </Route>
        <Route path="/super-admin">
          {() => <Redirect to="/super-admin/dashboard" />}
        </Route>
        <Route>
          {() => <Redirect to="/super-admin/dashboard" />}
        </Route>
      </Switch>
    </Suspense>
  );
}

export function SuperLayout() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <SkipLink />
      <div className="flex h-dvh w-full min-w-0">
        <SuperSidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-3 sm:px-4">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex items-center gap-2">
              <NotificationCenter />
              <ThemeToggle />
              <UserMenu />
            </div>
          </header>
          <main id="main-content" className="min-w-0 flex-1 overflow-hidden">
            <ErrorBoundary>
              <SuperAdminRouter />
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
