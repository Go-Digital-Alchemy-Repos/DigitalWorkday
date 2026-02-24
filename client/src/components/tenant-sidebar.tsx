import { useState, useMemo, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useTenantTheme } from "@/lib/tenant-theme-loader";
import { cn } from "@/lib/utils";
import {
  Home,
  FolderKanban,
  Users,
  CheckSquare,
  Settings,
  Plus,
  ChevronDown,
  Building2,
  Check,
  Briefcase,
  Clock,
  Cog,
  UserCog,
  MessageCircle,
  UsersRound,
  BarChart3,
  CalendarDays,
  FileStack,
  ChevronsDown,
  Pin,
  GripVertical,
  LifeBuoy,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
import { CreateProjectDialog } from "@/features/projects";
import { TeamDrawer } from "@/features/teams";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import type { Project, Team, Workspace, Client, ClientDivision } from "@shared/schema";

interface UiPreferences {
  sidebarProjectOrder?: string[] | null;
}

interface SortableProjectItemProps {
  project: Project;
  isActive: boolean;
  clientName: string | null;
  divisionName: string | null;
}

function SortableProjectItem({ project, isActive, clientName, divisionName }: SortableProjectItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      className="group/menu-item relative flex items-center"
    >
      <span
        className="flex items-center justify-center shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/0 group-hover/menu-item:text-muted-foreground transition-colors touch-none px-0.5 py-1"
        aria-label="Drag to reorder"
        data-testid={`drag-handle-project-${project.id}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3 w-3" />
      </span>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        className="flex-1"
      >
        <Link
          href={`/projects/${project.id}`}
          data-testid={`link-project-${project.id}`}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div
              className="h-3 w-3 rounded-sm shrink-0"
              style={{ backgroundColor: project.color || "#3B82F6" }}
            />
            <span className="truncate flex-1">{project.name}</span>
            {(clientName || divisionName) && (
              <div className="flex items-center gap-1 shrink-0">
                {clientName && (
                  <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4" data-testid={`badge-project-client-${project.id}`}>
                    {clientName.length > 10 ? clientName.slice(0, 10) + "\u2026" : clientName}
                  </Badge>
                )}
                {divisionName && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0 h-4" data-testid={`badge-project-division-${project.id}`}>
                    {divisionName.length > 8 ? divisionName.slice(0, 8) + "\u2026" : divisionName}
                  </Badge>
                )}
              </div>
            )}
          </div>
        </Link>
      </SidebarMenuButton>
    </li>
  );
}

const mainNavItems = [
  { title: "Home", url: "/", icon: Home, color: "text-sky-500" },
  { title: "My Tasks", url: "/my-tasks", icon: CheckSquare, color: "text-emerald-500" },
  { title: "My Time", url: "/my-time", icon: Clock, color: "text-rose-500" },
  // { title: "My Calendar", url: "/my-calendar", icon: CalendarDays },
  { title: "Projects", url: "/projects", icon: FolderKanban, color: "text-amber-500" },
  { title: "Clients", url: "/clients", icon: Briefcase, color: "text-indigo-500" },
  // { title: "Team Calendar", url: "/calendar", icon: CalendarDays },
  { title: "Chat", url: "/chat", icon: MessageCircle, color: "text-violet-500" },
  { title: "Support", url: "/support", icon: LifeBuoy, color: "text-orange-500" },
];

export function TenantSidebar() {
  const [location] = useLocation();
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [projectsLimit, setProjectsLimit] = useState(10);

  const { data: unreadCount = 0 } = useQuery<number>({
    queryKey: ["/api/v1/chat/unread-count"],
    refetchInterval: 30000,
  });

  const PROJECTS_PAGE_SIZE = 10;
  const { user } = useAuth();
  const { toast } = useToast();
  const { appName, iconUrl, logoUrl } = useTenantTheme();
  const isAdmin = user?.role === "admin";
  const isSuperUser = user?.role === "super_user";

  const { data: workspace } = useQuery<Workspace>({
    queryKey: ["/api/workspaces/current"],
  });

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/v1/projects"],
  });

  const { data: teams } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const { data: allDivisions = [] } = useQuery<ClientDivision[]>({
    queryKey: ["/api/v1/divisions/all"],
  });

  const getClientName = (clientId: string | null) => {
    if (!clientId || !clients) return null;
    const client = clients.find(c => c.id === clientId);
    return client ? (client.displayName || client.companyName) : null;
  };

  const getDivisionName = (divisionId: string | null) => {
    if (!divisionId) return null;
    const division = allDivisions.find(d => d.id === divisionId);
    return division?.name || null;
  };


  const { data: uiPrefs } = useQuery<UiPreferences>({
    queryKey: ["/api/users/me/ui-preferences"],
  });

  const saveOrderMutation = useMutation({
    mutationFn: async (order: string[]) => {
      return apiRequest("PATCH", "/api/users/me/ui-preferences", {
        sidebarProjectOrder: order,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/me/ui-preferences"] });
    },
  });

  const stickyProjects = useMemo(() => {
    if (!projects) return [];
    return [...projects]
      .filter((p) => p.status !== "archived" && p.stickyAt)
      .sort((a, b) => {
        const aTime = a.stickyAt ? new Date(a.stickyAt).getTime() : 0;
        const bTime = b.stickyAt ? new Date(b.stickyAt).getTime() : 0;
        return aTime - bTime;
      });
  }, [projects]);

  const nonStickyProjects = useMemo(() => {
    if (!projects) return [];
    const savedOrder = uiPrefs?.sidebarProjectOrder;
    const nonSticky = [...projects].filter((p) => p.status !== "archived" && !p.stickyAt);

    if (savedOrder && savedOrder.length > 0) {
      const orderMap = new Map(savedOrder.map((id, idx) => [id, idx]));
      const ordered: Project[] = [];
      const unordered: Project[] = [];

      for (const p of nonSticky) {
        if (orderMap.has(p.id)) {
          ordered.push(p);
        } else {
          unordered.push(p);
        }
      }

      ordered.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
      unordered.sort((a, b) => {
        const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return dateB - dateA;
      });

      return [...ordered, ...unordered];
    }

    return nonSticky.sort((a, b) => {
      const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return dateB - dateA;
    });
  }, [projects, uiPrefs?.sidebarProjectOrder]);

  const allSortedProjects = useMemo(
    () => [...stickyProjects, ...nonStickyProjects],
    [stickyProjects, nonStickyProjects]
  );

  const visibleProjects = useMemo(
    () => allSortedProjects.slice(0, projectsLimit),
    [allSortedProjects, projectsLimit]
  );

  const hasMoreProjects = allSortedProjects.length > projectsLimit;

  const visibleStickyProjects = useMemo(
    () => visibleProjects.filter((p) => p.stickyAt),
    [visibleProjects]
  );
  const visibleNonStickyProjects = useMemo(
    () => visibleProjects.filter((p) => !p.stickyAt),
    [visibleProjects]
  );

  const nonStickyIds = useMemo(
    () => visibleNonStickyProjects.map((p) => p.id),
    [visibleNonStickyProjects]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const visibleIds = visibleNonStickyProjects.map((p) => p.id);
      const oldVisibleIndex = visibleIds.indexOf(active.id as string);
      const newVisibleIndex = visibleIds.indexOf(over.id as string);
      if (oldVisibleIndex === -1 || newVisibleIndex === -1) return;

      const reorderedVisible = arrayMove(visibleIds, oldVisibleIndex, newVisibleIndex);
      const hiddenIds = nonStickyProjects
        .filter((p) => !visibleIds.includes(p.id))
        .map((p) => p.id);
      const newOrder = [...reorderedVisible, ...hiddenIds];

      const previousPrefs = queryClient.getQueryData<UiPreferences>(["/api/users/me/ui-preferences"]);

      queryClient.setQueryData<UiPreferences>(["/api/users/me/ui-preferences"], (prev) => ({
        ...prev,
        sidebarProjectOrder: newOrder,
      }));

      saveOrderMutation.mutate(newOrder, {
        onError: () => {
          queryClient.setQueryData(["/api/users/me/ui-preferences"], previousPrefs);
        },
      });
    },
    [visibleNonStickyProjects, nonStickyProjects, saveOrderMutation]
  );

  const createProjectMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/projects", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/projects"] });
      setCreateProjectOpen(false);
    },
  });

  const handleCreateProject = (data: any) => {
    createProjectMutation.mutate(data);
  };

  const createTeamMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      return apiRequest("POST", "/api/teams", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      setCreateTeamOpen(false);
      toast({ title: "Team created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create team", variant: "destructive" });
    },
  });

  const handleCreateTeam = async (data: { name: string }) => {
    await createTeamMutation.mutateAsync(data);
  };

  const handleAddWorkspace = () => {
    toast({
      title: "Coming Soon",
      description: "Multiple workspaces will be available in a future update.",
    });
  };

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <img src={iconUrl || logoUrl || appLogo} alt={appName} className="h-8 w-8 flex-shrink-0 rounded-sm object-contain" />
          <span className="font-['Inter',sans-serif] text-base font-semibold text-sidebar-foreground leading-tight truncate" data-testid="text-app-name">
            {appName}
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <Collapsible defaultOpen className="group/collapsible">
            <CollapsibleTrigger asChild>
              <SidebarGroupLabel className="cursor-pointer hover-elevate rounded-md px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <ChevronDown className="h-3 w-3 transition-transform group-data-[state=closed]/collapsible:-rotate-90" />
                <span className="ml-1">Navigation</span>
              </SidebarGroupLabel>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {mainNavItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={location === item.url || (item.url !== "/" && location.startsWith(item.url))}
                      >
                        <Link href={item.url} data-testid={`link-${item.title.toLowerCase().replace(/\s/g, "-")}`}>
                          <item.icon className={cn("h-4 w-4", item.color)} />
                          <span className="relative flex items-center gap-2">
                            {item.title}
                            {item.title === "Chat" && unreadCount > 0 && (
                              <Badge 
                                variant="destructive" 
                                className="h-4 min-w-[16px] px-1 text-[10px] flex items-center justify-center rounded-full"
                                data-testid="badge-chat-unread"
                              >
                                {unreadCount > 99 ? "99+" : unreadCount}
                              </Badge>
                            )}
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        <SidebarGroup>
          <Collapsible defaultOpen className="group/collapsible">
            <div className="flex items-center justify-between pr-2">
              <CollapsibleTrigger asChild>
                <SidebarGroupLabel className="cursor-pointer hover-elevate rounded-md px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <ChevronDown className="h-3 w-3 transition-transform group-data-[state=closed]/collapsible:-rotate-90" />
                  <span className="ml-1">Projects</span>
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCreateProjectOpen(true)}
                data-testid="button-add-project"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <CollapsibleContent>
              <SidebarGroupContent>
                <div className={visibleProjects.length > 10 ? "max-h-[360px] overflow-y-auto" : ""}>
                  <SidebarMenu>
                    {visibleStickyProjects.map((project) => {
                      const clientName = getClientName(project.clientId);
                      const divisionName = getDivisionName(project.divisionId);
                      return (
                        <SidebarMenuItem key={project.id}>
                          <SidebarMenuButton
                            asChild
                            isActive={location === `/projects/${project.id}`}
                          >
                            <Link
                              href={`/projects/${project.id}`}
                              data-testid={`link-project-${project.id}`}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <div
                                  className="h-3 w-3 rounded-sm shrink-0"
                                  style={{ backgroundColor: project.color || "#3B82F6" }}
                                />
                                <span className="truncate flex-1 font-semibold">{project.name}</span>
                                <Pin className="h-3 w-3 shrink-0 text-muted-foreground" data-testid={`icon-pinned-${project.id}`} />
                                {(clientName || divisionName) && (
                                  <div className="flex items-center gap-1 shrink-0">
                                    {clientName && (
                                      <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4" data-testid={`badge-project-client-${project.id}`}>
                                        {clientName.length > 10 ? clientName.slice(0, 10) + "\u2026" : clientName}
                                      </Badge>
                                    )}
                                    {divisionName && (
                                      <Badge variant="outline" className="text-[10px] px-1 py-0 h-4" data-testid={`badge-project-division-${project.id}`}>
                                        {divisionName.length > 8 ? divisionName.slice(0, 8) + "\u2026" : divisionName}
                                      </Badge>
                                    )}
                                  </div>
                                )}
                              </div>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={nonStickyIds}
                      strategy={verticalListSortingStrategy}
                    >
                      <SidebarMenu>
                        {visibleNonStickyProjects.map((project) => (
                          <SortableProjectItem
                            key={project.id}
                            project={project}
                            isActive={location === `/projects/${project.id}`}
                            clientName={getClientName(project.clientId)}
                            divisionName={getDivisionName(project.divisionId)}
                          />
                        ))}
                      </SidebarMenu>
                    </SortableContext>
                  </DndContext>
                  {(!projects || projects.length === 0) && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      No projects yet
                    </div>
                  )}
                </div>
                {hasMoreProjects && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setProjectsLimit(prev => prev + PROJECTS_PAGE_SIZE)}
                    className="flex items-center gap-1.5 w-full justify-start text-xs text-muted-foreground mt-1"
                    data-testid="button-load-more-projects"
                  >
                    <ChevronsDown className="h-3 w-3" />
                    <span>Load More ({allSortedProjects.length - projectsLimit} remaining)</span>
                  </Button>
                )}
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        <SidebarGroup>
          <Collapsible defaultOpen className="group/collapsible">
            <div className="flex items-center justify-between pr-2">
              <CollapsibleTrigger asChild>
                <SidebarGroupLabel className="cursor-pointer hover-elevate rounded-md px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <ChevronDown className="h-3 w-3 transition-transform group-data-[state=closed]/collapsible:-rotate-90" />
                  <span className="ml-1">Teams</span>
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCreateTeamOpen(true)}
                data-testid="button-add-team"
              >
                <Plus className="h-4 w-4" />
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
                <SidebarGroupLabel className="cursor-pointer hover-elevate rounded-md px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <ChevronDown className="h-3 w-3 transition-transform group-data-[state=closed]/collapsible:-rotate-90" />
                  <span className="ml-1">Workspaces</span>
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleAddWorkspace}
                data-testid="button-add-workspace"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton className="justify-between">
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

        <SidebarGroup>
          <Collapsible defaultOpen className="group/collapsible">
            <CollapsibleTrigger asChild>
              <SidebarGroupLabel className="cursor-pointer hover-elevate rounded-md px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <ChevronDown className="h-3 w-3 transition-transform group-data-[state=closed]/collapsible:-rotate-90" />
                <span className="ml-1">System Management</span>
              </SidebarGroupLabel>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={location === "/user-manager" || location.startsWith("/user-manager/")}
                    >
                      <Link href="/user-manager" data-testid="link-user-manager">
                        <UsersRound className="h-4 w-4" />
                        <span>{isAdmin || isSuperUser ? "User Manager" : "Team Manager"}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {(isAdmin || isSuperUser) && (
                    <>
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          asChild
                          isActive={location.startsWith("/account")}
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
                          isActive={location === "/reports" || location.startsWith("/reports/")}
                        >
                          <Link href="/reports" data-testid="link-reports">
                            <BarChart3 className="h-4 w-4" />
                            <span>Reports</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          asChild
                          isActive={location === "/templates" || location.startsWith("/templates/")}
                        >
                          <Link href="/templates" data-testid="link-templates">
                            <FileStack className="h-4 w-4" />
                            <span>Templates</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          asChild
                          isActive={location.startsWith("/settings")}
                        >
                          <Link href="/settings" data-testid="link-global-settings">
                            <Cog className="h-4 w-4" />
                            <span>System Settings</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-primary text-xs">
              {user?.firstName?.charAt(0) || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-1 flex-col overflow-hidden">
            <span className="truncate text-sm font-medium">
              {user?.firstName} {user?.lastName}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {user?.email}
            </span>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-settings">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>

      <CreateProjectDialog
        open={createProjectOpen}
        onOpenChange={setCreateProjectOpen}
        onSubmit={handleCreateProject}
        teams={teams}
        clients={clients}
        isPending={createProjectMutation.isPending}
      />

      <TeamDrawer
        open={createTeamOpen}
        onOpenChange={setCreateTeamOpen}
        onSubmit={handleCreateTeam}
        mode="create"
        isLoading={createTeamMutation.isPending}
      />
    </Sidebar>
  );
}
