import { Request, Response } from "express";
import { z } from "zod";
import { createApiRouter } from "../routerFactory";
import { AppError, handleRouteError, sendError } from "../../lib/errors";
import { getEffectiveTenantId } from "../../middleware/tenantContext";
import { getCurrentUserId } from "../../routes/helpers";
import { db } from "../../db";
import { taskAccess, projectAccess, tasks, projects, users } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import {
  canManageTaskAccess,
  canManageProjectAccess,
  canViewTask,
  canViewProject,
} from "../../lib/privateVisibility";

const router = createApiRouter({ policy: "authTenant", skipEnvelope: true });

const inviteSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["viewer", "editor", "admin"]).default("editor"),
});

const updateRoleSchema = z.object({
  role: z.enum(["viewer", "editor", "admin"]),
});

router.get("/tasks/:taskId/access", async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const userId = getCurrentUserId(req);
    const { taskId } = req.params;

    if (!tenantId) {
      return sendError(res, AppError.internal("Tenant context required"), req);
    }

    if (!(await canViewTask(tenantId, taskId, userId))) {
      return sendError(res, AppError.notFound("Task"), req);
    }

    const accessList = await db
      .select({
        id: taskAccess.id,
        userId: taskAccess.userId,
        role: taskAccess.role,
        invitedByUserId: taskAccess.invitedByUserId,
        createdAt: taskAccess.createdAt,
        userName: users.name,
        userEmail: users.email,
        userAvatarUrl: users.avatarUrl,
      })
      .from(taskAccess)
      .innerJoin(users, eq(users.id, taskAccess.userId))
      .where(and(eq(taskAccess.taskId, taskId), eq(taskAccess.tenantId, tenantId)));

    res.json(accessList);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/tasks/:taskId/access", req);
  }
});

router.post("/tasks/:taskId/access", async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const currentUserId = getCurrentUserId(req);
    const { taskId } = req.params;

    if (!tenantId) {
      return sendError(res, AppError.internal("Tenant context required"), req);
    }

    const body = inviteSchema.safeParse(req.body);
    if (!body.success) {
      return sendError(res, AppError.badRequest("Validation failed", body.error.errors), req);
    }

    if (!(await canManageTaskAccess(tenantId, taskId, currentUserId))) {
      return sendError(res, AppError.forbidden("Only the creator or an admin can manage access"), req);
    }

    const [invitedUser] = await db.select({ id: users.id, tenantId: users.tenantId })
      .from(users).where(eq(users.id, body.data.userId)).limit(1);
    if (!invitedUser || invitedUser.tenantId !== tenantId) {
      return sendError(res, AppError.badRequest("User not found or does not belong to this tenant"), req);
    }

    const [existing] = await db.select({ id: taskAccess.id })
      .from(taskAccess)
      .where(and(
        eq(taskAccess.taskId, taskId),
        eq(taskAccess.userId, body.data.userId),
        eq(taskAccess.tenantId, tenantId),
      ))
      .limit(1);

    if (existing) {
      return sendError(res, AppError.conflict("User already has access to this task"), req);
    }

    const [created] = await db.insert(taskAccess).values({
      tenantId,
      taskId,
      userId: body.data.userId,
      role: body.data.role,
      invitedByUserId: currentUserId,
    }).returning();

    res.status(201).json(created);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/tasks/:taskId/access", req);
  }
});

router.patch("/tasks/:taskId/access/:userId", async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const currentUserId = getCurrentUserId(req);
    const { taskId, userId: targetUserId } = req.params;

    if (!tenantId) {
      return sendError(res, AppError.internal("Tenant context required"), req);
    }

    const body = updateRoleSchema.safeParse(req.body);
    if (!body.success) {
      return sendError(res, AppError.badRequest("Validation failed", body.error.errors), req);
    }

    if (!(await canManageTaskAccess(tenantId, taskId, currentUserId))) {
      return sendError(res, AppError.forbidden("Only the creator or an admin can manage access"), req);
    }

    const [updated] = await db.update(taskAccess)
      .set({ role: body.data.role })
      .where(and(
        eq(taskAccess.taskId, taskId),
        eq(taskAccess.userId, targetUserId),
        eq(taskAccess.tenantId, tenantId),
      ))
      .returning();

    if (!updated) {
      return sendError(res, AppError.notFound("Access entry"), req);
    }

    res.json(updated);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /api/tasks/:taskId/access/:userId", req);
  }
});

router.delete("/tasks/:taskId/access/:userId", async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const currentUserId = getCurrentUserId(req);
    const { taskId, userId: targetUserId } = req.params;

    if (!tenantId) {
      return sendError(res, AppError.internal("Tenant context required"), req);
    }

    if (!(await canManageTaskAccess(tenantId, taskId, currentUserId))) {
      return sendError(res, AppError.forbidden("Only the creator or an admin can manage access"), req);
    }

    const [deleted] = await db.delete(taskAccess)
      .where(and(
        eq(taskAccess.taskId, taskId),
        eq(taskAccess.userId, targetUserId),
        eq(taskAccess.tenantId, tenantId),
      ))
      .returning();

    if (!deleted) {
      return sendError(res, AppError.notFound("Access entry"), req);
    }

    res.status(204).send();
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/tasks/:taskId/access/:userId", req);
  }
});

