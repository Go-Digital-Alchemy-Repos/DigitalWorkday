// ─────────────────────────────────────────────────────────────────────────────
// useFirstRunOnboarding
// Auto-trigger logic for the first-run onboarding modal.
//
// Mounts inside GuidedTourProvider so it has access to the store.
// Fires OPEN_ONBOARDING after a short delay when ALL conditions are met:
//   1. User is authenticated
//   2. Tours are enabled in the store
//   3. Onboarding has NOT been acknowledged (localStorage)
//   4. Onboarding has NOT been deferred this session (sessionStorage)
//   5. A tour is not currently running (avoid interrupting an active tour)
//   6. The Guidance Center is not open
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";
import { useAuthSafe } from "@/lib/auth";
import { useGuidedToursContext } from "../store/guidedToursStore";
import {
  isOnboardingAcknowledged,
  isOnboardingDeferredThisSession,
} from "../lib/onboardingPersistence";

/** Mount this inside GuidedTourProvider to auto-trigger the onboarding modal. */
export function useFirstRunOnboarding() {
  const { state, dispatch } = useGuidedToursContext();
  const auth = useAuthSafe();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false); // only auto-trigger once per mount

  useEffect(() => {
    // Guard: not yet authenticated
    if (!auth?.user) return;

    // Guard: already fired in this mount cycle
    if (firedRef.current) return;

    // Guard: onboarding already acknowledged or deferred this session
    if (isOnboardingAcknowledged()) return;
    if (isOnboardingDeferredThisSession()) return;

    // Guard: tours disabled
    if (!state.toursEnabled) return;

    // Guard: a tour is actively running — wait for it to finish
    if (state.isRunning) return;

    // Guard: Guidance Center is already open
    if (state.isGuidanceCenterOpen) return;

    // Guard: modal already open (prevent double dispatch)
    if (state.isOnboardingModalOpen) return;

    // All conditions met — delay slightly so the page has time to settle
    timerRef.current = setTimeout(() => {
      dispatch({ type: "OPEN_ONBOARDING" });
      firedRef.current = true;
    }, 700);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // We only want to run this once the user is authenticated and the initial
  // state is loaded; intentionally not listing all deps to avoid re-triggering.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.user?.id, state.toursEnabled, state.isRunning]);
}
