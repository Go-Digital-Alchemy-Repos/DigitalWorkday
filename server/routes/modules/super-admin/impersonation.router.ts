import { Router } from 'express';
import { requireSuperUser } from '../../../middleware/tenantContext';
import { db } from '../../../db';
import { tenants, tenantAuditEvents } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { recordTenantAuditEvent } from '../../superAdmin';

export const impersonationRouter = Router();

impersonationRouter.post("/impersonation/exit", requireSuperUser, async (req, res) => {
  try {
    const session = req.session as any;
    
    if (!session.isImpersonatingUser) {
      return res.status(400).json({ error: "Not currently impersonating any user" });
    }
    
    const impersonatedEmail = session.impersonatedUserEmail;
    const tenantId = session.impersonatedTenantId;
    const superUser = req.user!;
    
    if (tenantId) {
      await recordTenantAuditEvent(
        tenantId,
        "super_exit_impersonation",
        `Super admin exited impersonation of user ${impersonatedEmail}`,
        superUser?.id,
        { 
          impersonatedEmail,
          duration: session.impersonationStartedAt 
            ? `${Math.round((Date.now() - new Date(session.impersonationStartedAt).getTime()) / 1000)}s`
            : "unknown"
        }
      );
    }
    
    delete session.isImpersonatingUser;
    delete session.impersonatedUserId;
    delete session.impersonatedUserEmail;
    delete session.impersonatedUserRole;
    delete session.impersonatedTenantId;
    delete session.impersonatedTenantName;
    delete session.originalSuperUserId;
    delete session.originalSuperUserEmail;
    delete session.impersonationStartedAt;
    
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    console.log(`[impersonate] Super admin exited impersonation of ${impersonatedEmail}`);
    
    res.json({
      ok: true,
      message: "Impersonation ended. You are now viewing as super admin again.",
    });
  } catch (error) {
    console.error("Error exiting impersonation:", error);
    res.status(500).json({ error: "Failed to exit impersonation" });
  }
});

impersonationRouter.get("/impersonation/status", requireSuperUser, async (req, res) => {
  const session = req.session as any;
  
  if (!session.isImpersonatingUser) {
    return res.json({
      isImpersonating: false,
    });
  }
  
  res.json({
    isImpersonating: true,
    impersonatedUser: {
      id: session.impersonatedUserId,
      email: session.impersonatedUserEmail,
      role: session.impersonatedUserRole,
    },
    tenant: {
      id: session.impersonatedTenantId,
      name: session.impersonatedTenantName,
    },
    startedAt: session.impersonationStartedAt,
    originalSuperUser: {
      id: session.originalSuperUserId,
      email: session.originalSuperUserEmail,
    },
  });
});

const startImpersonationSchema = z.object({
  tenantId: z.string().uuid(),
});

impersonationRouter.post("/impersonate/start", requireSuperUser, async (req, res) => {
  try {
    const parseResult = startImpersonationSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ 
        error: "Invalid request data", 
        details: parseResult.error.errors 
      });
    }
    
    const { tenantId } = parseResult.data;
    const user = req.user!;
    
    const [tenant] = await db.select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    await db.insert(tenantAuditEvents).values({
      tenantId,
      userId: user.id,
      eventType: "super_user_action",
      message: `Super Admin ${user.email} started impersonating tenant`,
      eventDetails: {
        action: "impersonation_started",
        superUserId: user.id,
        superUserEmail: user.email,
        tenantName: tenant.name,
        timestamp: new Date().toISOString(),
      },
    });
    
    console.log(`[impersonate] Super user ${user.email} started impersonating tenant ${tenant.name} (${tenantId})`);
    
    res.json({ 
      success: true, 
      tenant: {
        id: tenant.id,
        name: tenant.name,
        status: tenant.status,
      }
    });
  } catch (error) {
    console.error("[impersonate/start] Failed to start impersonation:", error);
    res.status(500).json({ error: "Failed to start impersonation" });
  }
});

impersonationRouter.post("/impersonate/stop", requireSuperUser, async (req, res) => {
  try {
    const user = req.user!;
    const tenantId = req.headers["x-tenant-id"] as string | undefined;
    
    if (tenantId) {
      const [tenant] = await db.select()
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      
      if (tenant) {
        await db.insert(tenantAuditEvents).values({
          tenantId,
          userId: user.id,
          eventType: "super_user_action",
          message: `Super Admin ${user.email} stopped impersonating tenant`,
          eventDetails: {
            action: "impersonation_stopped",
            superUserId: user.id,
            superUserEmail: user.email,
            tenantName: tenant.name,
            timestamp: new Date().toISOString(),
          },
        });
        
        console.log(`[impersonate] Super user ${user.email} stopped impersonating tenant ${tenant.name} (${tenantId})`);
      }
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error("[impersonate/stop] Failed to stop impersonation:", error);
    res.status(500).json({ error: "Failed to stop impersonation" });
  }
});
