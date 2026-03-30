import { db } from "../../db";
import { tasks, taskAssignees, taskTags, tags, comments, users, subtasks, projects, clients } from "@shared/schema";
import { eq, inArray, and, isNull, sql, not, ilike, desc, asc, lt, gte } from "drizzle-orm";
import type { TaskListItem, TaskListFilters, TaskListSummary, TaskListResponse } from "@shared/schema";
import { getAccessiblePrivateTaskIds } from "../../lib/privateVisibility";
import { config } from "../../config";

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 200;

function computeDueBucket(dueDate: Date | null): "overdue" | "today" | "upcoming" | "no_date" {
  if (!dueDate) return "no_date";
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const d = new Date(dueDate);
  if (d < todayStart) return "overdue";
  if (d >= todayStart && d < todayEnd) return "today";
  return "upcoming";
}

async function getUserTaskIds(userId: string, includeArchived: boolean): Promise<string[]> {
  const [assigneeRows, personalRows] = await Promise.all([
    db.select({ taskId: taskAssignees.taskId })
      .from(taskAssignees)
      .where(eq(taskAssignees.userId, userId)),
    db.select({ id: tasks.id })
      .from(tasks)
      .where(and(
        eq(tasks.isPersonal, true),
        eq(tasks.createdBy, userId),
        ...(!includeArchived ? [isNull(tasks.archivedAt)] : [])
      )),
  ]);
  const assignedIds = assigneeRows.map(r => r.taskId);
  const personalIds = personalRows.map(r => r.id);
  return Array.from(new Set([...assignedIds, ...personalIds]));
}

function buildFilterConditions(filters: TaskListFilters) {
  const conditions: any[] = [];

  if (filters.status && filters.status !== "all") {
    conditions.push(eq(tasks.status, filters.status));
  }

  if (!filters.includeCompleted && (!filters.status || filters.status === "all")) {
    conditions.push(not(eq(tasks.status, "done")));
  }

  if (filters.priority && filters.priority !== "all") {
    conditions.push(eq(tasks.priority, filters.priority));
  }

  if (filters.search) {
    const searchPattern = `%${filters.search}%`;
    conditions.push(ilike(tasks.title, searchPattern));
  }

  if (filters.dueBucket) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    switch (filters.dueBucket) {
      case "overdue":
        conditions.push(lt(tasks.dueDate, sql`${todayStart.toISOString()}::timestamp`));
        break;
      case "today":
        conditions.push(gte(tasks.dueDate, sql`${todayStart.toISOString()}::timestamp`));
        conditions.push(lt(tasks.dueDate, sql`${todayEnd.toISOString()}::timestamp`));
        break;
      case "this_week": {
        const weekEnd = new Date(todayStart);
        weekEnd.setDate(weekEnd.getDate() + 7);
        conditions.push(gte(tasks.dueDate, sql`${todayStart.toISOString()}::timestamp`));
        conditions.push(lt(tasks.dueDate, sql`${weekEnd.toISOString()}::timestamp`));
        break;
      }
      case "upcoming":
        conditions.push(gte(tasks.dueDate, sql`${todayEnd.toISOString()}::timestamp`));
        break;
      case "no_date":
        conditions.push(isNull(tasks.dueDate));
        break;
    }
  }

  return conditions;
}

function buildOrderBy(sortBy?: string, sortDir?: string) {
  const direction = sortDir === "desc" ? desc : asc;

  switch (sortBy) {
    case "updated":
      return direction(tasks.updatedAt);
    case "priority":
      if (sortDir === "desc") {
        return sql`CASE ${tasks.priority} WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END DESC`;
      }
      return sql`CASE ${tasks.priority} WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END ASC`;
    case "title":
      return direction(tasks.title);
    case "due_date":
    default:
      if (sortDir === "desc") {
        return sql`${tasks.dueDate} DESC NULLS LAST`;
      }
      return sql`${tasks.dueDate} ASC NULLS LAST`;
  }
}

export async function getTaskListItemsByUser(userId: string, tenantId: string, includeArchived = false): Promise<TaskListItem[]> {
  const response = await getFilteredTaskListItems(userId, tenantId, includeArchived, {});
  return response.items;
}

