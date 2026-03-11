// ─────────────────────────────────────────────────────────────────────────────
// GuidanceCenter
// A Sheet panel listing all tours available to the current user.
// Shows completion status, a replay button for completed tours,
// and a contextual hints toggle.
//
// PHASE: Scaffolded — not yet wired into the header.
//        Import and render anywhere by calling openGuidanceCenter().
// ─────────────────────────────────────────────────────────────────────────────

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2,
  Circle,
  MinusCircle,
  PlayCircle,
  RotateCcw,
  BookOpen,
  Lightbulb,
  RefreshCw,
} from "lucide-react";
import { useGuidedTours } from "../hooks/useGuidedTours";
import { useGuidedToursContext } from "../store/guidedToursStore";
import { getAllTours } from "../lib/tourRegistry";
import { resetAllDismissedHintsLocally } from "../lib/hintPersistence";
import type { GuidedTourStatus } from "../types";
import { cn } from "@/lib/utils";

function StatusIcon({ status }: { status: GuidedTourStatus | undefined }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />;
    case "dismissed":
      return <MinusCircle className="h-4 w-4 text-muted-foreground shrink-0" />;
    case "in_progress":
      return <Circle className="h-4 w-4 text-blue-500 shrink-0 animate-pulse" />;
    default:
      return <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />;
  }
}

function statusLabel(status: GuidedTourStatus | undefined): string {
  switch (status) {
    case "completed": return "Completed";
    case "dismissed": return "Skipped";
    case "in_progress": return "In Progress";
    default: return "Not started";
  }
}

export function GuidanceCenter() {
  const {
    isGuidanceCenterOpen,
    closeGuidanceCenter,
    startTour,
    replayTour,
    toursEnabled,
    toggleToursEnabled,
    contextualHintsEnabled,
    toggleContextualHints,
    progress,
  } = useGuidedTours();

  const { state, dispatch } = useGuidedToursContext();
  const tours = getAllTours().filter((t) => t.replayable);

  const dismissedHintCount = Object.keys(state.dismissedHintVersions).length;

  const handleResetHints = () => {
    resetAllDismissedHintsLocally();
    dispatch({ type: "RESET_DISMISSED_HINTS" });
  };

  return (
    <Sheet open={isGuidanceCenterOpen} onOpenChange={(open) => !open && closeGuidanceCenter()}>
      <SheetContent side="right" className="w-[380px] sm:w-[420px] flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 py-5 border-b border-border">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <SheetTitle>Guidance Center</SheetTitle>
          </div>
          <SheetDescription>
            Interactive tours and contextual hints to help you get the most out
            of Digital Workday.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* ── Preferences toggles ────────────────────────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="tours-enabled" className="flex items-center gap-2 text-sm cursor-pointer">
                <PlayCircle className="h-4 w-4 text-muted-foreground" />
                Guided tours
              </Label>
              <Switch
                id="tours-enabled"
                checked={toursEnabled}
                onCheckedChange={toggleToursEnabled}
                data-testid="toggle-tours-enabled"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="hints-enabled" className="flex items-center gap-2 text-sm cursor-pointer">
                <Lightbulb className="h-4 w-4 text-muted-foreground" />
                Contextual hints
              </Label>
              <Switch
                id="hints-enabled"
                checked={contextualHintsEnabled}
                onCheckedChange={toggleContextualHints}
                data-testid="toggle-hints-enabled"
              />
            </div>

            {/* Re-enable dismissed hints */}
            {dismissedHintCount > 0 && (
              <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
                <span className="text-xs text-muted-foreground">
                  {dismissedHintCount} hint{dismissedHintCount !== 1 ? "s" : ""} dismissed
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs gap-1"
                  onClick={handleResetHints}
                  data-testid="reset-dismissed-hints"
                >
                  <RefreshCw className="h-3 w-3" />
                  Re-enable all
                </Button>
              </div>
            )}
          </div>

          <Separator />

          {/* ── Tour list ─────────────────────────────────────────────────── */}
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Available Tours
            </p>

            {tours.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No tours available yet.
              </p>
            )}

            {tours.map((tour) => {
              const tourProgress = progress[tour.id];
              const status = tourProgress?.status;
              const hasSeenBefore = status === "completed" || status === "dismissed";

              return (
                <div
                  key={tour.id}
                  className={cn(
                    "group flex items-start gap-3 rounded-lg p-3",
                    "hover:bg-muted/50 transition-colors"
                  )}
                  data-testid={`guidance-center-tour-${tour.id}`}
                >
                  <StatusIcon status={status} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">
                        {tour.name}
                      </span>
                      {tour.isDemoContent && (
                        <Badge variant="outline" className="text-[10px] py-0 shrink-0">
                          Preview
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {tour.description}
                    </p>
                    <p className="text-[11px] text-muted-foreground/60 mt-1">
                      {statusLabel(status)} · {tour.steps.length} steps
                    </p>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity h-7 px-2"
                    onClick={() =>
                      hasSeenBefore ? replayTour(tour.id) : startTour(tour.id, "manual")
                    }
                    data-testid={`launch-tour-${tour.id}`}
                    disabled={!toursEnabled}
                  >
                    {hasSeenBefore ? (
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />
                    ) : (
                      <PlayCircle className="h-3.5 w-3.5 mr-1" />
                    )}
                    {hasSeenBefore ? "Replay" : "Start"}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
