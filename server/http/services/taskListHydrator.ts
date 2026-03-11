import { db } from "../../db";
import { tasks, taskAssignees, taskTags, tags, comments, users, subtasks, projects, clients } from "@shared/schema";
import { eq, inArray, and, isNull, sql } from "drizzle-orm";
import type { TaskListItem } from "@shared/schema";
import { getAccessiblePrivateTaskIds } from "../../lib/privateVisibility";
import { config } from "../../config";

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

export async function getTaskListItemsByUser(userId: string, tenantId: string, includeArchived = false): Promise<TaskListItem[]> {
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

  const baseTasks: (typeof tasks.$inferSelect)[] = [];
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

  const projectIds = Array.from(new Set(filteredTasks.map(t => t.projectId).filter(Boolean))) as string[];
  const projectNameMap = new Map<string, { name: string; clientName: string | null }>();
  if (projectIds.length > 0) {
    for (const batch of chunk(projectIds, 200)) {
      const projectRows = await db
        .select({ id: projects.id, name: projects.name, clientName: clients.companyName })
        .from(projects)
        .leftJoin(clients, eq(projects.clientId, clients.id))
        .where(inArray(projects.id, batch));
      for (const row of projectRows) {
        projectNameMap.set(row.id, { name: row.name, clientName: row.clientName ?? null });
      }
    }
  }

  const [assigneeRows2, tagRows, commentCounts, childTaskCounts, subtaskCounts] = await Promise.all([
    db.select({
      taskId: taskAssignees.taskId,
      userId: taskAssignees.userId,
      userName: users.name,
    })
      .from(taskAssignees)
      .leftJoin(users, eq(taskAssignees.userId, users.id))
      .where(inArray(taskAssignees.taskId, taskIds)),

    db.select({
      taskId: taskTags.taskId,
      tagId: tags.id,
      tagName: tags.name,
      tagColor: tags.color,
    })
      .from(taskTags)
      .leftJoin(tags, eq(taskTags.tagId, tags.id))
      .where(inArray(taskTags.taskId, taskIds)),

    db.select({
      taskId: comments.taskId,
      count: sql<number>`count(*)::int`.as('count'),
    })
      .from(comments)
      .where(inArray(comments.taskId, taskIds))
      .groupBy(comments.taskId),

    db.select({
      parentTaskId: tasks.parentTaskId,
      count: sql<number>`count(*)::int`.as('count'),
    })
      .from(tasks)
      .where(inArray(tasks.parentTaskId, taskIds))
      .groupBy(tasks.parentTaskId),

    db.select({
      taskId: subtasks.taskId,
      count: sql<number>`count(*)::int`.as('count'),
    })
      .from(subtasks)
      .where(inArray(subtasks.taskId, taskIds))
      .groupBy(subtasks.taskId),
  ]);

  const assigneesByTask = new Map<string, { userId: string; name: string }[]>();
  for (const row of assigneeRows2) {
    if (!assigneesByTask.has(row.taskId)) assigneesByTask.set(row.taskId, []);
    assigneesByTask.get(row.taskId)!.push({
      userId: row.userId,
      name: row.userName || 'Unknown',
    });
  }

  const tagsByTask = new Map<string, { id: string; name: string; color: string | null }[]>();
  for (const row of tagRows) {
    if (!tagsByTask.has(row.taskId)) tagsByTask.set(row.taskId, []);
    if (row.tagId) {
      tagsByTask.get(row.taskId)!.push({
        id: row.tagId,
        name: row.tagName || '',
        color: row.tagColor,
      });
    }
  }

  const commentCountByTask = new Map<string, number>();
  for (const row of commentCounts) {
    if (row.taskId) {
      commentCountByTask.set(row.taskId, row.count);
    }
  }

  const childTaskCountByTask = new Map<string, number>();
  for (const row of childTaskCounts) {
    if (row.parentTaskId) {
      childTaskCountByTask.set(row.parentTaskId, row.count);
    }
  }

  const subtaskCountByTask = new Map<string, number>();
  for (const row of subtaskCounts) {
    subtaskCountByTask.set(row.taskId, row.count);
  }

  const result: TaskListItem[] = filteredTasks.map(task => {
    const taskAssigneeList = assigneesByTask.get(task.id) ?? [];
    const projectInfo = task.projectId ? projectNameMap.get(task.projectId) : undefined;
    return {
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      projectId: task.projectId,
      projectName: projectInfo?.name ?? null,
      clientName: projectInfo?.clientName ?? null,
      sectionId: task.sectionId,
      parentTaskId: task.parentTaskId,
      isPersonal: task.isPersonal,
      visibility: task.visibility,
      createdBy: task.createdBy,
      orderIndex: task.orderIndex,
      personalSectionId: task.personalSectionId,
      personalSortOrder: task.personalSortOrder,
      archivedAt: task.archivedAt,
      milestoneId: task.milestoneId,
      needsPmReview: task.needsPmReview,
      isBillable: task.isBillable,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      subtaskCount: subtaskCountByTask.get(task.id) ?? 0,
      commentCount: commentCountByTask.get(task.id) ?? 0,
      assigneeCount: taskAssigneeList.length,
      childTaskCount: childTaskCountByTask.get(task.id) ?? 0,
      assignees: taskAssigneeList,
      tags: tagsByTask.get(task.id) ?? [],
    };
  });

  return result.sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });
}
