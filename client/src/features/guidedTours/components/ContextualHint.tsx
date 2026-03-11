// ─────────────────────────────────────────────────────────────────────────────
// ContextualHint — lightweight tooltip-style hint anchored to a data-tour element
//
// NOTE: This is the simple tooltip variant. For the full pulsing-beacon
// with popup card and dismiss support, use ContextualHintBeacon instead.
// This component is primarily a building block / fallback.
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
  const rafRef = useRef<number | null>(null);

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

    const scheduleUpdate = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(updatePosition);
    };

    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate, { passive: true });

    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [hint.target, contextualHintsEnabled]);

  if (!position || !contextualHintsEnabled) return null;

  const dot = (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={cn(
            "fixed z-50 h-3 w-3 rounded-full bg-primary shadow-md",
            "motion-safe:animate-pulse cursor-pointer",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            "hover:scale-125 transition-transform"
          )}
          style={{ top: position.top, left: position.left }}
          aria-label={`Hint: ${hint.title}`}
          data-testid={`contextual-hint-${hint.id}`}
          onClick={() => onActivate?.(hint.id)}
        />
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-[220px]">
        <p className="font-semibold text-xs">{hint.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{hint.body}</p>
      </TooltipContent>
    </Tooltip>
  );

  return createPortal(dot, document.body);
}
