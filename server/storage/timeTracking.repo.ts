import {
  type TimeEntry, type InsertTimeEntry,
  type ActiveTimer, type InsertActiveTimer,
  type TimeEntryWithRelations, type ActiveTimerWithRelations,
  type TimeEntryListItem,
  type User, type Client, type Project, type Task,
  timeEntries, activeTimers, users, clients, projects, tasks,
} from "@shared/schema";
import { db } from "../db";
import { eq, and, desc, gte, lte, lt, inArray, isNull, or, sql, count, sum } from "drizzle-orm";
import { assertInsertHasTenantId } from "../lib/errors";

export type PeriodTotals = {
  total: number;
  billable: number;
  unbillable: number;
};

export type DailyBreakdownRow = {
  date: string;
  total: number;
  billable: number;
  unbillable: number;
};

export type DayTotal = {
  date: string;
  totalSeconds: number;
};

export type MissingDescriptionEntry = {
  id: string;
  date: string;
  duration: number;
  clientName?: string;
  projectName?: string;
};

export type GroupedSummaryRow = {
  id: string;
  name: string;
  seconds: number;
  clientName?: string | null;
};

export type ReportTotals = {
  totalSeconds: number;
  inScopeSeconds: number;
  outOfScopeSeconds: number;
  entryCount: number;
};

type TimeEntryFilters = {
  userId?: string;
  clientId?: string;
  projectId?: string;
  taskId?: string;
  scope?: 'in_scope' | 'out_of_scope';
  startDate?: Date;
  endDate?: Date;
};

function collectUniqueIds(entries: TimeEntry[], field: keyof TimeEntry): string[] {
  const ids = new Set<string>();
  for (const e of entries) {
    const val = e[field];
    if (typeof val === "string" && val) ids.add(val);
  }
  return Array.from(ids);
}

async function batchEnrichEntries(entries: TimeEntry[]): Promise<TimeEntryWithRelations[]> {
  if (entries.length === 0) return [];

  const userIds = collectUniqueIds(entries, "userId");
  const clientIds = collectUniqueIds(entries, "clientId");
  const projectIds = collectUniqueIds(entries, "projectId");
  const taskIds = collectUniqueIds(entries, "taskId");

  const [userList, clientList, projectList, taskList] = await Promise.all([
    userIds.length > 0 ? db.select().from(users).where(inArray(users.id, userIds)) : [],
    clientIds.length > 0 ? db.select().from(clients).where(inArray(clients.id, clientIds)) : [],
    projectIds.length > 0 ? db.select().from(projects).where(inArray(projects.id, projectIds)) : [],
    taskIds.length > 0 ? db.select().from(tasks).where(inArray(tasks.id, taskIds)) : [],
  ]);

  const userMap = new Map(userList.map(u => [u.id, u]));
  const clientMap = new Map(clientList.map(c => [c.id, c]));
  const projectMap = new Map(projectList.map(p => [p.id, p]));
  const taskMap = new Map(taskList.map(t => [t.id, t]));

  return entries.map(entry => {
    const enriched: TimeEntryWithRelations = { ...entry };
    if (entry.userId) enriched.user = userMap.get(entry.userId);
    if (entry.clientId) enriched.client = clientMap.get(entry.clientId);
    if (entry.projectId) enriched.project = projectMap.get(entry.projectId);
    if (entry.taskId) enriched.task = taskMap.get(entry.taskId);
    return enriched;
  });
}

async function batchFlattenEntries(entries: TimeEntry[]): Promise<TimeEntryListItem[]> {
  if (entries.length === 0) return [];

  const userIds = collectUniqueIds(entries, "userId");
  const clientIds = collectUniqueIds(entries, "clientId");
  const projectIds = collectUniqueIds(entries, "projectId");
  const taskIds = collectUniqueIds(entries, "taskId");

  const [userList, clientList, projectList, taskList] = await Promise.all([
    userIds.length > 0 ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds)) : [],
    clientIds.length > 0 ? db.select({ id: clients.id, companyName: clients.companyName }).from(clients).where(inArray(clients.id, clientIds)) : [],
    projectIds.length > 0 ? db.select({ id: projects.id, name: projects.name }).from(projects).where(inArray(projects.id, projectIds)) : [],
    taskIds.length > 0 ? db.select({ id: tasks.id, title: tasks.title }).from(tasks).where(inArray(tasks.id, taskIds)) : [],
  ]);

  const userMap = new Map(userList.map(u => [u.id, u.name]));
  const clientMap = new Map(clientList.map(c => [c.id, c.companyName]));
  const projectMap = new Map(projectList.map(p => [p.id, p.name]));
  const taskMap = new Map(taskList.map(t => [t.id, t.title]));

  return entries.map(entry => ({
    ...entry,
    userName: entry.userId ? userMap.get(entry.userId) ?? null : null,
    clientName: entry.clientId ? clientMap.get(entry.clientId) ?? null : null,
    projectName: entry.projectId ? projectMap.get(entry.projectId) ?? null : null,
    taskTitle: entry.taskId ? taskMap.get(entry.taskId) ?? null : null,
  }));
}

