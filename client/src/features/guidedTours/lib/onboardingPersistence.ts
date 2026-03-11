// ─────────────────────────────────────────────────────────────────────────────
// Onboarding Persistence
//
// Two-tier storage strategy:
//   localStorage  "dw_onboarding_v{N}" — permanent acknowledgment.
//                 If this key exists for the current version, the modal
//                 will NEVER be shown to this user again (until version bumps).
//
//   sessionStorage "dw_onboarding_deferred" — session-scoped deferral.
//                 Written when the user clicks "Skip for Now".
//                 Cleared when the browser tab closes; the modal re-appears
//                 on the next app load.
//
// Bumping ONBOARDING_VERSION re-triggers onboarding for all users
// (useful after a major release or significant UX change).
// ─────────────────────────────────────────────────────────────────────────────

export const ONBOARDING_VERSION = 1;

const localKey = `dw_onboarding_v${ONBOARDING_VERSION}`;
const sessionDeferKey = "dw_onboarding_deferred";

interface LocalOnboardingState {
  version: number;
  status: "acknowledged";
  acknowledgedAt: string;
  chosenPath: "tour" | "hints" | null;
}

// ── Acknowledgment (permanent) ────────────────────────────────────────────────

/** Returns true if the user has fully acknowledged onboarding for this version */
export function isOnboardingAcknowledged(): boolean {
  try {
    const raw = localStorage.getItem(localKey);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as LocalOnboardingState;
    return parsed.status === "acknowledged" && parsed.version === ONBOARDING_VERSION;
  } catch {
    return false;
  }
}

/** Mark onboarding as permanently acknowledged (won't show again for this version) */
export function acknowledgeOnboarding(chosenPath: "tour" | "hints" | null = null): void {
  try {
    const state: LocalOnboardingState = {
      version: ONBOARDING_VERSION,
      status: "acknowledged",
      acknowledgedAt: new Date().toISOString(),
      chosenPath,
    };
    localStorage.setItem(localKey, JSON.stringify(state));
  } catch {
    // fail silently
  }
}

/** Clear acknowledgment so the modal re-appears (used by Guidance Center replay) */
export function resetOnboardingState(): void {
  try {
    localStorage.removeItem(localKey);
    sessionStorage.removeItem(sessionDeferKey);
  } catch {
    // fail silently
  }
}

// ── Session deferral (clears on tab close) ────────────────────────────────────

/** Returns true if the user clicked "Skip for Now" in this browser session */
export function isOnboardingDeferredThisSession(): boolean {
  try {
    return sessionStorage.getItem(sessionDeferKey) === "1";
  } catch {
    return false;
  }
}

/** Defer onboarding for this session (will re-appear on next load) */
export function deferOnboardingThisSession(): void {
  try {
    sessionStorage.setItem(sessionDeferKey, "1");
  } catch {
    // fail silently
  }
}
