import { Request, Response, NextFunction } from "express";
import { createApiRouter } from "../http/routerFactory";
import { emailOutboxService, EmailMessageType, EmailStatus } from "../services/emailOutbox";
import { z } from "zod";

const router = createApiRouter({ policy: "authOnly" });

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

const requireTenantAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } });
  }
  if (req.user.role !== "admin" && req.user.role !== "super_user") {
    return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admin access required" } });
  }
  next();
};

const requireSuperUser = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } });
  }
  if (req.user.role !== "super_user") {
    return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Super admin access required" } });
  }
  next();
};

const emailLogFiltersSchema = z.object({
  status: z.enum(["queued", "sent", "failed"]).optional(),
  messageType: z.enum(["invitation", "mention_notification", "forgot_password", "test_email", "other"]).optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

router.get("/tenant/email-logs", requireTenantAdmin, async (req: Request, res: Response) => {
  const requestId = generateRequestId();
  
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ 
        ok: false, 
        error: { code: "NO_TENANT", message: "No tenant context", requestId } 
      });
    }

    const parsed = emailLogFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ 
        ok: false, 
        error: { code: "INVALID_FILTERS", message: "Invalid filter parameters", requestId } 
      });
    }

    const filters = parsed.data;
    const result = await emailOutboxService.getEmailLogs({
      tenantId,
      status: filters.status as EmailStatus,
      messageType: filters.messageType as EmailMessageType,
      fromDate: filters.fromDate ? new Date(filters.fromDate) : undefined,
      toDate: filters.toDate ? new Date(filters.toDate) : undefined,
      limit: filters.limit,
      offset: filters.offset,
    });

    return res.json({
      ok: true,
      data: result.emails,
      total: result.total,
      requestId,
    });
  } catch (error: any) {
    console.error("[EmailOutbox] Error fetching tenant email logs:", error);
    return res.status(500).json({ 
      ok: false, 
      error: { code: "INTERNAL_ERROR", message: "Failed to fetch email logs", requestId } 
    });
  }
});

router.get("/tenant/email-logs/stats", requireTenantAdmin, async (req: Request, res: Response) => {
  const requestId = generateRequestId();
  
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ 
        ok: false, 
        error: { code: "NO_TENANT", message: "No tenant context", requestId } 
      });
    }

    const stats = await emailOutboxService.getEmailStats(tenantId);
    return res.json({ ok: true, data: stats, requestId });
  } catch (error: any) {
    console.error("[EmailOutbox] Error fetching tenant email stats:", error);
    return res.status(500).json({ 
      ok: false, 
      error: { code: "INTERNAL_ERROR", message: "Failed to fetch email stats", requestId } 
    });
  }
});

router.post("/tenant/email-logs/:emailId/resend", requireTenantAdmin, async (req: Request, res: Response) => {
  const requestId = generateRequestId();
  
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ 
        ok: false, 
        error: { code: "NO_TENANT", message: "No tenant context", requestId } 
      });
    }

    const { emailId } = req.params;

    const email = await emailOutboxService.getEmailById(emailId);
    if (!email) {
      return res.status(404).json({ 
        ok: false, 
        error: { code: "NOT_FOUND", message: "Email not found", requestId } 
      });
    }

    if (email.tenantId !== tenantId) {
      return res.status(403).json({ 
        ok: false, 
        error: { code: "FORBIDDEN", message: "Email belongs to different tenant", requestId } 
      });
    }

    const canResend = await emailOutboxService.canResend(email, tenantId);
    if (!canResend.allowed) {
      return res.status(400).json({ 
        ok: false, 
        error: { code: "RESEND_NOT_ALLOWED", message: canResend.reason, requestId } 
      });
    }

    const result = await emailOutboxService.resendEmail(emailId, tenantId, requestId);
    
    if (result.success) {
      return res.json({ 
        ok: true, 
        data: { message: result.message, newEmailId: result.newEmailId },
        requestId,
      });
    }

    return res.status(400).json({ 
      ok: false, 
      error: { code: "RESEND_FAILED", message: result.message, requestId } 
    });
  } catch (error: any) {
    console.error("[EmailOutbox] Error resending email:", error);
    return res.status(500).json({ 
      ok: false, 
      error: { code: "INTERNAL_ERROR", message: "Failed to resend email", requestId } 
    });
  }
});

router.get("/super/email-logs", requireSuperUser, async (req: Request, res: Response) => {
  const requestId = generateRequestId();
  
  try {
    const parsed = emailLogFiltersSchema.extend({
      tenantId: z.string().optional(),
    }).safeParse(req.query);
    
    if (!parsed.success) {
      return res.status(400).json({ 
        ok: false, 
        error: { code: "INVALID_FILTERS", message: "Invalid filter parameters", requestId } 
      });
    }

    const filters = parsed.data;
    const result = await emailOutboxService.getEmailLogs({
      tenantId: filters.tenantId,
      status: filters.status as EmailStatus,
      messageType: filters.messageType as EmailMessageType,
      fromDate: filters.fromDate ? new Date(filters.fromDate) : undefined,
      toDate: filters.toDate ? new Date(filters.toDate) : undefined,
      limit: filters.limit,
      offset: filters.offset,
    });

    return res.json({
      ok: true,
      data: result.emails,
      total: result.total,
      requestId,
    });
  } catch (error: any) {
    console.error("[EmailOutbox] Error fetching super email logs:", error);
    return res.status(500).json({ 
      ok: false, 
      error: { code: "INTERNAL_ERROR", message: "Failed to fetch email logs", requestId } 
    });
  }
});

router.get("/super/email-logs/stats", requireSuperUser, async (req: Request, res: Response) => {
  const requestId = generateRequestId();
  
  try {
    const tenantId = req.query.tenantId as string | undefined;
    const stats = await emailOutboxService.getEmailStats(tenantId);
    return res.json({ ok: true, data: stats, requestId });
  } catch (error: any) {
    console.error("[EmailOutbox] Error fetching super email stats:", error);
    return res.status(500).json({ 
      ok: false, 
      error: { code: "INTERNAL_ERROR", message: "Failed to fetch email stats", requestId } 
    });
  }
});

router.post("/super/email-logs/:emailId/resend", requireSuperUser, async (req: Request, res: Response) => {
  const requestId = generateRequestId();
  
  try {
    const { emailId } = req.params;

    const email = await emailOutboxService.getEmailById(emailId);
    if (!email) {
      return res.status(404).json({ 
        ok: false, 
        error: { code: "NOT_FOUND", message: "Email not found", requestId } 
      });
    }

    const canResend = await emailOutboxService.canResend(email, null);
    if (!canResend.allowed) {
      return res.status(400).json({ 
        ok: false, 
        error: { code: "RESEND_NOT_ALLOWED", message: canResend.reason, requestId } 
      });
    }

    const result = await emailOutboxService.resendEmail(emailId, null, requestId);
    
    if (result.success) {
      return res.json({ 
        ok: true, 
        data: { message: result.message, newEmailId: result.newEmailId },
        requestId,
      });
    }

    return res.status(400).json({ 
      ok: false, 
      error: { code: "RESEND_FAILED", message: result.message, requestId } 
    });
  } catch (error: any) {
    console.error("[EmailOutbox] Error resending email (super):", error);
    return res.status(500).json({ 
      ok: false, 
      error: { code: "INTERNAL_ERROR", message: "Failed to resend email", requestId } 
    });
  }
});

export default router;
