import { eq, and, asc, sql, count } from "drizzle-orm";
import { db } from "../../db";
import { projectMilestones, tasks } from "@shared/schema";
import type { ProjectMilestone } from "@shared/schema";

export type MilestoneStatus = "not_started" | "in_progress" | "completed";

export interface MilestoneWithStats extends ProjectMilestone {
  totalTasks: number;
  completedTasks: number;
  percentComplete: number;
}

export interface CreateMilestoneInput {
  tenantId: string;
  projectId: string;
  name: string;
  description?: string | null;
  dueDate?: Date | null;
  orderIndex?: number;
  createdByUserId?: string | null;
}

export interface UpdateMilestoneInput {
  name?: string;
  description?: string | null;
  dueDate?: Date | null;
  status?: MilestoneStatus;
  orderIndex?: number;
  completedAt?: Date | null;
}

async function enrichWithStats(milestones: ProjectMilestone[]): Promise<MilestoneWithStats[]> {
  if (milestones.length === 0) return [];

  const milestoneIds = milestones.map((m) => m.id);

  const rows = await db
    .select({
      milestoneId: tasks.milestoneId,
      total: count(tasks.id),
      completed: sql<number>`count(*) filter (where ${tasks.status} in ('done', 'completed'))`,
    })
    .from(tasks)
    .where(
      and(
        sql`${tasks.milestoneId} = ANY(ARRAY[${sql.join(milestoneIds.map((id) => sql`${id}`), sql`, `)}]::text[])`,
        eq(tasks.isPersonal, false),
        sql`${tasks.archivedAt} IS NULL`
      )
    )
    .groupBy(tasks.milestoneId);

  const statsMap = new Map<string, { total: number; completed: number }>();
  for (const row of rows) {
    if (row.milestoneId) {
      statsMap.set(row.milestoneId, {
        total: Number(row.total),
        completed: Number(row.completed),
      });
    }
  }

  return milestones.map((m) => {
    const stats = statsMap.get(m.id) ?? { total: 0, completed: 0 };
    const percentComplete = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
    return { ...m, totalTasks: stats.total, completedTasks: stats.completed, percentComplete };
  });
}

async function syncMilestoneStatus(milestoneId: string, tenantId: string): Promise<void> {
  const milestone = await db
    .select()
    .from(projectMilestones)
    .where(and(eq(projectMilestones.id, milestoneId), eq(projectMilestones.tenantId, tenantId)))
    .limit(1)
    .then((r) => r[0] ?? null);

  if (!milestone) return;

  const [taskStats] = await db
    .select({
      total: count(tasks.id),
      completed: sql<number>`count(*) filter (where ${tasks.status} in ('done', 'completed'))`,
      inProgress: sql<number>`count(*) filter (where ${tasks.status} in ('in_progress', 'blocked'))`,
    })
    .from(tasks)
    .where(and(eq(tasks.milestoneId, milestoneId), eq(tasks.isPersonal, false), sql`${tasks.archivedAt} IS NULL`));

  const total = Number(taskStats?.total ?? 0);
  const completed = Number(taskStats?.completed ?? 0);
  const inProgress = Number(taskStats?.inProgress ?? 0);

  let newStatus: MilestoneStatus;
  let completedAt: Date | null = milestone.completedAt;

  if (total === 0) {
    newStatus = milestone.status as MilestoneStatus;
    return;
  } else if (completed === total) {
    newStatus = "completed";
    completedAt = milestone.completedAt ?? new Date();
  } else if (completed > 0 || inProgress > 0) {
    newStatus = "in_progress";
    completedAt = null;
  } else {
    newStatus = "not_started";
    completedAt = null;
  }

  if (newStatus !== milestone.status) {
    await db
      .update(projectMilestones)
      .set({ status: newStatus, completedAt, updatedAt: new Date() })
      .where(eq(projectMilestones.id, milestoneId));
  }
}

export const milestoneService = {
  async getMilestonesForProject(tenantId: string, projectId: string): Promise<MilestoneWithStats[]> {
    const rows = await db
      .select()
      .from(projectMilestones)
      .where(and(eq(projectMilestones.tenantId, tenantId), eq(projectMilestones.projectId, projectId)))
      .orderBy(asc(projectMilestones.orderIndex), asc(projectMilestones.createdAt));

    return enrichWithStats(rows);
  },

  async getMilestoneById(tenantId: string, milestoneId: string): Promise<MilestoneWithStats | null> {
    const [row] = await db
      .select()
      .from(projectMilestones)
      .where(and(eq(projectMilestones.id, milestoneId), eq(projectMilestones.tenantId, tenantId)))
      .limit(1);

    if (!row) return null;
    const [enriched] = await enrichWithStats([row]);
    return enriched ?? null;
  },

  async createMilestone(input: CreateMilestoneInput): Promise<MilestoneWithStats> {
    const maxOrderResult = await db
      .select({ max: sql<number>`coalesce(max(${projectMilestones.orderIndex}), -1)` })
      .from(projectMilestones)
      .where(and(eq(projectMilestones.tenantId, input.tenantId), eq(projectMilestones.projectId, input.projectId)));

    const nextOrder = (Number(maxOrderResult[0]?.max ?? -1)) + 1;

    const [created] = await db
      .insert(projectMilestones)
      .values({
        tenantId: input.tenantId,
        projectId: input.projectId,
        name: input.name,
        description: input.description ?? null,
        dueDate: input.dueDate ?? null,
        status: "not_started",
        orderIndex: input.orderIndex ?? nextOrder,
        createdByUserId: input.createdByUserId ?? null,
      })
      .returning();

    const [enriched] = await enrichWithStats([created]);
    return enriched!;
  },

  async updateMilestone(
    tenantId: string,
    milestoneId: string,
    updates: UpdateMilestoneInput
  ): Promise<MilestoneWithStats | null> {
    const setObj: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.name !== undefined) setObj.name = updates.name;
    if (updates.description !== undefined) setObj.description = updates.description;
    if (updates.dueDate !== undefined) setObj.dueDate = updates.dueDate;
    if (updates.status !== undefined) {
      setObj.status = updates.status;
      if (updates.status === "completed") {
        setObj.completedAt = new Date();
      } else {
        setObj.completedAt = null;
      }
    }
    if (updates.orderIndex !== undefined) setObj.orderIndex = updates.orderIndex;

    const [updated] = await db
      .update(projectMilestones)
      .set(setObj)
      .where(and(eq(projectMilestones.id, milestoneId), eq(projectMilestones.tenantId, tenantId)))
      .returning();

    if (!updated) return null;
    const [enriched] = await enrichWithStats([updated]);
    return enriched ?? null;
  },

  async deleteMilestone(tenantId: string, milestoneId: string): Promise<void> {
    await db
      .update(tasks)
      .set({ milestoneId: null, updatedAt: new Date() })
      .where(and(eq(tasks.milestoneId, milestoneId), eq(tasks.tenantId, tenantId)));

    await db
      .delete(projectMilestones)
      .where(and(eq(projectMilestones.id, milestoneId), eq(projectMilestones.tenantId, tenantId)));
  },

  async reorderMilestones(tenantId: string, updates: { id: string; orderIndex: number }[]): Promise<void> {
    for (const u of updates) {
      await db
        .update(projectMilestones)
        .set({ orderIndex: u.orderIndex, updatedAt: new Date() })
        .where(and(eq(projectMilestones.id, u.id), eq(projectMilestones.tenantId, tenantId)));
    }
  },

  syncMilestoneStatus,
};
