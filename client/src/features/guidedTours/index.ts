// ─────────────────────────────────────────────────────────────────────────────
// Guided Tours — Public API
// Import from here, never from internal paths.
// ─────────────────────────────────────────────────────────────────────────────

// Types
export type {
  GuidedTour,
  GuidedTourStep,
  GuidedTourStatus,
  GuidedTourPreference,
  GuidedTourProgress,
  TourEligibilityContext,
  ContextualHintDefinition,
  TourTriggerSource,
  TourScope,
  TourRole,
  TourVersionState,
  TourEngineAdapter,
  TourEngineOptions,
  GuidedToursState,
  GuidedToursAction,
} from "./types";

// Registry
export {
  getAllTours,
  getTourById,
  getToursForRoute,
  getToursForRole,
  registerTour,
  TOUR_IDS,
} from "./lib/tourRegistry";
export type { TourId } from "./lib/tourRegistry";

// Persistence helpers
export {
  loadLocalPreferences,
  saveLocalPreferences,
  loadLocalProgress,
  saveLocalProgress,
  markTourDismissed,
  markTourCompleted,
  resetTourProgress,
  clearAllLocalTourData,
} from "./lib/tourPersistence";

// Engine adapter
export { getAdapter, resetAdapter } from "./lib/tourEngineAdapter";

// Target resolver
export { resolveTarget, waitForTarget } from "./lib/tourTargetResolver";

// Hooks
export { useGuidedTours } from "./hooks/useGuidedTours";
export { useTourEligibility } from "./hooks/useTourEligibility";
export {
  useTourPreferences,
  useUpdateTourPreferences,
  useTourProgressList,
  useUpdateTourProgress,
  useCompleteTour,
  useDismissTour,
  useResetTour,
  TOUR_QUERY_KEYS,
} from "./hooks/useTourApi";
export type { TourPreferencesResponse } from "./hooks/useTourApi";

// Components
export { GuidedTourProvider } from "./components/GuidedTourProvider";
export { GuidanceCenter } from "./components/GuidanceCenter";
export { TourStepOverlay } from "./components/TourStepOverlay";
export { TourLauncher } from "./components/TourLauncher";
export { ContextualHint } from "./components/ContextualHint";
export { ContextualHintBeacon } from "./components/ContextualHintBeacon";
export { ContextualHintRenderer } from "./components/ContextualHintRenderer";
export { FirstRunModal } from "./components/FirstRunModal";

// Hint registry
export { getAllHints, getHintById, registerHint } from "./lib/hintRegistry";

// Hint persistence
export {
  loadDismissedHints,
  saveDismissedHints,
  dismissHintLocally,
  resetAllDismissedHintsLocally,
  isHintDismissedLocally,
} from "./lib/hintPersistence";

// Onboarding persistence
export {
  isOnboardingAcknowledged,
  acknowledgeOnboarding,
  resetOnboardingState,
  isOnboardingDeferredThisSession,
  deferOnboardingThisSession,
  ONBOARDING_VERSION,
} from "./lib/onboardingPersistence";

// Onboarding profiles
export { getOnboardingProfile } from "./lib/onboardingProfiles";
export type { OnboardingProfile, RecommendedArea } from "./lib/onboardingProfiles";