export async function getFilteredTaskListItems(
  userId: string,
  tenantId: string,
  includeArchived: boolean,
  filters: TaskListFilters
): Promise<TaskListResponse> {
  const allTaskIds = await getUserTaskIds(userId, includeArchived);
  if (allTaskIds.length === 0) {
    return {
      items: [],
      summary: emptySummary(),
      pagination: { offset: 0, limit: filters.limit || DEFAULT_PAGE_LIMIT, hasMore: false, totalFiltered: 0 },
    };
  }

  const filterConditions = buildFilterConditions(filters);
  const baseConditions = [
    inArray(tasks.id, allTaskIds),
    ...(!includeArchived ? [isNull(tasks.archivedAt)] : []),
    ...filterConditions,
  ];

  let accessibleSet: Set<string> | null = null;
  if (config.features.enablePrivateTasks) {
    const accessiblePrivateIds = await getAccessiblePrivateTaskIds(userId, tenantId);
    accessibleSet = new Set(accessiblePrivateIds);
  }

  const summaryPromise = computeSummaryFromIds(allTaskIds, includeArchived, accessibleSet, userId, tenantId);

  const limit = Math.min(filters.limit || DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
  const offset = filters.cursor || 0;
  const orderBy = buildOrderBy(filters.sortBy, filters.sortDir);

  const maxFetch = 2000;
  const baseTasks = await db.select()
    .from(tasks)
    .where(and(...baseConditions))
    .orderBy(orderBy)
    .limit(maxFetch);

  let filteredTasks = baseTasks;
  if (accessibleSet) {
    filteredTasks = baseTasks.filter(t =>
      (t as any).visibility !== 'private' || accessibleSet!.has(t.id)
    );
  }

  const totalFiltered = filteredTasks.length;
  const paginatedTasks = filteredTasks.slice(0, limit);
  const hasMore = limit < totalFiltered;

  if (paginatedTasks.length === 0) {
    const summary = await summaryPromise;
    return {
      items: [],
      summary,
      pagination: { offset: 0, limit, hasMore: false, totalFiltered },
    };
  }

  const taskIds = paginatedTasks.map(t => t.id);

  const projectIds = Array.from(new Set(paginatedTasks.map(t => t.projectId).filter(Boolean))) as string[];

  const projectNamePromise = projectIds.length > 0
    ? Promise.all(
        chunk(projectIds, 200).map(batch =>
          db.select({ id: projects.id, name: projects.name, clientName: clients.companyName })
            .from(projects)
            .leftJoin(clients, eq(projects.clientId, clients.id))
            .where(inArray(projects.id, batch))
        )
      ).then(batches => batches.flat())
    : Promise.resolve([] as { id: string; name: string; clientName: string | null }[]);

  const [projectRows, assigneeRows2, tagRows, commentCounts, childTaskCounts, subtaskCounts, summary] = await Promise.all([
    projectNamePromise,

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
      completedCount: sql<number>`count(*) filter (where ${subtasks.completed} = true)::int`.as('completedCount'),
    })
      .from(subtasks)
      .where(inArray(subtasks.taskId, taskIds))
      .groupBy(subtasks.taskId),

    summaryPromise,
  ]);

  const projectNameMap = new Map<string, { name: string; clientName: string | null }>();
  for (const row of projectRows) {
    projectNameMap.set(row.id, { name: row.name, clientName: row.clientName ?? null });
  }

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

  const subtaskCountByTask = new Map<string, { count: number; completedCount: number }>();
  for (const row of subtaskCounts) {
    subtaskCountByTask.set(row.taskId, { count: row.count, completedCount: row.completedCount });
  }

  const items: TaskListItem[] = paginatedTasks.map(task => {
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
      subtaskCount: subtaskCountByTask.get(task.id)?.count ?? 0,
      completedSubtaskCount: subtaskCountByTask.get(task.id)?.completedCount ?? 0,
      commentCount: commentCountByTask.get(task.id) ?? 0,
      assigneeCount: taskAssigneeList.length,
      childTaskCount: childTaskCountByTask.get(task.id) ?? 0,
      assignees: taskAssigneeList,
      tags: tagsByTask.get(task.id) ?? [],
      dueBucket: computeDueBucket(task.dueDate),
    };
  });

  return {
    items,
    summary,
    pagination: {
      offset: 0,
      limit,
      hasMore,
      totalFiltered,
    },
  };
}

