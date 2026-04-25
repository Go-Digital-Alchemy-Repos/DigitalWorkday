import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useAnyCrmEnabled } from "@/hooks/use-crm-flags";
import { useTenantTheme } from "@/lib/tenant-theme-loader";
import { cn } from "@/lib/utils";
import { ProjectClientBadge } from "@/components/project-client-badge";
import {
  Home,
  FolderKanban,
  Users,
  CheckSquare,
  Settings,
  Plus,
  ChevronDown,
  Hash,
  Building2,
  Check,
  Briefcase,
  Clock,
  Cog,
  Shield,
  UserCog,
  BarChart3,
  Activity,
  Wrench,
  MessageCircle,
  ContactRound,
  Columns3,
  CalendarClock,
  Pin,
} from "lucide-react";
import appLogo from "@assets/Symbol_1767994625714.png";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { ProjectDrawer } from "@/features/projects";
import type { Client, Project, Team, Workspace } from "@shared/schema";
import { hasProjectManagerDashboardAccess, hasTenantAdminAccess } from "@shared/roles";

const mainNavItems = [
  { title: "Home", url: "/", icon: Home, color: "text-sky-500" },
  { title: "My Tasks", url: "/my-tasks", icon: CheckSquare, color: "text-emerald-500" },
  { title: "Projects", url: "/projects", icon: FolderKanban, color: "text-amber-500" },
  { title: "PM Dashboard", url: "/pm-dashboard", icon: BarChart3, color: "text-cyan-500", adminOnly: true },
  { title: "Clients", url: "/clients", icon: Briefcase, color: "text-indigo-500" },
  { title: "My Time", url: "/my-time", icon: Clock, color: "text-rose-500" },
  { title: "Chat", url: "/chat", icon: MessageCircle, color: "text-violet-500" },
];

