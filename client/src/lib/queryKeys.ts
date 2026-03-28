import type { QueryClient } from "@tanstack/react-query";
import { tenantKey } from "./queryClient";

export const queryKeys = {
  projects: {
    all: ["/api/projects"] as const,
    detail: (id: string) => ["/api/projects", id] as const,
    sections: (id: string) => ["/api/projects", id, "sections"] as const,
    tasks: (id: string) => ["/api/projects", id, "tasks"] as const,
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
