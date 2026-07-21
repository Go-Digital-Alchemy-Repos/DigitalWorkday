import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearPendingAppModeTransition,
  scheduleAppModeTransitionCompletion,
  type AppModeMountedRef,
  type AppModeTransitionTimeoutRef,
} from "@/hooks/useAppMode";

describe("useAppMode transition scheduling", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("clears pending transition completion when the hook unmounts", () => {
    vi.useFakeTimers();
    const timeoutRef: AppModeTransitionTimeoutRef = { current: null };
    const mountedRef: AppModeMountedRef = { current: true };
    const complete = vi.fn();

    scheduleAppModeTransitionCompletion(timeoutRef, mountedRef, complete);
    expect(timeoutRef.current).not.toBeNull();

    mountedRef.current = false;
    clearPendingAppModeTransition(timeoutRef);
    vi.advanceTimersByTime(100);

    expect(complete).not.toHaveBeenCalled();
    expect(timeoutRef.current).toBeNull();
  });

  it("replaces an existing pending transition completion", () => {
    vi.useFakeTimers();
    const timeoutRef: AppModeTransitionTimeoutRef = { current: null };
    const mountedRef: AppModeMountedRef = { current: true };
    const firstComplete = vi.fn();
    const secondComplete = vi.fn();

    scheduleAppModeTransitionCompletion(timeoutRef, mountedRef, firstComplete);
    scheduleAppModeTransitionCompletion(timeoutRef, mountedRef, secondComplete);
    vi.advanceTimersByTime(100);

    expect(firstComplete).not.toHaveBeenCalled();
    expect(secondComplete).toHaveBeenCalledTimes(1);
    expect(timeoutRef.current).toBeNull();
  });
});
