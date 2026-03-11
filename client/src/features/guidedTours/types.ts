// ─────────────────────────────────────────────────────────────────────────────
// Guided Tours — Shared TypeScript Contracts
// All types used across the guided tour system live here.
// ─────────────────────────────────────────────────────────────────────────────

/** Maps to the app's existing role hierarchy */
export type TourRole =
  | "super_user"
  | "tenant_owner"
  | "admin"
  | "employee"
  | "client"
  | "*"; // wildcard — any authenticated user

/** How the tour is scoped to routes */
export type TourScope =
  | "single_route"   // all steps live on one route
  | "multi_route"    // steps span multiple routes (guided navigation)
  | "contextual";    // a one-off element highlight, not a linear tour

/** What caused the tour to start */
export type TourTriggerSource =
  | "auto"          // first-time auto-trigger on route visit
  | "manual"        // user clicked Replay in Guidance Center
  | "programmatic"; // called from product code via startTour()

/** Lifecycle state of a single tour for a user */
export type GuidedTourStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "dismissed";

/** Where the tour popover appears relative to the target element */
export type TourStepPlacement =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top-start"
  | "top-end"
  | "bottom-start"
  | "bottom-end"
  | "auto";

// ─────────────────────────────────────────────────────────────────────────────
// Tour Definition
// ─────────────────────────────────────────────────────────────────────────────

/** A single step within a tour */
export interface GuidedTourStep {
  /** CSS selector OR data-tour attribute value (e.g. "create-project-btn")
   *  The resolver will first try [data-tour="<target>"] before falling back
   *  to the raw string as a CSS selector. */
  target: string;
  title: string;
  description: string;
  placement?: TourStepPlacement;
  /** Route the user must be on for this step (multi-route tours) */
  requiredRoute?: string;
  /** Max ms to wait for the target element to appear in the DOM before skipping */
  waitForTargetMs?: number;
  /** Async hook before the step is shown — open a menu, scroll, etc. */
  onBeforeShow?: () => Promise<void> | void;
  /** Hook after the step popover is hidden */
  onAfterHide?: () => void;
}

/** Full definition of a named tour — registered in tourRegistry.ts */
export interface GuidedTour {
  id: string;
  /** Increment to re-trigger for users who completed an older version */
  version: number;
  name: string;
  description: string;
  /** lucide-react icon name for the Guidance Center list */
  icon?: string;
  scope: TourScope;
  /** Show in Guidance Center for manual replay after first completion */
  replayable: boolean;
  /** Roles that may see this tour. Use ["*"] for all authenticated users */
  allowedRoles: TourRole[];
  /** wouter-style route patterns where this tour is contextually relevant */
  relevantRoutes: string[];
  /** Feature flag keys that must be active for eligibility */
  requiredFeatureFlags?: string[];
  /** Auto-trigger on first matching route visit (subject to user preference) */
  autoTrigger: boolean;
  steps: GuidedTourStep[];
  /** Marks sample/placeholder tours — strip before shipping to production */
  isDemoContent?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Contextual Hints
// ─────────────────────────────────────────────────────────────────────────────

/** Visual display mode for a contextual hint */
export type HintDisplayMode =
  | "beacon"         // pulsing dot + popup card on hover/click (default)
  | "highlight"      // subtle glow ring around the target element
  | "tooltip"        // always-visible text badge near the element
  | "none";          // tracked but not rendered (future/programmatic use)

/** A passive, always-on hint anchored to a specific element */
export interface ContextualHintDefinition {
  id: string;
  /** Increment to re-show for users who dismissed an older version */
  version: number;
  title: string;
  body: string;
  /** data-tour attribute value or raw CSS selector */
  target: string;
  displayMode?: HintDisplayMode;
  /** Whether the user can permanently dismiss this hint (default: true) */
  dismissible?: boolean;
  /** 0–10: higher priority hints are shown first when the per-screen cap is hit */
  priority?: number;
  placement?: TourStepPlacement;
  requiredRoute?: string;
  allowedRoles?: TourRole[];
  requiredFeatureFlags?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Preferences & Progress (mirrors backend persistence contract)
// ─────────────────────────────────────────────────────────────────────────────

export interface GuidedTourPreference {
  contextualHintsEnabled: boolean;
  autoplayOnboarding: boolean;
}

/** Tracks which version of a tour a user last completed */
export interface TourVersionState {
  tourId: string;
  completedVersion: number | null;
}

/** Per-tour progress record for a user */
export interface GuidedTourProgress {
  tourId: string;
  tourVersion: number;
  status: GuidedTourStatus;
  currentStepIndex: number;
  completedAt?: string | null;
  dismissedAt?: string | null;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Eligibility
// ─────────────────────────────────────────────────────────────────────────────

/** Snapshot of context used to filter eligible tours for the current user */
export interface TourEligibilityContext {
  currentRoute: string;
  userRole: TourRole;
  enabledFeatureFlags: string[];
  completedTourIds: string[];
  dismissedTourIds: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Engine Adapter Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface TourEngineOptions {
  onStepChange?: (stepIndex: number) => void;
  onComplete?: () => void;
  onDismiss?: () => void;
  onError?: (error: Error) => void;
}

/** Contract every tour engine adapter must implement.
 *  The active adapter (no-op or Driver.js) swaps in/out transparently. */
export interface TourEngineAdapter {
  startTour: (steps: GuidedTourStep[], options?: TourEngineOptions) => void;
  stopTour: () => void;
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (index: number) => void;
  highlightElement: (target: string, message?: string) => void;
  cleanup: () => void;
  isActive: () => boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Store State & Actions
// ─────────────────────────────────────────────────────────────────────────────

export interface GuidedToursState {
  activeTourId: string | null;
  activeStepIndex: number;
  isRunning: boolean;
  toursEnabled: boolean;
  contextualHintsEnabled: boolean;
  isGuidanceCenterOpen: boolean;
  preferences: GuidedTourPreference;
  /** Progress keyed by tourId */
  progress: Record<string, GuidedTourProgress>;
  /** Fast-access set of dismissed tour IDs (sourced from progress) */
  dismissedTourIds: Set<string>;
  /** Dismissed hint versions — { [hintId]: dismissedVersion } */
  dismissedHintVersions: Record<string, number>;
}

export type GuidedToursAction =
  | { type: "START_TOUR"; tourId: string; triggerSource: TourTriggerSource }
  | { type: "STOP_TOUR" }
  | { type: "NEXT_STEP" }
  | { type: "PREV_STEP" }
  | { type: "SET_STEP"; stepIndex: number }
  | { type: "COMPLETE_TOUR"; tourId: string }
  | { type: "DISMISS_TOUR"; tourId: string }
  | { type: "TOGGLE_TOURS"; enabled: boolean }
  | { type: "TOGGLE_CONTEXTUAL_HINTS"; enabled: boolean }
  | { type: "OPEN_GUIDANCE_CENTER" }
  | { type: "CLOSE_GUIDANCE_CENTER" }
  | { type: "LOAD_PROGRESS"; progress: Record<string, GuidedTourProgress> }
  | { type: "LOAD_PREFERENCES"; preferences: GuidedTourPreference }
  | { type: "DISMISS_HINT"; hintId: string; version: number }
  | { type: "RESET_DISMISSED_HINTS" }
  | { type: "LOAD_DISMISSED_HINTS"; dismissedHintVersions: Record<string, number> };
