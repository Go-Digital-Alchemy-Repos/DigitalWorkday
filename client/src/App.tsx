import { lazy, Suspense } from "react";
import { Switch, Route, useLocation, Redirect } from "wouter";
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
import { ProtectedRoute } from "@/routing/guards";
import { Loader2 } from "lucide-react";

const TenantLayout = lazy(() => import("@/routing/tenantRouter").then(m => ({ default: m.TenantLayout })));
const SuperLayout = lazy(() => import("@/routing/superRouter").then(m => ({ default: m.SuperLayout })));
const ClientPortalLayout = lazy(() => import("@/routing/portalRouter").then(m => ({ default: m.ClientPortalLayout })));
const LoginPage = lazy(() => import("@/pages/login"));
const TenantOnboardingPage = lazy(() => import("@/pages/tenant-onboarding"));
const AcceptTermsPage = lazy(() => import("@/pages/accept-terms"));
const PlatformInvitePage = lazy(() => import("@/pages/platform-invite"));
const AcceptInvitePage = lazy(() => import("@/pages/accept-invite"));
const ForgotPasswordPage = lazy(() => import("@/pages/forgot-password"));
const ResetPasswordPage = lazy(() => import("@/pages/reset-password"));

function AppLayout() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { appMode } = useAppMode();
  const [location] = useLocation();

  const suspenseFallback = (
    <div className="flex items-center justify-center h-screen">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );

  if (location === "/login" || location === "/tenant-onboarding" || location === "/accept-terms" || location.startsWith("/auth/platform-invite") || location.startsWith("/accept-invite/") || location.startsWith("/auth/forgot-password") || location.startsWith("/auth/reset-password")) {
    return (
      <Suspense fallback={suspenseFallback}>
        <Switch>
          <Route path="/login" component={LoginPage} />
          <Route path="/tenant-onboarding">
            {() => <ProtectedRoute component={TenantOnboardingPage} />}
          </Route>
          <Route path="/accept-terms">
            {() => <ProtectedRoute component={AcceptTermsPage} />}
          </Route>
          <Route path="/auth/platform-invite" component={PlatformInvitePage} />
          <Route path="/accept-invite/:token" component={AcceptInvitePage} />
          <Route path="/auth/forgot-password" component={ForgotPasswordPage} />
          <Route path="/auth/reset-password" component={ResetPasswordPage} />
        </Switch>
      </Suspense>
    );
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
