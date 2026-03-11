// ─────────────────────────────────────────────────────────────────────────────
// TourStepOverlay
// Portal-rendered tour step UI:
//   1. A spotlight (box-shadow) highlighting the target DOM element
//   2. A floating card popover with step info and prev/next navigation
//
// Resilient by design:
//   - Polls for target element via waitForTarget() (handles lazy renders)
//   - Falls back to centered modal if no target found
//   - Repositions on window resize and scroll via ResizeObserver + scroll listener
//   - Never crashes the page on missing/invalid selectors
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";
import { useGuidedToursContext } from "../store/guidedToursStore";
import { getTourById } from "../lib/tourRegistry";
import { waitForTarget } from "../lib/tourTargetResolver";
import { useGuidedTours } from "../hooks/useGuidedTours";
import type { TourStepPlacement } from "../types";
import { cn } from "@/lib/utils";

const POPOVER_WIDTH = 320;
const POPOVER_GAP = 14; // px between target edge and popover

// ── Positioning ───────────────────────────────────────────────────────────────

interface PopoverPosition {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

function computePopoverPosition(
  rect: DOMRect,
  placement: TourStepPlacement = "auto"
): PopoverPosition {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 12;

  const clampLeft = (l: number) =>
    Math.max(margin, Math.min(l, vw - POPOVER_WIDTH - margin));

  switch (placement) {
    case "bottom":
    case "bottom-start":
    case "bottom-end": {
      let left =
        placement === "bottom-start"
          ? rect.left
          : placement === "bottom-end"
          ? rect.right - POPOVER_WIDTH
          : rect.left + rect.width / 2 - POPOVER_WIDTH / 2;
      return { top: rect.bottom + POPOVER_GAP, left: clampLeft(left) };
    }
    case "top":
    case "top-start":
    case "top-end": {
      let left =
        placement === "top-start"
          ? rect.left
          : placement === "top-end"
          ? rect.right - POPOVER_WIDTH
          : rect.left + rect.width / 2 - POPOVER_WIDTH / 2;
      return { bottom: vh - rect.top + POPOVER_GAP, left: clampLeft(left) };
    }
    case "left": {
      const right = vw - rect.left + POPOVER_GAP;
      const top = Math.max(margin, rect.top + rect.height / 2 - 90);
      return { top, right: Math.max(margin, right) };
    }
    case "right": {
      const left = rect.right + POPOVER_GAP;
      const top = Math.max(margin, rect.top + rect.height / 2 - 90);
      return { top, left: Math.min(left, vw - POPOVER_WIDTH - margin) };
    }
    default: {
      // "auto": prefer bottom if enough space, otherwise top
      const spaceBelow = vh - rect.bottom;
      const spaceAbove = rect.top;
      const useBottom = spaceBelow >= 180 || spaceBelow >= spaceAbove;
      const left = clampLeft(rect.left + rect.width / 2 - POPOVER_WIDTH / 2);
      if (useBottom) {
        return { top: rect.bottom + POPOVER_GAP, left };
      }
      return { bottom: vh - rect.top + POPOVER_GAP, left };
    }
  }
}

// ── Centered fallback (no target found) ──────────────────────────────────────

function centeredPosition(): PopoverPosition {
  return {
    top: Math.max(80, window.innerHeight / 2 - 120),
    left: Math.max(16, window.innerWidth / 2 - POPOVER_WIDTH / 2),
  };
}

// ── Main overlay component ────────────────────────────────────────────────────

export function TourStepOverlay() {
  const { state } = useGuidedToursContext();
  const { stopTour, nextStep, prevStep, replayTour } = useGuidedTours();

  const { isRunning, activeTourId, activeStepIndex } = state;

  const tour = activeTourId ? getTourById(activeTourId) : null;
  const step = tour ? tour.steps[activeStepIndex] : null;

  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [popoverPos, setPopoverPos] = useState<PopoverPosition | null>(null);
  const [resolving, setResolving] = useState(false);

  const observerRef = useRef<ResizeObserver | null>(null);
  const targetElRef = useRef<Element | null>(null);

  // ── Resolve target element and compute positions ───────────────────────────

  const updatePositions = useCallback(() => {
    const el = targetElRef.current;
    if (!el) {
      setTargetRect(null);
      setPopoverPos(centeredPosition());
      return;
    }
    const rect = el.getBoundingClientRect();
    setTargetRect(rect);
    setPopoverPos(computePopoverPosition(rect, step?.placement ?? "auto"));
  }, [step?.placement]);

  useEffect(() => {
    if (!isRunning || !step) {
      setTargetRect(null);
      setPopoverPos(null);
      targetElRef.current = null;
      observerRef.current?.disconnect();
      return;
    }

    let cancelled = false;
    setResolving(true);

    waitForTarget(step.target, step.waitForTargetMs ?? 2500).then((el) => {
      if (cancelled) return;
      setResolving(false);
      targetElRef.current = el;

      if (el) {
        // Observe size changes on the target
        observerRef.current?.disconnect();
        const ro = new ResizeObserver(updatePositions);
        ro.observe(el);
        observerRef.current = ro;
      }

      updatePositions();
    });

    return () => {
      cancelled = true;
      observerRef.current?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, activeTourId, activeStepIndex]);

  // Recompute on scroll and resize
  useEffect(() => {
    if (!isRunning) return;
    const onScroll = updatePositions;
    const onResize = updatePositions;
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("resize", onResize, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [isRunning, updatePositions]);

  // ── Keyboard handling ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!isRunning) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") stopTour();
      if (e.key === "ArrowRight" || e.key === "ArrowDown") nextStep();
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") prevStep();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isRunning, stopTour, nextStep, prevStep]);

  if (!isRunning || !tour || !step || resolving) return null;
  if (!popoverPos) return null;

  const stepNum = activeStepIndex + 1;
  const stepTotal = tour.steps.length;
  const isLast = activeStepIndex === stepTotal - 1;
  const isFirst = activeStepIndex === 0;
  const progressPct = (stepNum / stepTotal) * 100;

  return createPortal(
    <>
      {/* ── Spotlight highlight + backdrop ─────────────────────────────────── */}
      {targetRect ? (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            top: targetRect.top - 5,
            left: targetRect.left - 5,
            width: targetRect.width + 10,
            height: targetRect.height + 10,
            borderRadius: 6,
            // Inner highlight ring + full-screen semi-opaque backdrop
            boxShadow:
              "0 0 0 3px hsl(var(--primary)), 0 0 0 9999px rgba(0,0,0,0.48)",
            pointerEvents: "none",
            zIndex: 9990,
            transition: "top 0.15s ease, left 0.15s ease, width 0.15s ease, height 0.15s ease",
          }}
        />
      ) : (
        // No target found — simple full-screen backdrop
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.48)",
            pointerEvents: "none",
            zIndex: 9990,
          }}
        />
      )}

