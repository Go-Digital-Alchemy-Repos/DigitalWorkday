// ─────────────────────────────────────────────────────────────────────────────
// Guided Tours Store — React Context + useReducer
// Manages the in-memory state of the tour system.
// No Zustand — consistent with the existing app pattern of React Context.
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useContext } from "react";
import type {
  GuidedToursState,
  GuidedToursAction,
  GuidedTourProgress,
} from "../types";

// ── Initial State ─────────────────────────────────────────────────────────────

export const initialGuidedToursState: GuidedToursState = {
  activeTourId: null,
  activeStepIndex: 0,
  isRunning: false,
  toursEnabled: true,
  contextualHintsEnabled: true,
  isGuidanceCenterOpen: false,
  isOnboardingModalOpen: false,
  preferences: {
    contextualHintsEnabled: true,
    autoplayOnboarding: false,
  },
  progress: {},
  dismissedTourIds: new Set(),
  dismissedHintVersions: {},
};

// ── Reducer ───────────────────────────────────────────────────────────────────

export function guidedToursReducer(
  state: GuidedToursState,
  action: GuidedToursAction
): GuidedToursState {
  switch (action.type) {
    case "START_TOUR":
      return {
        ...state,
        activeTourId: action.tourId,
        activeStepIndex: state.progress[action.tourId]?.currentStepIndex ?? 0,
        isRunning: true,
        isGuidanceCenterOpen: false,
      };

    case "STOP_TOUR":
      return {
        ...state,
        activeTourId: null,
        activeStepIndex: 0,
        isRunning: false,
      };

    case "NEXT_STEP":
      return {
        ...state,
        activeStepIndex: state.activeStepIndex + 1,
      };

    case "PREV_STEP":
      return {
        ...state,
        activeStepIndex: Math.max(0, state.activeStepIndex - 1),
      };

    case "SET_STEP":
      return {
        ...state,
        activeStepIndex: action.stepIndex,
      };

    case "COMPLETE_TOUR": {
      const now = new Date().toISOString();
      const existing = state.progress[action.tourId];
      const updated: GuidedTourProgress = {
        tourId: action.tourId,
        tourVersion: existing?.tourVersion ?? 1,
        status: "completed",
        currentStepIndex: 0,
        completedAt: now,
        dismissedAt: existing?.dismissedAt ?? null,
        updatedAt: now,
      };
      return {
        ...state,
        activeTourId: null,
        activeStepIndex: 0,
        isRunning: false,
        progress: { ...state.progress, [action.tourId]: updated },
      };
    }

    case "DISMISS_TOUR": {
      const now = new Date().toISOString();
      const existing = state.progress[action.tourId];
      const updated: GuidedTourProgress = {
        tourId: action.tourId,
        tourVersion: existing?.tourVersion ?? 1,
        status: "dismissed",
        currentStepIndex: state.activeStepIndex,
        completedAt: existing?.completedAt ?? null,
        dismissedAt: now,
        updatedAt: now,
      };
      const newDismissed = new Set(state.dismissedTourIds);
      newDismissed.add(action.tourId);
      return {
        ...state,
        activeTourId: null,
        activeStepIndex: 0,
        isRunning: false,
        progress: { ...state.progress, [action.tourId]: updated },
        dismissedTourIds: newDismissed,
      };
    }

    case "TOGGLE_TOURS":
      return { ...state, toursEnabled: action.enabled };

    case "TOGGLE_CONTEXTUAL_HINTS":
      return {
        ...state,
        contextualHintsEnabled: action.enabled,
        preferences: {
          ...state.preferences,
          contextualHintsEnabled: action.enabled,
        },
      };

    case "OPEN_GUIDANCE_CENTER":
      return { ...state, isGuidanceCenterOpen: true };

    case "CLOSE_GUIDANCE_CENTER":
      return { ...state, isGuidanceCenterOpen: false };

    case "LOAD_PROGRESS": {
      const dismissed = new Set(
        Object.values(action.progress)
          .filter((p) => p.status === "dismissed")
          .map((p) => p.tourId)
      );
      return {
        ...state,
        progress: action.progress,
        dismissedTourIds: dismissed,
      };
    }

    case "LOAD_PREFERENCES":
      return {
        ...state,
        preferences: action.preferences,
        contextualHintsEnabled: action.preferences.contextualHintsEnabled,
      };

    case "DISMISS_HINT":
      return {
        ...state,
        dismissedHintVersions: {
          ...state.dismissedHintVersions,
          [action.hintId]: action.version,
        },
      };

    case "RESET_DISMISSED_HINTS":
      return { ...state, dismissedHintVersions: {} };

    case "LOAD_DISMISSED_HINTS":
      return { ...state, dismissedHintVersions: action.dismissedHintVersions };

    case "OPEN_ONBOARDING":
      return {
        ...state,
        isOnboardingModalOpen: true,
        isGuidanceCenterOpen: false, // close guidance center if open
      };

    case "CLOSE_ONBOARDING":
      return { ...state, isOnboardingModalOpen: false };

    default:
      return state;
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

export interface GuidedToursContextValue {
  state: GuidedToursState;
  dispatch: React.Dispatch<GuidedToursAction>;
}

export const GuidedToursContext = createContext<GuidedToursContextValue | null>(
  null
);

/** Internal hook — prefer useGuidedTours for product code */
export function useGuidedToursContext(): GuidedToursContextValue {
  const ctx = useContext(GuidedToursContext);
  if (!ctx) {
    throw new Error(
      "useGuidedToursContext must be used inside <GuidedTourProvider>"
    );
  }
  return ctx;
}
