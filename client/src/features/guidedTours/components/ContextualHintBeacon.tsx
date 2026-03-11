// ─────────────────────────────────────────────────────────────────────────────
// ContextualHintBeacon — pulsing dot anchored to a UI element
//
// The beacon is a small fixed-position circle that pulses to attract attention.
// Hovering or clicking it reveals a lightweight popup card with:
//   - hint title + body
//   - optional "Dismiss" button (writes to localStorage + store)
//
// The dot anchors to the top-right corner of its target element and repositions
// on scroll/resize via a ResizeObserver + scroll listener.
//
// Accessibility:
//   - Beacon has role="button" + tabIndex=0 + aria-expanded + aria-haspopup
//   - Popup card has role="dialog" + aria-label
//   - Respects prefers-reduced-motion (disables the ping animation)
//   - Escape key closes the popup
//   - Focus moves to the close button when the popup opens
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useGuidedToursContext } from "../store/guidedToursStore";
import { dismissHintLocally } from "../lib/hintPersistence";
import { waitForTarget } from "../lib/tourTargetResolver";
import type { ContextualHintDefinition } from "../types";

interface DotPosition {
  top: number;
  left: number;
}

/** Compute where the beacon dot should sit (top-right corner of target).
 * Returns viewport-relative coordinates (suitable for position:fixed). */
function getDotPosition(el: Element): DotPosition {
  const rect = el.getBoundingClientRect();
  return {
    top: rect.top - 5,
    left: rect.right - 5,
  };
}

/** Clamp the popup card so it never overflows the viewport */
function clampPosition(
  left: number,
  top: number,
  cardW = 244,
  cardH = 140
): { left: number; top: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    left: Math.max(8, Math.min(left, vw - cardW - 8)),
    top: Math.max(8, Math.min(top, vh - cardH - 8)),
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  hint: ContextualHintDefinition;
}

