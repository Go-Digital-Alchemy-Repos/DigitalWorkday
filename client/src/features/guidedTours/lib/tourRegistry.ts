// ─────────────────────────────────────────────────────────────────────────────
// Tour Registry
// Central catalog of all named tours in the application.
// Tours are plain data objects — no side effects on import.
// ─────────────────────────────────────────────────────────────────────────────

import type { GuidedTour } from "../types";

// ── Tour IDs ─────────────────────────────────────────────────────────────────
// Define as constants so referencing code never uses raw strings.
//
// Release tours: add a new RELEASE_* entry when shipping a release tour.
// Convention: RELEASE_<YEAR>_<QUARTER> or RELEASE_<SEMVER>

export const TOUR_IDS = {
  DASHBOARD_INTRO:  "dashboard-intro",
  PROJECTS_OVERVIEW: "projects-overview",
  TASKS_BASICS:     "tasks-basics",
  // ── Release tours — add new ones at the bottom of this block ────────────
  RELEASE_Q1_2025:  "release-q1-2025",
} as const;

export type TourId = (typeof TOUR_IDS)[keyof typeof TOUR_IDS];

// ── Tour Definitions ──────────────────────────────────────────────────────────

const TOURS: GuidedTour[] = [
  // ── Dashboard Introduction ─────────────────────────────────────────────────
  {
    id: TOUR_IDS.DASHBOARD_INTRO,
    version: 1,
    name: "Dashboard Overview",
    description: "A quick walkthrough of your Digital Workday home dashboard.",
    icon: "LayoutDashboard",
    scope: "single_route",
    replayable: true,
    allowedRoles: ["*"],
    relevantRoutes: ["/", "/home"],
    requiredFeatureFlags: [],
    autoTrigger: false,
    steps: [
      {
        target: "home-focus-tasks",
        title: "Your Focus Tasks",
        description:
          "These are the tasks most relevant to you right now — overdue items and things due today rise to the top automatically.",
        placement: "bottom",
        waitForTargetMs: 3000,
        requiredRoute: "/",
      },
      {
        target: "home-upcoming",
        title: "Upcoming Deadlines",
        description:
          "Tasks due in the next 7 days are surfaced here so nothing sneaks up on you.",
        placement: "bottom",
        waitForTargetMs: 2500,
        requiredRoute: "/",
      },
      {
        target: "home-stat-cards",
        title: "At-a-Glance Stats",
        description:
          "Your key metrics — active projects, tasks overdue, tasks due today, and unassigned work — all in one row.",
        placement: "bottom",
        waitForTargetMs: 2500,
        requiredRoute: "/",
      },
    ],
  },

  // ── Projects Overview ──────────────────────────────────────────────────────
  {
    id: TOUR_IDS.PROJECTS_OVERVIEW,
    version: 1,
    name: "Projects Overview",
    description: "Learn how to navigate and manage your projects.",
    icon: "FolderKanban",
    scope: "single_route",
    replayable: true,
    allowedRoles: ["tenant_owner", "admin", "employee"],
    relevantRoutes: ["/projects"],
    requiredFeatureFlags: [],
    autoTrigger: false,
    steps: [
      {
        target: "projects-create-btn",
        title: "Create a Project",
        description:
          "Start a new project, assign it to a client, set a budget, and invite your team — all in one place.",
        placement: "bottom-end",
        waitForTargetMs: 2500,
        requiredRoute: "/projects",
      },
      {
        target: "projects-search",
        title: "Search Your Projects",
        description:
          "Filter projects by name instantly as you type. Great for large workspaces.",
        placement: "bottom",
        waitForTargetMs: 2500,
        requiredRoute: "/projects",
      },
      {
        target: "projects-filter-bar",
        title: "Filter & Sort",
        description:
          "Narrow projects by status, client, or team. Combine multiple filters to zero in on exactly what you need.",
        placement: "bottom",
        waitForTargetMs: 2500,
        requiredRoute: "/projects",
      },
    ],
  },

  // ── Task Management Basics ─────────────────────────────────────────────────
  {
    id: TOUR_IDS.TASKS_BASICS,
    version: 1,
    name: "Task Management Basics",
    description:
      "Get familiar with creating, assigning, and completing tasks.",
    icon: "CheckSquare",
    scope: "single_route",
    replayable: true,
    allowedRoles: ["*"],
    relevantRoutes: ["/my-tasks"],
    requiredFeatureFlags: [],
    autoTrigger: false,
    steps: [
      {
        target: "my-tasks-personal-task-btn",
        title: "Add a Personal Task",
        description:
          "Personal tasks live in your workspace — visible only to you, not tied to any project.",
        placement: "bottom-end",
        waitForTargetMs: 2500,
        requiredRoute: "/my-tasks",
      },
      {
        target: "my-tasks-search",
        title: "Find Your Tasks",
        description:
          "Search across all tasks assigned to you. Filter by priority, status, or due date to focus your work.",
        placement: "bottom",
        waitForTargetMs: 2500,
        requiredRoute: "/my-tasks",
      },
    ],
  },

  // ── Release Tours ─────────────────────────────────────────────────────────
  // Add new release tours at the END of this block.
  // getLatestReleaseTour() picks the last entry with tourType === "release".
  // Convention: releaseVersion uses lowercase slug format: "q1-2025", "q2-2025", "v2-1"
  //
  // To ship a new release tour:
  //   1. Add RELEASE_<NAME> to TOUR_IDS above
  //   2. Add a tour definition here with tourType: "release" and a unique releaseVersion
  //   3. Keep it to 2–4 steps; use existing data-tour attributes where possible
  //   4. Remove isDemoContent: true flag before shipping to production
  // ──────────────────────────────────────────────────────────────────────────

  {
    id: TOUR_IDS.RELEASE_Q1_2025,
    version: 1,
    tourType: "release",
    releaseVersion: "q1-2025",
    releaseLabel: "Q1 2025",
    name: "What's New — Q1 2025",
    description:
      "A quick look at the biggest additions this quarter: dashboard refreshes, billing approvals, and project milestones.",
    icon: "Sparkles",
    scope: "multi_route",
    replayable: true,
    allowedRoles: ["tenant_owner", "admin", "employee"],
    relevantRoutes: ["/", "/home", "/my-time", "/projects"],
    requiredFeatureFlags: [],
    autoTrigger: false, // auto-surface handled by useReleaseTourAutoLaunch
    isDemoContent: true, // ← remove this flag when using in production
    steps: [
      {
        target: "home-stat-cards",
        title: "Dashboard, Refreshed",
        description:
          "Your key metrics — active projects, overdue tasks, and unassigned work — are now front and center every time you open the app.",
        placement: "bottom",
        waitForTargetMs: 3000,
        requiredRoute: "/",
      },
      {
        target: "my-time-start-timer",
        title: "Billing Approval Workflow",
        description:
          "Time entries can now be submitted for approval before invoicing. Each entry flows through Submit → Approve → Invoice — giving managers full visibility before anything goes out.",
        placement: "bottom-end",
        waitForTargetMs: 3000,
        requiredRoute: "/my-time",
      },
      {
        target: "projects-create-btn",
        title: "Project Milestones",
        description:
          "Projects now support milestones. Link tasks to key deliverables and watch live completion bars update as your team makes progress.",
        placement: "bottom-end",
        waitForTargetMs: 3000,
        requiredRoute: "/projects",
      },
    ],
  },
];

