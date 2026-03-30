import type { QueryClient } from "@tanstack/react-query";
import { tenantKey } from "./queryClient";

export const queryKeys = {
  projects: {
    all: ["/api/projects"] as const,
    detail: (id: string) => ["/api/projects", id] as const,
    sections: (id: string) => ["/api/projects", id, "sections"] as const,
    tasks: (id: string) => ["/api/projects", id, "tasks"] as const,
    tasksList: (id: string) => ["/api/projects", id, "tasks", { fields: "list" }] as const,
    calendarEvents: (id: string) => ["/api/projects", id, "calendar-events"] as const,
    context: (id: string) => ["/api/projects", id, "context"] as const,
    members: (id: string) => ["/api/projects", id, "members"] as const,
    milestones: (id: string) => [`/api/projects/${id}/milestones`] as const,
    unassigned: (search?: string) =>
      search
        ? (["/api/projects/unassigned", search] as const)
        : (["/api/projects/unassigned"] as const),
    withCounts: ["/api/projects", { includeCounts: "true" }] as const,
    analyticsSummary: ["/api/v1/projects/analytics/summary"] as const,
  },

  tasks: {
    all: ["/api/tasks"] as const,
    my: ["/api/tasks/my"] as const,
    detail: (id: string) => ["/api/tasks", id] as const,
    /**
     * Subtasks are simple checklist items nested under a task.
     * They use the `/api/tasks/:id/subtasks` endpoint.
     */
    subtasks: (id: string) => ["/api/tasks", id, "subtasks"] as const,
    /**
     * Child tasks are full task records that have a parent-child relationship.
     * They use the `/api/tasks/:id/childtasks` endpoint.
     * Canonical: use `childTasks` for full nested tasks; use `subtasks` for lightweight checklist items.
     */
    childTasks: (id: string) => ["/api/tasks", id, "childtasks"] as const,
    comments: (id: string) => ["/api/tasks", id, "comments"] as const,
    timeEntries: (id: string) => ["/api/tasks", id, "time-entries"] as const,
    attachments: (projectId: string, taskId: string) =>
      ["/api/projects", projectId, "tasks", taskId, "attachments"] as const,
  },

  subtasks: {
    detail: (id: string) => ["/api/subtasks", id] as const,
    assignees: (id: string) => ["/api/subtasks", id, "assignees"] as const,
    tags: (id: string) => ["/api/subtasks", id, "tags"] as const,
    comments: (id: string) => [`/api/subtasks/${id}/comments`] as const,
  },

  clients: {
    all: ["/api/clients"] as const,
    minimal: ["/api/clients", { fields: "minimal" }] as const,
    detail: (id: string) => ["/api/clients", id] as const,
    notes: (id: string) => ["/api/clients", id, "notes"] as const,
    portalUsers: (id: string) => ["/api/clients", id, "users"] as const,
    crmSummary: (id: string) => [`/api/crm/clients/${id}/summary`] as const,
    hierarchy: ["/api/v1/clients/hierarchy/list"] as const,
    stagesSummary: ["/api/v1/clients/stages/summary"] as const,
  },

  teams: {
    all: ["/api/teams"] as const,
  },

  users: {
    all: ["/api/users"] as const,
    tenant: ["/api/tenant/users"] as const,
  },

  workspaces: {
    current: ["/api/workspaces/current"] as const,
    tags: (id: string) => ["/api/workspaces", id, "tags"] as const,
  },

  timer: {
    current: ["/api/timer/current"] as const,
  },

  timeEntries: {
    all: ["/api/time-entries"] as const,
    list: ["/api/time-entries", { fields: "list" }] as const,
    paginated: ["/api/time-entries", "paginated"] as const,
    myStats: ["/api/time-entries/my/stats"] as const,
    byTask: (taskId: string) => ["/api/time-entries", { taskId }] as const,
  },

  notifications: {
    all: ["/api/notifications"] as const,
  },

  activities: {
    all: ["/api/activities"] as const,
  },

  dashboard: {
    reviewQueue: ["/api/dashboard/review-queue"] as const,
  },

  ai: {
    status: ["/api/v1/ai/status"] as const,
  },

  workload: {
    tasksByEmployee: ["/api/v1/workload/tasks-by-employee"] as const,
    unassigned: ["/api/v1/workload/unassigned"] as const,
  },

  chat: {
    channels: ["/api/v1/chat/channels"] as const,
    dm: ["/api/v1/chat/dm"] as const,
    recentSinceLogin: ["/api/v1/chat/messages/recent-since-login"] as const,
  },

  projectTemplates: {
    all: ["/api/project-templates"] as const,
  },

  tenant: {
    me: ["/api/v1/tenant/me"] as const,
    integrations: ["/api/v1/tenant/integrations"] as const,
  },

  superAdmin: {
    tenants: ["/api/v1/super/tenants"] as const,
    tenantsDetail: ["/api/v1/super/tenants-detail"] as const,
    users: ["/api/v1/super/users"] as const,
    integrationsStatus: ["/api/v1/super/integrations/status"] as const,
    agreements: ["/api/v1/super/agreements"] as const,
    tenantUsers: (tenantId: string) => ["/api/v1/super/tenants", tenantId, "users"] as const,
    tenantInvitations: (tenantId: string) => ["/api/v1/super/tenants", tenantId, "invitations"] as const,
    tenantAudit: (tenantId: string) => ["/api/v1/super/tenants", tenantId, "audit"] as const,
  },
} as const;

