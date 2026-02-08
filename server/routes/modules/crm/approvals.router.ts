import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../../../db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { AppError, handleRouteError, sendError } from "../../../lib/errors";
import { getEffectiveTenantId } from "../../../middleware/tenantContext";
import { requireAuth } from "../../../auth";
import {
  approvalRequests,
  clients,
  users,
  updateApprovalStatusSchema,
  UserRole,
} from "@shared/schema";
import { getCurrentUserId } from "../../helpers";
import { isAdminOrSuper, verifyClientTenancy } from "./crm.helpers";

const router = Router();

const approvalCreateSchema = z.object({
  title: z.string().min(1).max(200),
  instructions: z.string().optional(),
  projectId: z.string().uuid().optional(),
  taskId: z.string().uuid().optional(),
  dueAt: z.string().optional(),
});

router.post("/crm/clients/:clientId/approvals", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    if (!isAdminOrSuper(req)) {
      return sendError(res, AppError.forbidden("Admin access required"), req);
    }

    const { clientId } = req.params;
    const client = await verifyClientTenancy(clientId, tenantId);
    if (!client) return sendError(res, AppError.notFound("Client"), req);

    const body = approvalCreateSchema.parse(req.body);
    const userId = getCurrentUserId(req);

    const [approval] = await db.insert(approvalRequests).values({
      tenantId,
      clientId,
      projectId: body.projectId || null,
      taskId: body.taskId || null,
      requestedByUserId: userId,
      title: body.title,
      instructions: body.instructions || null,
      dueAt: body.dueAt ? new Date(body.dueAt) : null,
      status: "pending",
    }).returning();

    res.status(201).json(approval);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/crm/clients/:clientId/approvals", req);
  }
});

router.get("/crm/clients/:clientId/approvals", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { clientId } = req.params;

    const user = req.user!;
    if (user.role === UserRole.CLIENT) {
      const { getClientUserAccessibleClients } = await import("../../../middleware/clientAccess");
      const accessibleClients = await getClientUserAccessibleClients(user.id);
      if (!accessibleClients.includes(clientId)) {
        return sendError(res, AppError.forbidden("Access denied"), req);
      }
    } else {
      const client = await verifyClientTenancy(clientId, tenantId);
      if (!client) return sendError(res, AppError.notFound("Client"), req);
    }

    const { status } = req.query;

    let query = db.select({
      approval: approvalRequests,
      requesterName: users.name,
    })
      .from(approvalRequests)
      .leftJoin(users, eq(approvalRequests.requestedByUserId, users.id))
      .where(
        and(
          eq(approvalRequests.tenantId, tenantId),
          eq(approvalRequests.clientId, clientId),
          ...(status ? [eq(approvalRequests.status, status as string)] : [])
        )
      )
      .orderBy(desc(approvalRequests.createdAt))
      .$dynamic();

    const results = await query;

    const approvals = results.map((r) => ({
      ...r.approval,
      requesterName: r.requesterName || "Unknown",
    }));

    res.json(approvals);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/crm/clients/:clientId/approvals", req);
  }
});

router.patch("/crm/approvals/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { id } = req.params;

    const [existing] = await db.select()
      .from(approvalRequests)
      .where(and(eq(approvalRequests.id, id), eq(approvalRequests.tenantId, tenantId)))
      .limit(1);

    if (!existing) return sendError(res, AppError.notFound("Approval request"), req);

    const user = req.user!;

    if (user.role === UserRole.CLIENT) {
      const { getClientUserAccessibleClients } = await import("../../../middleware/clientAccess");
      const accessibleClients = await getClientUserAccessibleClients(user.id);
      if (!accessibleClients.includes(existing.clientId)) {
        return sendError(res, AppError.forbidden("Access denied"), req);
      }
    } else {
      return sendError(res, AppError.forbidden("Only clients can respond to approval requests"), req);
    }

    if (existing.status !== "pending") {
      return sendError(res, AppError.badRequest("This approval request has already been responded to"), req);
    }

    const body = updateApprovalStatusSchema.parse(req.body);

    const respondedByName = user.name || user.email || "Client";

    const [updated] = await db.update(approvalRequests)
      .set({
        status: body.status,
        responseComment: body.responseComment || null,
        respondedByName,
        respondedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(approvalRequests.id, id), eq(approvalRequests.tenantId, tenantId)))
      .returning();

    try {
      const { notifyApprovalResponse } = await import("../../../features/notifications/notification.service");
      await notifyApprovalResponse(
        existing.requestedByUserId,
        updated.id,
        updated.title,
        body.status,
        respondedByName,
        { tenantId, excludeUserId: user.id }
      );
    } catch (notifErr) {
      console.error("[approvals] Failed to send notification:", notifErr);
    }

    res.json(updated);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /api/crm/approvals/:id", req);
  }
});

router.get("/crm/portal/approvals", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const user = req.user!;
    if (user.role !== UserRole.CLIENT) {
      return sendError(res, AppError.forbidden("Portal access only"), req);
    }

    const { getClientUserAccessibleClients } = await import("../../../middleware/clientAccess");
    const clientIds = await getClientUserAccessibleClients(user.id);

    if (clientIds.length === 0) {
      return res.json([]);
    }

    const results = await db.select({
      approval: approvalRequests,
      requesterName: users.name,
      clientName: clients.companyName,
    })
      .from(approvalRequests)
      .leftJoin(users, eq(approvalRequests.requestedByUserId, users.id))
      .leftJoin(clients, eq(approvalRequests.clientId, clients.id))
      .where(
        and(
          eq(approvalRequests.tenantId, tenantId),
          inArray(approvalRequests.clientId, clientIds)
        )
      )
      .orderBy(desc(approvalRequests.createdAt));

    const approvals = results.map((r) => ({
      ...r.approval,
      requesterName: r.requesterName || "Unknown",
      clientName: r.clientName || "Unknown",
    }));

    res.json(approvals);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/crm/portal/approvals", req);
  }
});

export default router;
