// ─────────────────────────────────────────────────────────────────────────────
// useGuidedTours — Primary consumer hook for all product code
// Wraps the store dispatch + adapter calls into a stable, typed API.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback } from "react";
import { useGuidedToursContext } from "../store/guidedToursStore";
import { getAdapter } from "../lib/tourEngineAdapter";
import { getTourById } from "../lib/tourRegistry";
import {
  markTourDismissed,
  markTourCompleted,
  resetTourProgress,
} from "../lib/tourPersistence";
import type { TourTriggerSource } from "../types";

const DEV = import.meta.env.DEV;

export function useGuidedTours() {
  const { state, dispatch } = useGuidedToursContext();
  const adapter = getAdapter();

  // ── Start a tour ────────────────────────────────────────────────────────────

  const startTour = useCallback(
    (tourId: string, triggerSource: TourTriggerSource = "manual") => {
      if (!state.toursEnabled) {
        if (DEV) console.debug("[useGuidedTours] Tours are disabled — skipping", tourId);
        return;
      }

      const tour = getTourById(tourId);
      if (!tour) {
        console.warn("[useGuidedTours] Tour not found:", tourId);
        return;
      }

      dispatch({ type: "START_TOUR", tourId, triggerSource });

      const resumeStep = state.progress[tourId]?.currentStepIndex ?? 0;

      adapter.startTour(tour.steps, {
        onStepChange: (stepIndex) => {
          dispatch({ type: "SET_STEP", stepIndex });
        },
        onComplete: () => {
          dispatch({ type: "COMPLETE_TOUR", tourId });
          markTourCompleted(tourId, tour.version);
        },
        onDismiss: () => {
          dispatch({ type: "DISMISS_TOUR", tourId });
          markTourDismissed(tourId);
        },
        onError: (err) => {
          console.error("[useGuidedTours] Adapter error:", err);
          dispatch({ type: "STOP_TOUR" });
        },
      });

      // Resume from saved step if applicable
      if (resumeStep > 0) {
        adapter.goToStep(resumeStep);
      }
    },
    [state.toursEnabled, state.progress, dispatch, adapter]
  );

  // ── Stop / dismiss the active tour ──────────────────────────────────────────

  const stopTour = useCallback(() => {
    if (state.activeTourId) {
      dispatch({ type: "DISMISS_TOUR", tourId: state.activeTourId });
      markTourDismissed(state.activeTourId);
    }
    adapter.stopTour();
  }, [state.activeTourId, dispatch, adapter]);

  // ── Navigation within the active tour ──────────────────────────────────────

  const nextStep = useCallback(() => {
    adapter.nextStep();
  }, [adapter]);

  const prevStep = useCallback(() => {
    adapter.prevStep();
  }, [adapter]);

  // ── Replay a completed or dismissed tour ────────────────────────────────────

  const replayTour = useCallback(
    (tourId: string) => {
      resetTourProgress(tourId);
      // Reset progress in store so resume doesn't skip to the end
      dispatch({
        type: "LOAD_PROGRESS",
        progress: { ...state.progress, [tourId]: {
          tourId,
          tourVersion: getTourById(tourId)?.version ?? 1,
          status: "not_started",
          currentStepIndex: 0,
          updatedAt: new Date().toISOString(),
        }},
      });
      startTour(tourId, "manual");
    },
    [state.progress, dispatch, startTour]
  );

  // ── Guidance Center ─────────────────────────────────────────────────────────

  const openGuidanceCenter = useCallback(() => {
    dispatch({ type: "OPEN_GUIDANCE_CENTER" });
  }, [dispatch]);

  const closeGuidanceCenter = useCallback(() => {
    dispatch({ type: "CLOSE_GUIDANCE_CENTER" });
  }, [dispatch]);

  // ── Preferences ─────────────────────────────────────────────────────────────

  const toggleToursEnabled = useCallback(
    (enabled: boolean) => {
      dispatch({ type: "TOGGLE_TOURS", enabled });
    },
    [dispatch]
  );

  const toggleContextualHints = useCallback(
    (enabled: boolean) => {
      dispatch({ type: "TOGGLE_CONTEXTUAL_HINTS", enabled });
    },
    [dispatch]
  );

  // ── Derived helpers ─────────────────────────────────────────────────────────

  const isTourCompleted = useCallback(
    (tourId: string) => state.progress[tourId]?.status === "completed",
    [state.progress]
  );

  const isTourDismissed = useCallback(
    (tourId: string) => state.dismissedTourIds.has(tourId),
    [state.dismissedTourIds]
  );

  const activeTour = state.activeTourId
    ? getTourById(state.activeTourId)
    : null;

  return {
    // State
    isRunning: state.isRunning,
    activeTourId: state.activeTourId,
    activeTour,
    activeStepIndex: state.activeStepIndex,
    toursEnabled: state.toursEnabled,
    contextualHintsEnabled: state.contextualHintsEnabled,
    isGuidanceCenterOpen: state.isGuidanceCenterOpen,
    preferences: state.preferences,
    progress: state.progress,

    // Actions
    startTour,
    stopTour,
    nextStep,
    prevStep,
    replayTour,
    openGuidanceCenter,
    closeGuidanceCenter,
    toggleToursEnabled,
    toggleContextualHints,

    // Helpers
    isTourCompleted,
    isTourDismissed,
  };
}
