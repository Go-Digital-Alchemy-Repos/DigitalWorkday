// ─────────────────────────────────────────────────────────────────────────────
// Release Tour Persistence
//
// Tracks which "What's New" release tours the user has already seen, using a
// single localStorage key that holds a per-releaseVersion record.
//
// Storage key: "dw_release_tours"
// Shape: { [releaseVersion: string]: { seenAt: string; outcome: "seen" | "dismissed" } }
//
// Usage:
//   isReleaseTourSeen("q1-2025")          → true / false
//   markReleaseTourSeen("q1-2025")        → write record
//   resetSeenReleaseTour("q1-2025")       → delete record (dev / replay)
//   getSeenReleaseTours()                 → full map
//
// To add a new release tour: define it in tourRegistry.ts with tourType "release"
// and a unique releaseVersion string. The persistence layer handles everything else.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "dw_release_tours";

interface ReleaseTourEntry {
  seenAt: string;
  outcome: "seen" | "dismissed";
}

type ReleaseTourMap = Record<string, ReleaseTourEntry>;

// ── Low-level helpers ─────────────────────────────────────────────────────────

function load(): ReleaseTourMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ReleaseTourMap;
  } catch {
    return {};
  }
}

function save(map: ReleaseTourMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // fail silently (private browsing, storage quota, etc.)
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns true if the user has already been shown this release tour version */
export function isReleaseTourSeen(releaseVersion: string): boolean {
  return !!load()[releaseVersion];
}

/**
 * Records that the user has seen a release tour.
 * Call this just before launching the tour to prevent repeated auto-launches
 * even if the tour errors out or the user immediately dismisses it.
 */
export function markReleaseTourSeen(
  releaseVersion: string,
  outcome: "seen" | "dismissed" = "seen"
): void {
  const map = load();
  map[releaseVersion] = {
    seenAt: new Date().toISOString(),
    outcome,
  };
  save(map);
}

/** Returns the full map of all seen release versions (useful for debugging) */
export function getSeenReleaseTours(): ReleaseTourMap {
  return load();
}

/**
 * Removes the seen record for a specific release version.
 * Useful for development / replay-from-Guidance-Center.
 */
export function resetSeenReleaseTour(releaseVersion: string): void {
  const map = load();
  delete map[releaseVersion];
  save(map);
}

/** Clears ALL seen release tour records (dev / testing only) */
export function resetAllSeenReleaseTours(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // fail silently
  }
}
