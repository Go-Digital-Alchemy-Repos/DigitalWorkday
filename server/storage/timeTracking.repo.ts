import {
  type TimeEntry, type InsertTimeEntry,
  type ActiveTimer, type InsertActiveTimer,
  type TimeEntryWithRelations, type ActiveTimerWithRelations,
  type User, type Client, type Project, type Task,
  timeEntries, activeTimers, users, clients, projects, tasks,
} from "@shared/schema";
import { db } from "../db";
import { eq, and, desc, gte, lte, inArray } from "drizzle-orm";
import { assertInsertHasTenantId } from "../lib/errors";

export class TimeTrackingRepository {
  async getTimeEntry(id: string): Promise<TimeEntry | undefined> {
    const [entry] = await db.select().from(timeEntries).where(eq(timeEntries.id, id));
    return entry || undefined;
  }

  async getTimeEntriesByWorkspace(workspaceId: string, filters?: {
    userId?: string;
    clientId?: string;
    projectId?: string;
    taskId?: string;
    scope?: 'in_scope' | 'out_of_scope';
    startDate?: Date;
    endDate?: Date;
  }): Promise<TimeEntryWithRelations[]> {
    let conditions = [eq(timeEntries.workspaceId, workspaceId)];
    
    if (filters?.userId) {
      conditions.push(eq(timeEntries.userId, filters.userId));
    }
    if (filters?.clientId) {
      conditions.push(eq(timeEntries.clientId, filters.clientId));
    }
    if (filters?.projectId) {
      conditions.push(eq(timeEntries.projectId, filters.projectId));
    }
    if (filters?.taskId) {
      conditions.push(eq(timeEntries.taskId, filters.taskId));
    }
    if (filters?.scope) {
      conditions.push(eq(timeEntries.scope, filters.scope));
    }
    if (filters?.startDate) {
      conditions.push(gte(timeEntries.startTime, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(timeEntries.startTime, filters.endDate));
    }

    const entries = await db.select()
      .from(timeEntries)
      .where(and(...conditions))
      .orderBy(desc(timeEntries.startTime));

    const result: TimeEntryWithRelations[] = [];
    for (const entry of entries) {
      const enriched: TimeEntryWithRelations = { ...entry };
      
      if (entry.userId) {
        const [user] = await db.select().from(users).where(eq(users.id, entry.userId));
        if (user) enriched.user = user;
      }
      if (entry.clientId) {
        const [client] = await db.select().from(clients).where(eq(clients.id, entry.clientId));
        if (client) enriched.client = client;
      }
      if (entry.projectId) {
        const [project] = await db.select().from(projects).where(eq(projects.id, entry.projectId));
        if (project) enriched.project = project;
      }
      if (entry.taskId) {
        const [task] = await db.select().from(tasks).where(eq(tasks.id, entry.taskId));
        if (task) enriched.task = task;
      }
      
      result.push(enriched);
    }
    
    return result;
  }

  async getTimeEntriesByUser(userId: string, workspaceId: string): Promise<TimeEntryWithRelations[]> {
    return this.getTimeEntriesByWorkspace(workspaceId, { userId });
  }

  async createTimeEntry(entry: InsertTimeEntry): Promise<TimeEntry> {
    assertInsertHasTenantId(entry, "time_entries");
    const [created] = await db.insert(timeEntries).values(entry).returning();
    return created;
  }

  async updateTimeEntry(id: string, entry: Partial<InsertTimeEntry>): Promise<TimeEntry | undefined> {
    const [updated] = await db.update(timeEntries)
      .set({ ...entry, updatedAt: new Date() })
      .where(eq(timeEntries.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteTimeEntry(id: string): Promise<void> {
    await db.delete(timeEntries).where(eq(timeEntries.id, id));
  }

  async getActiveTimer(id: string): Promise<ActiveTimer | undefined> {
    const [timer] = await db.select().from(activeTimers).where(eq(activeTimers.id, id));
    return timer || undefined;
  }

  async getActiveTimerByUser(userId: string): Promise<ActiveTimerWithRelations | undefined> {
    const [timer] = await db.select().from(activeTimers).where(eq(activeTimers.userId, userId));
    
    if (!timer) return undefined;
    
    const enriched: ActiveTimerWithRelations = { ...timer };
    
    if (timer.userId) {
      const [user] = await db.select().from(users).where(eq(users.id, timer.userId));
      if (user) enriched.user = user;
    }
    if (timer.clientId) {
      const [client] = await db.select().from(clients).where(eq(clients.id, timer.clientId));
      if (client) enriched.client = client;
    }
    if (timer.projectId) {
      const [project] = await db.select().from(projects).where(eq(projects.id, timer.projectId));
      if (project) enriched.project = project;
    }
    if (timer.taskId) {
      const [task] = await db.select().from(tasks).where(eq(tasks.id, timer.taskId));
      if (task) enriched.task = task;
    }
    
    return enriched;
  }

  async createActiveTimer(timer: InsertActiveTimer): Promise<ActiveTimer> {
    assertInsertHasTenantId(timer, "active_timers");
    const [created] = await db.insert(activeTimers).values(timer).returning();
    return created;
  }

  async updateActiveTimer(id: string, timer: Partial<InsertActiveTimer>): Promise<ActiveTimer | undefined> {
    const [updated] = await db.update(activeTimers)
      .set({ ...timer, updatedAt: new Date() })
      .where(eq(activeTimers.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteActiveTimer(id: string): Promise<void> {
    await db.delete(activeTimers).where(eq(activeTimers.id, id));
  }

  async getTimeEntryByIdAndTenant(id: string, tenantId: string): Promise<TimeEntry | undefined> {
    const [entry] = await db.select().from(timeEntries)
      .where(and(eq(timeEntries.id, id), eq(timeEntries.tenantId, tenantId)));
    return entry || undefined;
  }

  async getTimeEntriesByTenant(tenantId: string, workspaceId: string, filters?: {
    userId?: string;
    clientId?: string;
    projectId?: string;
    taskId?: string;
    divisionId?: string;
    scope?: 'in_scope' | 'out_of_scope';
    startDate?: Date;
    endDate?: Date;
  }): Promise<TimeEntryWithRelations[]> {
    let conditions = [
      eq(timeEntries.tenantId, tenantId),
      eq(timeEntries.workspaceId, workspaceId)
    ];
    
    if (filters?.userId) {
      conditions.push(eq(timeEntries.userId, filters.userId));
    }
    if (filters?.clientId) {
      conditions.push(eq(timeEntries.clientId, filters.clientId));
    }
    if (filters?.projectId) {
      conditions.push(eq(timeEntries.projectId, filters.projectId));
    }
    if (filters?.taskId) {
      conditions.push(eq(timeEntries.taskId, filters.taskId));
    }
    if (filters?.divisionId) {
      conditions.push(eq(timeEntries.divisionId, filters.divisionId));
    }
    if (filters?.scope) {
      conditions.push(eq(timeEntries.scope, filters.scope));
    }
    if (filters?.startDate) {
      conditions.push(gte(timeEntries.startTime, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(timeEntries.startTime, filters.endDate));
    }

    const entries = await db.select()
      .from(timeEntries)
      .where(and(...conditions))
      .orderBy(desc(timeEntries.startTime));

    const result: TimeEntryWithRelations[] = [];
    for (const entry of entries) {
      const enriched: TimeEntryWithRelations = { ...entry };
      
      if (entry.userId) {
        const [user] = await db.select().from(users).where(eq(users.id, entry.userId));
        if (user) enriched.user = user;
      }
      if (entry.clientId) {
        const [client] = await db.select().from(clients).where(eq(clients.id, entry.clientId));
        if (client) enriched.client = client;
      }
      if (entry.projectId) {
        const [project] = await db.select().from(projects).where(eq(projects.id, entry.projectId));
        if (project) enriched.project = project;
      }
      if (entry.taskId) {
        const [task] = await db.select().from(tasks).where(eq(tasks.id, entry.taskId));
        if (task) enriched.task = task;
      }
      
      result.push(enriched);
    }
    
    return result;
  }

  async createTimeEntryWithTenant(entry: InsertTimeEntry, tenantId: string): Promise<TimeEntry> {
    const [created] = await db.insert(timeEntries).values({ ...entry, tenantId }).returning();
    return created;
  }

  async updateTimeEntryWithTenant(id: string, tenantId: string, entry: Partial<InsertTimeEntry>): Promise<TimeEntry | undefined> {
    const [updated] = await db.update(timeEntries)
      .set({ ...entry, updatedAt: new Date() })
      .where(and(eq(timeEntries.id, id), eq(timeEntries.tenantId, tenantId)))
      .returning();
    return updated || undefined;
  }

  async deleteTimeEntryWithTenant(id: string, tenantId: string): Promise<boolean> {
    const [existing] = await db.select().from(timeEntries)
      .where(and(eq(timeEntries.id, id), eq(timeEntries.tenantId, tenantId)));
    if (!existing) return false;
    
    await db.delete(timeEntries).where(eq(timeEntries.id, id));
    return true;
  }

  async getActiveTimerByIdAndTenant(id: string, tenantId: string): Promise<ActiveTimer | undefined> {
    const [timer] = await db.select().from(activeTimers)
      .where(and(eq(activeTimers.id, id), eq(activeTimers.tenantId, tenantId)));
    return timer || undefined;
  }

  async getActiveTimerByUserAndTenant(userId: string, tenantId: string): Promise<ActiveTimerWithRelations | undefined> {
    const [timer] = await db.select().from(activeTimers)
      .where(and(eq(activeTimers.userId, userId), eq(activeTimers.tenantId, tenantId)));
    
    if (!timer) return undefined;
    
    const enriched: ActiveTimerWithRelations = { ...timer };
    
    if (timer.userId) {
      const [user] = await db.select().from(users).where(eq(users.id, timer.userId));
      if (user) enriched.user = user;
    }
    if (timer.clientId) {
      const [client] = await db.select().from(clients).where(eq(clients.id, timer.clientId));
      if (client) enriched.client = client;
    }
    if (timer.projectId) {
      const [project] = await db.select().from(projects).where(eq(projects.id, timer.projectId));
      if (project) enriched.project = project;
    }
    if (timer.taskId) {
      const [task] = await db.select().from(tasks).where(eq(tasks.id, timer.taskId));
      if (task) enriched.task = task;
    }
    
    return enriched;
  }

  async createActiveTimerWithTenant(timer: InsertActiveTimer, tenantId: string): Promise<ActiveTimer> {
    const [created] = await db.insert(activeTimers).values({ ...timer, tenantId }).returning();
    return created;
  }

  async updateActiveTimerWithTenant(id: string, tenantId: string, timer: Partial<InsertActiveTimer>): Promise<ActiveTimer | undefined> {
    const [updated] = await db.update(activeTimers)
      .set({ ...timer, updatedAt: new Date() })
      .where(and(eq(activeTimers.id, id), eq(activeTimers.tenantId, tenantId)))
      .returning();
    return updated || undefined;
  }

  async deleteActiveTimerWithTenant(id: string, tenantId: string): Promise<boolean> {
    const [existing] = await db.select().from(activeTimers)
      .where(and(eq(activeTimers.id, id), eq(activeTimers.tenantId, tenantId)));
    if (!existing) return false;
    
    await db.delete(activeTimers).where(eq(activeTimers.id, id));
    return true;
  }
}
