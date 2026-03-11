// ─────────────────────────────────────────────────────────────────────────────
// useReleaseTourAutoLaunch
//
// Automatically surfaces the latest unseen "What's New" release tour once per
// user per release version. Mounts inside GuidedTourProvider as a side-effect-
// only component (returns null).
//
// Launch conditions (ALL must be true):
//   1. User is authenticated
//   2. Guided tours are enabled
//   3. No other tour is currently running
//   4. The Guidance Center is not open
//   5. The first-run onboarding modal is not open
//   6. First-run onboarding has been permanently acknowledged (user is not new)
//   7. There is a registered release tour in the registry
//   8. The user's role matches the tour's allowedRoles
//   9. This release version has NOT been seen yet (releaseTourPersistence)
//
// The hook fires at most once per mount cycle (firedRef guard).
// Delay: 1 500 ms — slightly after the first-run onboarding 700 ms window so
// the two never overlap in the same session.
//
// How to add a new release tour
// ─────────────────────────────
// 1. In tourRegistry.ts add a new entry with:
//      tourType: "release"
//      releaseVersion: "<unique-key>"   e.g. "q2-2025"
//      releaseLabel:  "<display-name>"  e.g. "Q2 2025"
// 2. Place it AFTER all previous release tours — `getLatestReleaseTour()`
//    picks the last release tour defined in the TOURS array.
// 3. That's it. The auto-launch and Guidance Center section handle themselves.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";
import { useGuidedToursContext } from "../store/guidedToursStore";
import { useGuidedTours } from "./useGuidedTours";
import { useAuthSafe } from "@/lib/auth";
import { getLatestReleaseTour } from "../lib/tourRegistry";
import {
  isReleaseTourSeen,
  markReleaseTourSeen,
} from "../lib/releaseTourPersistence";
import { isOnboardingAcknowledged } from "../lib/onboardingPersistence";

const AUTO_LAUNCH_DELAY_MS = 1500;

export function useReleaseTourAutoLaunch() {
  const { state } = useGuidedToursContext();
  const { startTour } = useGuidedTours();
  const auth = useAuthSafe();
  const firedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Guard 1: user not authenticated yet
    if (!auth?.user) return;

    // Guard 2: already fired this mount cycle
    if (firedRef.current) return;

    // Guard 3: tours disabled
    if (!state.toursEnabled) return;

    // Guard 4: a tour is already running
    if (state.isRunning) return;

    // Guard 5: Guidance Center is open
    if (state.isGuidanceCenterOpen) return;

    // Guard 6: onboarding modal is open (don't overlap)
    if (state.isOnboardingModalOpen) return;

    // Guard 7: user is brand-new (first-run not acknowledged) — let onboarding
    //           show first; release tour will surface on the NEXT session.
    if (!isOnboardingAcknowledged()) return;

    // Guard 8: find the latest release tour in the registry
    const tour = getLatestReleaseTour();
    if (!tour?.releaseVersion) return;

    // Guard 9: already seen this version
    if (isReleaseTourSeen(tour.releaseVersion)) return;

    // Guard 10: role eligibility
    const role = auth.user.role;
    if (
      !tour.allowedRoles.includes("*") &&
      !tour.allowedRoles.includes(role as typeof tour.allowedRoles[number])
    ) return;

    // All guards passed — schedule the auto-launch
    timerRef.current = setTimeout(() => {
      // Re-check running state at time of launch (state may have changed)
      if (state.isRunning) return;

      // Mark as seen immediately so we never auto-launch twice, even if the
      // tour errors out or the user dismisses it on step 1.
      markReleaseTourSeen(tour.releaseVersion!, "seen");
      firedRef.current = true;

      startTour(tour.id, "programmatic");
    }, AUTO_LAUNCH_DELAY_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // Intentionally limited deps — we want this to fire once after auth settles.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.user?.id, state.toursEnabled, state.isRunning, state.isOnboardingModalOpen]);
}
