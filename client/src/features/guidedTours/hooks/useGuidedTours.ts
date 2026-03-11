// ─────────────────────────────────────────────────────────────────────────────
// useGuidedTours — Primary consumer hook for all product code
// Wraps the store dispatch + adapter calls into a stable, typed API.
//
// Responsibilities:
//   - Start / stop / replay tours
//   - Sync step progress, completion, dismissal to backend API
//   - Navigate to requiredRoute before showing a step (multi-route tours)
//   - Prevent duplicate launches (isRunning guard)
//   - Persist preference toggles to both localStorage and backend API
//   - Expose Guidance Center open/close helpers
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback } from "react";
import { useLocation } from "wouter";
import { useGuidedToursContext } from "../store/guidedToursStore";
import { getAdapter } from "../lib/tourEngineAdapter";
import { getTourById } from "../lib/tourRegistry";
import {
  markTourDismissed,
  markTourCompleted,
  resetTourProgress,
  saveLocalProgress,
  saveLocalPreferences,
  loadLocalPreferences,
} from "../lib/tourPersistence";
import {
  useCompleteTour,
  useDismissTour,
  useUpdateTourProgress,
  useUpdateTourPreferences,
  useResetTour,
} from "./useTourApi";
import type { TourTriggerSource, GuidedTourProgress } from "../types";

const DEV = import.meta.env.DEV;

function log(msg: string, ...args: unknown[]) {
  if (DEV) console.debug("[useGuidedTours]", msg, ...args);
}

