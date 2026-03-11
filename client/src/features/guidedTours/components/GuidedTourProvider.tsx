// ─────────────────────────────────────────────────────────────────────────────
// GuidedTourProvider
// Top-level provider that:
//  - Bootstraps the store (useReducer)
//  - Loads preferences + progress from backend API (graceful fallback on error)
//  - Hydrates store from localStorage until API responds (fast initial render)
//  - Manages the adapter lifecycle (cleanup on unmount)
//  - Exposes context via GuidedToursContext
// ─────────────────────────────────────────────────────────────────────────────

import { useReducer, useEffect, type ReactNode } from "react";
import {
  GuidedToursContext,
  guidedToursReducer,
  initialGuidedToursState,
} from "../store/guidedToursStore";
import { getAdapter, resetAdapter } from "../lib/tourEngineAdapter";
import {
  loadLocalPreferences,
  loadLocalProgress,
  saveLocalPreferences,
  saveLocalProgress,
} from "../lib/tourPersistence";
import { loadDismissedHints } from "../lib/hintPersistence";
import type { GuidedTourProgress } from "../types";
import { useTourPreferences, useTourProgressList } from "../hooks/useTourApi";
import { useAuthSafe } from "@/lib/auth";
import { useFirstRunOnboarding } from "../hooks/useFirstRunOnboarding";

interface GuidedTourProviderProps {
  children: ReactNode;
  /** Set false to disable the entire system (e.g. feature flag off) */
  enabled?: boolean;
}

// ── First-run trigger — must live inside the context so it can dispatch ───────

function FirstRunOnboardingTrigger() {
  useFirstRunOnboarding();
  return null;
}

// Inner component — needs to be inside QueryClientProvider to use hooks
function GuidedTourProviderInner({
  children,
  enabled,
}: GuidedTourProviderProps) {
  const [state, dispatch] = useReducer(guidedToursReducer, {
    ...initialGuidedToursState,
    toursEnabled: enabled ?? true,
    dismissedHintVersions: loadDismissedHints(),
  });

  // Only fire API calls when the user is actually authenticated
  const { isAuthenticated } = useAuthSafe() ?? { isAuthenticated: false };

  // ── Load API data ─────────────────────────────────────────────────────────
  const { data: apiPrefs } = useTourPreferences({ enabled: isAuthenticated });
  const { data: apiProgress } = useTourProgressList({ enabled: isAuthenticated });

  // Hydrate preferences: localStorage first (instant), then API (authoritative)
  useEffect(() => {
    if (!enabled) return;
    const local = loadLocalPreferences();
    if (local) {
      dispatch({ type: "LOAD_PREFERENCES", preferences: local });
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !apiPrefs) return;
    const prefs = {
      contextualHintsEnabled: apiPrefs.contextualHintsEnabled,
      autoplayOnboarding: false, // never auto-play
    };
    dispatch({ type: "LOAD_PREFERENCES", preferences: prefs });
    dispatch({ type: "TOGGLE_TOURS", enabled: apiPrefs.toursEnabled });
    saveLocalPreferences(prefs);
  }, [enabled, apiPrefs]);

  // Hydrate progress: localStorage first, then API
  useEffect(() => {
    if (!enabled) return;
    const local = loadLocalProgress();
    if (Object.keys(local).length > 0) {
      dispatch({ type: "LOAD_PROGRESS", progress: local });
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !apiProgress) return;
    const progressMap: Record<string, GuidedTourProgress> = {};
    for (const row of apiProgress) {
      progressMap[row.tourKey] = {
        tourId: row.tourKey,
        tourVersion: row.tourVersion,
        status: row.status as GuidedTourProgress["status"],
        currentStepIndex: row.currentStepIndex,
        completedAt: row.completedAt?.toString() ?? null,
        dismissedAt: row.dismissedAt?.toString() ?? null,
        updatedAt: row.updatedAt?.toString() ?? new Date().toISOString(),
      };
    }
    dispatch({ type: "LOAD_PROGRESS", progress: progressMap });
    saveLocalProgress(progressMap);
  }, [enabled, apiProgress]);

  // Sync enabled prop at runtime
  useEffect(() => {
    dispatch({ type: "TOGGLE_TOURS", enabled: enabled ?? true });
  }, [enabled]);

  // Cleanup adapter on unmount
  useEffect(() => {
    const adapter = getAdapter();
    return () => {
      if (adapter.isActive()) adapter.cleanup();
      resetAdapter();
    };
  }, []);

  return (
    <GuidedToursContext.Provider value={{ state, dispatch }}>
      <FirstRunOnboardingTrigger />
      {children}
    </GuidedToursContext.Provider>
  );
}

export function GuidedTourProvider({ children, enabled = true }: GuidedTourProviderProps) {
  // Outer wrapper is inert if disabled — saves hook calls
  if (!enabled) {
    return (
      <GuidedToursContext.Provider
        value={{ state: { ...initialGuidedToursState, toursEnabled: false }, dispatch: () => {} }}
      >
        {children}
      </GuidedToursContext.Provider>
    );
  }
  return <GuidedTourProviderInner enabled={enabled}>{children}</GuidedTourProviderInner>;
}
