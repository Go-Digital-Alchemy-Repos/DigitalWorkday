import { Router } from "express";
import { z } from "zod";
import { storage } from "../../storage";
import { getEffectiveTenantId } from "../../middleware/tenantContext";
import type { Request } from "express";
import { handleRouteError, AppError } from "../../lib/errors";

function getCurrentUserId(req: Request): string {
  return req.user?.id || "demo-user-id";
}

const router = Router();

router.get("/notifications", async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const tenantId = getEffectiveTenantId(req);
    const { unreadOnly, limit, cursor, typeFilter } = req.query;

    if (cursor) {
      const result = await storage.getNotificationsByUserPaginated(userId, tenantId, {
        unreadOnly: unreadOnly === "true",
        limit: limit ? parseInt(limit as string) : 30,
        cursor: cursor as string,
        typeFilter: typeFilter as string | undefined,
      });
      return res.json(result);
    }

    const result = await storage.getNotificationsByUserPaginated(userId, tenantId, {
      unreadOnly: unreadOnly === "true",
      limit: limit ? parseInt(limit as string) : 30,
      typeFilter: typeFilter as string | undefined,
    });
    res.json(result);
  } catch (error) {
    return handleRouteError(res, error, "GET /notifications", req);
  }
});

router.get("/notifications/unread-count", async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const tenantId = getEffectiveTenantId(req);
    const count = await storage.getUnreadNotificationCount(userId, tenantId);
    res.json({ count });
  } catch (error) {
    return handleRouteError(res, error, "GET /notifications/unread-count", req);
  }
});

router.patch("/notifications/:id/read", async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const tenantId = getEffectiveTenantId(req);
    const { id } = req.params;
    
    const notification = await storage.markNotificationRead(id, userId, tenantId);
    if (!notification) {
      throw AppError.notFound("Notification");
    }
    
    res.json(notification);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /notifications/:id/read", req);
  }
});

router.post("/notifications/mark-all-read", async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const tenantId = getEffectiveTenantId(req);
    await storage.markAllNotificationsRead(userId, tenantId);
    res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, "POST /notifications/mark-all-read", req);
  }
});

router.patch("/notifications/:id/dismiss", async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const tenantId = getEffectiveTenantId(req);
    const { id } = req.params;

    const notification = await storage.dismissNotification(id, userId, tenantId);
    if (!notification) {
      throw AppError.notFound("Notification");
    }

    res.json(notification);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /notifications/:id/dismiss", req);
  }
});

router.post("/notifications/dismiss-all", async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const tenantId = getEffectiveTenantId(req);
    await storage.dismissAllNotifications(userId, tenantId);
    res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, "POST /notifications/dismiss-all", req);
  }
});

router.delete("/notifications/:id", async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const tenantId = getEffectiveTenantId(req);
    const { id } = req.params;
    
    await storage.deleteNotification(id, userId, tenantId);
    res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, "DELETE /notifications/:id", req);
  }
});

function getDefaultPreferences(userId: string, tenantId: string | null) {
  return {
    id: "default",
    tenantId,
    userId,
    taskDeadline: true,
    taskAssigned: true,
    taskCompleted: true,
    commentAdded: true,
    commentMention: true,
    projectUpdate: true,
    projectMemberAdded: true,
    taskStatusChanged: true,
    chatMessage: true,
    clientMessage: true,
    supportTicket: true,
    workOrder: true,
    emailEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

router.get("/notifications/preferences", async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const tenantId = getEffectiveTenantId(req);
    
    let prefs = await storage.getNotificationPreferences(userId);
    
    if (!prefs) {
      try {
        prefs = await storage.upsertNotificationPreferences(userId, {
          tenantId: tenantId || undefined,
        });
      } catch (error) {
        console.warn("[notifications] Could not create preferences, using defaults:", error);
        prefs = getDefaultPreferences(userId, tenantId) as any;
      }
    }
    
    res.json(prefs);
  } catch (error) {
    const userId = getCurrentUserId(req);
    const tenantId = getEffectiveTenantId(req);
    res.json(getDefaultPreferences(userId, tenantId));
  }
});

const updatePreferencesSchema = z.object({
  taskDeadline: z.boolean().optional(),
  taskAssigned: z.boolean().optional(),
  taskCompleted: z.boolean().optional(),
  commentAdded: z.boolean().optional(),
  commentMention: z.boolean().optional(),
  projectUpdate: z.boolean().optional(),
  projectMemberAdded: z.boolean().optional(),
  taskStatusChanged: z.boolean().optional(),
  chatMessage: z.boolean().optional(),
  clientMessage: z.boolean().optional(),
  supportTicket: z.boolean().optional(),
  workOrder: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
});

router.patch("/notifications/preferences", async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const tenantId = getEffectiveTenantId(req);
    
    const parsed = updatePreferencesSchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.badRequest("Invalid preferences", parsed.error.errors);
    }
    
    const prefs = await storage.upsertNotificationPreferences(userId, {
      ...parsed.data,
      tenantId: tenantId || undefined,
    });
    
    res.json(prefs);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /notifications/preferences", req);
  }
});

export default router;
