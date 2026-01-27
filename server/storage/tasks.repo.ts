import {
  type Task, type InsertTask,
  type TaskAssignee, type InsertTaskAssignee,
  type TaskWatcher, type InsertTaskWatcher,
  type Subtask, type InsertSubtask,
  type SubtaskAssignee, type InsertSubtaskAssignee,
  type SubtaskTag, type InsertSubtaskTag,
  type Tag, type InsertTag,
  type TaskTag, type InsertTaskTag,
  type Comment, type InsertComment,
  type CommentMention, type InsertCommentMention,
  type ActivityLog, type InsertActivityLog,
  type TaskAttachment, type InsertTaskAttachment,
  type User, type Section, type Project,
  type TaskWithRelations, type TaskAttachmentWithUser,
  tasks, taskAssignees, taskWatchers, subtasks, subtaskAssignees, subtaskTags,
  tags, taskTags, comments, commentMentions, activityLog, taskAttachments,
  projects, users, timeEntries, sections,
} from "@shared/schema";
import { db } from "../db";
import { eq, and, desc, asc, gte, lte, inArray, sql } from "drizzle-orm";

export type CalendarTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: Date | null;
  projectId: string | null;
  assignees: Array<{ userId: string; user?: { id: string; name: string; email: string } }>;
};

export type ProjectActivityItem = {
  id: string;
  type: "task_created" | "task_updated" | "comment_added" | "time_logged";
  timestamp: Date;
  actorId: string;
  actorName: string;
  actorEmail: string;
  entityId: string;
  entityTitle: string;
  metadata?: Record<string, unknown>;
};

export class TasksRepository {
  private getUser: (id: string) => Promise<User | undefined>;
  private getSection: (id: string) => Promise<Section | undefined>;
  private getProject: (id: string) => Promise<Project | undefined>;

  constructor(deps: {
    getUser: (id: string) => Promise<User | undefined>;
    getSection: (id: string) => Promise<Section | undefined>;
    getProject: (id: string) => Promise<Project | undefined>;
  }) {
    this.getUser = deps.getUser;
    this.getSection = deps.getSection;
    this.getProject = deps.getProject;
  }

