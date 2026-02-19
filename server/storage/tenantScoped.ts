import { Request } from "express";
import { storage } from "../storage";
import { getEffectiveTenantId } from "../middleware/tenantContext";
import {
  getTenancyEnforcementMode,
  isStrictMode,
  logTenancyWarning,
} from "../middleware/tenancyEnforcement";
import { AppError } from "../lib/errors";
import type {
  Project, InsertProject,
  Task, InsertTask,
  Client, InsertClient,
  TimeEntry, InsertTimeEntry,
  ActiveTimer, InsertActiveTimer,
  Comment, InsertComment,
  TaskAttachment, InsertTaskAttachment,
  ClientWithContacts,
  TaskWithRelations,
  TimeEntryWithRelations,
  ActiveTimerWithRelations,
  TaskAttachmentWithUser,
  User,
} from "@shared/schema";

export interface TenantScopedContext {
  tenantId: string;
  userId: string;
  isSuperUser: boolean;
  requestId?: string;
}

function buildContext(req: Request): TenantScopedContext {
  const user = req.user as any;
  const tenantId = getEffectiveTenantId(req);
  const isSuperUser = user?.role === "super_user";

  if (!tenantId) {
    const mode = getTenancyEnforcementMode();
    if (mode === "strict") {
      throw AppError.tenantRequired("Tenant context required for this operation");
    }
    if (mode === "soft") {
      logTenancyWarning(
        "tenantScoped.buildContext",
        "No tenant context available — allowing in soft mode",
        user?.id
      );
    }
  }

  return {
    tenantId: tenantId || "",
    userId: user?.id || "",
    isSuperUser,
    requestId: (req as any).requestId,
  };
}

function requireTenantId(ctx: TenantScopedContext, operation: string): string {
  if (!ctx.tenantId) {
    const mode = getTenancyEnforcementMode();
    if (mode === "strict") {
      throw AppError.tenantRequired(`${operation} requires tenant context`);
    }
    logTenancyWarning("tenantScoped", `${operation} without tenantId (mode=${mode})`, ctx.userId);
  }
  return ctx.tenantId;
}

export class TenantScopedStorage {
  constructor(private ctx: TenantScopedContext) {}

  get tenantId(): string {
    return this.ctx.tenantId;
  }

  // ─── Projects ─────────────────────────────────────────────────────────

  async getProject(id: string): Promise<Project | undefined> {
    const tenantId = requireTenantId(this.ctx, "getProject");
    if (tenantId) {
      return storage.getProjectByIdAndTenant(id, tenantId);
    }
    return storage.getProject(id);
  }

  async getProjects(workspaceId?: string): Promise<Project[]> {
    const tenantId = requireTenantId(this.ctx, "getProjects");
    if (tenantId) {
      return storage.getProjectsByTenant(tenantId, workspaceId);
    }
    return [];
  }

  async getProjectsForUser(workspaceId?: string, isAdmin?: boolean): Promise<Project[]> {
    const tenantId = requireTenantId(this.ctx, "getProjectsForUser");
    if (tenantId) {
      return storage.getProjectsForUser(this.ctx.userId, tenantId, workspaceId, isAdmin);
    }
    return [];
  }

  async createProject(project: InsertProject): Promise<Project> {
    const tenantId = requireTenantId(this.ctx, "createProject");
    if (tenantId) {
      return storage.createProjectWithTenant(project, tenantId);
    }
    return storage.createProject(project);
  }

  async updateProject(id: string, data: Partial<InsertProject>): Promise<Project | undefined> {
    const tenantId = requireTenantId(this.ctx, "updateProject");
    if (tenantId) {
      return storage.updateProjectWithTenant(id, tenantId, data);
    }
    return storage.updateProject(id, data);
  }

  // ─── Tasks ────────────────────────────────────────────────────────────

  async getTask(id: string): Promise<Task | undefined> {
    const tenantId = requireTenantId(this.ctx, "getTask");
    if (tenantId) {
      return storage.getTaskByIdAndTenant(id, tenantId);
    }
    return storage.getTask(id);
  }

  async createTask(task: InsertTask): Promise<Task> {
    const tenantId = requireTenantId(this.ctx, "createTask");
    if (tenantId) {
      return storage.createTaskWithTenant(task, tenantId);
    }
    return storage.createTask(task);
  }

  async updateTask(id: string, data: Partial<InsertTask>): Promise<Task | undefined> {
    const tenantId = requireTenantId(this.ctx, "updateTask");
    if (tenantId) {
      return storage.updateTaskWithTenant(id, tenantId, data);
    }
    return storage.updateTask(id, data);
  }

  async deleteTask(id: string): Promise<boolean> {
    const tenantId = requireTenantId(this.ctx, "deleteTask");
    if (tenantId) {
      return storage.deleteTaskWithTenant(id, tenantId);
    }
    await storage.deleteTask(id);
    return true;
  }

  // ─── Clients ──────────────────────────────────────────────────────────

  async getClient(id: string): Promise<Client | undefined> {
    const tenantId = requireTenantId(this.ctx, "getClient");
    if (tenantId) {
      return storage.getClientByIdAndTenant(id, tenantId);
    }
    return storage.getClient(id);
  }

  async getClients(workspaceId?: string): Promise<ClientWithContacts[]> {
    const tenantId = requireTenantId(this.ctx, "getClients");
    if (tenantId) {
      return storage.getClientsByTenant(tenantId, workspaceId);
    }
    return [];
  }

