// ─────────────────────────────────────────────────────────────────────────────
// Tour Persistence — localStorage helpers
// Used as a fast-path cache before the backend API is called.
// The backend is always the source of truth; this just prevents flicker.
// ─────────────────────────────────────────────────────────────────────────────

import type { GuidedTourPreference, GuidedTourProgress } from "../types";

const PREFS_KEY = "dw_tour_prefs";
const PROGRESS_KEY = "dw_tour_progress";

// ── Preferences ───────────────────────────────────────────────────────────────

export function loadLocalPreferences(): GuidedTourPreference | null {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GuidedTourPreference;
  } catch {
    return null;
  }
}

export function saveLocalPreferences(prefs: GuidedTourPreference): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage may be unavailable in private browsing — fail silently
  }
}

// ── Progress ──────────────────────────────────────────────────────────────────

export function loadLocalProgress(): Record<string, GuidedTourProgress> {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, GuidedTourProgress>;
  } catch {
    return {};
  }
}

export function saveLocalProgress(
  progress: Record<string, GuidedTourProgress>
): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // fail silently
  }
}

export function markTourDismissed(tourId: string): void {
  const current = loadLocalProgress();
  current[tourId] = {
    ...current[tourId],
    tourId,
    tourVersion: current[tourId]?.tourVersion ?? 1,
    status: "dismissed",
    currentStepIndex: current[tourId]?.currentStepIndex ?? 0,
    dismissedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  saveLocalProgress(current);
}

export function markTourCompleted(tourId: string, version: number): void {
  const current = loadLocalProgress();
  current[tourId] = {
    ...current[tourId],
    tourId,
    tourVersion: version,
    status: "completed",
    currentStepIndex: 0,
    completedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  saveLocalProgress(current);
}

export function resetTourProgress(tourId: string): void {
  const current = loadLocalProgress();
  delete current[tourId];
  saveLocalProgress(current);
}

export function clearAllLocalTourData(): void {
  try {
    localStorage.removeItem(PREFS_KEY);
    localStorage.removeItem(PROGRESS_KEY);
  } catch {
    // fail silently
  }
}
