import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useTenantTheme } from "@/lib/tenant-theme-loader";
import { cn } from "@/lib/utils";
import {
  Building2,
  Wrench,
  Activity,
  LayoutDashboard,
  FileText,
  Users,
  PieChart,
  Database,
  BarChart3,
  Shield,
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
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const superAdminNavItems = [
  { title: "Dashboard",      url: "/super-admin/dashboard",     icon: LayoutDashboard, exact: false, color: "text-sky-500" },
  { title: "Tenants",        url: "/super-admin/tenants",       icon: Building2,       exact: false, color: "text-emerald-500" },
  { title: "User Manager",   url: "/super-admin/users",         icon: Users,           exact: false, color: "text-violet-500" },
  { title: "Reports",        url: "/super-admin/reports",       icon: BarChart3,       exact: false, color: "text-amber-500" },
  { title: "Data Retention", url: "/super-admin/retention",     icon: Database,        exact: false, color: "text-rose-500" },
  { title: "System Health",  url: "/super-admin/status",        icon: Activity,        exact: false, color: "text-green-500" },
  { title: "App Docs",       url: "/super-admin/docs",          icon: FileText,        exact: true,  color: "text-indigo-500" },
  { title: "Docs Coverage",  url: "/super-admin/docs-coverage", icon: PieChart,        exact: false, color: "text-orange-500" },
  { title: "System Settings",url: "/super-admin/settings",      icon: Wrench,          exact: false, color: "text-slate-400" },
];

export function SuperSidebar() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { appName, iconUrl, logoUrl } = useTenantTheme();
  const { state: sidebarState } = useSidebar();
  const isCollapsed = sidebarState === "collapsed";

  const isActive = (url: string, exact: boolean) => {
    if (exact) return location === url;
    return location.startsWith(url);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-3 group-data-[collapsible=icon]:px-2">
        <div className="flex items-center gap-3 min-w-0 group-data-[collapsible=icon]:justify-center">
          <img
            src={iconUrl || logoUrl || appLogo}
            alt={appName}
            className="h-8 w-8 flex-shrink-0 rounded-sm object-contain"
          />
          <div className="flex flex-col min-w-0 group-data-[collapsible=icon]:hidden">
            <span
              className="font-['Inter',sans-serif] text-base font-semibold text-sidebar-foreground leading-tight truncate"
              data-testid="text-app-name"
            >
              {appName}
            </span>
            <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
              Super Admin
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-medium uppercase tracking-wide text-muted-foreground px-2 group-data-[collapsible=icon]:hidden">
            Administration
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {superAdminNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url, item.exact)}
                    tooltip={item.title}
                  >
                    <Link
                      href={item.url}
                      data-testid={`link-super-${item.title.toLowerCase().replace(/\s/g, "-")}`}
                    >
                      <item.icon className={cn("h-4 w-4 shrink-0", item.color)} />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3 group-data-[collapsible=icon]:p-2">
        <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <Avatar className="h-8 w-8 shrink-0 cursor-default">
                <AvatarFallback className="bg-amber-500/20 text-amber-700 dark:text-amber-400 text-xs">
                  <Shield className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            {isCollapsed && (
              <TooltipContent side="right">
                <p className="font-medium">{user?.firstName} {user?.lastName}</p>
                <p className="text-xs text-muted-foreground">Super Admin</p>
              </TooltipContent>
            )}
          </Tooltip>
          <div className="flex flex-1 flex-col overflow-hidden group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-medium">
              {user?.firstName} {user?.lastName}
            </span>
            <span className="truncate text-xs text-amber-600 dark:text-amber-400">
              Super Admin
            </span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
