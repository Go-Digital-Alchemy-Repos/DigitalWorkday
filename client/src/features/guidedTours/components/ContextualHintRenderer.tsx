// ─────────────────────────────────────────────────────────────────────────────
// ContextualHintRenderer — decides which hints to show on the current page
//
// Rendering rules (all must be true for a hint to render):
//  1. contextualHintsEnabled is true in the store
//  2. No tour is actively running
//  3. Guidance Center is NOT open
//  4. The hint's requiredRoute (if set) matches the current location prefix
//  5. The user's role is in hint.allowedRoles (or allowedRoles contains "*")
//  6. The hint has NOT been dismissed at the current version
//  7. At most MAX_HINTS_PER_SCREEN are shown (sorted by priority desc)
//  8. Viewport is >= 640px (sm breakpoint) — too small for beacons otherwise
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuthSafe } from "@/lib/auth";
import { useGuidedToursContext } from "../store/guidedToursStore";
import { getAllHints } from "../lib/hintRegistry";
import { ContextualHintBeacon } from "./ContextualHintBeacon";
import type { ContextualHintDefinition, TourRole } from "../types";

const MAX_HINTS_PER_SCREEN = 3;
const SM_BREAKPOINT = 640;

// ── Helpers ───────────────────────────────────────────────────────────────────

function routeMatches(requiredRoute: string | undefined, currentPath: string): boolean {
  if (!requiredRoute) return true; // no restriction → always eligible
  // Exact match or prefix match for nested routes
  return currentPath === requiredRoute || currentPath.startsWith(requiredRoute + "/");
}

function roleAllowed(
  allowedRoles: TourRole[] | undefined,
  userRole: string | null | undefined
): boolean {
  if (!allowedRoles || allowedRoles.length === 0) return true;
  if (allowedRoles.includes("*" as TourRole)) return true;
  if (!userRole) return false;
  return allowedRoles.includes(userRole as TourRole);
}

function isHintVisible(
  hint: ContextualHintDefinition,
  dismissedHintVersions: Record<string, number>
): boolean {
  const dismissed = dismissedHintVersions[hint.id];
  if (dismissed === undefined) return true;
  return dismissed < hint.version;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ContextualHintRenderer() {
  const { state } = useGuidedToursContext();
  const [location] = useLocation();
  const auth = useAuthSafe();
  const userRole = auth?.user?.role ?? null;

  const [isSmallViewport, setIsSmallViewport] = useState(
    () => typeof window !== "undefined" && window.innerWidth < SM_BREAKPOINT
  );

  useEffect(() => {
    const handler = () => setIsSmallViewport(window.innerWidth < SM_BREAKPOINT);
    window.addEventListener("resize", handler, { passive: true });
    return () => window.removeEventListener("resize", handler);
  }, []);

  // ── Suppression guards ─────────────────────────────────────────────────────
  if (!state.contextualHintsEnabled) return null;
  if (state.isRunning) return null;               // tour is active
  if (state.isGuidanceCenterOpen) return null;    // sheet is open
  if (state.isOnboardingModalOpen) return null;   // onboarding dialog is open
  if (isSmallViewport) return null;               // too small for beacons

  // ── Filter & prioritize ────────────────────────────────────────────────────
  const allHints = getAllHints();

  const eligible = allHints
    .filter((h) => {
      if (!routeMatches(h.requiredRoute, location)) return false;
      if (!roleAllowed(h.allowedRoles, userRole)) return false;
      if (!isHintVisible(h, state.dismissedHintVersions)) return false;
      return true;
    })
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    .slice(0, MAX_HINTS_PER_SCREEN);

  if (eligible.length === 0) return null;

  return (
    <>
      {eligible.map((hint) => (
        <ContextualHintBeacon key={hint.id} hint={hint} />
      ))}
    </>
  );
}
