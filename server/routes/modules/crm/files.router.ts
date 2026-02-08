import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../../../db";
import { eq, and, desc } from "drizzle-orm";
import { AppError, handleRouteError, sendError, validateBody } from "../../../lib/errors";
import { getEffectiveTenantId } from "../../../middleware/tenantContext";
import { requireAuth } from "../../../auth";
import {
  clientFiles,
  users,
  updateClientFileSchema,
  UserRole,
  ClientFileVisibility,
} from "@shared/schema";
import { getCurrentUserId } from "../../helpers";
import { verifyClientTenancy } from "./crm.helpers";

const router = Router();

router.get("/crm/clients/:clientId/files", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { clientId } = req.params;
    const client = await verifyClientTenancy(clientId, tenantId);
    if (!client) return sendError(res, AppError.notFound("Client"), req);

    const isClient = req.user?.role === UserRole.CLIENT;
    const visibilityConditions = isClient
      ? and(eq(clientFiles.clientId, clientId), eq(clientFiles.tenantId, tenantId), eq(clientFiles.visibility, ClientFileVisibility.CLIENT))
      : and(eq(clientFiles.clientId, clientId), eq(clientFiles.tenantId, tenantId));

    const typeFilter = req.query.type as string | undefined;
    const visibilityFilter = req.query.visibility as string | undefined;

    let conditions = visibilityConditions;
    if (typeFilter) {
      conditions = and(conditions, eq(clientFiles.mimeType, typeFilter))!;
    }
    if (visibilityFilter && !isClient) {
      conditions = and(conditions, eq(clientFiles.visibility, visibilityFilter))!;
    }

    const files = await db
      .select({
        id: clientFiles.id,
        filename: clientFiles.filename,
        mimeType: clientFiles.mimeType,
        size: clientFiles.size,
        url: clientFiles.url,
        visibility: clientFiles.visibility,
        linkedEntityType: clientFiles.linkedEntityType,
        linkedEntityId: clientFiles.linkedEntityId,
        uploadedByUserId: clientFiles.uploadedByUserId,
        uploaderName: users.name,
        createdAt: clientFiles.createdAt,
      })
      .from(clientFiles)
      .leftJoin(users, eq(users.id, clientFiles.uploadedByUserId))
      .where(conditions)
      .orderBy(desc(clientFiles.createdAt));

    res.json(files);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/crm/clients/:clientId/files", req);
  }
});

router.post("/crm/clients/:clientId/files", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    if (req.user?.role === UserRole.CLIENT) {
      return sendError(res, AppError.forbidden("Client users cannot upload files"), req);
    }

    const { clientId } = req.params;
    const client = await verifyClientTenancy(clientId, tenantId);
    if (!client) return sendError(res, AppError.notFound("Client"), req);

    const userId = getCurrentUserId(req);

    const fileSchema = z.object({
      filename: z.string().min(1),
      mimeType: z.string().optional(),
      size: z.number().optional(),
      storageKey: z.string().min(1),
      url: z.string().optional(),
      visibility: z.enum(["internal", "client"]).optional(),
      linkedEntityType: z.string().optional(),
      linkedEntityId: z.string().optional(),
    });

    const data = validateBody(req.body, fileSchema, res);
    if (!data) return;

    const [file] = await db.insert(clientFiles).values({
      tenantId,
      clientId,
      uploadedByUserId: userId,
      filename: data.filename,
      mimeType: data.mimeType ?? null,
      size: data.size ?? null,
      storageKey: data.storageKey,
      url: data.url ?? null,
      visibility: data.visibility ?? ClientFileVisibility.INTERNAL,
      linkedEntityType: data.linkedEntityType ?? null,
      linkedEntityId: data.linkedEntityId ?? null,
    }).returning();

    res.status(201).json(file);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/crm/clients/:clientId/files", req);
  }
});

router.patch("/crm/files/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    if (req.user?.role === UserRole.CLIENT) {
      return sendError(res, AppError.forbidden("Client users cannot modify files"), req);
    }

    const { id } = req.params;

    const [existing] = await db.select()
      .from(clientFiles)
      .where(and(eq(clientFiles.id, id), eq(clientFiles.tenantId, tenantId)))
      .limit(1);
    if (!existing) return sendError(res, AppError.notFound("File"), req);

    const data = validateBody(req.body, updateClientFileSchema, res);
    if (!data) return;

    const [updated] = await db.update(clientFiles)
      .set(data)
      .where(and(eq(clientFiles.id, id), eq(clientFiles.tenantId, tenantId)))
      .returning();

    res.json(updated);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /api/crm/files/:id", req);
  }
});

router.delete("/crm/files/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    if (req.user?.role === UserRole.CLIENT) {
      return sendError(res, AppError.forbidden("Client users cannot delete files"), req);
    }

    const { id } = req.params;

    const [existing] = await db.select()
      .from(clientFiles)
      .where(and(eq(clientFiles.id, id), eq(clientFiles.tenantId, tenantId)))
      .limit(1);
    if (!existing) return sendError(res, AppError.notFound("File"), req);

    await db.delete(clientFiles).where(and(eq(clientFiles.id, id), eq(clientFiles.tenantId, tenantId)));

    res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/crm/files/:id", req);
  }
});

export default router;
