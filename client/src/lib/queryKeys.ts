import type { QueryClient } from "@tanstack/react-query";
import { tenantKey } from "./queryClient";

export const queryKeys = {
  projects: {
    all: ["/api/projects"] as const,
    picker: ["/api/projects", { fields: "picker" }] as const,
    detail: (id: string) => ["/api/projects", id] as const,
    sections: (id: string) => ["/api/projects", id, "sections"] as const,
    tasks: (id: string) => ["/api/projects", id, "tasks"] as const,
    tasksList: (id: string) => ["/api/projects", id, "tasks", { fields: "list" }] as const,
    calendarEvents: (id: string) => ["/api/projects", id, "calendar-events"] as const,
    context: (id: string) => ["/api/projects", id, "context"] as const,
    members: (id: string) => ["/api/projects", id, "members"] as const,
    milestones: (id: string) => [`/api/projects/${id}/milestones`] as const,
    access: (id: string) => ["/api/projects", id, "access"] as const,
    analytics: (id: string) => ["/api/v1/projects", id, "analytics"] as const,
    forecast: (id: string) => ["/api/v1/projects", id, "forecast"] as const,
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
    subtasks: (id: string) => ["/api/tasks", id, "subtasks"] as const,
    childTasks: (id: string) => ["/api/tasks", id, "childtasks"] as const,
    comments: (id: string) => ["/api/tasks", id, "comments"] as const,
    timeEntries: (id: string) => ["/api/tasks", id, "time-entries"] as const,
    access: (id: string) => ["/api/tasks", id, "access"] as const,
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
    projects: (id: string) => ["/api/clients", id, "projects"] as const,
    search: (id: string, q: string) => ["/api/clients", id, "search", { q }] as const,
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
    uiPreferences: ["/api/users/me/ui-preferences"] as const,
  },

  workspaces: {
    current: ["/api/workspaces/current"] as const,
    tags: (id: string) => ["/api/workspaces", id, "tags"] as const,
    members: (id: string) => ["/api/workspaces", id, "members"] as const,
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
    settings: ["/api/v1/tenant/settings"] as const,
    branding: ["/api/v1/tenant/branding"] as const,
  },

  features: {
    flags: ["/api/features/flags"] as const,
    system: ["/api/v1/system/features"] as const,
  },

  crm: {
    flags: ["/api/crm/flags"] as const,
  },

  presence: {
    all: ["/api/v1/presence"] as const,
  },

  reports: {
    clientsAnalytics: ["/api/v1/reports/clients/analytics"] as const,
    pmPortfolio: ["/api/reports/pm/portfolio"] as const,
    workloadTeam: (rangeDays: number) => ["/api/reports/v2/workload/team", { rangeDays }] as const,
  },

  billing: {
    pendingApproval: ["/api/billing/pending-approval"] as const,
    invoiceDrafts: ["/api/billing/invoice-drafts"] as const,
    billableTasksCompleted: ["/api/billing/billable-tasks/completed"] as const,
    clientProfitability: (threshold: number) => ["/api/analytics/client-profitability", threshold] as const,
  },

  assets: {
    downloadUrl: (id: string) => ["/api/v1/assets", id, "download-url"] as const,
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
    qc.invalidateQueries({ queryKey: tenantKey(timeEntryQueryKeyForFilter(opts.dateFilter) as string[]) });
  } else {
    qc.invalidateQueries({ queryKey: tenantKey(queryKeys.timeEntries.all as unknown as string[]) });
  }

  if (opts.includeStats !== false) {
    qc.invalidateQueries({ queryKey: tenantKey(queryKeys.timeEntries.myStats as unknown as string[]) });
  }

  if (opts.taskId) {
    qc.invalidateQueries({ queryKey: tenantKey(queryKeys.tasks.timeEntries(opts.taskId) as unknown as string[]) });
  }
}
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

export function invalidateClientCaches(
  qc: QueryClient,
  opts: {
    clientId?: string | null;
    includeNotes?: boolean;
    includeCrmSummary?: boolean;
  } = {},
): void {
  qc.invalidateQueries({ queryKey: tenantKey(queryKeys.clients.all) });
  qc.invalidateQueries({ queryKey: tenantKey(queryKeys.clients.minimal) });

  if (opts.clientId) {
    qc.invalidateQueries({ queryKey: tenantKey(queryKeys.clients.detail(opts.clientId)) });
    if (opts.includeNotes) {
      qc.invalidateQueries({ queryKey: tenantKey(queryKeys.clients.notes(opts.clientId)) });
    }
    if (opts.includeCrmSummary) {
      qc.invalidateQueries({ queryKey: tenantKey(queryKeys.clients.crmSummary(opts.clientId)) });
    }
  }

  qc.invalidateQueries({ queryKey: tenantKey(queryKeys.clients.hierarchy) });
  qc.invalidateQueries({ queryKey: tenantKey(queryKeys.clients.stagesSummary) });
}

export function invalidateTimeEntryCaches(
  qc: QueryClient,
  opts: {
    taskId?: string | null;
    includeTimer?: boolean;
  } = {},
): void {
  qc.invalidateQueries({ queryKey: tenantKey(queryKeys.timeEntries.all) });
  qc.invalidateQueries({ queryKey: tenantKey(queryKeys.timeEntries.myStats) });
  qc.invalidateQueries({ queryKey: tenantKey(queryKeys.timeEntries.paginated) });

  if (opts.taskId) {
    qc.invalidateQueries({ queryKey: tenantKey(queryKeys.timeEntries.byTask(opts.taskId)) });
  }

  if (opts.includeTimer) {
    qc.invalidateQueries({ queryKey: tenantKey(queryKeys.timer.current) });
  }
}

export function invalidateProjectCaches(
  qc: QueryClient,
  opts: {
    projectId?: string | null;
    includeTasks?: boolean;
    includeMembers?: boolean;
  } = {},
): void {
  qc.invalidateQueries({ queryKey: tenantKey(queryKeys.projects.all) });
  qc.invalidateQueries({ queryKey: tenantKey(queryKeys.projects.withCounts) });
  qc.invalidateQueries({ queryKey: tenantKey(queryKeys.projects.analyticsSummary) });

  if (opts.projectId) {
    qc.invalidateQueries({ queryKey: tenantKey(queryKeys.projects.detail(opts.projectId)) });
    if (opts.includeTasks) {
      qc.invalidateQueries({ queryKey: tenantKey(queryKeys.projects.sections(opts.projectId)) });
      qc.invalidateQueries({ queryKey: tenantKey(queryKeys.projects.tasks(opts.projectId)) });
      qc.invalidateQueries({ queryKey: tenantKey(queryKeys.projects.calendarEvents(opts.projectId)) });
    }
    if (opts.includeMembers) {
      qc.invalidateQueries({ queryKey: tenantKey(queryKeys.projects.members(opts.projectId)) });
    }
  }
}
