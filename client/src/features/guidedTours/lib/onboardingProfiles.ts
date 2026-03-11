// ─────────────────────────────────────────────────────────────────────────────
// Onboarding Profiles
// Role-aware first-run recommendations derived from the tour registry.
//
// Each profile describes:
//   - A short headline and description specific to the user's role
//   - Recommended areas (route + label pairs) to explore first
//   - The starter tour ID (pulled from tourRegistry, never hardcoded here)
//
// To add a new role profile: add a case to getOnboardingProfile().
// Recommended tour IDs are resolved through getToursForRole() so they stay
// in sync with the registry automatically.
// ─────────────────────────────────────────────────────────────────────────────

import { getToursForRole } from "./tourRegistry";
import type { GuidedTour, TourRole } from "../types";

// ── Recommended Area ──────────────────────────────────────────────────────────

export interface RecommendedArea {
  label: string;
  path: string;
  icon: string; // lucide icon name as string (rendered dynamically)
}

// ── Profile Definition ────────────────────────────────────────────────────────

export interface OnboardingProfile {
  roleLabel: string;
  headline: string;
  description: string;
  recommendedAreas: RecommendedArea[];
  /** Tours from the registry that are relevant for this role */
  suggestedTours: GuidedTour[];
  /** The single best starter tour to launch on "Take a Quick Tour" */
  starterTourId: string | null;
}

// ── Area Libraries ────────────────────────────────────────────────────────────

const AREAS: Record<string, RecommendedArea> = {
  tenantManagement: { label: "Tenant Management", path: "/super-admin/tenants", icon: "Building2" },
  platformSettings:  { label: "Platform Settings",  path: "/super-admin/settings", icon: "Settings" },
  diagnostics:       { label: "Diagnostics",         path: "/super-admin/diagnostics", icon: "Activity" },
  settings:          { label: "Settings",            path: "/settings", icon: "Settings" },
  teamManagement:    { label: "Team Management",     path: "/settings/teams", icon: "Users" },
  billing:           { label: "Billing & Integrations", path: "/settings/billing", icon: "CreditCard" },
  reports:           { label: "Reports",             path: "/reports", icon: "BarChart2" },
  projects:          { label: "Projects",            path: "/projects", icon: "FolderKanban" },
  workload:          { label: "Workload",             path: "/reports/time-workload", icon: "Users2" },
  myTasks:           { label: "My Tasks",            path: "/my-tasks", icon: "CheckSquare" },
  timeTracking:      { label: "Time Tracking",       path: "/my-time", icon: "Clock" },
  chat:              { label: "Chat",                path: "/chat", icon: "MessageCircle" },
  notifications:     { label: "Notifications",       path: "/notifications", icon: "Bell" },
  clients:           { label: "Clients",             path: "/clients", icon: "Briefcase" },
  clientPortal:      { label: "Client Portal",       path: "/client-portal", icon: "ExternalLink" },
};

// ── Profile Builder ───────────────────────────────────────────────────────────

/**
 * Returns the onboarding profile for a given user role.
 * `isProjectManager` refines the employee profile.
 */
export function getOnboardingProfile(
  role: TourRole | string,
  isProjectManager = false
): OnboardingProfile {
  const allRoleTours = getToursForRole(role);

  switch (role) {
    case "super_user":
      return {
        roleLabel: "Super Admin",
        headline: "You're in command.",
        description:
          "As Super Admin you manage the entire platform — tenants, diagnostics, and global settings all live here.",
        recommendedAreas: [
          AREAS.tenantManagement,
          AREAS.platformSettings,
          AREAS.diagnostics,
        ],
        suggestedTours: allRoleTours.slice(0, 2),
        starterTourId: allRoleTours[0]?.id ?? null,
      };

    case "tenant_owner":
      return {
        roleLabel: "Owner",
        headline: "Welcome to your workspace.",
        description:
          "Configure your workspace, invite your team, connect your tools, and track your business from here.",
        recommendedAreas: [
          AREAS.settings,
          AREAS.teamManagement,
          AREAS.billing,
          AREAS.reports,
        ],
        suggestedTours: allRoleTours.slice(0, 3),
        starterTourId:
          allRoleTours.find((t) => t.id === "dashboard-intro")?.id ??
          allRoleTours[0]?.id ??
          null,
      };

    case "admin":
      return {
        roleLabel: "Admin",
        headline: "Keep your team on track.",
        description:
          "Manage projects, oversee your team's workload, and dig into reports to stay on top of everything.",
        recommendedAreas: [
          AREAS.projects,
          AREAS.teamManagement,
          AREAS.reports,
          AREAS.settings,
        ],
        suggestedTours: allRoleTours.slice(0, 3),
        starterTourId:
          allRoleTours.find((t) => t.id === "projects-overview")?.id ??
          allRoleTours[0]?.id ??
          null,
      };

    case "employee":
      if (isProjectManager) {
        return {
          roleLabel: "Project Manager",
          headline: "Manage projects, drive results.",
          description:
            "Plan and track projects, manage your team's capacity, and report on progress — all in one place.",
          recommendedAreas: [
            AREAS.projects,
            AREAS.workload,
            AREAS.reports,
            AREAS.timeTracking,
          ],
          suggestedTours: allRoleTours.slice(0, 3),
          starterTourId:
            allRoleTours.find((t) => t.id === "projects-overview")?.id ??
            allRoleTours[0]?.id ??
            null,
        };
      }
      return {
        roleLabel: "Team Member",
        headline: "Your work, organized.",
        description:
          "Stay on top of your tasks, log your time, and collaborate with your team — all in one place.",
        recommendedAreas: [
          AREAS.myTasks,
          AREAS.timeTracking,
          AREAS.chat,
          AREAS.notifications,
        ],
        suggestedTours: allRoleTours.slice(0, 3),
        starterTourId:
          allRoleTours.find((t) => t.id === "tasks-basics")?.id ??
          allRoleTours[0]?.id ??
          null,
      };

    case "client":
      return {
        roleLabel: "Client",
        headline: "Stay in the loop.",
        description:
          "View project updates, share feedback, and collaborate with the team — no login headaches.",
        recommendedAreas: [
          AREAS.clientPortal,
          AREAS.clients,
        ],
        suggestedTours: allRoleTours.slice(0, 2),
        starterTourId: allRoleTours[0]?.id ?? null,
      };

    default:
      return {
        roleLabel: "User",
        headline: "Welcome to Digital Workday.",
        description: "Explore the platform and get started with your work.",
        recommendedAreas: [AREAS.myTasks, AREAS.projects],
        suggestedTours: allRoleTours.slice(0, 2),
        starterTourId: allRoleTours[0]?.id ?? null,
      };
  }
}
