// ─────────────────────────────────────────────────────────────────────────────
// Hint Registry
// Central catalog of all contextual hint definitions.
//
// Hints are prioritized (higher = shown first), route-scoped, and role-filtered.
// The renderer caps the visible count per screen to avoid overwhelming users.
//
// To add a new hint:
//  1. Define it in HINTS below
//  2. Add a data-tour="<target>" attribute to the target element in the page
//  3. Done — the renderer picks it up automatically
// ─────────────────────────────────────────────────────────────────────────────

import type { ContextualHintDefinition } from "../types";

// ── Hint Definitions ──────────────────────────────────────────────────────────

const HINTS: ContextualHintDefinition[] = [
  // ── Home / Dashboard ──────────────────────────────────────────────────────
  {
    id: "dashboard-stats",
    version: 1,
    title: "At-a-Glance Metrics",
    body: "Your key daily numbers — overdue items, tasks due today, time logged, and tasks completed. Click any card to jump straight to My Tasks.",
    target: "home-stat-cards",
    displayMode: "beacon",
    dismissible: true,
    priority: 8,
    requiredRoute: "/",
    allowedRoles: ["*"],
  },
  {
    id: "dashboard-focus",
    version: 1,
    title: "Today's Focus",
    body: "Overdue and due-today tasks are surfaced here automatically so you always know what needs immediate attention.",
    target: "home-focus-tasks",
    displayMode: "beacon",
    dismissible: true,
    priority: 6,
    requiredRoute: "/",
    allowedRoles: ["*"],
  },

  // ── Projects ──────────────────────────────────────────────────────────────
  {
    id: "projects-create",
    version: 1,
    title: "Create a Project",
    body: "Start a new project here. You can assign it to a client, set a budget, choose a team, and apply a template to speed things up.",
    target: "projects-create-btn",
    displayMode: "beacon",
    dismissible: true,
    priority: 7,
    requiredRoute: "/projects",
    allowedRoles: ["tenant_owner", "admin"],
  },
  {
    id: "projects-filter",
    version: 1,
    title: "Filter & Search",
    body: "Narrow your view by status, client, division, or team. Filters stack — combine multiple at once to zero in on exactly what you need.",
    target: "projects-filter-bar",
    displayMode: "beacon",
    dismissible: true,
    priority: 5,
    requiredRoute: "/projects",
    allowedRoles: ["*"],
  },

  // ── My Tasks ──────────────────────────────────────────────────────────────
  {
    id: "tasks-personal",
    version: 1,
    title: "Personal Tasks",
    body: "Personal tasks are private to you — not tied to any project or client. Great for reminders, to-dos, and personal work items.",
    target: "my-tasks-personal-task-btn",
    displayMode: "beacon",
    dismissible: true,
    priority: 7,
    requiredRoute: "/my-tasks",
    allowedRoles: ["*"],
  },
  {
    id: "tasks-search",
    version: 1,
    title: "Search & Filter Tasks",
    body: "Search across all your tasks and filter by priority, status, or due date to focus on what matters most.",
    target: "my-tasks-search",
    displayMode: "beacon",
    dismissible: true,
    priority: 4,
    requiredRoute: "/my-tasks",
    allowedRoles: ["*"],
  },

  // ── Time Tracking ─────────────────────────────────────────────────────────
  {
    id: "time-start-timer",
    version: 1,
    title: "Track Your Time",
    body: "Start the built-in timer to log hours against a project or task. You can also add manual entries for time already worked.",
    target: "my-time-start-timer",
    displayMode: "beacon",
    dismissible: true,
    priority: 8,
    requiredRoute: "/my-time",
    allowedRoles: ["*"],
  },

  // ── Chat (sidebar — shows on any route since chat link is always in nav) ──
  {
    id: "chat-entry",
    version: 1,
    title: "Team Chat",
    body: "Collaborate in real-time with your team. Conversations are organized by team — look for the unread badge when someone reaches out.",
    // The sidebar renders the Chat nav link with this data-testid
    target: "[data-testid='link-chat']",
    displayMode: "beacon",
    dismissible: true,
    priority: 3,
    // No requiredRoute — sidebar chat link is available on all routes
    allowedRoles: ["tenant_owner", "admin", "employee"],
  },
];

// ── Registry API ──────────────────────────────────────────────────────────────

const _registry = new Map<string, ContextualHintDefinition>(
  HINTS.map((h) => [h.id, h])
);

/** All registered hints */
export function getAllHints(): ContextualHintDefinition[] {
  return Array.from(_registry.values());
}

/** Get a single hint by id */
export function getHintById(id: string): ContextualHintDefinition | undefined {
  return _registry.get(id);
}

/** Register a hint at runtime (plugin / feature-flag-driven hints) */
export function registerHint(hint: ContextualHintDefinition): void {
  _registry.set(hint.id, hint);
}