export class TimeTrackingRepository {
  async getTimeEntry(id: string): Promise<TimeEntry | undefined> {
    const [entry] = await db.select().from(timeEntries).where(eq(timeEntries.id, id));
    return entry || undefined;
  }

  private buildFilterConditions(baseConditions: any[], filters?: TimeEntryFilters) {
    const conditions = [...baseConditions];
    if (filters?.userId) conditions.push(eq(timeEntries.userId, filters.userId));
    if (filters?.clientId) conditions.push(eq(timeEntries.clientId, filters.clientId));
    if (filters?.projectId) conditions.push(eq(timeEntries.projectId, filters.projectId));
    if (filters?.taskId) conditions.push(eq(timeEntries.taskId, filters.taskId));
    if (filters?.scope) conditions.push(eq(timeEntries.scope, filters.scope));
    if (filters?.startDate) conditions.push(gte(timeEntries.startTime, filters.startDate));
    if (filters?.endDate) conditions.push(lte(timeEntries.startTime, filters.endDate));
    return conditions;
  }

  private async fetchRawEntries(conditions: any[]): Promise<TimeEntry[]> {
    return db.select()
      .from(timeEntries)
      .where(and(...conditions))
      .orderBy(desc(timeEntries.startTime));
  }

  async getTimeEntriesByWorkspace(workspaceId: string, filters?: TimeEntryFilters): Promise<TimeEntryWithRelations[]> {
    const conditions = this.buildFilterConditions([eq(timeEntries.workspaceId, workspaceId)], filters);
    const entries = await this.fetchRawEntries(conditions);
    return batchEnrichEntries(entries);
  }

  async getTimeEntriesByWorkspaceFlat(workspaceId: string, filters?: TimeEntryFilters): Promise<TimeEntryListItem[]> {
    const conditions = this.buildFilterConditions([eq(timeEntries.workspaceId, workspaceId)], filters);
    const entries = await this.fetchRawEntries(conditions);
    return batchFlattenEntries(entries);
  }

  async getTimeEntriesByUser(userId: string, workspaceId: string): Promise<TimeEntryWithRelations[]> {
    return this.getTimeEntriesByWorkspace(workspaceId, { userId });
  }

