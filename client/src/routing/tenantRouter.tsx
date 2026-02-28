import { lazy, Suspense, useEffect } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { TenantSidebar } from "@/components/tenant-sidebar";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { TenantContextGate } from "@/components/tenant-context-gate";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { NotificationCenter } from "@/components/notification-center";
import { CommandPalette } from "@/components/command-palette";
import { ErrorBoundary } from "@/components/error-boundary";
import { MobileNavBar } from "@/components/mobile-nav-bar";
import { useAppMode } from "@/hooks/useAppMode";
import { useIsMobile } from "@/hooks/use-mobile";
import { useChatDrawer } from "@/contexts/chat-drawer-context";
import { ChatDrawerProvider } from "@/contexts/chat-drawer-context";
import { GlobalChatDrawer } from "@/components/global-chat-drawer";
import { TaskDrawerProvider } from "@/lib/task-drawer-context";
import { GlobalActiveTimer } from "@/features/timer/global-active-timer";
import { MobileActiveTimerBar } from "@/features/timer/mobile-active-timer-bar";
import { useTheme } from "@/lib/theme-provider";
import { TenantRouteGuard, ProtectedRoute } from "./guards";
import { SkipLink } from "@/components/skip-link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MessageCircle, MoreVertical, Moon, Sun, Building2, ChevronDown, Check, Search } from "lucide-react";
import { GlobalSearchBar } from "@/components/global-search-bar";
import { type Workspace } from "@shared/schema";
import { PageSkeleton } from "@/components/skeletons/page-skeleton";

import { trackChunkLoad } from "@/lib/perf";

const Home = lazy(trackChunkLoad("Home", () => import("@/pages/home")));
const MyTasks = lazy(trackChunkLoad("MyTasks", () => import("@/pages/my-tasks")));
const ProjectsDashboard = lazy(trackChunkLoad("Projects", () => import("@/pages/projects-dashboard")));
const ProjectPage = lazy(trackChunkLoad("Project", () => import("@/pages/project")));
const ClientsPage = lazy(trackChunkLoad("Clients", () => import("@/pages/clients")));
const ClientDetailPage = lazy(trackChunkLoad("ClientDetail", () => import("@/pages/client-detail")));
const CrmPipelinePage = lazy(trackChunkLoad("CrmPipeline", () => import("@/pages/crm-pipeline")));
const CrmFollowupsPage = lazy(trackChunkLoad("CrmFollowups", () => import("@/pages/crm-followups")));
const SettingsPage = lazy(trackChunkLoad("Settings", () => import("@/pages/settings")));
const AccountPage = lazy(trackChunkLoad("Account", () => import("@/pages/account")));
const UserManagerPage = lazy(trackChunkLoad("UserManager", () => import("@/pages/user-manager")));
const UserProfilePage = lazy(trackChunkLoad("UserProfile", () => import("@/pages/user-profile")));
const ChatPage = lazy(trackChunkLoad("Chat", () => import("@/pages/chat")));
const ReportsPage = lazy(trackChunkLoad("Reports", () => import("@/pages/reports")));
const EmployeeProfileReportPage = lazy(trackChunkLoad("EmployeeProfile", () => import("@/pages/employee-profile-report")));
const ClientProfileReportPage = lazy(trackChunkLoad("ClientProfile", () => import("@/pages/client-profile-report")));
const TemplatesPage = lazy(trackChunkLoad("Templates", () => import("@/pages/templates")));
const CalendarPage = lazy(trackChunkLoad("Calendar", () => import("@/pages/calendar")));
const MyTimePage = lazy(trackChunkLoad("MyTime", () => import("@/pages/my-time")));
const MyCalendarPage = lazy(trackChunkLoad("MyCalendar", () => import("@/pages/my-calendar")));
const TeamDetailPage = lazy(trackChunkLoad("TeamDetail", () => import("@/pages/team-detail")));
const SupportTickets = lazy(trackChunkLoad("SupportTickets", () => import("@/pages/support-tickets")));
const SupportTicketDetail = lazy(trackChunkLoad("SupportTicketDetail", () => import("@/pages/support-ticket-detail")));
const SupportTemplates = lazy(trackChunkLoad("SupportTemplates", () => import("@/pages/support-templates")));
const SupportSlaPolicies = lazy(trackChunkLoad("SupportSla", () => import("@/pages/support-sla-policies")));
const SupportFormSchemas = lazy(trackChunkLoad("SupportForms", () => import("@/pages/support-form-schemas")));
const DesignSystemPage = lazy(trackChunkLoad("DesignSystem", () => import("@/pages/design-system")));
const NotFound = lazy(trackChunkLoad("NotFound", () => import("@/pages/not-found")));

