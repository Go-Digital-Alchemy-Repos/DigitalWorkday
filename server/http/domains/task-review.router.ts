import { Request, Response } from "express";
import { createApiRouter } from "../routerFactory";
import { AppError, handleRouteError, sendError } from "../../lib/errors";
import { getEffectiveTenantId } from "../../middleware/tenantContext";
import { getCurrentUserId } from "../../routes/helpers";
import { config } from "../../config";
import { db } from "../../db";
import { tasks, projects, projectMembers, users } from "@shared/schema";
import { eq, and, sql, desc, isNull } from "drizzle-orm";

const router = createApiRouter({ policy: "authTenant", skipEnvelope: true });

function checkFeatureFlag(res: Response, req: Request): boolean {
  if (!config.features.enableTaskReviewQueue) {
    sendError(res, AppError.forbidden("Task review queue feature is disabled"), req);
    return false;
  }
  return true;
}

router.post("/tasks/:taskId/review/request", async (req: Request, res: Response) => {
  try {
    if (!checkFeatureFlag(res, req)) return;

    const tenantId = getEffectiveTenantId(req);
    const userId = getCurrentUserId(req);
    const userRole = (req.user as any)?.role;
    const { taskId } = req.params;

    if (userRole === "client") {
      return sendError(res, AppError.forbidden("Client users cannot request PM reviews"), req);
    }

    const [task] = await db
      .select({ id: tasks.id, tenantId: tasks.tenantId, visibility: tasks.visibility, createdBy: tasks.createdBy })
      .from(tasks)
      .where(eq(tasks.id, taskId));

    if (!task) {
      return sendError(res, AppError.notFound("Task"), req);
    }

    if (tenantId && task.tenantId !== tenantId) {
      return sendError(res, AppError.notFound("Task"), req);
    }

    if (task.visibility === "private" && task.createdBy !== userId) {
      const accessResult = await db.execute(
        sql`SELECT 1 FROM task_access WHERE task_id = ${taskId} AND user_id = ${userId} LIMIT 1`
      );
      if (!accessResult.rows?.length) {
        return sendError(res, AppError.notFound("Task"), req);
      }
    }

    const now = new Date();
    const [updated] = await db
      .update(tasks)
      .set({
        needsPmReview: true,
        pmReviewRequestedAt: now,
        pmReviewRequestedBy: userId,
        pmReviewResolvedAt: null,
        pmReviewResolvedBy: null,
      })
      .where(eq(tasks.id, taskId))
      .returning({
        id: tasks.id,
        needsPmReview: tasks.needsPmReview,
        pmReviewRequestedAt: tasks.pmReviewRequestedAt,
      });

    res.json({ ok: true, task: updated });
  } catch (error) {
    return handleRouteError(res, error, "POST /api/tasks/:taskId/review/request", req);
  }
});

router.post("/tasks/:taskId/review/clear", async (req: Request, res: Response) => {
  try {
    if (!checkFeatureFlag(res, req)) return;

    const tenantId = getEffectiveTenantId(req);
    const userId = getCurrentUserId(req);
    const { taskId } = req.params;
    const { note, markComplete } = req.body || {};

    const [task] = await db
      .select({
        id: tasks.id,
        tenantId: tasks.tenantId,
        projectId: tasks.projectId,
        status: tasks.status,
      })
      .from(tasks)
      .where(eq(tasks.id, taskId));

    if (!task) {
      return sendError(res, AppError.notFound("Task"), req);
    }

    if (tenantId && task.tenantId !== tenantId) {
      return sendError(res, AppError.notFound("Task"), req);
    }

    const userRole = (req.user as any)?.role;
    const isAdmin = userRole === "admin" || userRole === "super_user";

    if (!isAdmin) {
      let isProjectOwner = false;
      if (task.projectId) {
        const [member] = await db
          .select({ role: projectMembers.role })
          .from(projectMembers)
          .where(
            and(
              eq(projectMembers.projectId, task.projectId),
              eq(projectMembers.userId, userId),
              eq(projectMembers.role, "owner")
            )
          );
        isProjectOwner = !!member;
      }

      if (!isProjectOwner) {
        return sendError(res, AppError.forbidden("Only admins or project owners can clear reviews"), req);
      }
    }

    const now = new Date();
    const updateData: Record<string, any> = {
      needsPmReview: false,
      pmReviewResolvedAt: now,
      pmReviewResolvedBy: userId,
    };

    if (note) {
      updateData.pmReviewNote = note;
    }

    if (markComplete === true) {
      updateData.status = "done";
      updateData.updatedAt = now;
    }

    const [updated] = await db
      .update(tasks)
      .set(updateData)
      .where(eq(tasks.id, taskId))
      .returning({
        id: tasks.id,
        needsPmReview: tasks.needsPmReview,
        status: tasks.status,
      });

    res.json({ ok: true, task: updated });
  } catch (error) {
    return handleRouteError(res, error, "POST /api/tasks/:taskId/review/clear", req);
  }
});

router.get("/dashboard/review-queue", async (req: Request, res: Response) => {
  try {
    if (!checkFeatureFlag(res, req)) return;

    const tenantId = getEffectiveTenantId(req);
    const userId = getCurrentUserId(req);
    const userRole = (req.user as any)?.role;
    const isAdmin = userRole === "admin" || userRole === "super_user";

    if (!tenantId) {
      return res.json({ items: [] });
    }

    let query = sql`
      SELECT
        t.id AS task_id,
        t.title,
        t.status,
        t.priority,
        t.due_date,
        t.project_id,
        t.visibility,
        t.created_by,
        p.name AS project_name,
        t.pm_review_requested_at,
        t.pm_review_requested_by,
        u.first_name AS requester_first_name,
        u.last_name AS requester_last_name
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN users u ON t.pm_review_requested_by = u.id
      WHERE t.tenant_id = ${tenantId}
        AND t.needs_pm_review = true
        AND t.archived_at IS NULL
    `;

    if (!isAdmin) {
      query = sql`${query}
        AND t.project_id IN (
          SELECT pm.project_id FROM project_members pm
          WHERE pm.user_id = ${userId} AND pm.role = 'owner'
        )
      `;
    }

    if (config.features.enablePrivateTasks) {
      query = sql`${query}
        AND (t.visibility != 'private' OR t.created_by = ${userId}
          OR EXISTS (
            SELECT 1 FROM task_access ta WHERE ta.task_id = t.id AND ta.user_id = ${userId}
          ))
      `;
    }

    query = sql`${query}
      ORDER BY t.pm_review_requested_at DESC
      LIMIT 20
    `;

    const result = await db.execute(query);
    const rows = result.rows || [];

    const items = rows.map((row: any) => ({
      taskId: row.task_id,
      title: row.title,
      status: row.status,
      priority: row.priority,
      dueDate: row.due_date,
      projectId: row.project_id,
      projectName: row.project_name,
      pmReviewRequestedAt: row.pm_review_requested_at,
      pmReviewRequestedBy: row.pm_review_requested_by,
      requesterFirstName: row.requester_first_name,
      requesterLastName: row.requester_last_name,
    }));

    res.json({ items });
  } catch (error) {
    return handleRouteError(res, error, "GET /api/dashboard/review-queue", req);
  }
});

export default router;
