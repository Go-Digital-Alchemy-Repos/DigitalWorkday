import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Home,
  CheckSquare,
  FolderKanban,
  Clock,
  Plus,
  Calendar,
  Menu,
  MessageCircle,
  Briefcase,
  BarChart3,
  Settings,
  UserCog,
  ContactRound,
  Columns3,
  CalendarClock,
  Building2,
  Wrench,
  Activity,
  Shield,
  Users,
  LayoutTemplate,
  Headphones,
  Palette,
  User,
  ChevronRight,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AppDrawer } from "@/components/layout/app-drawer";
import { useAuth } from "@/lib/auth";
import { useAnyCrmEnabled } from "@/hooks/use-crm-flags";
import { useTenantTheme } from "@/lib/tenant-theme-loader";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import appLogo from "@assets/Symbol_1767994625714.png";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  matchPaths?: string[];
}

const navItems: NavItem[] = [
  { 
    title: "Home", 
    href: "/", 
    icon: Home,
    matchPaths: ["/"]
  },
  { 
    title: "Tasks", 
    href: "/my-tasks", 
    icon: CheckSquare,
    matchPaths: ["/my-tasks"]
  },
  { 
    title: "Projects", 
    href: "/projects", 
    icon: FolderKanban,
    matchPaths: ["/projects"]
  },
  { 
    title: "Chat", 
    href: "/chat", 
    icon: MessageCircle,
    matchPaths: ["/chat"]
  },
];

interface QuickAction {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  action?: () => void;
}

interface MenuLink {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  color?: string;
  matchFn?: (loc: string) => boolean;
}

interface MenuSection {
  label?: string;
  items: MenuLink[];
  adminOnly?: boolean;
  superOnly?: boolean;
  crmOnly?: boolean;
}

