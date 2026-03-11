// ─────────────────────────────────────────────────────────────────────────────
// Tour Engine Adapter
// Wraps the underlying tour rendering library (Driver.js, Joyride, etc.)
// behind a stable interface so product code never imports the library directly.
//
// Current implementation: NoOpTourEngineAdapter
// When Driver.js is installed, swap createNoOpAdapter() → createDriverAdapter()
// without touching any other file.
// ─────────────────────────────────────────────────────────────────────────────

import type { TourEngineAdapter, TourEngineOptions, GuidedTourStep } from "../types";
import { waitForTarget } from "./tourTargetResolver";

const DEV = import.meta.env.DEV;

function log(msg: string, ...args: unknown[]) {
  if (DEV) console.debug("[TourEngineAdapter]", msg, ...args);
}

// ── No-Op Adapter ─────────────────────────────────────────────────────────────
// Safe placeholder — keeps the app fully functional while Driver.js is not yet
// installed. Replace by returning createDriverAdapter() from getAdapter() below.

function createNoOpAdapter(): TourEngineAdapter {
  let _active = false;
  let _steps: GuidedTourStep[] = [];
  let _stepIndex = 0;
  let _options: TourEngineOptions = {};

  return {
    startTour(steps, options = {}) {
      _steps = steps;
      _stepIndex = 0;
      _options = options;
      _active = true;
      log("startTour (no-op)", { stepCount: steps.length });
      options.onStepChange?.(0);
    },

    stopTour() {
      if (!_active) return;
      log("stopTour (no-op)");
      _active = false;
      _options.onDismiss?.();
    },

    nextStep() {
      if (!_active) return;
      _stepIndex = Math.min(_stepIndex + 1, _steps.length - 1);
      log("nextStep (no-op)", _stepIndex);
      _options.onStepChange?.(_stepIndex);
      if (_stepIndex === _steps.length - 1) {
        _active = false;
        _options.onComplete?.();
      }
    },

    prevStep() {
      if (!_active) return;
      _stepIndex = Math.max(_stepIndex - 1, 0);
      log("prevStep (no-op)", _stepIndex);
      _options.onStepChange?.(_stepIndex);
    },

    goToStep(index) {
      if (!_active) return;
      _stepIndex = Math.max(0, Math.min(index, _steps.length - 1));
      log("goToStep (no-op)", _stepIndex);
      _options.onStepChange?.(_stepIndex);
    },

    async highlightElement(target, message) {
      log("highlightElement (no-op)", { target, message });
      const el = await waitForTarget(target, 1500);
      if (el && DEV) {
        // In dev, briefly outline the target so developers can verify selectors
        const prev = (el as HTMLElement).style?.outline ?? "";
        (el as HTMLElement).style.outline = "2px dashed #6366f1";
        setTimeout(() => {
          (el as HTMLElement).style.outline = prev;
        }, 2000);
      }
    },

    cleanup() {
      log("cleanup (no-op)");
      _active = false;
      _steps = [];
      _stepIndex = 0;
      _options = {};
    },

    isActive() {
      return _active;
    },
  };
}

// ── Active adapter singleton ──────────────────────────────────────────────────
// Call getAdapter() anywhere in the guided tour system.
// In the future, swap the implementation inside this function.

let _adapterInstance: TourEngineAdapter | null = null;

export function getAdapter(): TourEngineAdapter {
  if (!_adapterInstance) {
    // TODO: replace with createDriverAdapter() once `npm install driver.js` runs
    _adapterInstance = createNoOpAdapter();
    log("Adapter initialized: NoOp");
  }
  return _adapterInstance;
}

export function resetAdapter(): void {
  if (_adapterInstance?.isActive()) {
    _adapterInstance.cleanup();
  }
  _adapterInstance = null;
}