  async createClient(client: InsertClient): Promise<Client> {
    const tenantId = requireTenantId(this.ctx, "createClient");
    if (tenantId) {
      return storage.createClientWithTenant(client, tenantId);
    }
    return storage.createClient(client);
  }

  async updateClient(id: string, data: Partial<InsertClient>): Promise<Client | undefined> {
    const tenantId = requireTenantId(this.ctx, "updateClient");
    if (tenantId) {
      return storage.updateClientWithTenant(id, tenantId, data);
    }
    return storage.updateClient(id, data);
  }

  async deleteClient(id: string): Promise<boolean> {
    const tenantId = requireTenantId(this.ctx, "deleteClient");
    if (tenantId) {
      return storage.deleteClientWithTenant(id, tenantId);
    }
    await storage.deleteClient(id);
    return true;
  }

  // ─── Time Entries ─────────────────────────────────────────────────────

  async getTimeEntry(id: string): Promise<TimeEntry | undefined> {
    const tenantId = requireTenantId(this.ctx, "getTimeEntry");
    if (tenantId) {
      return storage.getTimeEntryByIdAndTenant(id, tenantId);
    }
    return storage.getTimeEntry(id);
  }

  async getTimeEntries(workspaceId: string, filters?: {
    userId?: string;
    clientId?: string;
    projectId?: string;
    taskId?: string;
    divisionId?: string;
    scope?: "in_scope" | "out_of_scope";
    startDate?: Date;
    endDate?: Date;
  }): Promise<TimeEntryWithRelations[]> {
    const tenantId = requireTenantId(this.ctx, "getTimeEntries");
    if (tenantId) {
      return storage.getTimeEntriesByTenant(tenantId, workspaceId, filters);
    }
    return storage.getTimeEntriesByWorkspace(workspaceId, filters);
  }

  async createTimeEntry(entry: InsertTimeEntry): Promise<TimeEntry> {
    const tenantId = requireTenantId(this.ctx, "createTimeEntry");
    if (tenantId) {
      return storage.createTimeEntryWithTenant(entry, tenantId);
    }
    return storage.createTimeEntry(entry);
  }

  async updateTimeEntry(id: string, data: Partial<InsertTimeEntry>): Promise<TimeEntry | undefined> {
    const tenantId = requireTenantId(this.ctx, "updateTimeEntry");
    if (tenantId) {
      return storage.updateTimeEntryWithTenant(id, tenantId, data);
    }
    return storage.updateTimeEntry(id, data);
  }

  async deleteTimeEntry(id: string): Promise<boolean> {
    const tenantId = requireTenantId(this.ctx, "deleteTimeEntry");
    if (tenantId) {
      return storage.deleteTimeEntryWithTenant(id, tenantId);
    }
    await storage.deleteTimeEntry(id);
    return true;
  }

  // ─── Active Timers ────────────────────────────────────────────────────

  async getActiveTimer(id: string): Promise<ActiveTimer | undefined> {
    const tenantId = requireTenantId(this.ctx, "getActiveTimer");
    if (tenantId) {
      return storage.getActiveTimerByIdAndTenant(id, tenantId);
    }
    return storage.getActiveTimer(id);
  }

  async getActiveTimerByUser(): Promise<ActiveTimerWithRelations | undefined> {
    const tenantId = requireTenantId(this.ctx, "getActiveTimerByUser");
    if (tenantId) {
      return storage.getActiveTimerByUserAndTenant(this.ctx.userId, tenantId);
    }
    return storage.getActiveTimerByUser(this.ctx.userId);
  }

  async createActiveTimer(timer: InsertActiveTimer): Promise<ActiveTimer> {
    const tenantId = requireTenantId(this.ctx, "createActiveTimer");
    if (tenantId) {
      return storage.createActiveTimerWithTenant(timer, tenantId);
    }
    return storage.createActiveTimer(timer);
  }

  async deleteActiveTimer(id: string): Promise<boolean> {
    const tenantId = requireTenantId(this.ctx, "deleteActiveTimer");
    if (tenantId) {
      return storage.deleteActiveTimerWithTenant(id, tenantId);
    }
    await storage.deleteActiveTimer(id);
    return true;
  }

  // ─── Task Attachments ─────────────────────────────────────────────────

  async getTaskAttachment(id: string): Promise<TaskAttachment | undefined> {
    const tenantId = requireTenantId(this.ctx, "getTaskAttachment");
    if (tenantId) {
      return storage.getTaskAttachmentByIdAndTenant(id, tenantId);
    }
    return storage.getTaskAttachment(id);
  }

  async getTaskAttachmentsByTask(taskId: string): Promise<TaskAttachmentWithUser[]> {
    const tenantId = requireTenantId(this.ctx, "getTaskAttachmentsByTask");
    if (tenantId) {
      return storage.getTaskAttachmentsByTaskAndTenant(taskId, tenantId);
    }
    return storage.getTaskAttachmentsByTask(taskId);
  }
}

export function getTenantScopedStorage(req: Request): TenantScopedStorage {
  const ctx = buildContext(req);
  return new TenantScopedStorage(ctx);
}

export function createTenantScopedStorage(ctx: TenantScopedContext): TenantScopedStorage {
  return new TenantScopedStorage(ctx);
}
