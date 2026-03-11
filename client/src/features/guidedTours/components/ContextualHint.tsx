// ─────────────────────────────────────────────────────────────────────────────
// ContextualHint
// A passive, pulsing indicator anchored near a specific data-tour element.
// Shown when contextualHintsEnabled is true and the element is in the DOM.
// Uses a portal so it doesn't disturb page layout.
//
// PHASE: Scaffolded — not yet wired to specific elements.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { resolveTarget } from "../lib/tourTargetResolver";
import { useGuidedTours } from "../hooks/useGuidedTours";
import { cn } from "@/lib/utils";
import type { ContextualHintDefinition } from "../types";

interface ContextualHintProps {
  hint: ContextualHintDefinition;
  /** Called when the user clicks the hint dot */
  onActivate?: (hintId: string) => void;
}

export function ContextualHint({ hint, onActivate }: ContextualHintProps) {
  const { contextualHintsEnabled } = useGuidedTours();
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!contextualHintsEnabled) {
      setPosition(null);
      return;
    }

    function updatePosition() {
      const el = resolveTarget(hint.target);
      if (!el) {
        setPosition(null);
        return;
      }
      const rect = el.getBoundingClientRect();
      setPosition({
        top: rect.top + window.scrollY - 6,
        left: rect.right + window.scrollX - 6,
      });
    }

    updatePosition();

    // Re-position on scroll/resize
    window.addEventListener("scroll", updatePosition, { passive: true });
    window.addEventListener("resize", updatePosition, { passive: true });

    return () => {
      window.removeEventListener("scroll", updatePosition);
      window.removeEventListener("resize", updatePosition);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [hint.target, contextualHintsEnabled]);

  if (!position || !contextualHintsEnabled) return null;

  const dot = (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={cn(
            "fixed z-50 h-3 w-3 rounded-full bg-primary shadow-md",
            "animate-pulse cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary",
            "hover:scale-125 transition-transform"
          )}
          style={{ top: position.top, left: position.left }}
          aria-label={hint.message}
          data-testid={`contextual-hint-${hint.id}`}
          onClick={() => onActivate?.(hint.id)}
        />
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-[220px]">
        {hint.message}
      </TooltipContent>
    </Tooltip>
  );

  return createPortal(dot, document.body);
}