export function AppSidebar() {
  const [location] = useLocation();
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const { user } = useAuth();
  const { appName, iconUrl, logoUrl } = useTenantTheme();
  const isAdmin = hasTenantAdminAccess(user?.role);
  const isSuperUser = user?.role === "super_user";
  const showPmDashboard = hasProjectManagerDashboardAccess(user?.role);
  const crmEnabled = useAnyCrmEnabled();

  const { data: workspace } = useQuery<Workspace>({
    queryKey: ["/api/workspaces/current"],
  });

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: teams } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const getClientName = (clientId: string | null) => {
    if (!clientId || !clients) return null;
    const client = clients.find((item) => item.id === clientId);
    return client ? (client.displayName || client.companyName) : null;
  };

  const createProjectMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/projects", data);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    },
  });

  const handleCreateProject = async (data: any) => {
    await createProjectMutation.mutateAsync(data);
  };

  return (
    <Sidebar className="bg-sidebar/95 backdrop-blur-xl">
      <SidebarHeader className="border-b border-sidebar-border/80 px-4 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-sidebar-border/80 bg-sidebar-accent/60 shadow-[var(--shadow-soft)]">
            <img src={iconUrl || logoUrl || appLogo} alt={appName} className="h-8 w-8 rounded-lg object-contain" />
          </div>
          <span className="font-['Inter',sans-serif] text-base font-semibold text-sidebar-foreground leading-tight truncate" data-testid="text-app-name">
            {appName}
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-3 px-2 py-3">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.filter((item: any) => !item.adminOnly || showPmDashboard).map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    className="rounded-xl px-2.5"
                  >
                    <Link href={item.url} data-testid={`link-${item.title.toLowerCase().replace(/\s/g, "-")}`}>
                      <item.icon className={cn("h-4 w-4", item.color)} />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <Collapsible defaultOpen className="group/collapsible">
            <div className="flex items-center justify-between pr-2">
              <CollapsibleTrigger asChild>
                <SidebarGroupLabel className="cursor-pointer rounded-xl px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground">
                  <ChevronDown className="h-3 w-3 transition-transform group-data-[state=closed]/collapsible:-rotate-90" />
                  <span className="ml-1">Projects</span>
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-xl"
                onClick={() => setCreateProjectOpen(true)}
                data-testid="button-add-project"
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {projects?.filter((p) => p.status !== "archived")
                    .sort((a, b) => {
                      const aSticky = a.stickyAt ? new Date(a.stickyAt).getTime() : 0;
                      const bSticky = b.stickyAt ? new Date(b.stickyAt).getTime() : 0;
                      if (aSticky && !bSticky) return -1;
                      if (!aSticky && bSticky) return 1;
                      if (aSticky && bSticky) return aSticky - bSticky;
                      return 0;
                    })
                    .map((project) => (
                    <SidebarMenuItem key={project.id}>
                      <SidebarMenuButton
                        asChild
                        isActive={location === `/projects/${project.id}`}
                        className="rounded-xl px-2.5"
                      >
                        <Link
                          href={`/projects/${project.id}`}
                          data-testid={`link-project-${project.id}`}
                        >
                          <div
                            className="h-3 w-3 rounded-sm"
                            style={{ backgroundColor: project.color || "#3B82F6" }}
                          />
                          <div className="min-w-0 flex-1">
                            <span className={`block truncate${project.stickyAt ? " font-semibold" : ""}`}>{project.name}</span>
                            <ProjectClientBadge
                              clientName={getClientName(project.clientId)}
                              className="mt-1"
                              maxLength={11}
                              testId={`badge-project-client-${project.id}`}
                            />
                          </div>
                          {project.stickyAt && (
                            <Pin className="h-3 w-3 shrink-0 text-muted-foreground" />
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                  {(!projects || projects.filter((p) => p.status !== "archived").length === 0) && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      No projects yet
                    </div>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        <SidebarGroup>
          <Collapsible defaultOpen className="group/collapsible">
            <div className="flex items-center justify-between pr-2">
              <CollapsibleTrigger asChild>
                <SidebarGroupLabel className="cursor-pointer rounded-xl px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground">
                  <ChevronDown className="h-3 w-3 transition-transform group-data-[state=closed]/collapsible:-rotate-90" />
                  <span className="ml-1">Teams</span>
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-xl"
                data-testid="button-add-team"
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {teams?.map((team) => (
                    <SidebarMenuItem key={team.id}>
                      <SidebarMenuButton
                        asChild
                        isActive={location === `/teams/${team.id}`}
                        className="rounded-xl px-2.5"
                      >
                        <Link
                          href={`/teams/${team.id}`}
                          data-testid={`link-team-${team.id}`}
                        >
                          <Users className="h-4 w-4" />
                          <span className="truncate">{team.name}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                  {(!teams || teams.length === 0) && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      No teams yet
                    </div>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        <SidebarGroup>
          <Collapsible defaultOpen className="group/collapsible">
            <div className="flex items-center justify-between pr-2">
              <CollapsibleTrigger asChild>
                <SidebarGroupLabel className="cursor-pointer rounded-xl px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground">
                  <ChevronDown className="h-3 w-3 transition-transform group-data-[state=closed]/collapsible:-rotate-90" />
                  <span className="ml-1">Workspaces</span>
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-xl"
                data-testid="button-add-workspace"
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton className="justify-between rounded-xl px-2.5">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        <span className="truncate">{workspace?.name || "Default Workspace"}</span>
                      </div>
                      <Check className="h-4 w-4 text-primary" />
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        {(isAdmin || isSuperUser) && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location.startsWith("/account")}
                    className="rounded-xl px-2.5"
                  >
                    <Link href="/account" data-testid="link-account-settings">
                      <UserCog className="h-4 w-4" />
                      <span>Account</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location.startsWith("/settings")}
                    className="rounded-xl px-2.5"
                  >
                    <Link href="/settings" data-testid="link-global-settings">
                      <Cog className="h-4 w-4" />
                      <span>Settings</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {crmEnabled && (
                  <>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        isActive={location === "/clients" || location.startsWith("/clients/")}
                        className="rounded-xl px-2.5"
                      >
                        <Link href="/clients" data-testid="link-crm-clients">
                          <ContactRound className="h-4 w-4" />
                          <span>Clients</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        isActive={location === "/crm/pipeline"}
                        className="rounded-xl px-2.5"
                      >
                        <Link href="/crm/pipeline" data-testid="link-crm-pipeline">
                          <Columns3 className="h-4 w-4" />
                          <span>Pipeline</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        isActive={location === "/crm/followups"}
                        className="rounded-xl px-2.5"
                      >
                        <Link href="/crm/followups" data-testid="link-crm-followups">
                          <CalendarClock className="h-4 w-4" />
                          <span>Follow-ups</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        
        {isSuperUser && (
          <SidebarGroup>
            <SidebarGroupLabel className="rounded-xl px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/60">
              Super Admin
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location === "/super-admin"}
                    className="rounded-xl px-2.5"
                  >
                    <Link href="/super-admin" data-testid="link-super-admin">
                      <Building2 className="h-4 w-4" />
                      <span>Tenants</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location.startsWith("/super-admin/reports")}
                    className="rounded-xl px-2.5"
                  >
                    <Link href="/super-admin/reports" data-testid="link-super-admin-reports">
                      <BarChart3 className="h-4 w-4" />
                      <span>Global Reports</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location.startsWith("/super-admin/settings")}
                    className="rounded-xl px-2.5"
                  >
                    <Link href="/super-admin/settings" data-testid="link-super-admin-settings">
                      <Wrench className="h-4 w-4" />
                      <span>System Settings</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location.startsWith("/super-admin/status")}
                    className="rounded-xl px-2.5"
                  >
                    <Link href="/super-admin/status" data-testid="link-super-admin-status">
                      <Activity className="h-4 w-4" />
                      <span>System Status</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/80 p-3">
        <div className="flex items-center gap-3 rounded-2xl border border-sidebar-border/70 bg-sidebar-accent/40 px-3 py-2.5 shadow-[var(--shadow-soft)]">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-primary text-xs">
              U
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-1 flex-col overflow-hidden">
            <span className="truncate text-sm font-medium">Demo User</span>
            <span className="truncate text-xs text-muted-foreground">
              pm@demo.com
            </span>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" data-testid="button-settings">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>

      <ProjectDrawer
        open={createProjectOpen}
        onOpenChange={setCreateProjectOpen}
        onSubmit={handleCreateProject}
        isLoading={createProjectMutation.isPending}
        mode="create"
      />
    </Sidebar>
  );
}
