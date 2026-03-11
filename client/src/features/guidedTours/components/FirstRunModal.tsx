// ─────────────────────────────────────────────────────────────────────────────
// FirstRunModal
//
// Lightweight first-run onboarding dialog shown once per version per user.
// Non-destructive: the user can skip, defer, or acknowledge on their terms.
//
// Three paths:
//   "Take a Quick Tour"      → launches the role-appropriate starter tour
//                              + permanently acknowledges onboarding
//   "Explore with Tips On"   → ensures contextual hints are enabled
//                              + permanently acknowledges onboarding
//   "Skip for Now"           → defers to next session (sessionStorage only)
//
// Replay from Guidance Center: "Replay Welcome Guide" resets acknowledgment
// and dispatches OPEN_ONBOARDING, which re-shows this dialog.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Play,
  Lightbulb,
  SkipForward,
  MapPin,
  CheckSquare,
  FolderKanban,
  LayoutDashboard,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { useGuidedToursContext } from "../store/guidedToursStore";
import { useGuidedTours } from "../hooks/useGuidedTours";
import { useAuthSafe } from "@/lib/auth";
import { getOnboardingProfile } from "../lib/onboardingProfiles";
import { getTourById } from "../lib/tourRegistry";
import {
  acknowledgeOnboarding,
  deferOnboardingThisSession,
} from "../lib/onboardingPersistence";
import { cn } from "@/lib/utils";

// ── Icon resolver for recommended areas ──────────────────────────────────────

const ICON_MAP: Record<string, React.ReactNode> = {
  FolderKanban:  <FolderKanban className="h-3.5 w-3.5" />,
  CheckSquare:   <CheckSquare className="h-3.5 w-3.5" />,
  LayoutDashboard: <LayoutDashboard className="h-3.5 w-3.5" />,
  MapPin:        <MapPin className="h-3.5 w-3.5" />,
  Lightbulb:     <Lightbulb className="h-3.5 w-3.5" />,
};

function AreaIcon({ name }: { name: string }) {
  return <>{ICON_MAP[name] ?? <MapPin className="h-3.5 w-3.5" />}</>;
}

// ── Tour card icon resolver ──────────────────────────────────────────────────

function TourIcon({ name }: { name: string | undefined }) {
  switch (name) {
    case "FolderKanban":   return <FolderKanban className="h-4 w-4 shrink-0" />;
    case "CheckSquare":    return <CheckSquare className="h-4 w-4 shrink-0" />;
    case "LayoutDashboard": return <LayoutDashboard className="h-4 w-4 shrink-0" />;
    default:               return <Play className="h-4 w-4 shrink-0" />;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FirstRunModal() {
  const { state, dispatch } = useGuidedToursContext();
  const { startTour, toggleContextualHints } = useGuidedTours();
  const auth = useAuthSafe();

  const user = auth?.user;
  const role = user?.role ?? "employee";
  const isProjectManager = user?.isProjectManager ?? false;

  const profile = getOnboardingProfile(role, isProjectManager);
  const starterTour = profile.starterTourId ? getTourById(profile.starterTourId) : null;

  const close = useCallback(() => {
    dispatch({ type: "CLOSE_ONBOARDING" });
  }, [dispatch]);

  // ── Action: Take a Quick Tour ─────────────────────────────────────────────

  const handleStartTour = useCallback(
    (tourId: string) => {
      acknowledgeOnboarding("tour");
      close();
      // Small delay so modal closes before tour spotlight renders
      setTimeout(() => startTour(tourId, "programmatic"), 150);
    },
    [close, startTour]
  );

  // ── Action: Explore with Tips On ─────────────────────────────────────────

  const handleExploreWithTips = useCallback(() => {
    acknowledgeOnboarding("hints");
    toggleContextualHints(true);
    close();
  }, [close, toggleContextualHints]);

  // ── Action: Skip for Now ─────────────────────────────────────────────────

  const handleSkip = useCallback(() => {
    deferOnboardingThisSession();
    close();
  }, [close]);

  if (!state.isOnboardingModalOpen || !user) return null;

  return (
    <Dialog open={state.isOnboardingModalOpen} onOpenChange={(open) => !open && handleSkip()}>
      <DialogContent
        className="max-w-[500px] p-0 gap-0 overflow-hidden"
        data-testid="first-run-modal"
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="bg-gradient-to-br from-primary/8 via-background to-background px-6 pt-6 pb-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-5 w-5 text-primary" />
            <Badge variant="secondary" className="text-xs" data-testid="onboarding-role-badge">
              {profile.roleLabel}
            </Badge>
          </div>

          <DialogHeader className="text-left space-y-1">
            <DialogTitle className="text-xl font-semibold leading-tight">
              {profile.headline}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground leading-snug">
              {profile.description}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6 space-y-5">
          {/* ── Recommended areas ──────────────────────────────────── */}
          {profile.recommendedAreas.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Recommended areas for you
              </p>
              <div className="flex flex-wrap gap-1.5">
                {profile.recommendedAreas.map((area) => (
                  <Badge
                    key={area.path}
                    variant="outline"
                    className="gap-1 text-xs font-normal cursor-default"
                    data-testid={`onboarding-area-${area.label.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <AreaIcon name={area.icon} />
                    {area.label}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* ── Available tours ────────────────────────────────────── */}
          {profile.suggestedTours.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Quick start tours
              </p>
              <div className="space-y-2">
                {profile.suggestedTours.map((tour) => (
                  <button
                    key={tour.id}
                    onClick={() => handleStartTour(tour.id)}
                    className={cn(
                      "w-full text-left rounded-lg border border-border/60 px-3 py-2.5",
                      "flex items-start gap-3 group",
                      "hover:bg-muted/60 hover:border-border transition-colors",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    )}
                    data-testid={`onboarding-tour-card-${tour.id}`}
                  >
                    <span className="mt-0.5 text-primary">
                      <TourIcon name={tour.icon} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground leading-tight">
                        {tour.name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">
                        {tour.description}
                      </p>
                      <p className="text-[11px] text-muted-foreground/60 mt-1">
                        {tour.steps.length} step{tour.steps.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary shrink-0 mt-0.5 transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {/* ── Action row ─────────────────────────────────────────── */}
          <div className="flex items-center gap-2">
            {starterTour ? (
              <Button
                className="flex-1 gap-1.5"
                onClick={() => handleStartTour(starterTour.id)}
                data-testid="onboarding-btn-start-tour"
              >
                <Play className="h-3.5 w-3.5" />
                Take a Quick Tour
              </Button>
            ) : (
              <Button
                variant="outline"
                className="flex-1 gap-1.5"
                onClick={handleExploreWithTips}
                data-testid="onboarding-btn-explore"
              >
                <Lightbulb className="h-3.5 w-3.5" />
                Explore with Tips On
              </Button>
            )}

            {starterTour && (
              <Button
                variant="outline"
                className="flex-1 gap-1.5"
                onClick={handleExploreWithTips}
                data-testid="onboarding-btn-explore"
              >
                <Lightbulb className="h-3.5 w-3.5" />
                Tips Only
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={handleSkip}
              className="text-muted-foreground hover:text-foreground gap-1"
              data-testid="onboarding-btn-skip"
            >
              <SkipForward className="h-3.5 w-3.5" />
              Skip
            </Button>
          </div>

          <p className="text-[11px] text-muted-foreground/60 text-center leading-relaxed">
            You can replay this guide anytime from <strong>Help &amp; Tours</strong> in your user menu.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