router.get("/projects/:projectId/access", async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const userId = getCurrentUserId(req);
    const { projectId } = req.params;

    if (!tenantId) {
      return sendError(res, AppError.internal("Tenant context required"), req);
    }

    if (!(await canViewProject(tenantId, projectId, userId))) {
      return sendError(res, AppError.notFound("Project"), req);
    }

    const accessList = await db
      .select({
        id: projectAccess.id,
        userId: projectAccess.userId,
        role: projectAccess.role,
        invitedByUserId: projectAccess.invitedByUserId,
        createdAt: projectAccess.createdAt,
        userName: users.name,
        userEmail: users.email,
        userAvatarUrl: users.avatarUrl,
      })
      .from(projectAccess)
      .innerJoin(users, eq(users.id, projectAccess.userId))
      .where(and(eq(projectAccess.projectId, projectId), eq(projectAccess.tenantId, tenantId)));

    res.json(accessList);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/projects/:projectId/access", req);
  }
});

router.post("/projects/:projectId/access", async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const currentUserId = getCurrentUserId(req);
    const { projectId } = req.params;

    if (!tenantId) {
      return sendError(res, AppError.internal("Tenant context required"), req);
    }

    const body = inviteSchema.safeParse(req.body);
    if (!body.success) {
      return sendError(res, AppError.badRequest("Validation failed", body.error.errors), req);
    }

    if (!(await canManageProjectAccess(tenantId, projectId, currentUserId))) {
      return sendError(res, AppError.forbidden("Only the creator or an admin can manage access"), req);
    }

    const [invitedUser] = await db.select({ id: users.id, tenantId: users.tenantId })
      .from(users).where(eq(users.id, body.data.userId)).limit(1);
    if (!invitedUser || invitedUser.tenantId !== tenantId) {
      return sendError(res, AppError.badRequest("User not found or does not belong to this tenant"), req);
    }

    const [existing] = await db.select({ id: projectAccess.id })
      .from(projectAccess)
      .where(and(
        eq(projectAccess.projectId, projectId),
        eq(projectAccess.userId, body.data.userId),
        eq(projectAccess.tenantId, tenantId),
      ))
      .limit(1);

    if (existing) {
      return sendError(res, AppError.conflict("User already has access to this project"), req);
    }

    const [created] = await db.insert(projectAccess).values({
      tenantId,
      projectId,
      userId: body.data.userId,
      role: body.data.role,
      invitedByUserId: currentUserId,
    }).returning();

    res.status(201).json(created);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/projects/:projectId/access", req);
  }
});

router.patch("/projects/:projectId/access/:userId", async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const currentUserId = getCurrentUserId(req);
    const { projectId, userId: targetUserId } = req.params;

    if (!tenantId) {
      return sendError(res, AppError.internal("Tenant context required"), req);
    }

    const body = updateRoleSchema.safeParse(req.body);
    if (!body.success) {
      return sendError(res, AppError.badRequest("Validation failed", body.error.errors), req);
    }

    if (!(await canManageProjectAccess(tenantId, projectId, currentUserId))) {
      return sendError(res, AppError.forbidden("Only the creator or an admin can manage access"), req);
    }

    const [updated] = await db.update(projectAccess)
      .set({ role: body.data.role })
      .where(and(
        eq(projectAccess.projectId, projectId),
        eq(projectAccess.userId, targetUserId),
        eq(projectAccess.tenantId, tenantId),
      ))
      .returning();

    if (!updated) {
      return sendError(res, AppError.notFound("Access entry"), req);
    }

    res.json(updated);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /api/projects/:projectId/access/:userId", req);
  }
});

router.delete("/projects/:projectId/access/:userId", async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const currentUserId = getCurrentUserId(req);
    const { projectId, userId: targetUserId } = req.params;

    if (!tenantId) {
      return sendError(res, AppError.internal("Tenant context required"), req);
    }

    if (!(await canManageProjectAccess(tenantId, projectId, currentUserId))) {
      return sendError(res, AppError.forbidden("Only the creator or an admin can manage access"), req);
    }

    const [deleted] = await db.delete(projectAccess)
      .where(and(
        eq(projectAccess.projectId, projectId),
        eq(projectAccess.userId, targetUserId),
        eq(projectAccess.tenantId, tenantId),
      ))
      .returning();

    if (!deleted) {
      return sendError(res, AppError.notFound("Access entry"), req);
    }

    res.status(204).send();
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/projects/:projectId/access/:userId", req);
  }
});

export default router;
