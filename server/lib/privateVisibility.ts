import { db } from "../db";
import { tasks, taskAccess, projectAccess, projects } from "@shared/schema";
import { eq, and, or, sql, inArray, ne, SQL } from "drizzle-orm";
import { config } from "../config";

export function taskVisibilityFilter(userId: string, tenantId: string): SQL {
  if (!config.features.enablePrivateTasks) {
    return sql`true`;
  }
  return or(
    ne(tasks.visibility, 'private'),
    eq(tasks.createdBy, userId),
    sql`EXISTS (SELECT 1 FROM task_access WHERE task_access.task_id = ${tasks.id} AND task_access.user_id = ${userId} AND task_access.tenant_id = ${tenantId})`,
    sql`EXISTS (SELECT 1 FROM project_access WHERE project_access.project_id = ${tasks.projectId} AND project_access.user_id = ${userId} AND project_access.tenant_id = ${tenantId})`
  )!;
}

export async function canViewTask(tenantId: string, taskId: string, userId: string): Promise<boolean> {
  if (!config.features.enablePrivateTasks) return true;
  const [task] = await db.select({ visibility: tasks.visibility, createdBy: tasks.createdBy, projectId: tasks.projectId })
    .from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) return false;
  if (task.visibility !== 'private') return true;
  if (task.createdBy === userId) return true;
  const [access] = await db.select({ id: taskAccess.id })
    .from(taskAccess)
    .where(and(eq(taskAccess.taskId, taskId), eq(taskAccess.userId, userId), eq(taskAccess.tenantId, tenantId)))
    .limit(1);
  if (access) return true;
  if (task.projectId) {
    const [projAccess] = await db.select({ id: projectAccess.id })
      .from(projectAccess)
      .where(and(eq(projectAccess.projectId, task.projectId), eq(projectAccess.userId, userId), eq(projectAccess.tenantId, tenantId)))
      .limit(1);
    if (projAccess) return true;
  }
  return false;
}

export function projectVisibilityFilter(userId: string, tenantId: string): SQL {
  if (!config.features.enablePrivateProjects) {
    return sql`true`;
  }
  return or(
    ne(projects.visibility, 'private'),
    eq(projects.createdBy, userId),
    sql`EXISTS (SELECT 1 FROM project_access WHERE project_access.project_id = ${projects.id} AND project_access.user_id = ${userId} AND project_access.tenant_id = ${tenantId})`
  )!;
}

export async function canViewProject(tenantId: string, projectId: string, userId: string): Promise<boolean> {
  if (!config.features.enablePrivateProjects) return true;
  const [project] = await db.select({ visibility: projects.visibility, createdBy: projects.createdBy })
    .from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return false;
  if (project.visibility !== 'private') return true;
  if (project.createdBy === userId) return true;
  const [access] = await db.select({ id: projectAccess.id })
    .from(projectAccess)
    .where(and(eq(projectAccess.projectId, projectId), eq(projectAccess.userId, userId), eq(projectAccess.tenantId, tenantId)))
    .limit(1);
  return !!access;
}

export async function canManageTaskAccess(tenantId: string, taskId: string, userId: string): Promise<boolean> {
  const [task] = await db.select({ createdBy: tasks.createdBy })
    .from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) return false;
  if (task.createdBy === userId) return true;
  const [access] = await db.select({ role: taskAccess.role })
    .from(taskAccess)
    .where(and(eq(taskAccess.taskId, taskId), eq(taskAccess.userId, userId), eq(taskAccess.tenantId, tenantId)))
    .limit(1);
  return access?.role === 'admin';
}

export async function canManageProjectAccess(tenantId: string, projectId: string, userId: string): Promise<boolean> {
  const [project] = await db.select({ createdBy: projects.createdBy })
    .from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return false;
  if (project.createdBy === userId) return true;
  const [access] = await db.select({ role: projectAccess.role })
    .from(projectAccess)
    .where(and(eq(projectAccess.projectId, projectId), eq(projectAccess.userId, userId), eq(projectAccess.tenantId, tenantId)))
    .limit(1);
  return access?.role === 'admin';
}

export async function getAccessiblePrivateTaskIds(userId: string, tenantId: string): Promise<string[]> {
  if (!config.features.enablePrivateTasks) return [];
  const createdTasks = await db.select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.tenantId, tenantId), eq(tasks.visibility, 'private'), eq(tasks.createdBy, userId)));
  const accessTasks = await db.select({ taskId: taskAccess.taskId })
    .from(taskAccess)
    .where(and(eq(taskAccess.tenantId, tenantId), eq(taskAccess.userId, userId)));
  const projAccessRows = await db.select({ projectId: projectAccess.projectId })
    .from(projectAccess)
    .where(and(eq(projectAccess.tenantId, tenantId), eq(projectAccess.userId, userId)));
  let projectTaskIds: string[] = [];
  if (projAccessRows.length > 0) {
    const pIds = projAccessRows.map(r => r.projectId);
    const projectTasks = await db.select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.visibility, 'private'), inArray(tasks.projectId, pIds)));
    projectTaskIds = projectTasks.map(t => t.id);
  }
  return Array.from(new Set([
    ...createdTasks.map(t => t.id),
    ...accessTasks.map(t => t.taskId),
    ...projectTaskIds,
  ]));
}

export async function getAccessiblePrivateProjectIds(userId: string, tenantId: string): Promise<string[]> {
  if (!config.features.enablePrivateProjects) return [];
  const createdProjects = await db.select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.tenantId, tenantId), eq(projects.visibility, 'private'), eq(projects.createdBy, userId)));
  const accessProjects = await db.select({ projectId: projectAccess.projectId })
    .from(projectAccess)
    .where(and(eq(projectAccess.tenantId, tenantId), eq(projectAccess.userId, userId)));
  return Array.from(new Set([
    ...createdProjects.map(p => p.id),
    ...accessProjects.map(p => p.projectId),
  ]));
}
