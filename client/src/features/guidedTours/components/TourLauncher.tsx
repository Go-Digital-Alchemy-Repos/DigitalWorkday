// ─────────────────────────────────────────────────────────────────────────────
// TourLauncher
// A self-contained button that starts or replays a specific tour by ID.
// Can be dropped into any page, menu, empty state, or help panel.
//
// PHASE: Starter component — not yet inserted into the main nav/menu.
//        Will be wired into the header help menu in a later phase.
// ─────────────────────────────────────────────────────────────────────────────

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PlayCircle, RotateCcw } from "lucide-react";
import { useGuidedTours } from "../hooks/useGuidedTours";
import { getTourById } from "../lib/tourRegistry";
import { cn } from "@/lib/utils";

interface TourLauncherProps {
  tourId: string;
  /** Override the button label — defaults to the tour name */
  label?: string;
  variant?: "default" | "ghost" | "outline" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  /** Show as icon-only (for tight spaces like menus) */
  iconOnly?: boolean;
}

export function TourLauncher({
  tourId,
  label,
  variant = "ghost",
  size = "sm",
  className,
  iconOnly = false,
}: TourLauncherProps) {
  const { startTour, replayTour, isTourCompleted, isTourDismissed, toursEnabled } =
    useGuidedTours();

  const tour = getTourById(tourId);

  // Don't render anything if the tour doesn't exist or tours are disabled
  if (!tour || !toursEnabled) return null;

  const isCompleted = isTourCompleted(tourId);
  const isDismissed = isTourDismissed(tourId);
  const hasSeenBefore = isCompleted || isDismissed;

  const buttonLabel = label ?? (hasSeenBefore ? `Replay: ${tour.name}` : `Start: ${tour.name}`);
  const Icon = hasSeenBefore ? RotateCcw : PlayCircle;

  function handleClick() {
    if (hasSeenBefore) {
      replayTour(tourId);
    } else {
      startTour(tourId, "manual");
    }
  }

  const button = (
    <Button
      variant={variant}
      size={size}
      onClick={handleClick}
      className={cn("gap-2", className)}
      data-testid={`tour-launcher-${tourId}`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!iconOnly && <span>{buttonLabel}</span>}
    </Button>
  );

  if (iconOnly) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>{buttonLabel}</TooltipContent>
      </Tooltip>
    );
  }

  return button;
}