export const TIMER_QUERY_KEY = queryKeys.timer.current;

export type TimeEntryDateFilter = "all" | "today" | "week" | "month";

export function timeEntryQueryKeyForFilter(
  dateFilter: TimeEntryDateFilter,
): readonly unknown[] {
  const usePaginated = dateFilter === "all" || dateFilter === "month";
  if (usePaginated) {
    return [...queryKeys.timeEntries.paginated, dateFilter];
  }
  return [...queryKeys.timeEntries.list, dateFilter];
}

const TIME_ENTRY_BROADCAST_CHANNEL = "active-timer-sync";

export function broadcastTimeEntryChanged(): void {
  try {
    const ch = new BroadcastChannel(TIME_ENTRY_BROADCAST_CHANNEL);
    ch.postMessage({ type: "timer-updated", eventType: "time-entry-changed" });
    ch.close();
  } catch {
    // BroadcastChannel not supported
  }
  try {
    localStorage.setItem("timer-sync", JSON.stringify({ eventType: "time-entry-changed", ts: Date.now() }));
    localStorage.removeItem("timer-sync");
  } catch {
    // localStorage may be unavailable
  }
}

export interface CachedTimeEntry {
  id: string;
  workspaceId: string;
  userId: string;
  clientId: string | null;
  projectId: string | null;
  taskId: string | null;
  title: string | null;
  description: string | null;
  startTime: string;
  endTime: string | null;
  durationSeconds: number;
  scope: "in_scope" | "out_of_scope";
  isManual: boolean;
  createdAt: string;
  client?: { id: string; companyName: string; displayName: string | null };
  project?: { id: string; name: string };
  task?: { id: string; title: string };
  user?: { id: string; name: string; email: string };
  userName?: string | null;
  clientName?: string | null;
  projectName?: string | null;
  taskTitle?: string | null;
}

interface PaginatedTimeEntryPage {
  items: CachedTimeEntry[];
  hasMore: boolean;
  nextCursor: string | null;
  totalCount: number;
}

type FlatCache = CachedTimeEntry[];
type PaginatedCache = { pages: PaginatedTimeEntryPage[]; pageParams: (string | null)[] };

function isPaginated(dateFilter: TimeEntryDateFilter): boolean {
  return dateFilter === "all" || dateFilter === "month";
}

