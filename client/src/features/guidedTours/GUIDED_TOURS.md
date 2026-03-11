# Guided Tour & Contextual Help System

## Overview

The guided tour system is a four-phase, production-safe in-app help system built on React Context + useReducer. It has **no hard dependency on Driver.js or any other third-party tour library** — those are plugged in via a swappable adapter interface. All rendering is handled by custom React components.

| Phase | Feature | Status |
|-------|---------|--------|
| 1 | Tour Runtime (step overlay, keyboard nav, spotlight) | ✅ Complete |
| 2 | Contextual Hints (pulsing beacons, hover popup, dismiss) | ✅ Complete |
| 3 | First-Run Onboarding Modal (role-aware, 3 paths) | ✅ Complete |
| 4 | Release Tours / "What's New" (auto-launch once per version) | ✅ Complete |

---

## Architecture

```
client/src/features/guidedTours/
├── index.ts                          ← Public API (import from here only)
├── types.ts                          ← All shared TypeScript types/interfaces
│
├── store/
│   └── guidedToursStore.ts           ← React Context + useReducer store + initial state
│
├── hooks/
│   ├── useGuidedTours.ts             ← Primary consumer hook (start/stop/replay, preferences)
│   ├── useTourApi.ts                 ← TanStack Query hooks (backend sync)
│   ├── useTourEligibility.ts         ← Eligibility filtering helpers
│   ├── useFirstRunOnboarding.ts      ← Auto-trigger logic for first-run modal
│   └── useReleaseTourAutoLaunch.ts   ← Auto-launch logic for release tours
│
├── components/
│   ├── GuidedTourProvider.tsx        ← Root provider: bootstraps store, loads API data
│   ├── TourStepOverlay.tsx           ← Step popover (spotlight + card, portal rendered)
│   ├── GuidanceCenter.tsx            ← Sheet panel: tour list, preferences, What's New card
│   ├── FirstRunModal.tsx             ← First-run onboarding dialog (phase 3)
│   ├── TourLauncher.tsx              ← Inline "Start Tour" button component
│   ├── ContextualHintRenderer.tsx    ← Orchestrates hint beacon rendering per page
│   ├── ContextualHintBeacon.tsx      ← Pulsing dot + popup card for a single hint
│   └── ContextualHint.tsx            ← Lightweight tooltip variant (for simple use cases)
│
└── lib/
    ├── tourRegistry.ts               ← Tour catalog (TOURS array, TOUR_IDS, registry helpers)
    ├── hintRegistry.ts               ← Hint catalog (HINTS array, registry helpers)
    ├── tourTargetResolver.ts         ← resolveTarget() + waitForTarget() (DOM polling)
    ├── tourEngineAdapter.ts          ← Adapter interface + NoOp implementation
    ├── tourPersistence.ts            ← localStorage helpers for preferences + progress
    ├── hintPersistence.ts            ← localStorage helpers for dismissed hints
    ├── onboardingPersistence.ts      ← localStorage/sessionStorage for onboarding state
    ├── releaseTourPersistence.ts     ← localStorage helpers for "seen" release versions
    └── onboardingProfiles.ts         ← Role-based onboarding profiles
```

### State Flow

```
GuidedTourProvider (useReducer)
  └─ GuidedToursContext (state + dispatch)
       ├─ useGuidedTours (consumer hook — wraps dispatch + adapter + API mutations)
       ├─ TourStepOverlay (renders the visible step UI)
       ├─ GuidanceCenter (sheet panel)
       ├─ FirstRunModal (onboarding dialog)
       ├─ ContextualHintRenderer (hint orchestration)
       ├─ FirstRunOnboardingTrigger (auto-launch hook)
       └─ ReleaseTourAutoLaunchTrigger (release tour auto-launch hook)
```

---

## How to Add a New Tour

1. **Add a tour ID constant** in `tourRegistry.ts`:
   ```ts
   export const TOUR_IDS = {
     // existing tours...
     MY_FEATURE_TOUR: "my-feature-tour",
   } as const;
   ```

