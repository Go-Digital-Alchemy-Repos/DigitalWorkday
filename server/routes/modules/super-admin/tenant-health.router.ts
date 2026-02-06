import { Router } from 'express';
import { requireSuperUser } from '../../../middleware/tenantContext';
import { storage } from '../../../storage';
import { db } from '../../../db';
import { users, workspaces, tenantAgreements } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { tenantIntegrationService } from '../../../services/tenantIntegrations';

export const tenantHealthRouter = Router();

tenantHealthRouter.get("/tenants/:tenantId/health", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const settings = await storage.getTenantSettings(tenantId);

    const userCounts = await db.select({
      role: users.role,
      count: sql<number>`count(*)::int`,
    })
      .from(users)
      .where(eq(users.tenantId, tenantId))
      .groupBy(users.role);

    const userCountMap: Record<string, number> = {};
    for (const uc of userCounts) {
      userCountMap[uc.role] = uc.count;
    }
    const totalUsers = Object.values(userCountMap).reduce((a, b) => a + b, 0);

    const primaryWorkspace = await db.select()
      .from(workspaces)
      .where(and(eq(workspaces.tenantId, tenantId), eq(workspaces.isPrimary, true)))
      .limit(1);

    let mailgunConfigured = false;
    try {
      const mailgunIntegration = await tenantIntegrationService.getIntegration(tenantId, "mailgun");
      mailgunConfigured = mailgunIntegration?.status === "configured";
    } catch {
      mailgunConfigured = false;
    }

    const activeAgreement = await db.select()
      .from(tenantAgreements)
      .where(and(eq(tenantAgreements.tenantId, tenantId), eq(tenantAgreements.status, "active")))
      .limit(1);

    const warnings: string[] = [];
    if (!primaryWorkspace.length) {
      warnings.push("No primary workspace configured");
    }
    if (totalUsers === 0) {
      warnings.push("No users in tenant");
    }
    if (!settings?.displayName) {
      warnings.push("Display name not configured");
    }

    res.json({
      tenantId,
      status: tenant.status,
      primaryWorkspaceExists: primaryWorkspace.length > 0,
      primaryWorkspace: primaryWorkspace[0] || null,
      users: {
        total: totalUsers,
        byRole: userCountMap,
      },
      agreement: {
        hasActiveAgreement: activeAgreement.length > 0,
        version: activeAgreement[0]?.version || null,
        title: activeAgreement[0]?.title || null,
      },
      integrations: {
        mailgunConfigured,
      },
      branding: {
        displayName: settings?.displayName || null,
        whiteLabelEnabled: settings?.whiteLabelEnabled || false,
        logoConfigured: !!settings?.logoUrl,
      },
      warnings,
      canEnableStrict: warnings.length === 0,
    });
  } catch (error) {
    console.error("Error fetching tenant health:", error);
    res.status(500).json({ error: "Failed to fetch tenant health" });
  }
});
