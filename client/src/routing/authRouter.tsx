import { lazy, Suspense } from "react";
import { Switch, Route } from "wouter";
import { ProtectedRoute } from "./guards";
import { PageSkeleton } from "@/components/skeletons/page-skeleton";
import { trackChunkLoad } from "@/lib/perf";
import LoginPage from "@/pages/login";

const TenantOnboardingPage = lazy(trackChunkLoad("TenantOnboarding", () => import("@/pages/tenant-onboarding")));
const AcceptTermsPage = lazy(trackChunkLoad("AcceptTerms", () => import("@/pages/accept-terms")));
const PlatformInvitePage = lazy(trackChunkLoad("PlatformInvite", () => import("@/pages/platform-invite")));
const AcceptInvitePage = lazy(trackChunkLoad("AcceptInvite", () => import("@/pages/accept-invite")));
const ForgotPasswordPage = lazy(trackChunkLoad("ForgotPassword", () => import("@/pages/forgot-password")));
const ResetPasswordPage = lazy(trackChunkLoad("ResetPassword", () => import("@/pages/reset-password")));

const AUTH_PATHS = [
  "/login",
  "/tenant-onboarding",
  "/accept-terms",
  "/auth/platform-invite",
  "/accept-invite/",
  "/auth/forgot-password",
  "/auth/reset-password",
];

export function isAuthRoute(location: string): boolean {
  return AUTH_PATHS.some((p) => location === p || location.startsWith(p));
}

export function AuthRouter() {
  return (
    <Suspense fallback={<PageSkeleton />}>
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
