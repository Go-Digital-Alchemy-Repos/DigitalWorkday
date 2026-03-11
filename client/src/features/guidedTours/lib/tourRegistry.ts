// ─────────────────────────────────────────────────────────────────────────────
// Tour Registry
// Central catalog of all named tours in the application.
// Tours are plain data objects — no side effects on import.
// ─────────────────────────────────────────────────────────────────────────────

import type { GuidedTour } from "../types";

// ── Tour IDs ─────────────────────────────────────────────────────────────────
// Define as constants so referencing code never uses raw strings.

export const TOUR_IDS = {
  DASHBOARD_INTRO: "dashboard-intro",
  PROJECTS_OVERVIEW: "projects-overview",
  TASKS_BASICS: "tasks-basics",
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
      tour.allowedRoles.includes("*") ||
      tour.allowedRoles.includes(role as GuidedTour["allowedRoles"][number])
  );
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
