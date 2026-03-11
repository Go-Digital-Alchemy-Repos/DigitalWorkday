// ─────────────────────────────────────────────────────────────────────────────
// TourStepOverlay
// Portal-rendered tour step UI:
//   1. A spotlight (box-shadow) highlighting the target DOM element
//   2. A floating card popover with step info and prev/next navigation
//   3. An arrow connector pointing from the popover toward the target
//
// Resilient by design:
//   - Polls for target element via waitForTarget() (handles lazy renders)
//   - Scrolls the target into view before measuring position
//   - Falls back to centered modal if no target found
//   - Shows a skeleton while the target is resolving (avoids blank flicker)
//   - Repositions on window resize and scroll via ResizeObserver + scroll listener
//   - Never crashes the page on missing/invalid selectors
//   - Traps focus inside the dialog and restores it on close
//   - Respects prefers-reduced-motion
//   - Full-width on narrow viewports (<= 400px)
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, ChevronLeft, ChevronRight, CheckCircle2, Loader2 } from "lucide-react";
import { useGuidedToursContext } from "../store/guidedToursStore";
import { getTourById } from "../lib/tourRegistry";
import { waitForTarget } from "../lib/tourTargetResolver";
import { useGuidedTours } from "../hooks/useGuidedTours";
import type { TourStepPlacement } from "../types";
import { cn } from "@/lib/utils";

const POPOVER_WIDTH = 320;
const POPOVER_GAP = 14;
const ARROW_SIZE = 8;

// ── Positioning ───────────────────────────────────────────────────────────────

type ResolvedSide = "top" | "bottom" | "left" | "right";

interface PopoverPosition {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  width?: string | number;
  resolvedSide: ResolvedSide;
}

function computePopoverPosition(
  rect: DOMRect,
  placement: TourStepPlacement = "auto"
): PopoverPosition {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 12;

  if (vw <= 400) {
    return {
      top: rect.bottom + POPOVER_GAP,
      left: margin,
      width: vw - margin * 2,
      resolvedSide: "bottom",
    };
  }

  const clampLeft = (l: number) =>
    Math.max(margin, Math.min(l, vw - POPOVER_WIDTH - margin));

  switch (placement) {
    case "bottom":
    case "bottom-start":
    case "bottom-end": {
      const left =
        placement === "bottom-start"
          ? rect.left
          : placement === "bottom-end"
          ? rect.right - POPOVER_WIDTH
          : rect.left + rect.width / 2 - POPOVER_WIDTH / 2;
      return { top: rect.bottom + POPOVER_GAP, left: clampLeft(left), resolvedSide: "bottom" };
    }
    case "top":
    case "top-start":
    case "top-end": {
      const left =
        placement === "top-start"
          ? rect.left
          : placement === "top-end"
          ? rect.right - POPOVER_WIDTH
          : rect.left + rect.width / 2 - POPOVER_WIDTH / 2;
      return { bottom: vh - rect.top + POPOVER_GAP, left: clampLeft(left), resolvedSide: "top" };
    }
    case "left": {
      const right = vw - rect.left + POPOVER_GAP;
      const top = Math.max(margin, rect.top + rect.height / 2 - 90);
      return { top, right: Math.max(margin, right), resolvedSide: "left" };
    }
    case "right": {
      const left = rect.right + POPOVER_GAP;
      const top = Math.max(margin, rect.top + rect.height / 2 - 90);
      return { top, left: Math.min(left, vw - POPOVER_WIDTH - margin), resolvedSide: "right" };
    }
    default: {
      const spaceBelow = vh - rect.bottom;
      const spaceAbove = rect.top;
      const useBottom = spaceBelow >= 180 || spaceBelow >= spaceAbove;
      const left = clampLeft(rect.left + rect.width / 2 - POPOVER_WIDTH / 2);
      if (useBottom) {
        return { top: rect.bottom + POPOVER_GAP, left, resolvedSide: "bottom" };
      }
      return { bottom: vh - rect.top + POPOVER_GAP, left, resolvedSide: "top" };
    }
  }
}

// ── Arrow positioning ─────────────────────────────────────────────────────────