  async getTimeEntriesByUserFlat(userId: string, workspaceId: string): Promise<TimeEntryListItem[]> {
    return this.getTimeEntriesByWorkspaceFlat(workspaceId, { userId });
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

  async getTimeEntriesByTenant(tenantId: string, workspaceId: string, filters?: TimeEntryFilters): Promise<TimeEntryWithRelations[]> {
    const conditions = this.buildFilterConditions([
      eq(timeEntries.tenantId, tenantId),
      eq(timeEntries.workspaceId, workspaceId),
    ], filters);
    const entries = await this.fetchRawEntries(conditions);
    return batchEnrichEntries(entries);
  }

  async getTimeEntriesByTenantFlat(tenantId: string, workspaceId: string, filters?: TimeEntryFilters): Promise<TimeEntryListItem[]> {
    const conditions = this.buildFilterConditions([
      eq(timeEntries.tenantId, tenantId),
      eq(timeEntries.workspaceId, workspaceId),
    ], filters);
    const entries = await this.fetchRawEntries(conditions);
    return batchFlattenEntries(entries);
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

  private buildScopeConditions(opts: { tenantId?: string; workspaceId: string; userId?: string }): any[] {
    const conditions: any[] = [eq(timeEntries.workspaceId, opts.workspaceId)];
    if (opts.tenantId) conditions.push(eq(timeEntries.tenantId, opts.tenantId));
    if (opts.userId) conditions.push(eq(timeEntries.userId, opts.userId));
    return conditions;
  }

  async getAggregatedPeriodTotals(
    opts: { tenantId?: string; workspaceId: string; userId?: string },
    periods: { name: string; start: Date; end: Date }[],
  ): Promise<Record<string, PeriodTotals>> {
    const baseConditions = this.buildScopeConditions(opts);
    const result: Record<string, PeriodTotals> = {};

    await Promise.all(periods.map(async (period) => {
      const conditions = [
        ...baseConditions,
        gte(timeEntries.startTime, period.start),
        lt(timeEntries.startTime, period.end),
      ];
      const rows = await db.select({
        total: sql<number>`coalesce(sum(${timeEntries.durationSeconds}), 0)`.as('total'),
        billable: sql<number>`coalesce(sum(case when ${timeEntries.scope} = 'out_of_scope' then ${timeEntries.durationSeconds} else 0 end), 0)`.as('billable'),
        unbillable: sql<number>`coalesce(sum(case when coalesce(${timeEntries.scope}, 'in_scope') != 'out_of_scope' then ${timeEntries.durationSeconds} else 0 end), 0)`.as('unbillable'),
      }).from(timeEntries).where(and(...conditions));

      const row = rows[0];
      result[period.name] = {
        total: Number(row?.total ?? 0),
        billable: Number(row?.billable ?? 0),
        unbillable: Number(row?.unbillable ?? 0),
      };
    }));

    return result;
  }

  async getAllTimeTotals(
    opts: { tenantId?: string; workspaceId: string; userId?: string },
  ): Promise<PeriodTotals> {
    const conditions = this.buildScopeConditions(opts);
    const rows = await db.select({
      total: sql<number>`coalesce(sum(${timeEntries.durationSeconds}), 0)`.as('total'),
      billable: sql<number>`coalesce(sum(case when ${timeEntries.scope} = 'out_of_scope' then ${timeEntries.durationSeconds} else 0 end), 0)`.as('billable'),
      unbillable: sql<number>`coalesce(sum(case when coalesce(${timeEntries.scope}, 'in_scope') != 'out_of_scope' then ${timeEntries.durationSeconds} else 0 end), 0)`.as('unbillable'),
    }).from(timeEntries).where(and(...conditions));

    const row = rows[0];
    return {
      total: Number(row?.total ?? 0),
      billable: Number(row?.billable ?? 0),
      unbillable: Number(row?.unbillable ?? 0),
    };
  }

  async getDailyBreakdown(
    opts: { tenantId?: string; workspaceId: string; userId?: string },
    start: Date,
    end: Date,
  ): Promise<DailyBreakdownRow[]> {
    const conditions = [
      ...this.buildScopeConditions(opts),
      gte(timeEntries.startTime, start),
      lt(timeEntries.startTime, end),
    ];
    const rows = await db.select({
      date: sql<string>`to_char(${timeEntries.startTime}, 'YYYY-MM-DD')`.as('date'),
      total: sql<number>`coalesce(sum(${timeEntries.durationSeconds}), 0)`.as('total'),
      billable: sql<number>`coalesce(sum(case when ${timeEntries.scope} = 'out_of_scope' then ${timeEntries.durationSeconds} else 0 end), 0)`.as('billable'),
      unbillable: sql<number>`coalesce(sum(case when coalesce(${timeEntries.scope}, 'in_scope') != 'out_of_scope' then ${timeEntries.durationSeconds} else 0 end), 0)`.as('unbillable'),
    })
      .from(timeEntries)
      .where(and(...conditions))
      .groupBy(sql`to_char(${timeEntries.startTime}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${timeEntries.startTime}, 'YYYY-MM-DD')`);

    return rows.map(r => ({
      date: r.date,
      total: Number(r.total),
      billable: Number(r.billable),
      unbillable: Number(r.unbillable),
    }));
  }

  async getDayTotalsForMonth(
    opts: { tenantId?: string; workspaceId: string; userId?: string },
    monthStart: Date,
    monthEnd: Date,
  ): Promise<DayTotal[]> {
    const conditions = [
      ...this.buildScopeConditions(opts),
      gte(timeEntries.startTime, monthStart),
      lt(timeEntries.startTime, monthEnd),
    ];
    const rows = await db.select({
      date: sql<string>`to_char(${timeEntries.startTime}, 'YYYY-MM-DD')`.as('date'),
      totalSeconds: sql<number>`coalesce(sum(${timeEntries.durationSeconds}), 0)`.as('total_seconds'),
    })
      .from(timeEntries)
      .where(and(...conditions))
      .groupBy(sql`to_char(${timeEntries.startTime}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${timeEntries.startTime}, 'YYYY-MM-DD')`);

    return rows.map(r => ({
      date: r.date,
      totalSeconds: Number(r.totalSeconds),
    }));
  }

  async getMissingDescriptionEntries(
    opts: { tenantId?: string; workspaceId: string; userId?: string },
    since: Date,
    limit: number = 10,
  ): Promise<MissingDescriptionEntry[]> {
    const conditions = [
      ...this.buildScopeConditions(opts),
      gte(timeEntries.startTime, since),
      sql`(${timeEntries.description} IS NULL OR btrim(${timeEntries.description}) = '')`,
    ];
    const rows = await db.select({
      id: timeEntries.id,
      startTime: timeEntries.startTime,
      durationSeconds: timeEntries.durationSeconds,
      clientId: timeEntries.clientId,
      projectId: timeEntries.projectId,
    })
      .from(timeEntries)
      .where(and(...conditions))
      .orderBy(desc(timeEntries.startTime))
      .limit(limit);

    if (rows.length === 0) return [];

    const clientIds = [...new Set(rows.filter(r => r.clientId).map(r => r.clientId!))];
    const projectIds = [...new Set(rows.filter(r => r.projectId).map(r => r.projectId!))];

    const [clientList, projectList] = await Promise.all([
      clientIds.length > 0 ? db.select({ id: clients.id, displayName: clients.displayName, legalName: sql<string>`${clients.legalName}` }).from(clients).where(inArray(clients.id, clientIds)) : [],
      projectIds.length > 0 ? db.select({ id: projects.id, name: projects.name }).from(projects).where(inArray(projects.id, projectIds)) : [],
    ]);

    const clientMap = new Map(clientList.map(c => [c.id, c.displayName || c.legalName]));
    const projectMap = new Map(projectList.map(p => [p.id, p.name]));

    return rows.map(r => ({
      id: r.id,
      date: r.startTime.toISOString(),
      duration: r.durationSeconds,
      clientName: r.clientId ? clientMap.get(r.clientId) || undefined : undefined,
      projectName: r.projectId ? projectMap.get(r.projectId) || undefined : undefined,
    }));
  }

  async getLastEntryId(
    opts: { tenantId?: string; workspaceId: string; userId?: string },
  ): Promise<string | null> {
    const conditions = this.buildScopeConditions(opts);
    const rows = await db.select({ id: timeEntries.id })
      .from(timeEntries)
      .where(and(...conditions))
      .orderBy(desc(timeEntries.startTime))
      .limit(1);
    return rows[0]?.id ?? null;
  }

  async getReportTotals(
    opts: { tenantId?: string; workspaceId: string },
    filters?: { startDate?: Date; endDate?: Date },
  ): Promise<ReportTotals> {
    const conditions: any[] = [eq(timeEntries.workspaceId, opts.workspaceId)];
    if (opts.tenantId) conditions.push(eq(timeEntries.tenantId, opts.tenantId));
    if (filters?.startDate) conditions.push(gte(timeEntries.startTime, filters.startDate));
    if (filters?.endDate) conditions.push(lte(timeEntries.startTime, filters.endDate));

    const rows = await db.select({
      totalSeconds: sql<number>`coalesce(sum(${timeEntries.durationSeconds}), 0)`.as('total'),
      inScopeSeconds: sql<number>`coalesce(sum(case when ${timeEntries.scope} = 'in_scope' then ${timeEntries.durationSeconds} else 0 end), 0)`.as('in_scope'),
      outOfScopeSeconds: sql<number>`coalesce(sum(case when ${timeEntries.scope} = 'in_scope' then 0 else ${timeEntries.durationSeconds} end), 0)`.as('out_scope'),
      entryCount: sql<number>`count(*)`.as('cnt'),
    }).from(timeEntries).where(and(...conditions));

    const row = rows[0];
    return {
      totalSeconds: Number(row?.totalSeconds ?? 0),
      inScopeSeconds: Number(row?.inScopeSeconds ?? 0),
      outOfScopeSeconds: Number(row?.outOfScopeSeconds ?? 0),
      entryCount: Number(row?.entryCount ?? 0),
    };
  }

  async getReportByClient(
    opts: { tenantId?: string; workspaceId: string },
    filters?: { startDate?: Date; endDate?: Date },
  ): Promise<GroupedSummaryRow[]> {
    const conditions: any[] = [
      eq(timeEntries.workspaceId, opts.workspaceId),
      sql`${timeEntries.clientId} IS NOT NULL`,
    ];
    if (opts.tenantId) conditions.push(eq(timeEntries.tenantId, opts.tenantId));
    if (filters?.startDate) conditions.push(gte(timeEntries.startTime, filters.startDate));
    if (filters?.endDate) conditions.push(lte(timeEntries.startTime, filters.endDate));

    const rows = await db.select({
      id: timeEntries.clientId,
      name: sql<string>`coalesce(${clients.displayName}, ${clients.companyName})`.as('name'),
      seconds: sql<number>`coalesce(sum(${timeEntries.durationSeconds}), 0)`.as('seconds'),
    })
      .from(timeEntries)
      .leftJoin(clients, eq(timeEntries.clientId, clients.id))
      .where(and(...conditions))
      .groupBy(timeEntries.clientId, clients.displayName, clients.companyName);

    return rows.map(r => ({
      id: r.id!,
      name: r.name || 'Unknown',
      seconds: Number(r.seconds),
    }));
  }

  async getReportByProject(
    opts: { tenantId?: string; workspaceId: string },
    filters?: { startDate?: Date; endDate?: Date },
  ): Promise<GroupedSummaryRow[]> {
    const conditions: any[] = [
      eq(timeEntries.workspaceId, opts.workspaceId),
      sql`${timeEntries.projectId} IS NOT NULL`,
    ];
    if (opts.tenantId) conditions.push(eq(timeEntries.tenantId, opts.tenantId));
    if (filters?.startDate) conditions.push(gte(timeEntries.startTime, filters.startDate));
    if (filters?.endDate) conditions.push(lte(timeEntries.startTime, filters.endDate));

    const rows = await db.select({
      id: timeEntries.projectId,
      name: sql<string>`coalesce(min(${projects.name}), 'Unknown')`.as('name'),
      seconds: sql<number>`coalesce(sum(${timeEntries.durationSeconds}), 0)`.as('seconds'),
      clientName: sql<string>`min(coalesce(${clients.displayName}, ${clients.companyName}))`.as('client_name'),
    })
      .from(timeEntries)
      .leftJoin(projects, eq(timeEntries.projectId, projects.id))
      .leftJoin(clients, eq(timeEntries.clientId, clients.id))
      .where(and(...conditions))
      .groupBy(timeEntries.projectId);

    return rows.map(r => ({
      id: r.id!,
      name: r.name || 'Unknown',
      seconds: Number(r.seconds),
      clientName: r.clientName || null,
    }));
  }

  async getReportByUser(
    opts: { tenantId?: string; workspaceId: string },
    filters?: { startDate?: Date; endDate?: Date },
  ): Promise<GroupedSummaryRow[]> {
    const conditions: any[] = [
      eq(timeEntries.workspaceId, opts.workspaceId),
      sql`${timeEntries.userId} IS NOT NULL`,
    ];
    if (opts.tenantId) conditions.push(eq(timeEntries.tenantId, opts.tenantId));
    if (filters?.startDate) conditions.push(gte(timeEntries.startTime, filters.startDate));
    if (filters?.endDate) conditions.push(lte(timeEntries.startTime, filters.endDate));

    const rows = await db.select({
      id: timeEntries.userId,
      name: sql<string>`coalesce(${users.name}, ${users.email})`.as('name'),
      seconds: sql<number>`coalesce(sum(${timeEntries.durationSeconds}), 0)`.as('seconds'),
    })
      .from(timeEntries)
      .leftJoin(users, eq(timeEntries.userId, users.id))
      .where(and(...conditions))
      .groupBy(timeEntries.userId, users.name, users.email);

    return rows.map(r => ({
      id: r.id!,
      name: r.name || 'Unknown',
      seconds: Number(r.seconds),
    }));
  }

  async hasEntriesWithNullTenant(
    workspaceId: string,
    filters?: { startDate?: Date; endDate?: Date },
  ): Promise<boolean> {
    const conditions: any[] = [
      eq(timeEntries.workspaceId, workspaceId),
      isNull(timeEntries.tenantId),
    ];
    if (filters?.startDate) conditions.push(gte(timeEntries.startTime, filters.startDate));
    if (filters?.endDate) conditions.push(lte(timeEntries.startTime, filters.endDate));

    const rows = await db.select({ id: timeEntries.id })
      .from(timeEntries)
      .where(and(...conditions))
      .limit(1);
    return rows.length > 0;
  }
}