export function entryMatchesDateFilter(
  startTimeISO: string,
  dateFilter: TimeEntryDateFilter,
): boolean {
  if (dateFilter === "all") return true;

  const entryDate = new Date(startTimeISO);
  const now = new Date();

  switch (dateFilter) {
    case "today": {
      const todayStr = now.toISOString().slice(0, 10);
      return entryDate.toISOString().slice(0, 10) === todayStr;
    }
    case "week": {
      const day = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((day + 6) % 7));
      monday.setHours(0, 0, 0, 0);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);
      return entryDate >= monday && entryDate <= sunday;
    }
    case "month": {
      return (
        entryDate.getFullYear() === now.getFullYear() &&
        entryDate.getMonth() === now.getMonth()
      );
    }
    default:
      return true;
  }
}

export function optimisticRemoveTimeEntry(
  qc: QueryClient,
  entryId: string,
  dateFilter: TimeEntryDateFilter,
): FlatCache | PaginatedCache | undefined {
  const key = timeEntryQueryKeyForFilter(dateFilter);

  if (isPaginated(dateFilter)) {
    const prev = qc.getQueryData<PaginatedCache>(key);
    if (prev) {
      qc.setQueryData<PaginatedCache>(key, {
        ...prev,
        pages: prev.pages.map((page) => ({
          ...page,
          items: page.items.filter((e) => e.id !== entryId),
          totalCount: Math.max(0, page.totalCount - 1),
        })),
      });
    }
    return prev;
  } else {
    const prev = qc.getQueryData<FlatCache>(key);
    if (prev) {
      qc.setQueryData<FlatCache>(key, prev.filter((e) => e.id !== entryId));
    }
    return prev;
  }
}

export function optimisticUpdateTimeEntry(
  qc: QueryClient,
  entryId: string,
  dateFilter: TimeEntryDateFilter,
  patch: Partial<CachedTimeEntry>,
): FlatCache | PaginatedCache | undefined {
  const key = timeEntryQueryKeyForFilter(dateFilter);

  if (isPaginated(dateFilter)) {
    const prev = qc.getQueryData<PaginatedCache>(key);
    if (prev) {
      qc.setQueryData<PaginatedCache>(key, {
        ...prev,
        pages: prev.pages.map((page) => ({
          ...page,
          items: page.items.map((e) => (e.id === entryId ? { ...e, ...patch } : e)),
        })),
      });
    }
    return prev;
  } else {
    const prev = qc.getQueryData<FlatCache>(key);
    if (prev) {
      qc.setQueryData<FlatCache>(key, prev.map((e) => (e.id === entryId ? { ...e, ...patch } : e)));
    }
    return prev;
  }
}

export function optimisticInsertTimeEntry(
  qc: QueryClient,
  entry: CachedTimeEntry,
  dateFilter: TimeEntryDateFilter,
): FlatCache | PaginatedCache | undefined {
  const key = timeEntryQueryKeyForFilter(dateFilter);

  if (isPaginated(dateFilter)) {
    const prev = qc.getQueryData<PaginatedCache>(key);
    if (prev && prev.pages.length > 0) {
      const firstPage = prev.pages[0];
      qc.setQueryData<PaginatedCache>(key, {
        ...prev,
        pages: [
          { ...firstPage, items: [entry, ...firstPage.items], totalCount: firstPage.totalCount + 1 },
          ...prev.pages.slice(1),
        ],
      });
    }
    return prev;
  } else {
    const prev = qc.getQueryData<FlatCache>(key);
    if (prev) {
      qc.setQueryData<FlatCache>(key, [entry, ...prev]);
    }
    return prev;
  }
}