function computeArrowStyle(
  side: ResolvedSide,
  targetRect: DOMRect | null,
  popoverPos: PopoverPosition,
  popoverWidth: number | string
): React.CSSProperties | null {
  if (!targetRect) return null;

  const pw = typeof popoverWidth === "number" ? popoverWidth : POPOVER_WIDTH;
  const targetCenterX = targetRect.left + targetRect.width / 2;
  const targetCenterY = targetRect.top + targetRect.height / 2;
  const popLeft = popoverPos.left ?? 0;

  const shared: React.CSSProperties = {
    position: "absolute",
    width: 0,
    height: 0,
    pointerEvents: "none",
  };

  switch (side) {
    case "bottom": {
      const arrowX = Math.max(16, Math.min(targetCenterX - popLeft, pw - 16));
      return {
        ...shared,
        top: -ARROW_SIZE,
        left: arrowX,
        transform: "translateX(-50%)",
        borderLeft: `${ARROW_SIZE}px solid transparent`,
        borderRight: `${ARROW_SIZE}px solid transparent`,
        borderBottom: `${ARROW_SIZE}px solid hsl(var(--border))`,
      };
    }
    case "top": {
      const arrowX = Math.max(16, Math.min(targetCenterX - popLeft, pw - 16));
      return {
        ...shared,
        bottom: -ARROW_SIZE,
        left: arrowX,
        transform: "translateX(-50%)",
        borderLeft: `${ARROW_SIZE}px solid transparent`,
        borderRight: `${ARROW_SIZE}px solid transparent`,
        borderTop: `${ARROW_SIZE}px solid hsl(var(--border))`,
      };
    }
    case "left": {
      const popTop = popoverPos.top ?? 0;
      const arrowY = Math.max(16, Math.min(targetCenterY - popTop, 160));
      return {
        ...shared,
        right: -ARROW_SIZE,
        top: arrowY,
        transform: "translateY(-50%)",
        borderTop: `${ARROW_SIZE}px solid transparent`,
        borderBottom: `${ARROW_SIZE}px solid transparent`,
        borderLeft: `${ARROW_SIZE}px solid hsl(var(--border))`,
      };
    }
    case "right": {
      const popTop = popoverPos.top ?? 0;
      const arrowY = Math.max(16, Math.min(targetCenterY - popTop, 160));
      return {
        ...shared,
        left: -ARROW_SIZE,
        top: arrowY,
        transform: "translateY(-50%)",
        borderTop: `${ARROW_SIZE}px solid transparent`,
        borderBottom: `${ARROW_SIZE}px solid transparent`,
        borderRight: `${ARROW_SIZE}px solid hsl(var(--border))`,
      };
    }
  }
}

// ── Centered fallback (no target found) ──────────────────────────────────────

function centeredPosition(): PopoverPosition {
  const vw = window.innerWidth;
  const margin = 12;
  if (vw <= 400) {
    return {
      top: Math.max(80, window.innerHeight / 2 - 120),
      left: margin,
      width: vw - margin * 2,
      resolvedSide: "bottom",
    };
  }
  return {
    top: Math.max(80, window.innerHeight / 2 - 120),
    left: Math.max(margin, window.innerWidth / 2 - POPOVER_WIDTH / 2),
    resolvedSide: "bottom",
  };
}

// ── Scroll into view helper ──────────────────────────────────────────────────

function scrollTargetIntoView(el: Element): Promise<void> {
  return new Promise((resolve) => {
    el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    const timeout = setTimeout(resolve, 350);
    const onScroll = () => {
      clearTimeout(timeout);
      window.removeEventListener("scrollend", onScroll);
      requestAnimationFrame(() => resolve());
    };
    window.addEventListener("scrollend", onScroll, { once: true });
  });
}

// ── Resolving skeleton (shown while target is polling) ────────────────────────

function ResolvingSkeleton({ onClose }: { onClose: () => void }) {
  return createPortal(
    <>
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.38)",
          pointerEvents: "none",
          zIndex: 9990,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Loading tour step"
        style={{
          position: "fixed",
          zIndex: 9999,
          width: Math.min(POPOVER_WIDTH, window.innerWidth - 24),
          top: Math.max(80, window.innerHeight / 2 - 80),
          left: Math.max(12, window.innerWidth / 2 - POPOVER_WIDTH / 2),
        }}
        className="rounded-xl border border-border bg-card text-card-foreground shadow-xl"
      >
        <div className="relative h-1 rounded-t-xl overflow-hidden bg-muted">
          <div className="h-full bg-primary/30 animate-pulse w-1/3" />
        </div>
        <div className="px-4 pt-3 pb-4 flex items-center gap-3">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
          <span className="text-sm text-muted-foreground">Loading tour step…</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 ml-auto shrink-0 text-muted-foreground"
            onClick={onClose}
            aria-label="Close tour"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </>,
    document.body
  );
}

// ── Main overlay component ────────────────────────────────────────────────────

