// ─────────────────────────────────────────────────────────────────────────────
// GuidedTourProvider
// Top-level provider that:
//  - Bootstraps the store (useReducer)
//  - Loads persisted preferences and progress from localStorage
//  - Manages the adapter lifecycle (cleanup on unmount)
//  - Exposes context to children via GuidedToursContext
//  - Remains fully inert until a tour is explicitly started
//
// Mount this once inside App.tsx, inside AuthProvider + FeaturesProvider.
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
} from "../lib/tourPersistence";

interface GuidedTourProviderProps {
  children: ReactNode;
  /** Set to false to disable the entire tour system (e.g. feature flag off) */
  enabled?: boolean;
}

export function GuidedTourProvider({
  children,
  enabled = true,
}: GuidedTourProviderProps) {
  const [state, dispatch] = useReducer(
    guidedToursReducer,
    {
      ...initialGuidedToursState,
      toursEnabled: enabled,
    }
  );

  // ── Hydrate from localStorage on first mount ──────────────────────────────
  useEffect(() => {
    if (!enabled) return;

    const savedPrefs = loadLocalPreferences();
    if (savedPrefs) {
      dispatch({ type: "LOAD_PREFERENCES", preferences: savedPrefs });
    }

    const savedProgress = loadLocalProgress();
    if (Object.keys(savedProgress).length > 0) {
      dispatch({ type: "LOAD_PROGRESS", progress: savedProgress });
    }
  }, [enabled]);

  // ── Sync toursEnabled if the prop changes at runtime ──────────────────────
  useEffect(() => {
    dispatch({ type: "TOGGLE_TOURS", enabled });
  }, [enabled]);

  // ── Cleanup adapter on unmount ────────────────────────────────────────────
  useEffect(() => {
    const adapter = getAdapter();
    return () => {
      if (adapter.isActive()) {
        adapter.cleanup();
      }
      resetAdapter();
    };
  }, []);

  return (
    <GuidedToursContext.Provider value={{ state, dispatch }}>
      {children}
    </GuidedToursContext.Provider>
  );
}