2. **Add the tour definition** to the `TOURS` array in `tourRegistry.ts`:
   ```ts
   {
     id: TOUR_IDS.MY_FEATURE_TOUR,
     version: 1,
     name: "My Feature Tour",
     description: "A quick walkthrough of the new feature.",
     icon: "Sparkles",           // lucide-react icon name
     scope: "single_route",      // or "multi_route"
     replayable: true,
     allowedRoles: ["*"],        // or specific roles
     relevantRoutes: ["/my-feature"],
     requiredFeatureFlags: [],
     autoTrigger: false,
     steps: [
       {
         target: "my-feature-main-btn", // matches data-tour="my-feature-main-btn"
         title: "The Main Button",
         description: "Click here to start something great.",
         placement: "bottom",
         waitForTargetMs: 2500,
         requiredRoute: "/my-feature",  // required for multi-route tours
       },
     ],
   }
   ```

3. **Add the `data-tour` attribute** to the target element in the page component:
   ```tsx
   <Button data-tour="my-feature-main-btn">Do Something</Button>
   ```

4. **Optional: launch it programmatically** (e.g. from a help button):
   ```tsx
   const { startTour } = useGuidedTours();
   startTour(TOUR_IDS.MY_FEATURE_TOUR, "manual");
   ```

That's it. The tour will appear in the Guidance Center automatically.

---

## How to Add a New Release Tour ("What's New")

Release tours are short 2–4 step announcements that auto-launch once per user per release version.

1. **Add an ID constant** at the bottom of the `TOUR_IDS` block in `tourRegistry.ts`:
   ```ts
   RELEASE_Q2_2025: "release-q2-2025",
   ```

2. **Add the tour definition** at the END of the `TOURS` array (position determines "latest"):
   ```ts
   {
     id: TOUR_IDS.RELEASE_Q2_2025,
     version: 1,
     tourType: "release",
     releaseVersion: "q2-2025",   // ← unique persistence key
     releaseLabel: "Q2 2025",     // ← shown in the Guidance Center badge
     name: "What's New — Q2 2025",
     description: "Short summary of the biggest changes this quarter.",
     icon: "Sparkles",
     scope: "multi_route",
     replayable: true,
     allowedRoles: ["tenant_owner", "admin", "employee"],
     relevantRoutes: ["/", "/projects"],
     autoTrigger: false,           // auto-surface is handled by useReleaseTourAutoLaunch
     steps: [/* 2–4 steps */],
   }
   ```

3. **Remove `isDemoContent: true`** if you were using it during development.

The `getLatestReleaseTour()` helper always returns the **last** release tour in the array, so order matters.

---

## How to Add a New Contextual Hint

1. **Add the hint definition** to `HINTS` in `hintRegistry.ts`:
   ```ts
   {
     id: "my-feature-hint",
     version: 1,
     title: "Short Title",
     body: "Descriptive explanation of the feature this hint points at.",
     target: "my-feature-element",   // data-tour attribute value
     displayMode: "beacon",
     dismissible: true,
     priority: 7,                    // 0–10; higher = shown first up to MAX 3/screen
     requiredRoute: "/my-feature",   // omit to show on all routes
     allowedRoles: ["*"],
   }
   ```

2. **Add the `data-tour` attribute** to the target element in the page:
   ```tsx
   <div data-tour="my-feature-element">...</div>
   ```

3. Done. The `ContextualHintRenderer` picks it up automatically on the matching route.

---

## How Persistence Works

| Feature | Storage | Key | Cleared by |
|---------|---------|-----|------------|
| Tour preferences (tours on/off, hints on/off) | `localStorage` + Backend DB | `dw_tour_prefs` | Synced from backend on load |
| Tour progress (in_progress, completed, dismissed) | `localStorage` + Backend DB | `dw_tour_progress` | Backend is source of truth |
| Dismissed hint versions | `localStorage` | `dw_hint_dismissed` | "Re-enable all" in Guidance Center |
| First-run onboarding acknowledgment | `localStorage` | `dw_onboarding_v{N}` | Never (until `ONBOARDING_VERSION` bumps) |
| First-run onboarding deferral | `sessionStorage` | `dw_onboarding_deferred` | Tab close / page reload |
| Release tour "seen" tracking | `localStorage` | `dw_release_tours` | Dev replay / `resetAllSeenReleaseTours()` |

**Backend is always the authoritative source.** localStorage is a fast-path hydration cache used to prevent flicker before the first API response. The `GuidedTourProvider` loads from localStorage immediately, then overwrites with API data when it arrives.

---

## How to Add Stable Target Hooks (`data-tour`)

The tour system resolves element targets in two steps:
1. `document.querySelector('[data-tour="<target>"]')` — preferred
2. Falls back to treating `target` as a raw CSS selector

