export const queryKeys = {
  projects: {
    all: ["/api/projects"] as const,
    detail: (id: string) => ["/api/projects", id] as const,
    sections: (id: string) => ["/api/projects", id, "sections"] as const,
    tasks: (id: string) => ["/api/projects", id, "tasks"] as const,
    calendarEvents: (id: string) => ["/api/projects", id, "calendar-events"] as const,
    context: (id: string) => ["/api/projects", id, "context"] as const,
    v1: ["/api/v1/projects"] as const,
  },

  tasks: {
    all: ["/api/tasks"] as const,
    my: ["/api/tasks/my"] as const,
    detail: (id: string) => ["/api/tasks", id] as const,
    subtasks: (id: string) => ["/api/tasks", id, "subtasks"] as const,
    childTasks: (id: string) => ["/api/tasks", id, "childtasks"] as const,
    comments: (id: string) => ["/api/tasks", id, "comments"] as const,
    attachments: (projectId: string, taskId: string) =>
      ["/api/projects", projectId, "tasks", taskId, "attachments"] as const,
  },

  clients: {
    all: ["/api/clients"] as const,
    detail: (id: string) => ["/api/clients", id] as const,
    notes: (id: string) => ["/api/clients", id, "notes"] as const,
    divisions: (id: string) => ["/api/v1/clients", id, "divisions"] as const,
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

  chat: {
    channels: ["/api/v1/chat/channels"] as const,
    dm: ["/api/v1/chat/dm"] as const,
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
