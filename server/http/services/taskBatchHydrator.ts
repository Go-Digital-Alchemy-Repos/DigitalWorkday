import { db } from "../../db";
import { tasks, taskAssignees, taskWatchers, taskTags, tags, sections, projects } from "@shared/schema";
import { eq, inArray, and, isNull } from "drizzle-orm";
import type { TaskWithRelations, Subtask } from "@shared/schema";
import { getAccessiblePrivateTaskIds } from "../../lib/privateVisibility";
import { config } from "../../config";

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

export async function getTasksByUserBatched(userId: string, tenantId: string, includeArchived = false): Promise<TaskWithRelations[]> {
  const assigneeRows = await db.select({ taskId: taskAssignees.taskId })
    .from(taskAssignees)
    .where(eq(taskAssignees.userId, userId));
  const assignedIds = assigneeRows.map(r => r.taskId);

  const personalConditions = [eq(tasks.isPersonal, true), eq(tasks.createdBy, userId)];
  if (!includeArchived) {
    personalConditions.push(isNull(tasks.archivedAt));
  }

  const personalRows = await db.select({ id: tasks.id })
    .from(tasks)
    .where(and(...personalConditions));
  const personalIds = personalRows.map(r => r.id);

  const allTaskIds = Array.from(new Set([...assignedIds, ...personalIds]));
  if (allTaskIds.length === 0) return [];

  const baseTasks: typeof tasks.$inferSelect[] = [];
  for (const batch of chunk(allTaskIds, 500)) {
    const conditions = [inArray(tasks.id, batch)];
    if (!includeArchived) {
      conditions.push(isNull(tasks.archivedAt));
    }
    const rows = await db.select().from(tasks).where(and(...conditions));
    baseTasks.push(...rows);
  }
  if (baseTasks.length === 0) return [];

  let filteredTasks = baseTasks;
  if (config.features.enablePrivateTasks) {
    const accessiblePrivateIds = await getAccessiblePrivateTaskIds(userId, tenantId);
    const accessibleSet = new Set(accessiblePrivateIds);
    filteredTasks = baseTasks.filter(t =>
      (t as any).visibility !== 'private' || accessibleSet.has(t.id)
    );
  }
  if (filteredTasks.length === 0) return [];

  const taskIds = filteredTasks.map(t => t.id);

  const [assigneeRows2, watcherRows, tagRows, subtaskRows] = await Promise.all([
    db.select().from(taskAssignees).where(inArray(taskAssignees.taskId, taskIds)),
    db.select().from(taskWatchers).where(inArray(taskWatchers.taskId, taskIds)),
    db.select({
      id: taskTags.id,
      taskId: taskTags.taskId,
      tagId: taskTags.tagId,
      tag: tags,
    })
      .from(taskTags)
      .leftJoin(tags, eq(taskTags.tagId, tags.id))
      .where(inArray(taskTags.taskId, taskIds)),
    db.select().from(tasks).where(inArray(tasks.parentTaskId, taskIds)),
  ]);

  const uniqueSectionIds = Array.from(new Set(filteredTasks.map(t => t.sectionId).filter((id): id is string => id !== null && id !== undefined)));
  const uniqueProjectIds = Array.from(new Set(filteredTasks.map(t => t.projectId).filter((id): id is string => id !== null && id !== undefined)));

  const [sectionRows, projectRows] = await Promise.all([
    uniqueSectionIds.length > 0
      ? db.select().from(sections).where(inArray(sections.id, uniqueSectionIds))
      : Promise.resolve([]),
    uniqueProjectIds.length > 0
      ? db.select().from(projects).where(inArray(projects.id, uniqueProjectIds))
      : Promise.resolve([]),
  ]);

  const assigneesByTask = new Map<string, typeof taskAssignees.$inferSelect[]>();
  for (const row of assigneeRows2) {
    if (!assigneesByTask.has(row.taskId)) assigneesByTask.set(row.taskId, []);
    assigneesByTask.get(row.taskId)!.push(row);
  }

  const watchersByTask = new Map<string, typeof taskWatchers.$inferSelect[]>();
  for (const row of watcherRows) {
    if (!watchersByTask.has(row.taskId)) watchersByTask.set(row.taskId, []);
    watchersByTask.get(row.taskId)!.push(row);
  }

  type TagRowWithTag = typeof taskTags.$inferSelect & { tag: typeof tags.$inferSelect | null };
  const tagsByTask = new Map<string, TagRowWithTag[]>();
  for (const row of tagRows) {
    if (!tagsByTask.has(row.taskId)) tagsByTask.set(row.taskId, []);
    tagsByTask.get(row.taskId)!.push(row as TagRowWithTag);
  }

  const subtasksByParent = new Map<string, typeof tasks.$inferSelect[]>();
  for (const row of subtaskRows) {
    if (!row.parentTaskId) continue;
    if (!subtasksByParent.has(row.parentTaskId)) subtasksByParent.set(row.parentTaskId, []);
    subtasksByParent.get(row.parentTaskId)!.push(row);
  }

  const sectionById = new Map(sectionRows.map(s => [s.id, s]));
  const projectById = new Map(projectRows.map(p => [p.id, p]));

  const buildChildStub = (ct: typeof tasks.$inferSelect): TaskWithRelations => ({
    ...ct,
    assignees: [],
    watchers: [],
    tags: [],
    subtasks: [] as Subtask[],
    childTasks: [],
    section: undefined,
    project: undefined,
  });

  const result: TaskWithRelations[] = filteredTasks.map(task => ({
    ...task,
    assignees: assigneesByTask.get(task.id) ?? [],
    watchers: watchersByTask.get(task.id) ?? [],
    tags: (tagsByTask.get(task.id) ?? []).map(r => ({
      id: r.id,
      taskId: r.taskId,
      tagId: r.tagId,
      tag: r.tag ?? undefined,
    })),
    subtasks: [] as Subtask[],
    childTasks: (subtasksByParent.get(task.id) ?? []).map(buildChildStub),
    section: task.sectionId ? sectionById.get(task.sectionId) : undefined,
    project: task.projectId ? projectById.get(task.projectId) : undefined,
  }));

  return result.sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });
}