export function TourStepOverlay() {
  const { state } = useGuidedToursContext();
  const { stopTour, nextStep, prevStep } = useGuidedTours();

  const { isRunning, activeTourId, activeStepIndex } = state;

  const tour = activeTourId ? getTourById(activeTourId) : null;
  const step = tour ? tour.steps[activeStepIndex] : null;

  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [popoverPos, setPopoverPos] = useState<PopoverPosition | null>(null);
  const [resolving, setResolving] = useState(false);

  const observerRef = useRef<ResizeObserver | null>(null);
  const targetElRef = useRef<Element | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const lastFocusedRef = useRef<Element | null>(null);

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

    waitForTarget(step.target, step.waitForTargetMs ?? 2500).then(async (el) => {
      if (cancelled) return;

      targetElRef.current = el;

      if (el) {
        await scrollTargetIntoView(el);
        if (cancelled) return;

        observerRef.current?.disconnect();
        const ro = new ResizeObserver(updatePositions);
        ro.observe(el);
        observerRef.current = ro;
      }

      setResolving(false);
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
    window.addEventListener("scroll", updatePositions, { passive: true, capture: true });
    window.addEventListener("resize", updatePositions, { passive: true });
    return () => {
      window.removeEventListener("scroll", updatePositions, true);
      window.removeEventListener("resize", updatePositions);
    };
  }, [isRunning, updatePositions]);

  // ── Focus management ───────────────────────────────────────────────────────
  useEffect(() => {
    if (isRunning) {
      lastFocusedRef.current = document.activeElement;
    } else {
      if (lastFocusedRef.current instanceof HTMLElement) {
        lastFocusedRef.current.focus();
      }
      lastFocusedRef.current = null;
    }
  }, [isRunning]);

  useEffect(() => {
    if (popoverPos && !resolving) {
      const raf = requestAnimationFrame(() => {
        dialogRef.current?.focus();
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [popoverPos, resolving]);

  // ── Keyboard handling ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!isRunning) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); stopTour(); }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") nextStep();
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") prevStep();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isRunning, stopTour, nextStep, prevStep]);

  // ── Arrow style (memoized to avoid recalc on every render) ─────────────────

  const arrowStyle = useMemo(() => {
    if (!popoverPos || !targetRect) return null;
    return computeArrowStyle(
      popoverPos.resolvedSide,
      targetRect,
      popoverPos,
      popoverPos.width ?? POPOVER_WIDTH
    );
  }, [popoverPos, targetRect]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (!isRunning || !tour || !step) return null;

  if (resolving) {
    return <ResolvingSkeleton onClose={stopTour} />;
  }

  if (!popoverPos) return null;

  const stepNum = activeStepIndex + 1;
  const stepTotal = tour.steps.length;
  const isLast = activeStepIndex === stepTotal - 1;
  const isFirst = activeStepIndex === 0;
  const progressPct = (stepNum / stepTotal) * 100;
  const popoverWidth = popoverPos.width ?? POPOVER_WIDTH;
  const hasTarget = !!targetRect;

  return createPortal(
    <>
      {/* ── Spotlight highlight + backdrop ─────────────────────────────────── */}
      {targetRect ? (
        <div
          aria-hidden="true"
          className="tour-spotlight-ring"
          data-testid="tour-spotlight"
          style={{
            position: "fixed",
            top: targetRect.top - 6,
            left: targetRect.left - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12,
            borderRadius: 8,
            boxShadow:
              "0 0 0 3px hsl(var(--primary)), 0 0 0 9999px rgba(0,0,0,0.48)",
            pointerEvents: "none",
            zIndex: 9990,
            transition: "top 0.2s ease, left 0.2s ease, width 0.2s ease, height 0.2s ease",
          }}
        />
      ) : (
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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Tour step ${stepNum} of ${stepTotal}: ${step.title}`}
        tabIndex={-1}
        data-testid="tour-step-popover"
        style={{
          position: "fixed",
          zIndex: 9999,
          width: popoverWidth,
          top: popoverPos.top,
          bottom: popoverPos.bottom,
          left: popoverPos.left,
          right: popoverPos.right,
        }}
        className={cn(
          "rounded-xl border border-border bg-card text-card-foreground shadow-xl",
          "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-200",
          "focus:outline-none"
        )}
      >
        {/* Arrow connector pointing toward the target */}
        {arrowStyle && <div aria-hidden="true" style={arrowStyle} />}

        {/* Progress bar */}
        <div className="relative h-1 rounded-t-xl overflow-hidden bg-muted" aria-hidden="true">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="px-4 pt-3 pb-4 space-y-3">
          {/* Header row */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-[10px] py-0 font-semibold shrink-0" aria-label={`Step ${stepNum} of ${stepTotal}`}>
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

          {/* No-target fallback indicator */}
          {!hasTarget && (
            <p className="text-xs text-muted-foreground/60 italic" data-testid="tour-no-target-hint">
              This step has no highlighted element on the current page.
            </p>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={prevStep}
              disabled={isFirst}
              className="gap-1 h-7 px-2"
              aria-label="Previous step"
              data-testid="tour-prev-btn"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </Button>

            {isLast ? (
              <Button
                size="sm"
                className="gap-1.5 h-7 px-3"
                onClick={nextStep}
                aria-label="Finish tour"
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
                aria-label={`Next step (${stepNum + 1} of ${stepTotal})`}
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