**Always prefer `data-tour` attributes** over raw CSS selectors. They are stable across refactors, work with dynamic IDs, and are semantically clear.

```tsx
// ✅ Preferred
<Button data-tour="projects-create-btn">New Project</Button>

// ⚠️ Fragile (breaks if class names change)
target: ".btn-primary .create-btn"

// ⚠️ Fragile (breaks if ID changes)
target: "#create-project-button"
```

For elements that render conditionally or are inside lazy-loaded components, use `waitForTargetMs` on the step:
```ts
{
  target: "feature-settings-panel",
  waitForTargetMs: 3000,  // poll for up to 3 seconds
  ...
}
```

If the target never appears, the overlay falls back to a centered position automatically.

---

## Tour Engine Adapter

The rendering engine is abstracted behind a `TourEngineAdapter` interface in `tourEngineAdapter.ts`. The current implementation is a **NoOp adapter** that drives the tour purely via React state (no third-party library).

To swap in Driver.js:
1. `npm install driver.js`
2. Implement `createDriverAdapter()` in `tourEngineAdapter.ts`
3. Change `getAdapter()` to return `createDriverAdapter()`

No other files need to change.

---

## Accessibility Checklist

| Item | Status |
|------|--------|
| `TourStepOverlay` — `role="dialog"` + `aria-modal="true"` | ✅ |
| `TourStepOverlay` — focus moved to dialog on open, restored on close | ✅ |
| `TourStepOverlay` — Escape closes tour | ✅ |
| `TourStepOverlay` — Arrow keys navigate steps | ✅ |
| `TourStepOverlay` — progress bar has `aria-hidden` | ✅ |
| `ContextualHintBeacon` — `role="button"` + `aria-expanded` + `aria-haspopup` | ✅ |
| `ContextualHintBeacon` — Escape closes popup | ✅ |
| `ContextualHintBeacon` — focus moved to close button on popup open | ✅ |
| `ContextualHintBeacon` — popup has `role="dialog"` + `aria-label` | ✅ |
| `ContextualHintRenderer` — suppressed during onboarding modal | ✅ |
| `FirstRunModal` — Escape defers (not silently closes) | ✅ |
| `GuidanceCenter` — Sheet handles its own keyboard dismissal | ✅ (shadcn/ui) |
| Animations use `motion-safe:` prefix | ✅ |
| Beacons suppressed on viewports < 640px | ✅ |
| Tour popover full-width on viewports <= 400px | ✅ |

---

## Performance Considerations

- **DOM polling**: `waitForTarget` uses exponential back-off (50ms → 100ms → 200ms → 400ms cap). Maximum polling duration defaults to 2500ms per step. This only runs while a tour step is active.
- **`ContextualHintBeacon` polling**: waits up to 5000ms for the target element. Once found, it uses a `ResizeObserver` + scroll listener — no continuous polling.
- **`ContextualHintRenderer` caps** visible hints at `MAX_HINTS_PER_SCREEN = 3` to avoid DOM flooding.
- **API queries**: preferences use `staleTime: 10min`, progress uses `staleTime: 5min`. No query spam.
- **Step progress mutations**: fire-and-forget per step advance. Acceptable for tour telemetry.

---

## Known Limitations & Recommended Follow-Up

1. **`isDemoContent: true` on `RELEASE_Q1_2025`** — this flag marks the sample release tour as preview content. Remove it when shipping a real release tour.

2. **Tour targets in dynamically loaded components** — if a target element is inside a suspense boundary or heavy async route, `waitForTargetMs` may need to be increased to 4000–5000ms. Set it per-step.

3. **Multi-tenant hint customization** — the hint registry is global (shared across all tenants). Per-tenant hints are not currently supported.

4. **No offline queue for API mutations** — if the user dismisses a tour while offline, the localStorage write succeeds but the backend sync is lost. Adds complexity; treat the backend as eventually consistent for tour progress.

5. **`TourEngineAdapter` is NoOp** — the custom `TourStepOverlay` handles all rendering. Driver.js is wired as a future option but not installed. If installed, `TourStepOverlay` and the adapter would need to be reconciled (Driver.js owns the rendering).

6. **No per-step `onBeforeShow` / `onAfterHide` wiring** — the hooks are defined in `GuidedTourStep` but not called by the adapter or overlay yet. Future enhancement.