      {/* ── Tour step card ─────────────────────────────────────────────────── */}
      <div
        role="dialog"
        aria-modal="false"
        aria-label={`Tour step ${stepNum} of ${stepTotal}: ${step.title}`}
        data-testid="tour-step-popover"
        style={{
          position: "fixed",
          zIndex: 9999,
          width: POPOVER_WIDTH,
          ...popoverPos,
        }}
        className={cn(
          "rounded-xl border border-border bg-card text-card-foreground shadow-xl",
          "animate-in fade-in-0 slide-in-from-bottom-2 duration-200"
        )}
      >
        {/* Progress bar */}
        <div className="relative h-1 rounded-t-xl overflow-hidden bg-muted">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="px-4 pt-3 pb-4 space-y-3">
          {/* Header row */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-[10px] py-0 font-semibold shrink-0">
                {stepNum} / {stepTotal}
              </Badge>
              <h3 className="text-sm font-semibold leading-tight">{step.title}</h3>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 -mr-1 -mt-0.5 text-muted-foreground hover:text-foreground"
              onClick={stopTour}
              aria-label="Close tour"
              data-testid="tour-close-btn"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Description */}
          <p className="text-sm text-muted-foreground leading-relaxed">
            {step.description}
          </p>

          {/* Navigation */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={prevStep}
              disabled={isFirst}
              className="gap-1 h-7 px-2"
              data-testid="tour-prev-btn"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </Button>

            {isLast ? (
              <Button
                size="sm"
                className="gap-1.5 h-7 px-3"
                onClick={() => {
                  // Complete action — handled via adapter callback chain in useGuidedTours
                  nextStep();
                }}
                data-testid="tour-finish-btn"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Done
              </Button>
            ) : (
              <Button
                size="sm"
                className="gap-1 h-7 px-3"
                onClick={nextStep}
                data-testid="tour-next-btn"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