export function ContextualHintBeacon({ hint }: Props) {
  const { dispatch } = useGuidedToursContext();

  const [dotPos, setDotPos] = useState<DotPosition | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0 });

  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetRef = useRef<Element | null>(null);
  const raf = useRef<number | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  // Stable ref so scroll/resize listeners always call the latest updatePosition
  const updatePositionRef = useRef<() => void>(() => {});

  // ── Position helpers ───────────────────────────────────────────────────────

  const updatePosition = useCallback(() => {
    const el = targetRef.current;
    if (!el) return;
    const newDot = getDotPosition(el);
    setDotPos(newDot);

    if (popupOpen) {
      const rect = el.getBoundingClientRect();
      const dotScreenTop = rect.top - 5;
      const dotScreenLeft = rect.right - 5;
      const spaceBelow = window.innerHeight - dotScreenTop - 20;
      const preferTop = spaceBelow < 160;

      const rawTop = preferTop ? dotScreenTop - 150 : dotScreenTop + 20;
      const rawLeft = dotScreenLeft - 224 + 10;

      setPopupPos(clampPosition(rawLeft, rawTop));
    }
  }, [popupOpen]);

  useEffect(() => {
    updatePositionRef.current = updatePosition;
  });

  const scheduleUpdate = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => updatePositionRef.current());
  }, []);

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    let ro: ResizeObserver | null = null;

    waitForTarget(hint.target, 5000).then((el) => {
      if (cancelled || !el) return;

      targetRef.current = el;
      updatePositionRef.current();

      ro = new ResizeObserver(scheduleUpdate);
      ro.observe(el);
      ro.observe(document.documentElement);

      window.addEventListener("scroll", scheduleUpdate, { passive: true, capture: true });
      window.addEventListener("resize", scheduleUpdate, { passive: true });
    });

    return () => {
      cancelled = true;
      ro?.disconnect();
      window.removeEventListener("scroll", scheduleUpdate, { capture: true });
      window.removeEventListener("resize", scheduleUpdate);
      if (raf.current) cancelAnimationFrame(raf.current);
      // Clear hover timer so it doesn't fire after unmount
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hint.target]);

  // Re-run position whenever popup opens/closes so the card is correctly placed
  useEffect(() => {
    scheduleUpdate();
  }, [popupOpen, scheduleUpdate]);

  // Move focus to the close button when the popup opens
  useEffect(() => {
    if (popupOpen) {
      const raf = requestAnimationFrame(() => {
        closeBtnRef.current?.focus();
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [popupOpen]);

  // Close popup on outside click
  useEffect(() => {
    if (!popupOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const beaconEl = document.getElementById(`hint-beacon-${hint.id}`);
      const cardEl = document.getElementById(`hint-card-${hint.id}`);
      if (beaconEl?.contains(target) || cardEl?.contains(target)) return;
      setPopupOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [popupOpen, hint.id]);

  // Close popup on Escape
  useEffect(() => {
    if (!popupOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setPopupOpen(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [popupOpen]);

  // ── Interaction handlers ───────────────────────────────────────────────────

  const handleDotMouseEnter = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setPopupOpen(true);
  };

  const handleDotMouseLeave = () => {
    hoverTimerRef.current = setTimeout(() => setPopupOpen(false), 250);
  };

  const handleCardMouseEnter = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
  };

  const handleCardMouseLeave = () => {
    hoverTimerRef.current = setTimeout(() => setPopupOpen(false), 300);
  };

  const handleDotClick = () => {
    setPopupOpen((prev) => !prev);
  };

  const handleDismiss = () => {
    dismissHintLocally(hint.id, hint.version);
    dispatch({ type: "DISMISS_HINT", hintId: hint.id, version: hint.version });
    setPopupOpen(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!dotPos) return null;

  const BEACON_SIZE = 10;

  return createPortal(
    <>
      {/* Pulsing dot */}
      <div
        id={`hint-beacon-${hint.id}`}
        data-testid={`hint-beacon-${hint.id}`}
        role="button"
        tabIndex={0}
        aria-label={`Hint: ${hint.title}. Click for details.`}
        aria-expanded={popupOpen}
        aria-haspopup="dialog"
        onMouseEnter={handleDotMouseEnter}
        onMouseLeave={handleDotMouseLeave}
        onClick={handleDotClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleDotClick();
          }
        }}
        style={{
          position: "fixed",
          top: dotPos.top,
          left: dotPos.left,
          width: BEACON_SIZE,
          height: BEACON_SIZE,
          zIndex: 9000,
          cursor: "pointer",
        }}
        className="focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 rounded-full"
      >
        {/* Outer ping ring — suppressed when user prefers reduced motion */}
        <span
          className="absolute inset-0 rounded-full bg-primary opacity-40 motion-safe:animate-ping"
          style={{ animationDuration: "2s" }}
          aria-hidden="true"
        />
        {/* Inner solid dot */}
        <span
          className="absolute inset-0 rounded-full bg-primary"
          aria-hidden="true"
        />
      </div>

      {/* Popup card */}
      {popupOpen && (
        <div
          id={`hint-card-${hint.id}`}
          role="dialog"
          aria-label={hint.title}
          aria-modal="false"
          onMouseEnter={handleCardMouseEnter}
          onMouseLeave={handleCardMouseLeave}
          style={{
            position: "fixed",
            top: popupPos.top,
            left: popupPos.left,
            width: 244,
            zIndex: 9001,
          }}
          className="transition-all duration-150 origin-top-right"
        >
          <Card className="shadow-xl border border-border/80">
            <CardContent className="p-3">
              <div className="flex items-start gap-2">
                <Lightbulb className="h-4 w-4 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground leading-tight">
                    {hint.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                    {hint.body}
                  </p>
                  {hint.dismissible !== false && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDismiss}
                      className="h-5 px-1.5 mt-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                      data-testid={`hint-dismiss-${hint.id}`}
                    >
                      Don't show again
                    </Button>
                  )}
                </div>
                <button
                  ref={closeBtnRef}
                  onClick={() => setPopupOpen(false)}
                  className="shrink-0 ml-1 opacity-50 hover:opacity-100 transition-opacity focus:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded"
                  aria-label="Close hint"
                  data-testid={`hint-close-${hint.id}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>,
    document.body
  );
}
