import { Switch, Route, Redirect } from "wouter";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { NotificationCenter } from "@/components/notification-center";
import { ErrorBoundary } from "@/components/error-boundary";
import { ClientPortalRouteGuard } from "./guards";
import { ClientPortalSidebar } from "@/components/client-portal-sidebar";
import { ClientPortalMobileNav } from "@/components/client-portal-mobile-nav";
import { useIsMobile } from "@/hooks/use-mobile";
import ClientPortalDashboard from "@/pages/client-portal-dashboard";
import ClientPortalProjects from "@/pages/client-portal-projects";
import ClientPortalTasks from "@/pages/client-portal-tasks";
import ClientPortalProjectDetail from "@/pages/client-portal-project-detail";
import ClientPortalApprovals from "@/pages/client-portal-approvals";
import ClientPortalMessages from "@/pages/client-portal-messages";
import ChatPage from "@/pages/chat";

function ClientPortalRouter() {
  return (
    <Switch>
      <Route path="/portal">
        {() => <ClientPortalRouteGuard component={ClientPortalDashboard} />}
      </Route>
      <Route path="/portal/projects">
        {() => <ClientPortalRouteGuard component={ClientPortalProjects} />}
      </Route>
      <Route path="/portal/projects/:id">
        {() => <ClientPortalRouteGuard component={ClientPortalProjectDetail} />}
      </Route>
      <Route path="/portal/tasks">
        {() => <ClientPortalRouteGuard component={ClientPortalTasks} />}
      </Route>
      <Route path="/portal/approvals">
        {() => <ClientPortalRouteGuard component={ClientPortalApprovals} />}
      </Route>
      <Route path="/portal/messages">
        {() => <ClientPortalRouteGuard component={ClientPortalMessages} />}
      </Route>
      <Route path="/portal/chat">
        {() => <ClientPortalRouteGuard component={ChatPage} />}
      </Route>
      <Route>
        {() => <Redirect to="/portal" />}
      </Route>
    </Switch>
  );
}

export function ClientPortalLayout() {
  const isMobile = useIsMobile();
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <ClientPortalSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center justify-between h-12 px-2 md:px-4 border-b border-border bg-background shrink-0">
            <div className="flex items-center gap-2">
              <SidebarTrigger data-testid="button-sidebar-toggle" className="hidden md:flex" />
            </div>
            <div className="flex items-center gap-1 md:gap-2">
              <NotificationCenter />
              <ThemeToggle className="hidden md:flex" />
              <UserMenu />
            </div>
          </header>
          <main className={`flex-1 overflow-hidden ${isMobile ? "pb-16" : ""}`}>
            <ErrorBoundary>
              <ClientPortalRouter />
            </ErrorBoundary>
          </main>
        </div>
      </div>
      {isMobile && <ClientPortalMobileNav />}
    </SidebarProvider>
  );
}