export function optimisticInsertTimeEntryBroad(
  qc: QueryClient,
  entry: CachedTimeEntry,
): void {
  const filters: TimeEntryDateFilter[] = ["today", "week", "month", "all"];
  for (const filter of filters) {
    if (entryMatchesDateFilter(entry.startTime, filter)) {
      const key = timeEntryQueryKeyForFilter(filter);
      if (isPaginated(filter)) {
        const existing = qc.getQueryData<PaginatedCache>(key);
        if (existing && existing.pages.length > 0) {
          const firstPage = existing.pages[0];
          qc.setQueryData<PaginatedCache>(key, {
            ...existing,
            pages: [
              { ...firstPage, items: [entry, ...firstPage.items], totalCount: firstPage.totalCount + 1 },
              ...existing.pages.slice(1),
            ],
          });
        }
      } else {
        const existing = qc.getQueryData<FlatCache>(key);
        if (existing) {
          qc.setQueryData<FlatCache>(key, [entry, ...existing]);
        }
      }
    }
  }
}

export function rollbackTimeEntryCache(
  qc: QueryClient,
  dateFilter: TimeEntryDateFilter,
  previousData: FlatCache | PaginatedCache | undefined,
): void {
  if (previousData !== undefined) {
    qc.setQueryData(timeEntryQueryKeyForFilter(dateFilter), previousData);
  }
}

export function invalidateTimeEntries(
  qc: QueryClient,
  opts: {
    dateFilter?: TimeEntryDateFilter | null;
    includeStats?: boolean;
    taskId?: string | null;
  } = {},
): void {
  if (opts.dateFilter) {
    qc.invalidateQueries({ queryKey: timeEntryQueryKeyForFilter(opts.dateFilter) });
  } else {
    qc.invalidateQueries({ queryKey: queryKeys.timeEntries.all });
  }

  if (opts.includeStats !== false) {
    qc.invalidateQueries({ queryKey: queryKeys.timeEntries.myStats });
  }

  if (opts.taskId) {
    qc.invalidateQueries({ queryKey: queryKeys.tasks.timeEntries(opts.taskId) });
  }
}

/**
 * Invalidate all task-related caches after a task mutation.
 *
 * Consolidates the repeated 3–5 line invalidation pattern that appears
 * in task-detail-drawer, subtask-detail-drawer, ai-project-planner,
 * use-create-task, and project.tsx.
 *
 * @param qc - QueryClient instance
 * @param opts.projectId - invalidate project sections/tasks if provided
 * @param opts.taskId - invalidate specific task detail if provided
 * @param opts.parentTaskId - invalidate parent task + child tasks if provided
 */
export function invalidateTaskCaches(
  qc: QueryClient,
  opts: {
    projectId?: string | null;
    taskId?: string | null;
    parentTaskId?: string | null;
    includeProjectLists?: boolean;
  } = {},
): void {
  qc.invalidateQueries({ queryKey: tenantKey(queryKeys.tasks.my) });
  qc.invalidateQueries({ queryKey: tenantKey(queryKeys.tasks.all) });

  if (opts.taskId) {
    qc.invalidateQueries({ queryKey: tenantKey(queryKeys.tasks.detail(opts.taskId)) });
  }

  if (opts.projectId) {
    qc.invalidateQueries({ queryKey: tenantKey(queryKeys.projects.sections(opts.projectId)) });
    qc.invalidateQueries({ queryKey: tenantKey(queryKeys.projects.tasks(opts.projectId)) });
  }

  if (opts.parentTaskId) {
    qc.invalidateQueries({ queryKey: tenantKey(queryKeys.tasks.detail(opts.parentTaskId)) });
    qc.invalidateQueries({ queryKey: tenantKey(queryKeys.tasks.childTasks(opts.parentTaskId)) });
    qc.invalidateQueries({ queryKey: tenantKey(queryKeys.tasks.subtasks(opts.parentTaskId)) });
  }

  if (opts.includeProjectLists) {
    qc.invalidateQueries({ queryKey: tenantKey(queryKeys.projects.all) });
  }
}