export function MobileNavBar() {
  const [location, setLocation] = useLocation();
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const { user } = useAuth();
  const { appName, iconUrl, logoUrl } = useTenantTheme();
  const crmEnabled = useAnyCrmEnabled();
  const isAdmin = user?.role === "admin";
  const isSuperUser = user?.role === "super_user";

  const isActive = (item: NavItem) => {
    if (item.matchPaths) {
      return item.matchPaths.some(path => {
        if (path === "/") return location === "/";
        return location.startsWith(path);
      });
    }
    return location === item.href;
  };

  const isMenuActive = (item: MenuLink) => {
    if (item.matchFn) return item.matchFn(location);
    if (item.href === "/") return location === "/";
    return location === item.href || location.startsWith(item.href + "/");
  };

  const quickActions: QuickAction[] = [
    {
      title: "New Task",
      description: "Create a personal task",
      icon: CheckSquare,
      href: "/my-tasks?action=new",
    },
    {
      title: "Start Timer",
      description: "Track time on a task",
      icon: Clock,
      href: "/my-time",
    },
    {
      title: "View Calendar",
      description: "Check your schedule",
      icon: Calendar,
      href: "/calendar",
    },
    {
      title: "View Clients",
      description: "Manage your clients",
      icon: Briefcase,
      href: "/clients",
    },
  ];

  const menuSections: MenuSection[] = [
    {
      items: [
        { title: "Home", href: "/", icon: Home, color: "text-sky-500" },
        { title: "My Tasks", href: "/my-tasks", icon: CheckSquare, color: "text-emerald-500" },
        { title: "Projects", href: "/projects", icon: FolderKanban, color: "text-amber-500" },
        { title: "Clients", href: "/clients", icon: Briefcase, color: "text-indigo-500" },
        { title: "My Time", href: "/my-time", icon: Clock, color: "text-rose-500" },
        { title: "Chat", href: "/chat", icon: MessageCircle, color: "text-violet-500" },
        { title: "Calendar", href: "/calendar", icon: Calendar, color: "text-teal-500" },
        { title: "Reports", href: "/reports", icon: BarChart3, color: "text-orange-500", matchFn: (loc) => loc.startsWith("/reports") },
      ],
    },
    {
      label: "Management",
      adminOnly: true,
      items: [
        { title: "Account", href: "/account", icon: UserCog, matchFn: (loc) => loc.startsWith("/account") },
        { title: "Settings", href: "/settings", icon: Settings, matchFn: (loc) => loc.startsWith("/settings") },
        { title: "User Manager", href: "/user-manager", icon: Users },
        { title: "Templates", href: "/templates", icon: LayoutTemplate },
        { title: "Support", href: "/support", icon: Headphones, matchFn: (loc) => loc.startsWith("/support") },
      ],
    },
    {
      label: "CRM",
      crmOnly: true,
      adminOnly: true,
      items: [
        { title: "Clients", href: "/clients", icon: ContactRound, matchFn: (loc) => loc === "/clients" || loc.startsWith("/clients/") },
        { title: "Pipeline", href: "/crm/pipeline", icon: Columns3 },
        { title: "Follow-ups", href: "/crm/followups", icon: CalendarClock },
      ],
    },
    {
      label: "Super Admin",
      superOnly: true,
      items: [
        { title: "Tenants", href: "/super-admin", icon: Building2, matchFn: (loc) => loc === "/super-admin" },
        { title: "Global Reports", href: "/super-admin/reports", icon: BarChart3, matchFn: (loc) => loc.startsWith("/super-admin/reports") },
        { title: "System Settings", href: "/super-admin/settings", icon: Wrench, matchFn: (loc) => loc.startsWith("/super-admin/settings") },
        { title: "System Status", href: "/super-admin/status", icon: Activity, matchFn: (loc) => loc.startsWith("/super-admin/status") },
      ],
    },
  ];

  const handleQuickAction = (action: QuickAction) => {
    setShowQuickActions(false);
    if (action.href) {
      setLocation(action.href);
    } else if (action.action) {
      action.action();
    }
  };

  const handleMenuNav = (href: string) => {
    setShowMobileSidebar(false);
    setLocation(href);
  };

  const userInitials = user
    ? `${(user.firstName || "")[0] || ""}${(user.lastName || "")[0] || ""}`.toUpperCase() || user.email[0].toUpperCase()
    : "U";

  return (
    <>
      <nav 
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden pb-safe"
        data-testid="mobile-nav-bar"
      >
        <div className="flex h-16 items-center justify-around px-0.5">
          {navItems.slice(0, 2).map((item) => {
            const Icon = item.icon;
            const active = isActive(item);
            return (
              <Button
                key={item.href}
                variant="ghost"
                size="sm"
                asChild
                className={cn("flex-1 max-w-14 h-full px-0", active && "text-primary bg-primary/5")}
              >
                <Link
                  href={item.href}
                  data-testid={`mobile-nav-${item.title.toLowerCase()}`}
                  className="flex flex-col items-center justify-center gap-0.5"
                >
                  <Icon className={cn("h-5 w-5", active && "text-primary")} />
                  <span className="text-[10px] font-medium leading-none">{item.title}</span>
                </Link>
              </Button>
            );
          })}
          
          <div className="relative -mt-6">
            <Button
              size="icon"
              className="h-12 w-12 rounded-full shadow-lg border-4 border-background"
              onClick={() => setShowQuickActions(true)}
              data-testid="mobile-nav-quick-add"
            >
              <Plus className="h-6 w-6" />
            </Button>
          </div>
          
          {navItems.slice(2).map((item) => {
            const Icon = item.icon;
            const active = isActive(item);
            return (
              <Button
                key={item.href}
                variant="ghost"
                size="sm"
                asChild
                className={cn("flex-1 max-w-14 h-full px-0", active && "text-primary bg-primary/5")}
              >
                <Link
                  href={item.href}
                  data-testid={`mobile-nav-${item.title.toLowerCase()}`}
                  className="flex flex-col items-center justify-center gap-0.5"
                >
                  <Icon className={cn("h-5 w-5", active && "text-primary")} />
                  <span className="text-[10px] font-medium leading-none">{item.title}</span>
                </Link>
              </Button>
            );
          })}
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowMobileSidebar(true)}
            data-testid="mobile-nav-menu"
            className="flex-1 max-w-14 h-full px-0 flex flex-col items-center justify-center gap-0.5"
          >
            <Menu className="h-5 w-5" />
            <span className="text-[10px] font-medium leading-none">More</span>
          </Button>
        </div>
      </nav>

      <AppDrawer
        open={showMobileSidebar}
        onOpenChange={setShowMobileSidebar}
        side="left"
        className="w-72 p-0"
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={iconUrl || logoUrl || appLogo}
                alt={appName}
                className="h-7 w-7 flex-shrink-0 rounded-sm object-contain"
              />
              <span className="font-semibold text-sm truncate" data-testid="mobile-menu-app-name">
                {appName}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => setShowMobileSidebar(false)}
              data-testid="mobile-menu-close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <ScrollArea className="flex-1">
            <div className="py-2">
              {menuSections.map((section, sIdx) => {
                if (section.adminOnly && !isAdmin && !isSuperUser) return null;
                if (section.superOnly && !isSuperUser) return null;
                if (section.crmOnly && !crmEnabled) return null;

                return (
                  <div key={sIdx}>
                    {section.label && (
                      <>
                        <Separator className="my-2" />
                        <div className="px-4 py-1.5">
                          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                            {section.label}
                          </span>
                        </div>
                      </>
                    )}
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      const active = isMenuActive(item);
                      return (
                        <button
                          key={item.href + item.title}
                          onClick={() => handleMenuNav(item.href)}
                          className={cn(
                            "flex items-center gap-3 w-full px-4 py-2.5 text-sm transition-colors",
                            active
                              ? "bg-primary/8 text-primary font-medium"
                              : "text-foreground hover:bg-muted/50"
                          )}
                          data-testid={`mobile-menu-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                        >
                          <Icon className={cn("h-4 w-4 shrink-0", item.color || (active ? "text-primary" : "text-muted-foreground"))} />
                          <span className="flex-1 text-left">{item.title}</span>
                          {active && <ChevronRight className="h-3.5 w-3.5 text-primary/60" />}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          <div className="border-t px-4 py-3">
            <button
              onClick={() => handleMenuNav("/profile")}
              className="flex items-center gap-3 w-full text-left"
              data-testid="mobile-menu-profile"
            >
              <Avatar className="h-8 w-8">
                {user?.avatarUrl && <AvatarImage src={user.avatarUrl} />}
                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {user?.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : user?.email || "User"}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {user?.email || ""}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          </div>
        </div>
      </AppDrawer>

      <Dialog open={showQuickActions} onOpenChange={setShowQuickActions}>
        <DialogContent className="sm:max-w-[320px] rounded-t-xl sm:rounded-xl bottom-0 sm:bottom-auto fixed sm:relative translate-y-0 sm:-translate-y-1/2">
          <DialogHeader>
            <DialogTitle className="text-center">Quick Actions</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 pt-2">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Button
                  key={action.title}
                  variant="outline"
                  size="lg"
                  className="justify-start gap-3 h-14"
                  onClick={() => handleQuickAction(action)}
                  data-testid={`quick-action-${action.title.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <div className="rounded-full bg-primary/10 p-2 shrink-0">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="text-left">
                    <div className="font-medium text-sm">{action.title}</div>
                    <div className="text-xs text-muted-foreground">{action.description}</div>
                  </div>
                </Button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
