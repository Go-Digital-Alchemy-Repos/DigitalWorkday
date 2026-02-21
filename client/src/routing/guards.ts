import { useEffect, useRef } from "react";
import { Redirect, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useAppMode } from "@/hooks/useAppMode";
import { useToast } from "@/hooks/use-toast";
import { setLastAttemptedTenantUrl, isTenantRoute } from "@/lib/tenant-url-storage";
import { markNavigationStart, markNavigationEnd } from "@/lib/perf";
import { Loader2 } from "lucide-react";
import { createElement } from "react";

function useNavTiming(componentName: string) {
  const started = useRef(false);
  if (!started.current) {
    started.current = true;
    markNavigationStart(componentName);
  }
  useEffect(() => {
    markNavigationEnd(componentName);
  }, [componentName]);
}

function LoadingSpinner() {
  return createElement(
    "div",
    { className: "flex items-center justify-center h-full" },
    createElement(Loader2, { className: "h-8 w-8 animate-spin text-muted-foreground" })
  );
}

export function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return createElement(LoadingSpinner);
  }

  if (!isAuthenticated) {
    return createElement(Redirect, { to: "/login" });
  }

  return createElement(Component);
}

export function SuperRouteGuard({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return createElement(LoadingSpinner);
  }

  if (!isAuthenticated) {
    return createElement(Redirect, { to: "/login" });
  }

  if (user?.role !== "super_user") {
    return createElement(Redirect, { to: "/" });
  }

  return createElement(Component);
}

export function TenantRouteGuard({ component: Component }: { component: React.ComponentType }) {
  useNavTiming(Component.displayName || Component.name || "TenantView");
  const { isAuthenticated, isLoading, user } = useAuth();
  const { appMode } = useAppMode();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && isAuthenticated && user?.role === "super_user" && appMode === "super") {
      if (isTenantRoute(location)) {
        setLastAttemptedTenantUrl(location);
      }
      toast({
        title: "Tenant access required",
        description: "Switch to a tenant to access this page.",
      });
      setLocation("/super-admin/dashboard");
    }
  }, [isLoading, isAuthenticated, user?.role, appMode, toast, setLocation, location]);

  if (isLoading) {
    return createElement(LoadingSpinner);
  }

  if (!isAuthenticated) {
    return createElement(Redirect, { to: "/login" });
  }

  if (user?.role === "super_user" && appMode === "super") {
    if (isTenantRoute(location)) {
      setLastAttemptedTenantUrl(location);
    }
    return createElement(Redirect, { to: "/super-admin/dashboard" });
  }

  return createElement(Component);
}

export function ClientPortalRouteGuard({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return createElement(LoadingSpinner);
  }

  if (!isAuthenticated) {
    return createElement(Redirect, { to: "/login" });
  }

  if (user?.role !== "client") {
    return createElement(Redirect, { to: "/" });
  }

  return createElement(Component);
}

export type GuardRole = "super_user" | "client" | "tenant" | "authenticated";

const GUARD_MAP: Record<GuardRole, React.ComponentType<{ component: React.ComponentType }>> = {
  super_user: SuperRouteGuard,
  client: ClientPortalRouteGuard,
  tenant: TenantRouteGuard,
  authenticated: ProtectedRoute,
};

export function withRoleGuard(role: GuardRole) {
  const Guard = GUARD_MAP[role];
  return function GuardedRoute({ component }: { component: React.ComponentType }) {
    return createElement(Guard, { component });
  };
}