export function useGuidedTours() {
  const { state, dispatch } = useGuidedToursContext();
  const adapter = getAdapter();
  const [, setLocation] = useLocation();

  // ── Backend mutations ────────────────────────────────────────────────────
  const completeMutation = useCompleteTour();
  const dismissMutation = useDismissTour();
  const progressMutation = useUpdateTourProgress();
  const prefsMutation = useUpdateTourPreferences();
  const resetTourMutation = useResetTour();

  // ── Start a tour ─────────────────────────────────────────────────────────

  const startTour = useCallback(
    (tourId: string, triggerSource: TourTriggerSource = "manual") => {
      if (!state.toursEnabled) {
        log("Tours disabled — skipping", tourId);
        return;
      }

      if (state.isRunning && state.activeTourId !== tourId) {
        log("Another tour is already running — skipping", tourId, "active:", state.activeTourId);
        return;
      }

      const tour = getTourById(tourId);
      if (!tour) {
        console.warn("[useGuidedTours] Tour not found:", tourId);
        return;
      }

      const resumeStep = state.progress[tourId]?.currentStepIndex ?? 0;

      dispatch({ type: "START_TOUR", tourId, triggerSource });

      // Navigate to the route of the first step if needed
      const firstStep = tour.steps[resumeStep] ?? tour.steps[0];
      if (firstStep?.requiredRoute) {
        const current = window.location.pathname;
        if (current !== firstStep.requiredRoute && !current.startsWith(firstStep.requiredRoute + "/")) {
          setLocation(firstStep.requiredRoute);
        }
      }

      adapter.startTour(tour.steps, {
        onStepChange: (stepIndex) => {
          dispatch({ type: "SET_STEP", stepIndex });
          // Navigate if this step requires a different route
          const nextStep = tour.steps[stepIndex];
          if (nextStep?.requiredRoute) {
            const current = window.location.pathname;
            if (current !== nextStep.requiredRoute && !current.startsWith(nextStep.requiredRoute + "/")) {
              setLocation(nextStep.requiredRoute);
            }
          }
          // Sync step progress to backend (fire-and-forget)
          progressMutation.mutate({
            tourKey: tourId,
            data: {
              status: "in_progress",
              currentStepIndex: stepIndex,
              tourVersion: tour.version,
            },
          });
        },

        onComplete: () => {
          dispatch({ type: "COMPLETE_TOUR", tourId });
          markTourCompleted(tourId, tour.version);
          completeMutation.mutate({ tourKey: tourId, tourVersion: tour.version });
          log("Tour completed:", tourId);
        },

        onDismiss: () => {
          const currentStep = state.activeStepIndex;
          dispatch({ type: "DISMISS_TOUR", tourId });
          markTourDismissed(tourId);
          dismissMutation.mutate({
            tourKey: tourId,
            tourVersion: tour.version,
            currentStepIndex: currentStep,
          });
          log("Tour dismissed at step", currentStep, ":", tourId);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.toursEnabled, state.isRunning, state.activeTourId, state.progress, state.activeStepIndex, dispatch, adapter, setLocation]
  );

  // ── Next / prev step ─────────────────────────────────────────────────────

  const nextStep = useCallback(() => {
    if (!state.isRunning) return;
    adapter.nextStep();
  }, [state.isRunning, adapter]);

  const prevStep = useCallback(() => {
    if (!state.isRunning) return;
    adapter.prevStep();
  }, [state.isRunning, adapter]);

  // ── Stop / dismiss ───────────────────────────────────────────────────────

  const stopTour = useCallback(() => {
    if (state.activeTourId) {
      adapter.stopTour(); // triggers onDismiss callback above
    } else {
      dispatch({ type: "STOP_TOUR" });
    }
  }, [state.activeTourId, dispatch, adapter]);

  // ── Replay a completed or dismissed tour ─────────────────────────────────

  const replayTour = useCallback(
    (tourId: string) => {
      // Reset localStorage progress for this tour
      resetTourProgress(tourId);
      const tour = getTourById(tourId);
      const resetted: GuidedTourProgress = {
        tourId,
        tourVersion: tour?.version ?? 1,
        status: "not_started",
        currentStepIndex: 0,
        completedAt: null,
        dismissedAt: null,
        updatedAt: new Date().toISOString(),
      };
      const updatedProgress = { ...state.progress, [tourId]: resetted };
      dispatch({ type: "LOAD_PROGRESS", progress: updatedProgress });
      saveLocalProgress(updatedProgress);

      // Sync reset to backend (fire-and-forget — don't block the UI)
      resetTourMutation.mutate(tourId);

      startTour(tourId, "manual");
    },
    [state.progress, dispatch, startTour, resetTourMutation]
  );

  // ── Guidance Center ──────────────────────────────────────────────────────

  const openGuidanceCenter = useCallback(() => {
    dispatch({ type: "OPEN_GUIDANCE_CENTER" });
  }, [dispatch]);

  const closeGuidanceCenter = useCallback(() => {
    dispatch({ type: "CLOSE_GUIDANCE_CENTER" });
  }, [dispatch]);

  // ── Onboarding modal ─────────────────────────────────────────────────────

  const openOnboarding = useCallback(() => {
    dispatch({ type: "OPEN_ONBOARDING" });
  }, [dispatch]);

  const closeOnboarding = useCallback(() => {
    dispatch({ type: "CLOSE_ONBOARDING" });
  }, [dispatch]);

  // ── Preferences ──────────────────────────────────────────────────────────
  // Each toggle updates local store, persists to localStorage, and syncs to backend.

  const toggleToursEnabled = useCallback(
    (enabled: boolean) => {
      dispatch({ type: "TOGGLE_TOURS", enabled });
      // Persist locally
      const currentPrefs = loadLocalPreferences() ?? {
        contextualHintsEnabled: state.preferences.contextualHintsEnabled,
        autoplayOnboarding: false,
      };
      saveLocalPreferences({ ...currentPrefs });
      // Sync to backend (fire-and-forget)
      prefsMutation.mutate({ toursEnabled: enabled });
    },
    [dispatch, state.preferences.contextualHintsEnabled, prefsMutation]
  );

  const toggleContextualHints = useCallback(
    (enabled: boolean) => {
      dispatch({ type: "TOGGLE_CONTEXTUAL_HINTS", enabled });
      // Persist locally
      const newPrefs = {
        contextualHintsEnabled: enabled,
        autoplayOnboarding: false,
      };
      saveLocalPreferences(newPrefs);
      // Sync to backend (fire-and-forget)
      prefsMutation.mutate({ contextualHintsEnabled: enabled });
    },
    [dispatch, prefsMutation]
  );

  // ── Derived helpers ──────────────────────────────────────────────────────

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
    isOnboardingModalOpen: state.isOnboardingModalOpen,
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
    openOnboarding,
    closeOnboarding,
    toggleToursEnabled,
    toggleContextualHints,

    // Helpers
    isTourCompleted,
    isTourDismissed,
  };
}