async function computeSummaryFromIds(
  allTaskIds: string[],
  includeArchived: boolean,
  accessibleSet: Set<string> | null,
  userId: string,
  tenantId: string,
): Promise<TaskListSummary> {
  const baseConditions = [
    inArray(tasks.id, allTaskIds),
    ...(!includeArchived ? [isNull(tasks.archivedAt)] : []),
  ];

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  let privacyFilter = sql`TRUE`;
  if (accessibleSet && accessibleSet.size > 0) {
    const accessibleIds = Array.from(accessibleSet);
    privacyFilter = sql`(${tasks.visibility} != 'private' OR ${tasks.id} IN (${sql.join(accessibleIds.map(id => sql`${id}`), sql`, `)}))`;
  } else if (accessibleSet) {
    privacyFilter = sql`${tasks.visibility} != 'private'`;
  }

  const summaryRows = await db.select({
    status: tasks.status,
    priority: tasks.priority,
    dueDate: tasks.dueDate,
    isPersonal: tasks.isPersonal,
    projectId: tasks.projectId,
    updatedAt: tasks.updatedAt,
  })
    .from(tasks)
    .where(and(...baseConditions, privacyFilter));

  let total = 0;
  const byStatus = { todo: 0, in_progress: 0, blocked: 0, done: 0 };
  const byDueBucket = { overdue: 0, today: 0, upcoming: 0, no_date: 0, personal: 0 };
  let highPriorityCount = 0;
  let doneCount = 0;
  let completedThisWeek = 0;

  for (const row of summaryRows) {
    total++;

    if (row.status === "todo") byStatus.todo++;
    else if (row.status === "in_progress") byStatus.in_progress++;
    else if (row.status === "blocked") byStatus.blocked++;
    else if (row.status === "done") byStatus.done++;

    if (row.status === "done") {
      doneCount++;
      if (row.updatedAt && new Date(row.updatedAt) >= weekAgo) {
        completedThisWeek++;
      }
    }

    if ((row.priority === "high" || row.priority === "urgent") && row.status !== "done") {
      highPriorityCount++;
    }

    const isPersonalTask = row.isPersonal === true || (!row.projectId && row.isPersonal !== false);
    if (isPersonalTask) {
      byDueBucket.personal++;
    }

    const bucket = computeDueBucket(row.dueDate);
    if (bucket === "overdue" && row.status !== "done") byDueBucket.overdue++;
    else if (bucket === "today") byDueBucket.today++;
    else if (bucket === "upcoming") byDueBucket.upcoming++;
    else if (bucket === "no_date") byDueBucket.no_date++;
  }

  const completionRate = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return {
    total,
    byStatus,
    byDueBucket,
    highPriorityCount,
    completionRate,
    completedThisWeek,
  };
}

function emptySummary(): TaskListSummary {
  return {
    total: 0,
    byStatus: { todo: 0, in_progress: 0, blocked: 0, done: 0 },
    byDueBucket: { overdue: 0, today: 0, upcoming: 0, no_date: 0, personal: 0 },
    highPriorityCount: 0,
    completionRate: 0,
    completedThisWeek: 0,
  };
}

export async function getProjectTaskListItems(
  projectId: string,
  includeArchived: boolean,
): Promise<TaskListItem[]> {
  const conditions: any[] = [
    eq(tasks.projectId, projectId),
    eq(tasks.isPersonal, false),
  ];
  if (!includeArchived) {
    conditions.push(isNull(tasks.archivedAt));
  }

  const baseTasks = await db.select()
    .from(tasks)
    .where(and(...conditions))
    .orderBy(asc(tasks.orderIndex));

  if (baseTasks.length === 0) return [];

  const taskIds = baseTasks.map(t => t.id);

  const [assigneeRows, tagRows, commentCounts, childTaskCounts, subtaskCounts] = await Promise.all([
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
      completedCount: sql<number>`count(*) filter (where ${subtasks.completed} = true)::int`.as('completedCount'),
    })
      .from(subtasks)
      .where(inArray(subtasks.taskId, taskIds))
      .groupBy(subtasks.taskId),
  ]);

  const assigneesByTask = new Map<string, { userId: string; name: string }[]>();
  for (const row of assigneeRows) {
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
    if (row.taskId) commentCountByTask.set(row.taskId, row.count);
  }

  const childTaskCountByTask = new Map<string, number>();
  for (const row of childTaskCounts) {
    if (row.parentTaskId) childTaskCountByTask.set(row.parentTaskId, row.count);
  }

  const subtaskCountByTask = new Map<string, { count: number; completedCount: number }>();
  for (const row of subtaskCounts) {
    subtaskCountByTask.set(row.taskId, { count: row.count, completedCount: row.completedCount });
  }

  return baseTasks.map(task => {
    const taskAssigneeList = assigneesByTask.get(task.id) ?? [];
    return {
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      projectId: task.projectId,
      projectName: null,
      clientName: null,
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
      subtaskCount: subtaskCountByTask.get(task.id)?.count ?? 0,
      completedSubtaskCount: subtaskCountByTask.get(task.id)?.completedCount ?? 0,
      commentCount: commentCountByTask.get(task.id) ?? 0,
      assigneeCount: taskAssigneeList.length,
      childTaskCount: childTaskCountByTask.get(task.id) ?? 0,
      assignees: taskAssigneeList,
      tags: tagsByTask.get(task.id) ?? [],
      dueBucket: computeDueBucket(task.dueDate),
    };
  });
}