function ClientRedirect({ id }: { id: string }) {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate(`/clients/${id}`, { replace: true });
  }, [id, navigate]);
  return null;
}

function TenantRouter() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Switch>
        <Route path="/">
          {() => <TenantRouteGuard component={Home} />}
        </Route>
        <Route path="/my-tasks">
          {() => <TenantRouteGuard component={MyTasks} />}
        </Route>
        <Route path="/projects">
          {() => <TenantRouteGuard component={ProjectsDashboard} />}
        </Route>
        <Route path="/projects/:id">
          {() => <TenantRouteGuard component={ProjectPage} />}
        </Route>
        <Route path="/clients">
          {() => <TenantRouteGuard component={ClientsPage} />}
        </Route>
        <Route path="/clients/:id/360">
          {(params) => <ClientRedirect id={params.id} />}
        </Route>
        <Route path="/clients/:id">
          {() => <TenantRouteGuard component={ClientDetailPage} />}
        </Route>
        <Route path="/crm/pipeline">
          {() => <TenantRouteGuard component={CrmPipelinePage} />}
        </Route>
        <Route path="/crm/followups">
          {() => <TenantRouteGuard component={CrmFollowupsPage} />}
        </Route>
        <Route path="/time-tracking">
          {() => <Redirect to={`/my-time${window.location.search}`} />}
        </Route>
        <Route path="/calendar">
          {() => <TenantRouteGuard component={CalendarPage} />}
        </Route>
        <Route path="/my-time">
          {() => <TenantRouteGuard component={MyTimePage} />}
        </Route>
        <Route path="/my-calendar">
          {() => <TenantRouteGuard component={MyCalendarPage} />}
        </Route>
        <Route path="/chat">
          {() => <TenantRouteGuard component={ChatPage} />}
        </Route>
        <Route path="/settings">
          {() => <TenantRouteGuard component={SettingsPage} />}
        </Route>
        <Route path="/settings/:tab">
          {() => <TenantRouteGuard component={SettingsPage} />}
        </Route>
        <Route path="/account">
          {() => <TenantRouteGuard component={AccountPage} />}
        </Route>
        <Route path="/account/:tab">
          {() => <TenantRouteGuard component={AccountPage} />}
        </Route>
        <Route path="/user-manager">
          {() => <TenantRouteGuard component={UserManagerPage} />}
        </Route>
        <Route path="/reports/employees/:employeeId">
          {() => <TenantRouteGuard component={EmployeeProfileReportPage} />}
        </Route>
        <Route path="/reports/clients/:clientId">
          {() => <TenantRouteGuard component={ClientProfileReportPage} />}
        </Route>
        <Route path="/reports">
          {() => <TenantRouteGuard component={ReportsPage} />}
        </Route>
        <Route path="/templates">
          {() => <TenantRouteGuard component={TemplatesPage} />}
        </Route>
        <Route path="/teams/:id">
          {() => <TenantRouteGuard component={TeamDetailPage} />}
        </Route>
        <Route path="/support">
          {() => <TenantRouteGuard component={SupportTickets} />}
        </Route>
        <Route path="/support/templates">
          {() => <TenantRouteGuard component={SupportTemplates} />}
        </Route>
        <Route path="/support/sla-policies">
          {() => <TenantRouteGuard component={SupportSlaPolicies} />}
        </Route>
        <Route path="/support/form-schemas">
          {() => <TenantRouteGuard component={SupportFormSchemas} />}
        </Route>
        <Route path="/support/:id">
          {() => <TenantRouteGuard component={SupportTicketDetail} />}
        </Route>
        <Route path="/design-system">
          {() => <TenantRouteGuard component={DesignSystemPage} />}
        </Route>
        <Route path="/profile">
          {() => <ProtectedRoute component={UserProfilePage} />}
        </Route>
        <Route>
          {() => <NotFound />}
        </Route>
      </Switch>
    </Suspense>
  );
}

