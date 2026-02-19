import { Switch, Route, Redirect } from "wouter";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { SuperSidebar } from "@/components/super-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { NotificationCenter } from "@/components/notification-center";
import { ErrorBoundary } from "@/components/error-boundary";
import { SuperRouteGuard } from "./guards";
import { SkipLink } from "@/components/skip-link";
import SuperAdminPage from "@/pages/super-admin";
import SuperAdminDashboardPage from "@/pages/super-admin-dashboard";
import SuperAdminSettingsPage from "@/pages/super-admin-settings";
import SuperAdminStatusPage from "@/pages/super-admin-status";
import SuperAdminDocsPage from "@/pages/super-admin-docs";
import SuperAdminDocsCoveragePage from "@/pages/super-admin-docs-coverage";
import SuperChatMonitoringPage from "@/pages/super-chat-monitoring";
import SuperAdminUsersPage from "@/pages/super-admin-users";
import UserProfilePage from "@/pages/user-profile";

function SuperAdminRouter() {
  return (
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
      <Route path="/super-admin/reports">
        {() => <Redirect to="/super-admin/dashboard" />}
      </Route>
      <Route path="/super-admin/settings">
        {() => <SuperRouteGuard component={SuperAdminSettingsPage} />}
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
      <div className="flex h-screen w-full">
        <SuperSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center justify-between h-14 px-4 border-b border-border bg-background shrink-0">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex items-center gap-2">
              <NotificationCenter />
              <ThemeToggle />
              <UserMenu />
            </div>
          </header>
          <main id="main-content" className="flex-1 overflow-hidden">
            <ErrorBoundary>
              <SuperAdminRouter />
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