  async getTask(id: string): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    return task || undefined;
  }

  async getTaskWithRelations(id: string): Promise<TaskWithRelations | undefined> {
    const task = await this.getTask(id);
    if (!task) return undefined;

    const assignees = await this.getTaskAssignees(id);
    const watchers = await this.getTaskWatchers(id);
    const taskTagsList = await this.getTaskTags(id);
    const subtasksList = await this.getSubtasksByTask(id);
    const section = task.sectionId ? await this.getSection(task.sectionId) : undefined;
    const project = task.projectId ? await this.getProject(task.projectId) : undefined;
    
    const childTasksList = await this.getChildTasks(id);

    return {
      ...task,
      assignees,
      watchers,
      tags: taskTagsList,
      subtasks: subtasksList,
      childTasks: childTasksList,
      section,
      project,
    };
  }

  async getChildTasks(parentTaskId: string): Promise<TaskWithRelations[]> {
    const childTasksList = await db.select().from(tasks)
      .where(eq(tasks.parentTaskId, parentTaskId))
      .orderBy(asc(tasks.orderIndex));
    
    const result: TaskWithRelations[] = [];
    for (const task of childTasksList) {
      const assignees = await this.getTaskAssignees(task.id);
      const watchers = await this.getTaskWatchers(task.id);
      const taskTagsList = await this.getTaskTags(task.id);
      const section = task.sectionId ? await this.getSection(task.sectionId) : undefined;
      const project = task.projectId ? await this.getProject(task.projectId) : undefined;
      
      result.push({
        ...task,
        assignees,
        watchers,
        tags: taskTagsList,
        subtasks: [],
        childTasks: [],
        section,
        project,
      });
    }
    return result;
  }

  async getTasksByProject(projectId: string): Promise<TaskWithRelations[]> {
    const tasksList = await db.select().from(tasks)
      .where(and(
        eq(tasks.projectId, projectId),
        eq(tasks.isPersonal, false)
      ))
      .orderBy(asc(tasks.orderIndex));
    
    const result: TaskWithRelations[] = [];
    for (const task of tasksList) {
      const taskWithRelations = await this.getTaskWithRelations(task.id);
      if (taskWithRelations) {
        result.push(taskWithRelations);
      }
    }
    return result;
  }

  async getTasksDueSoon(beforeDate: Date): Promise<Task[]> {
    const now = new Date();
    const tasksList = await db.select().from(tasks)
      .where(and(
        gte(tasks.dueDate, now),
        lte(tasks.dueDate, beforeDate),
        sql`${tasks.status} != 'completed'`,
        eq(tasks.isPersonal, false)
      ))
      .orderBy(asc(tasks.dueDate));
    
    return tasksList;
  }

  async getTasksByUser(userId: string): Promise<TaskWithRelations[]> {
    const assigneeRecords = await db.select().from(taskAssignees).where(eq(taskAssignees.userId, userId));
    const assignedTaskIds = new Set(assigneeRecords.map(a => a.taskId));
    
    const personalTasks = await db.select().from(tasks).where(
      and(
        eq(tasks.isPersonal, true),
        eq(tasks.createdBy, userId)
      )
    );
    const personalTaskIds = personalTasks.map(t => t.id);
    
    const allTaskIds = [...new Set([...Array.from(assignedTaskIds), ...personalTaskIds])];
    if (allTaskIds.length === 0) return [];

    const result: TaskWithRelations[] = [];
    for (const taskId of allTaskIds) {
      const taskWithRelations = await this.getTaskWithRelations(taskId);
      if (taskWithRelations) {
        result.push(taskWithRelations);
      }
    }
    return result.sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });
  }

  async getCalendarTasksByTenant(tenantId: string, workspaceId: string, startDate: Date, endDate: Date): Promise<CalendarTask[]> {
    const tasksList = await db.select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      projectId: tasks.projectId,
    }).from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(and(
        eq(projects.tenantId, tenantId),
        eq(projects.workspaceId, workspaceId),
        eq(tasks.isPersonal, false),
        gte(tasks.dueDate, startDate),
        lte(tasks.dueDate, endDate)
      ))
      .orderBy(asc(tasks.dueDate));
    
    if (tasksList.length === 0) return [];
    
    const taskIds = tasksList.map(t => t.id);
    const allAssignees = await db.select({
      taskId: taskAssignees.taskId,
      userId: taskAssignees.userId,
      userName: users.name,
      userEmail: users.email,
    }).from(taskAssignees)
      .leftJoin(users, eq(taskAssignees.userId, users.id))
      .where(inArray(taskAssignees.taskId, taskIds));
    
    const assigneesByTask = new Map<string, CalendarTask["assignees"]>();
    for (const a of allAssignees) {
      if (!assigneesByTask.has(a.taskId)) {
        assigneesByTask.set(a.taskId, []);
      }
      assigneesByTask.get(a.taskId)!.push({
        userId: a.userId,
        user: a.userName ? { id: a.userId, name: a.userName, email: a.userEmail || "" } : undefined
      });
    }
    
    return tasksList.map(task => ({
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      projectId: task.projectId,
      assignees: assigneesByTask.get(task.id) || [],
    }));
  }

  async getCalendarTasksByWorkspace(workspaceId: string, startDate: Date, endDate: Date): Promise<CalendarTask[]> {
    const tasksList = await db.select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      projectId: tasks.projectId,
    }).from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(and(
        eq(projects.workspaceId, workspaceId),
        eq(tasks.isPersonal, false),
        gte(tasks.dueDate, startDate),
        lte(tasks.dueDate, endDate)
      ))
      .orderBy(asc(tasks.dueDate));
    
    if (tasksList.length === 0) return [];
    
    const taskIds = tasksList.map(t => t.id);
    const allAssignees = await db.select({
      taskId: taskAssignees.taskId,
      userId: taskAssignees.userId,
      userName: users.name,
      userEmail: users.email,
    }).from(taskAssignees)
      .leftJoin(users, eq(taskAssignees.userId, users.id))
      .where(inArray(taskAssignees.taskId, taskIds));
    
    const assigneesByTask = new Map<string, CalendarTask["assignees"]>();
    for (const a of allAssignees) {
      if (!assigneesByTask.has(a.taskId)) {
        assigneesByTask.set(a.taskId, []);
      }
      assigneesByTask.get(a.taskId)!.push({
        userId: a.userId,
        user: a.userName ? { id: a.userId, name: a.userName, email: a.userEmail || "" } : undefined
      });
    }
    
    return tasksList.map(task => ({
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      projectId: task.projectId,
      assignees: assigneesByTask.get(task.id) || [],
    }));
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    const existingTasks = insertTask.sectionId 
      ? await db.select().from(tasks).where(and(
          eq(tasks.sectionId, insertTask.sectionId),
          sql`${tasks.parentTaskId} IS NULL`
        ))
      : insertTask.projectId 
        ? await db.select().from(tasks).where(and(
            eq(tasks.projectId, insertTask.projectId),
            sql`${tasks.parentTaskId} IS NULL`
          ))
        : [];
    const orderIndex = insertTask.orderIndex ?? existingTasks.length;
    const [task] = await db.insert(tasks).values({ ...insertTask, orderIndex }).returning();
    return task;
  }

  async createChildTask(parentTaskId: string, insertTask: InsertTask): Promise<Task> {
    const parentTask = await this.getTask(parentTaskId);
    if (!parentTask) {
      throw new Error("Parent task not found");
    }
    if (parentTask.parentTaskId) {
      throw new Error("Cannot create subtask of a subtask (max depth is 2 levels)");
    }
    
    const existingChildren = await db.select().from(tasks)
      .where(eq(tasks.parentTaskId, parentTaskId));
    const orderIndex = insertTask.orderIndex ?? existingChildren.length;
    
    const [task] = await db.insert(tasks).values({
      ...insertTask,
      parentTaskId,
      sectionId: parentTask.sectionId,
      projectId: parentTask.projectId,
      orderIndex,
    }).returning();
    return task;
  }

  async updateTask(id: string, task: Partial<InsertTask>): Promise<Task | undefined> {
    const [updated] = await db.update(tasks).set({ ...task, updatedAt: new Date() }).where(eq(tasks.id, id)).returning();
    return updated || undefined;
  }

  async deleteTask(id: string): Promise<void> {
    const childTasksList = await db.select().from(tasks).where(eq(tasks.parentTaskId, id));
    for (const childTask of childTasksList) {
      await db.delete(taskAssignees).where(eq(taskAssignees.taskId, childTask.id));
      await db.delete(taskTags).where(eq(taskTags.taskId, childTask.id));
      await db.delete(comments).where(eq(comments.taskId, childTask.id));
    }
    await db.delete(tasks).where(eq(tasks.parentTaskId, id));
    
    await db.delete(subtasks).where(eq(subtasks.taskId, id));
    await db.delete(taskAssignees).where(eq(taskAssignees.taskId, id));
    await db.delete(taskTags).where(eq(taskTags.taskId, id));
    await db.delete(comments).where(eq(comments.taskId, id));
    await db.delete(tasks).where(eq(tasks.id, id));
  }

  async moveTask(id: string, sectionId: string, targetIndex: number): Promise<void> {
    const task = await this.getTask(id);
    if (!task) return;

    const tasksInSection = await db.select().from(tasks)
      .where(and(
        eq(tasks.sectionId, sectionId),
        sql`${tasks.parentTaskId} IS NULL`
      ))
      .orderBy(asc(tasks.orderIndex));

    const filtered = tasksInSection.filter(t => t.id !== id);
    filtered.splice(targetIndex, 0, { ...task, sectionId });

    for (let i = 0; i < filtered.length; i++) {
      await db.update(tasks)
        .set({ sectionId, orderIndex: i, updatedAt: new Date() })
        .where(eq(tasks.id, filtered[i].id));
    }
    
    await db.update(tasks)
      .set({ sectionId, updatedAt: new Date() })
      .where(eq(tasks.parentTaskId, id));
  }

  async reorderChildTasks(parentTaskId: string, taskId: string, toIndex: number): Promise<void> {
    const childTask = await this.getTask(taskId);
    if (!childTask || childTask.parentTaskId !== parentTaskId) return;

    const childTasksList = await db.select().from(tasks)
      .where(eq(tasks.parentTaskId, parentTaskId))
      .orderBy(asc(tasks.orderIndex));

    const filtered = childTasksList.filter(t => t.id !== taskId);
    filtered.splice(toIndex, 0, childTask);

    for (let i = 0; i < filtered.length; i++) {
      await db.update(tasks)
        .set({ orderIndex: i, updatedAt: new Date() })
        .where(eq(tasks.id, filtered[i].id));
    }
  }

  async getTaskAssignees(taskId: string): Promise<(TaskAssignee & { user?: User })[]> {
    const assignees = await db.select().from(taskAssignees).where(eq(taskAssignees.taskId, taskId));
    const result = [];
    for (const assignee of assignees) {
      const user = await this.getUser(assignee.userId);
      result.push({ ...assignee, user });
    }
    return result;
  }

  async addTaskAssignee(assignee: InsertTaskAssignee): Promise<TaskAssignee> {
    const [result] = await db.insert(taskAssignees).values(assignee).returning();
    return result;
  }

  async removeTaskAssignee(taskId: string, userId: string): Promise<void> {
    await db.delete(taskAssignees).where(
      and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.userId, userId))
    );
  }

  async getTaskWatchers(taskId: string): Promise<(TaskWatcher & { user?: User })[]> {
    const watchers = await db.select().from(taskWatchers).where(eq(taskWatchers.taskId, taskId));
    const result = [];
    for (const watcher of watchers) {
      const user = await this.getUser(watcher.userId);
      result.push({ ...watcher, user });
    }
    return result;
  }

  async addTaskWatcher(watcher: InsertTaskWatcher): Promise<TaskWatcher> {
    const [result] = await db.insert(taskWatchers).values(watcher).returning();
    return result;
  }

  async removeTaskWatcher(taskId: string, userId: string): Promise<void> {
    await db.delete(taskWatchers).where(
      and(eq(taskWatchers.taskId, taskId), eq(taskWatchers.userId, userId))
    );
  }

  async getSubtask(id: string): Promise<Subtask | undefined> {
    const [subtask] = await db.select().from(subtasks).where(eq(subtasks.id, id));
    return subtask || undefined;
  }

  async getSubtasksByTask(taskId: string): Promise<Subtask[]> {
    return db.select().from(subtasks).where(eq(subtasks.taskId, taskId)).orderBy(asc(subtasks.orderIndex));
  }

  async createSubtask(insertSubtask: InsertSubtask): Promise<Subtask> {
    const existingSubtasks = await this.getSubtasksByTask(insertSubtask.taskId);
    const orderIndex = insertSubtask.orderIndex ?? existingSubtasks.length;
    const [subtask] = await db.insert(subtasks).values({ ...insertSubtask, orderIndex }).returning();
    return subtask;
  }

  async updateSubtask(id: string, subtask: Partial<InsertSubtask>): Promise<Subtask | undefined> {
    const [updated] = await db.update(subtasks).set({ ...subtask, updatedAt: new Date() }).where(eq(subtasks.id, id)).returning();
    return updated || undefined;
  }

  async deleteSubtask(id: string): Promise<void> {
    await db.delete(subtasks).where(eq(subtasks.id, id));
  }

  async moveSubtask(id: string, targetIndex: number): Promise<void> {
    const subtask = await this.getSubtask(id);
    if (!subtask) return;

    const subtasksList = await this.getSubtasksByTask(subtask.taskId);
    const filtered = subtasksList.filter(s => s.id !== id);
    filtered.splice(targetIndex, 0, subtask);

    for (let i = 0; i < filtered.length; i++) {
      await db.update(subtasks)
        .set({ orderIndex: i, updatedAt: new Date() })
        .where(eq(subtasks.id, filtered[i].id));
    }
  }

  async getTag(id: string): Promise<Tag | undefined> {
    const [tag] = await db.select().from(tags).where(eq(tags.id, id));
    return tag || undefined;
  }

  async getTagsByWorkspace(workspaceId: string): Promise<Tag[]> {
    return db.select().from(tags).where(eq(tags.workspaceId, workspaceId));
  }

  async createTag(insertTag: InsertTag): Promise<Tag> {
    const [tag] = await db.insert(tags).values(insertTag).returning();
    return tag;
  }

  async updateTag(id: string, tag: Partial<InsertTag>): Promise<Tag | undefined> {
    const [updated] = await db.update(tags).set(tag).where(eq(tags.id, id)).returning();
    return updated || undefined;
  }

  async deleteTag(id: string): Promise<void> {
    await db.delete(taskTags).where(eq(taskTags.tagId, id));
    await db.delete(tags).where(eq(tags.id, id));
  }

  async getTaskTags(taskId: string): Promise<(TaskTag & { tag?: Tag })[]> {
    const taskTagsList = await db.select().from(taskTags).where(eq(taskTags.taskId, taskId));
    const result = [];
    for (const tt of taskTagsList) {
      const tag = await this.getTag(tt.tagId);
      result.push({ ...tt, tag });
    }
    return result;
  }

  async addTaskTag(taskTag: InsertTaskTag): Promise<TaskTag> {
    const [result] = await db.insert(taskTags).values(taskTag).returning();
    return result;
  }

  async removeTaskTag(taskId: string, tagId: string): Promise<void> {
    await db.delete(taskTags).where(
      and(eq(taskTags.taskId, taskId), eq(taskTags.tagId, tagId))
    );
  }

  async getSubtaskAssignees(subtaskId: string): Promise<(SubtaskAssignee & { user?: User })[]> {
    const results = await db.select().from(subtaskAssignees)
      .leftJoin(users, eq(subtaskAssignees.userId, users.id))
      .where(eq(subtaskAssignees.subtaskId, subtaskId));
    return results.map(r => ({
      ...r.subtask_assignees,
      user: r.users || undefined,
    }));
  }

  async addSubtaskAssignee(assignee: InsertSubtaskAssignee): Promise<SubtaskAssignee> {
    const [result] = await db.insert(subtaskAssignees).values(assignee).returning();
    return result;
  }

  async removeSubtaskAssignee(subtaskId: string, userId: string): Promise<void> {
    await db.delete(subtaskAssignees).where(
      and(eq(subtaskAssignees.subtaskId, subtaskId), eq(subtaskAssignees.userId, userId))
    );
  }

  async getSubtaskTags(subtaskId: string): Promise<(SubtaskTag & { tag?: Tag })[]> {
    const results = await db.select().from(subtaskTags)
      .leftJoin(tags, eq(subtaskTags.tagId, tags.id))
      .where(eq(subtaskTags.subtaskId, subtaskId));
    return results.map(r => ({
      ...r.subtask_tags,
      tag: r.tags || undefined,
    }));
  }

  async addSubtaskTag(subtaskTag: InsertSubtaskTag): Promise<SubtaskTag> {
    const [result] = await db.insert(subtaskTags).values(subtaskTag).returning();
    return result;
  }

  async removeSubtaskTag(subtaskId: string, tagId: string): Promise<void> {
    await db.delete(subtaskTags).where(
      and(eq(subtaskTags.subtaskId, subtaskId), eq(subtaskTags.tagId, tagId))
    );
  }

  async getSubtaskWithRelations(id: string): Promise<(Subtask & { assignees: (SubtaskAssignee & { user?: User })[]; tags: (SubtaskTag & { tag?: Tag })[] }) | undefined> {
    const subtask = await this.getSubtask(id);
    if (!subtask) return undefined;
    
    const assignees = await this.getSubtaskAssignees(id);
    const subtaskTagsList = await this.getSubtaskTags(id);
    
    return {
      ...subtask,
      assignees,
      tags: subtaskTagsList,
    };
  }

  async getComment(id: string): Promise<Comment | undefined> {
    const [comment] = await db.select().from(comments).where(eq(comments.id, id));
    return comment || undefined;
  }

  async getCommentsByTask(taskId: string): Promise<(Comment & { user?: User })[]> {
    const commentsList = await db.select().from(comments)
      .where(eq(comments.taskId, taskId))
      .orderBy(asc(comments.createdAt));
    
    const result = [];
    for (const comment of commentsList) {
      const user = await this.getUser(comment.userId);
      result.push({ ...comment, user });
    }
    return result;
  }

  async createComment(insertComment: InsertComment): Promise<Comment> {
    const [comment] = await db.insert(comments).values(insertComment).returning();
    return comment;
  }

  async updateComment(id: string, comment: Partial<InsertComment>): Promise<Comment | undefined> {
    const [updated] = await db.update(comments).set({ ...comment, updatedAt: new Date() }).where(eq(comments.id, id)).returning();
    return updated || undefined;
  }

  async deleteComment(id: string): Promise<void> {
    await db.delete(commentMentions).where(eq(commentMentions.commentId, id));
    await db.delete(comments).where(eq(comments.id, id));
  }

  async resolveComment(id: string, resolvedByUserId: string): Promise<Comment | undefined> {
    const [updated] = await db.update(comments).set({
      isResolved: true,
      resolvedAt: new Date(),
      resolvedByUserId,
      updatedAt: new Date(),
    }).where(eq(comments.id, id)).returning();
    return updated || undefined;
  }

  async unresolveComment(id: string): Promise<Comment | undefined> {
    const [updated] = await db.update(comments).set({
      isResolved: false,
      resolvedAt: null,
      resolvedByUserId: null,
      updatedAt: new Date(),
    }).where(eq(comments.id, id)).returning();
    return updated || undefined;
  }

  async createCommentMention(mention: InsertCommentMention): Promise<CommentMention> {
    const [result] = await db.insert(commentMentions).values(mention).returning();
    return result;
  }

  async getCommentMentions(commentId: string): Promise<(CommentMention & { mentionedUser?: User })[]> {
    const mentions = await db.select().from(commentMentions).where(eq(commentMentions.commentId, commentId));
    const result = [];
    for (const mention of mentions) {
      const user = await this.getUser(mention.mentionedUserId);
      result.push({ ...mention, mentionedUser: user });
    }
    return result;
  }

  async deleteCommentMentions(commentId: string): Promise<void> {
    await db.delete(commentMentions).where(eq(commentMentions.commentId, commentId));
  }

  async createActivityLog(log: InsertActivityLog): Promise<ActivityLog> {
    const [result] = await db.insert(activityLog).values(log).returning();
    return result;
  }

  async getActivityLogByEntity(entityType: string, entityId: string): Promise<ActivityLog[]> {
    return db.select().from(activityLog)
      .where(and(eq(activityLog.entityType, entityType), eq(activityLog.entityId, entityId)))
      .orderBy(desc(activityLog.createdAt));
  }

  async getProjectActivity(projectId: string, tenantId: string | null, limit: number = 50): Promise<ProjectActivityItem[]> {
    const activityItems: ProjectActivityItem[] = [];
    const userIds = new Set<string>();
    const taskCache = new Map<string, { id: string; title: string }>();

    const taskFilters = tenantId 
      ? and(eq(tasks.projectId, projectId), eq(tasks.tenantId, tenantId))
      : eq(tasks.projectId, projectId);

    const timeEntryFilters = tenantId
      ? and(eq(timeEntries.projectId, projectId), eq(timeEntries.tenantId, tenantId))
      : eq(timeEntries.projectId, projectId);

    const allProjectTasks = await db.select({ id: tasks.id, title: tasks.title })
      .from(tasks)
      .where(taskFilters);
    
    const allTaskIds = allProjectTasks.map(t => t.id);
    for (const t of allProjectTasks) {
      taskCache.set(t.id, t);
    }

    const recentTasks = await db.select().from(tasks)
      .where(taskFilters)
      .orderBy(desc(tasks.createdAt))
      .limit(limit);

    for (const task of recentTasks) {
      if (task.createdBy) userIds.add(task.createdBy);
      activityItems.push({
        id: `task-created-${task.id}`,
        type: "task_created",
        timestamp: task.createdAt,
        actorId: task.createdBy || "system",
        actorName: "",
        actorEmail: "",
        entityId: task.id,
        entityTitle: task.title,
      });

      const timeDiff = task.updatedAt.getTime() - task.createdAt.getTime();
      if (timeDiff > 60000) {
        activityItems.push({
          id: `task-updated-${task.id}-${task.updatedAt.getTime()}`,
          type: "task_updated",
          timestamp: task.updatedAt,
          actorId: task.createdBy || "system",
          actorName: "",
          actorEmail: "",
          entityId: task.id,
          entityTitle: task.title,
        });
      }
    }

    if (allTaskIds.length > 0) {
      const recentComments = await db.select().from(comments)
        .where(inArray(comments.taskId, allTaskIds))
        .orderBy(desc(comments.createdAt))
        .limit(limit);

      for (const comment of recentComments) {
        userIds.add(comment.userId);
        const task = taskCache.get(comment.taskId);
        activityItems.push({
          id: `comment-${comment.id}`,
          type: "comment_added",
          timestamp: comment.createdAt,
          actorId: comment.userId,
          actorName: "",
          actorEmail: "",
          entityId: comment.taskId,
          entityTitle: task?.title || "Task",
          metadata: { commentBody: comment.body.substring(0, 100) },
        });
      }
    }

    const recentTimeEntries = await db.select().from(timeEntries)
      .where(timeEntryFilters)
      .orderBy(desc(timeEntries.startTime))
      .limit(limit);

    for (const entry of recentTimeEntries) {
      userIds.add(entry.userId);
      const task = entry.taskId ? taskCache.get(entry.taskId) : null;
      activityItems.push({
        id: `time-entry-${entry.id}`,
        type: "time_logged",
        timestamp: entry.createdAt,
        actorId: entry.userId,
        actorName: "",
        actorEmail: "",
        entityId: entry.taskId || projectId,
        entityTitle: task?.title || entry.description || "Time logged",
        metadata: { durationSeconds: entry.durationSeconds },
      });
    }

    const userMap = new Map<string, { id: string; name: string; email: string }>();
    if (userIds.size > 0) {
      const userList = await db.select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(inArray(users.id, Array.from(userIds)));
      for (const u of userList) {
        userMap.set(u.id, u);
      }
    }

    for (const item of activityItems) {
      if (item.actorId === "system") {
        item.actorName = "System";
        item.actorEmail = "";
      } else {
        const user = userMap.get(item.actorId);
        item.actorName = user?.name || "Unknown";
        item.actorEmail = user?.email || "";
      }
    }

    activityItems.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return activityItems.slice(0, limit);
  }

  async getTaskAttachment(id: string): Promise<TaskAttachment | undefined> {
    const [attachment] = await db.select().from(taskAttachments).where(eq(taskAttachments.id, id));
    return attachment || undefined;
  }

  async getTaskAttachmentsByTask(taskId: string): Promise<TaskAttachmentWithUser[]> {
    const attachmentsList = await db.select().from(taskAttachments)
      .where(eq(taskAttachments.taskId, taskId))
      .orderBy(desc(taskAttachments.createdAt));
    
    const result: TaskAttachmentWithUser[] = [];
    for (const attachment of attachmentsList) {
      const user = await this.getUser(attachment.uploadedByUserId);
      result.push({ ...attachment, uploadedByUser: user });
    }
    return result;
  }

  async createTaskAttachment(insertAttachment: InsertTaskAttachment): Promise<TaskAttachment> {
    const [attachment] = await db.insert(taskAttachments).values(insertAttachment).returning();
    return attachment;
  }

  async updateTaskAttachment(id: string, attachment: Partial<InsertTaskAttachment>): Promise<TaskAttachment | undefined> {
    const [updated] = await db.update(taskAttachments)
      .set({ ...attachment, updatedAt: new Date() })
      .where(eq(taskAttachments.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteTaskAttachment(id: string): Promise<void> {
    await db.delete(taskAttachments).where(eq(taskAttachments.id, id));
  }

  async getTaskByIdAndTenant(id: string, tenantId: string): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.tenantId, tenantId)));
    return task || undefined;
  }

  async createTaskWithTenant(insertTask: InsertTask, tenantId: string): Promise<Task> {
    const existingTasks = insertTask.sectionId 
      ? await db.select().from(tasks).where(and(
          eq(tasks.sectionId, insertTask.sectionId),
          sql`${tasks.parentTaskId} IS NULL`
        ))
      : insertTask.projectId 
        ? await db.select().from(tasks).where(and(
            eq(tasks.projectId, insertTask.projectId),
            sql`${tasks.parentTaskId} IS NULL`
          ))
        : [];
    const orderIndex = insertTask.orderIndex ?? existingTasks.length;
    const [task] = await db.insert(tasks).values({ ...insertTask, tenantId, orderIndex }).returning();
    return task;
  }

  async updateTaskWithTenant(id: string, tenantId: string, task: Partial<InsertTask>): Promise<Task | undefined> {
    const [updated] = await db.update(tasks)
      .set({ ...task, updatedAt: new Date() })
      .where(and(eq(tasks.id, id), eq(tasks.tenantId, tenantId)))
      .returning();
    return updated || undefined;
  }

  async deleteTaskWithTenant(id: string, tenantId: string): Promise<boolean> {
    const [existing] = await db.select().from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.tenantId, tenantId)));
    if (!existing) return false;
    
    await this.deleteTask(id);
    return true;
  }

  async getTaskAttachmentByIdAndTenant(id: string, tenantId: string): Promise<TaskAttachment | undefined> {
    const attachment = await this.getTaskAttachment(id);
    if (!attachment) return undefined;
    
    const task = await this.getTaskByIdAndTenant(attachment.taskId, tenantId);
    if (!task) return undefined;
    
    return attachment;
  }

  async getTaskAttachmentsByTaskAndTenant(taskId: string, tenantId: string): Promise<TaskAttachmentWithUser[]> {
    const task = await this.getTaskByIdAndTenant(taskId, tenantId);
    if (!task) return [];
    
    return this.getTaskAttachmentsByTask(taskId);
  }
}
