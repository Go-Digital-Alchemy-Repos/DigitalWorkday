import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useCrmFlags } from "@/hooks/use-crm-flags";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  MessageCircle,
  Building2,
  ClipboardCheck,
  LifeBuoy,
  PackageOpen,
  Activity,
  Users,
  ChevronDown,
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

interface ClientInfo {
  id: string;
  companyName: string;
  displayName: string | null;
  accessLevel: string;
  capabilities?: { viewActivity?: boolean };
}

interface DashboardData {
  clients: ClientInfo[];
  projects: any[];
  tasks: any[];
  upcomingDeadlines: any[];
}

const mainNavItems = [
  {
    title: "Dashboard",
    url: "/portal",
    icon: LayoutDashboard,
    color: "text-sky-500",
  },
  {
    title: "Client Account",
    url: "/portal/account",
    icon: Users,
    color: "text-indigo-500",
  },
  {
    title: "Projects",
    url: "/portal/projects",
    icon: FolderKanban,
    color: "text-amber-500",
  },
  {
    title: "Tasks",
    url: "/portal/tasks",
    icon: CheckSquare,
    color: "text-emerald-500",
  },
  {
    title: "Asset Library",
    url: "/portal/assets",
    icon: PackageOpen,
    color: "text-blue-500",
  },
];

export function ClientPortalSidebar() {
  const [location] = useLocation();
  const { user } = useAuth();
  const crmFlags = useCrmFlags();

  const { data: dashboardData } = useQuery<DashboardData>({
    queryKey: queryKeys.portal.dashboard,
  });

  const isActiveRoute = (url: string) => {
    if (url === "/portal") {
      return location === "/portal";
    }
    return location.startsWith(url);
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Sidebar collapsible="icon" className="bg-sidebar/95 backdrop-blur-xl">
      <SidebarHeader className="border-b border-sidebar-border/80 px-4 py-4 group-data-[collapsible=icon]:px-1 group-data-[collapsible=icon]:py-2">
        <div className="flex min-w-0 items-center gap-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-sidebar-border/80 bg-background/75 shadow-[var(--shadow-soft)] group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:rounded-xl">
            <img
              src={appLogo}
              alt="Digital Workday"
              className="h-7 w-7 rounded-sm object-contain group-data-[collapsible=icon]:h-6 group-data-[collapsible=icon]:w-6"
            />
          </div>
          <span className="truncate font-['Inter',sans-serif] text-base font-semibold leading-tight text-sidebar-foreground group-data-[collapsible=icon]:hidden">
            Client Portal
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-3 px-2 py-3">
        <SidebarGroup>
          <Collapsible defaultOpen className="group/collapsible">
            <CollapsibleTrigger asChild>
              <SidebarGroupLabel className="cursor-pointer rounded-xl px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground hover:bg-sidebar-accent/70">
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
                        isActive={isActiveRoute(item.url)}
                        className="rounded-xl px-2.5"
                      >
                        <Link
                          href={item.url}
                          data-testid={`nav-${item.title.toLowerCase().replace(/\s/g, "-")}`}
                        >
                          <item.icon className={cn("h-4 w-4", item.color)} />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                  {dashboardData?.clients?.some(
                    (client) => client.capabilities?.viewActivity,
                  ) && (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        isActive={isActiveRoute("/portal/activity")}
                        className="rounded-xl px-2.5"
                      >
                        <Link
                          href="/portal/activity"
                          data-testid="nav-portal-activity"
                        >
                          <Activity className="h-4 w-4 text-cyan-500" />
                          <span>Activity</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                  {crmFlags.approvals && (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        isActive={isActiveRoute("/portal/approvals")}
                        className="rounded-xl px-2.5"
                      >
                        <Link
                          href="/portal/approvals"
                          data-testid="nav-portal-approvals"
                        >
                          <ClipboardCheck className="h-4 w-4 text-teal-500" />
                          <span>Approvals</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                  {crmFlags.clientMessaging && (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        isActive={isActiveRoute("/portal/messages")}
                        className="rounded-xl px-2.5"
                      >
                        <Link
                          href="/portal/messages"
                          data-testid="nav-portal-messages"
                        >
                          <MessageCircle className="h-4 w-4 text-violet-500" />
                          <span>Messages</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={isActiveRoute("/portal/support")}
                      className="rounded-xl px-2.5"
                    >
                      <Link
                        href="/portal/support"
                        data-testid="nav-portal-support"
                      >
                        <LifeBuoy className="h-4 w-4 text-orange-500" />
                        <span>Support</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        {dashboardData?.clients && dashboardData.clients.length > 0 && (
          <SidebarGroup>
            <Collapsible defaultOpen className="group/collapsible">
              <CollapsibleTrigger asChild>
                <SidebarGroupLabel className="cursor-pointer rounded-xl px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground hover:bg-sidebar-accent/70">
                  <ChevronDown className="h-3 w-3 transition-transform group-data-[state=closed]/collapsible:-rotate-90" />
                  <span className="ml-1">Your Organizations</span>
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {dashboardData.clients.map((client) => (
                      <SidebarMenuItem key={client.id}>
                        <div
                          className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                          data-testid={`client-${client.id}`}
                        >
                          <Building2 className="h-4 w-4 shrink-0 text-indigo-400" />
                          <span className="truncate">
                            {client.displayName || client.companyName}
                          </span>
                        </div>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </Collapsible>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/80 p-3 group-data-[collapsible=icon]:p-1">
        <div className="flex items-center gap-3 rounded-2xl border border-sidebar-border/70 bg-background/70 px-3 py-2 shadow-[var(--shadow-soft)] group-data-[collapsible=icon]:hidden">
          <Avatar className="h-9 w-9 border border-sidebar-border/80">
            <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
              {user?.name
                ? getInitials(user.name)
                : user?.email?.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium truncate">
              {user?.name || user?.email}
            </span>
            <span className="text-xs text-muted-foreground">Client Portal</span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
