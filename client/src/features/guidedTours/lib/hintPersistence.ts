// ─────────────────────────────────────────────────────────────────────────────
// Hint Persistence — localStorage helpers for dismissed contextual hints
//
// Stores { [hintId]: dismissedVersion } — when a hint's version bumps above
// the stored value, it re-appears for the user automatically.
// ─────────────────────────────────────────────────────────────────────────────

const DISMISSED_HINTS_KEY = "dw_hint_dismissed";

/** Load all dismissed hint versions from localStorage */
export function loadDismissedHints(): Record<string, number> {
  try {
    const raw = localStorage.getItem(DISMISSED_HINTS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, number>;
  } catch {
    return {};
  }
}

/** Persist a dismissed state for a hint */
export function saveDismissedHints(map: Record<string, number>): void {
  try {
    localStorage.setItem(DISMISSED_HINTS_KEY, JSON.stringify(map));
  } catch {
    // localStorage unavailable (e.g. private browsing) — fail silently
  }
}

/** Mark a single hint version as dismissed */
export function dismissHintLocally(hintId: string, version: number): void {
  const current = loadDismissedHints();
  current[hintId] = version;
  saveDismissedHints(current);
}

/** Clear all dismissed hints (user-triggered reset) */
export function resetAllDismissedHintsLocally(): void {
  try {
    localStorage.removeItem(DISMISSED_HINTS_KEY);
  } catch {
    // fail silently
  }
}

/** Returns true if the hint has been dismissed at the same or higher version */
export function isHintDismissedLocally(hintId: string, version: number): boolean {
  const current = loadDismissedHints();
  const dismissedVersion = current[hintId];
  if (dismissedVersion === undefined) return false;
  return dismissedVersion >= version;
}