function ChatToggleButton() {
  const { toggleDrawer } = useChatDrawer();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleDrawer}
      aria-label="Open chat"
      data-testid="button-open-chat"
      title="Open Chat"
    >
      <MessageCircle className="h-4 w-4" />
    </Button>
  );
}

function MobileHeaderMenu() {
  const { toggleDrawer } = useChatDrawer();
  const { mode, setMode, resolvedTheme } = useTheme();
  const { data: workspace } = useQuery<Workspace>({
    queryKey: ["/api/workspaces/current"],
  });
  
  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-9 gap-2 px-2" data-testid="button-workspace-switcher">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium max-w-[80px] truncate">
              {workspace?.name || "Workspace"}
            </span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[200px]">
          <DropdownMenuItem className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              <span className="truncate">{workspace?.name || "Default Workspace"}</span>
            </div>
            <Check className="h-4 w-4 text-primary" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="More options" data-testid="button-mobile-menu">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={toggleDrawer} data-testid="menu-item-chat">
            <MessageCircle className="h-4 w-4 mr-2" />
            Chat
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={() => {
              if (mode === "system") {
                setMode(resolvedTheme === "dark" ? "light" : "dark");
              } else {
                setMode(mode === "dark" ? "light" : "dark");
              }
            }}
            data-testid="menu-item-theme"
          >
            {resolvedTheme === "dark" ? (
              <>
                <Sun className="h-4 w-4 mr-2" />
                Light mode
              </>
            ) : (
              <>
                <Moon className="h-4 w-4 mr-2" />
                Dark mode
              </>
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function TenantLayout() {
  const { isImpersonating } = useAppMode();
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const { data: activeTimerData } = useQuery<{ id: string } | null>({
    queryKey: ["/api/timer/current"],
    enabled: isMobile,
    staleTime: 30000,
  });
  const hasActiveTimer = isMobile && !!activeTimerData;
  
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <TaskDrawerProvider>
      <ChatDrawerProvider>
        <SidebarProvider style={style as React.CSSProperties}>
          <TenantContextGate>
          <CommandPalette
            onNewTask={() => setLocation("/my-tasks")}
            onNewProject={() => setLocation("/projects")}
            onStartTimer={() => setLocation("/my-time")}
          />
          <SkipLink />
          <div className={`flex flex-col h-screen w-full ${isImpersonating ? "ring-2 ring-amber-500 ring-inset" : ""}`}>
            <ImpersonationBanner />
            <div className="flex flex-1 overflow-hidden">
              <TenantSidebar />
              <div className="flex flex-col flex-1 overflow-hidden">
                <header className={`flex items-center justify-between h-12 px-2 md:px-4 border-b shrink-0 ${isImpersonating ? "border-amber-400 bg-amber-50/30 dark:bg-amber-900/10" : "border-border bg-background"}`}>
                  <div className="flex items-center gap-1 md:gap-2">
                    <SidebarTrigger data-testid="button-sidebar-toggle" className="hidden md:flex" />
                    {isImpersonating && (
                      <span className="text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/50 px-2 py-0.5 rounded hidden md:inline" data-testid="badge-impersonating">
                        TENANT IMPERSONATION
                      </span>
                    )}
                  </div>
                  <div className="hidden md:block flex-1 max-w-sm mx-4">
                    <GlobalSearchBar />
                  </div>
                  <div className="flex items-center gap-1 md:gap-2">
                    <GlobalActiveTimer />
                    <div className="hidden md:flex items-center gap-1">
                      <ChatToggleButton />
                    </div>
                    <NotificationCenter />
                    <ThemeToggle className="hidden md:flex" />
                    <div className="md:hidden">
                      <MobileHeaderMenu />
                    </div>
                    <UserMenu />
                  </div>
                </header>
                <main id="main-content" className={`flex-1 overflow-hidden ${hasActiveTimer ? "pb-28" : isMobile ? "pb-16" : ""}`}>
                  <ErrorBoundary>
                    <TenantRouter />
                  </ErrorBoundary>
                </main>
              </div>
            </div>
          </div>
          {isMobile && <MobileActiveTimerBar />}
          {isMobile && <MobileNavBar />}
          <GlobalChatDrawer />
          </TenantContextGate>
        </SidebarProvider>
      </ChatDrawerProvider>
    </TaskDrawerProvider>
  );
}