// ── Registry API ──────────────────────────────────────────────────────────────

const _registry = new Map<string, GuidedTour>(
  TOURS.map((t) => [t.id, t])
);

/** Returns all registered tours */
export function getAllTours(): GuidedTour[] {
  return Array.from(_registry.values());
}

/** Returns a single tour by ID, or undefined if not found */
export function getTourById(id: string): GuidedTour | undefined {
  return _registry.get(id);
}

/** Returns tours whose relevantRoutes match the current pathname */
export function getToursForRoute(pathname: string): GuidedTour[] {
  return Array.from(_registry.values()).filter((tour) =>
    tour.relevantRoutes.some((pattern) => routeMatches(pathname, pattern))
  );
}

/** Returns tours eligible for a given role */
export function getToursForRole(role: string): GuidedTour[] {
  return Array.from(_registry.values()).filter(
    (tour) =>
      tour.tourType !== "release" && // exclude release tours from onboarding profiles
      (tour.allowedRoles.includes("*") ||
        tour.allowedRoles.includes(role as GuidedTour["allowedRoles"][number]))
  );
}

/**
 * Returns all release tours (tourType === "release") in registration order.
 * The last entry in the array is considered the most recent release.
 */
export function getReleaseTours(): GuidedTour[] {
  return Array.from(_registry.values()).filter(
    (tour) => tour.tourType === "release"
  );
}

/**
 * Returns the most recently registered release tour, or null if none exist.
 * "Most recent" is determined by position in the TOURS array — the last defined
 * release tour is the latest. To introduce a new release, add it at the end.
 */
export function getLatestReleaseTour(): GuidedTour | null {
  const releaseTours = getReleaseTours();
  return releaseTours.length > 0
    ? releaseTours[releaseTours.length - 1]
    : null;
}

/**
 * Registers a new tour at runtime (for dynamic or plugin-style tours).
 * Will overwrite an existing tour with the same ID.
 */
export function registerTour(tour: GuidedTour): void {
  _registry.set(tour.id, tour);
}

// ── Route Matching ────────────────────────────────────────────────────────────

/**
 * Matches a pathname against a route pattern.
 * Supports exact matches and simple prefix matching (ending in /*).
 */
function routeMatches(pathname: string, pattern: string): boolean {
  if (pattern === pathname) return true;
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -2);
    return pathname === prefix || pathname.startsWith(prefix + "/");
  }
  return false;
}
