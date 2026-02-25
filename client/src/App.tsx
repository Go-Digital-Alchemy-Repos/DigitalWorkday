import { lazy, Suspense } from "react";
import { useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-provider";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { AuthProvider, useAuth } from "@/lib/auth";
import { TenantThemeProvider } from "@/lib/tenant-theme-loader";
import { useAppMode } from "@/hooks/useAppMode";
import { PresenceProvider } from "@/hooks/use-presence";
import { TypingProvider } from "@/hooks/use-typing";
import { FeaturesProvider } from "@/contexts/features-context";
import { FeaturesBanner } from "@/components/features-banner";
import { isAuthRoute, AuthRouter } from "@/routing/authRouter";
import { PageSkeleton } from "@/components/skeletons/page-skeleton";
import { ErrorBoundary } from "@/components/error-boundary";
import { useDragDropFix } from "@/hooks/use-drag-fix";

const TenantLayout = lazy(() => import("@/routing/tenantRouter").then(m => ({ default: m.TenantLayout })));
const SuperLayout = lazy(() => import("@/routing/superRouter").then(m => ({ default: m.SuperLayout })));
const ClientPortalLayout = lazy(() => import("@/routing/portalRouter").then(m => ({ default: m.ClientPortalLayout })));

function AppLayout() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { appMode } = useAppMode();
  const [location] = useLocation();

  const suspenseFallback = <PageSkeleton />;

  if (isAuthRoute(location)) {
    return <ErrorBoundary><AuthRouter /></ErrorBoundary>;
  }

  if (isLoading) {
    return suspenseFallback;
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  const isSuperUser = user?.role === "super_user";
  const isClientUser = user?.role === "client";
  const isSuperRoute = location.startsWith("/super-admin");
  const isPortalRoute = location.startsWith("/portal");

  if (isClientUser) {
    if (!isPortalRoute) {
      return <Redirect to="/portal" />;
    }
    return <Suspense fallback={suspenseFallback}><ClientPortalLayout /></Suspense>;
  }

  if (isPortalRoute && !isClientUser) {
    return <Redirect to="/" />;
  }

  if (isSuperUser && appMode === "super") {
    if (!isSuperRoute) {
      return <Redirect to="/super-admin/dashboard" />;
    }
    return <Suspense fallback={suspenseFallback}><SuperLayout /></Suspense>;
  }

  if (isSuperRoute && (!isSuperUser || appMode === "tenant")) {
    return <Redirect to="/" />;
  }

  return <Suspense fallback={suspenseFallback}><TenantLayout /></Suspense>;
}

function UserImpersonationWrapper({ children }: { children: React.ReactNode }) {
  const { userImpersonation } = useAuth();
  
  if (userImpersonation?.isImpersonating) {
    return (
      <div className="flex flex-col h-screen">
        <ImpersonationBanner userImpersonation={userImpersonation} />
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </div>
    );
  }
  
  return <>{children}</>;
}

function App() {
  useDragDropFix();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <AuthProvider>
            <PresenceProvider>
              <TypingProvider>
                <FeaturesProvider>
                  <TenantThemeProvider>
                    <UserImpersonationWrapper>
                      <FeaturesBanner />
                      <AppLayout />
                    </UserImpersonationWrapper>
                  </TenantThemeProvider>
                </FeaturesProvider>
              </TypingProvider>
            </PresenceProvider>
          </AuthProvider>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
