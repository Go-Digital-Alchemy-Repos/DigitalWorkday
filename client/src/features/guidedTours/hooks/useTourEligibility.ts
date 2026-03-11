// ─────────────────────────────────────────────────────────────────────────────
// useTourEligibility
// Filters the tour registry down to only the tours eligible for the current
// user based on role, current route, feature flags, and completion state.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { useLocation } from "wouter";
import { getAllTours } from "../lib/tourRegistry";
import { useGuidedToursContext } from "../store/guidedToursStore";
import type { GuidedTour, TourRole } from "../types";

interface UseTourEligibilityOptions {
  /** The current user's role. Pass "*" if role is unknown. */
  userRole: TourRole;
  /** Feature flag keys currently active (from useFeatureFlags or similar) */
  enabledFeatureFlags?: string[];
  /** Whether to exclude completed tours from the eligible list */
  excludeCompleted?: boolean;
  /** Whether to exclude dismissed tours from the eligible list */
  excludeDismissed?: boolean;
}

interface TourEligibilityResult {
  /** All tours eligible for this user in any context */
  eligibleTours: GuidedTour[];
  /** Tours eligible on the current route specifically */
  eligibleForCurrentRoute: GuidedTour[];
  /** Eligible tours that haven't been completed or dismissed */
  unseenTours: GuidedTour[];
}

export function useTourEligibility({
  userRole,
  enabledFeatureFlags = [],
  excludeCompleted = false,
  excludeDismissed = false,
}: UseTourEligibilityOptions): TourEligibilityResult {
  const [location] = useLocation();
  const { state } = useGuidedToursContext();
  const { progress, toursEnabled } = state;

  const eligibleTours = useMemo(() => {
    if (!toursEnabled) return [];

    return getAllTours().filter((tour) => {
      // Role check
      if (
        !tour.allowedRoles.includes("*") &&
        !tour.allowedRoles.includes(userRole)
      ) {
        return false;
      }

      // Feature flag requirements
      if (tour.requiredFeatureFlags && tour.requiredFeatureFlags.length > 0) {
        const satisfied = tour.requiredFeatureFlags.every((flag) =>
          enabledFeatureFlags.includes(flag)
        );
        if (!satisfied) return false;
      }

      return true;
    });
  }, [toursEnabled, userRole, enabledFeatureFlags]);

  const eligibleForCurrentRoute = useMemo(() => {
    return eligibleTours.filter((tour) =>
      tour.relevantRoutes.some((pattern) => routeMatches(location, pattern))
    );
  }, [eligibleTours, location]);

  const unseenTours = useMemo(() => {
    return eligibleTours.filter((tour) => {
      const p = progress[tour.id];
      if (!p) return true;
      if (excludeCompleted && p.status === "completed") return false;
      if (excludeDismissed && p.status === "dismissed") return false;
      return true;
    });
  }, [eligibleTours, progress, excludeCompleted, excludeDismissed]);

  return { eligibleTours, eligibleForCurrentRoute, unseenTours };
}

// ── Route Matching ────────────────────────────────────────────────────────────

function routeMatches(pathname: string, pattern: string): boolean {
  if (pattern === pathname) return true;
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -2);
    return pathname === prefix || pathname.startsWith(prefix + "/");
  }
  return false;
}
