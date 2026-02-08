import { Router } from 'express';
import { requireSuperUser } from '../../../middleware/tenantContext';
import { db } from '../../../db';
import { tenantAgreements, tenantAgreementAcceptances, tenants, users, AgreementStatus } from '@shared/schema';
import { eq, and, desc, count, isNull, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import { invalidateAgreementCache, clearAgreementCache } from '../../../middleware/agreementEnforcement';

export const agreementsRouter = Router();

const agreementCreateSchema = z.object({
  tenantId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(200),
  body: z.string().min(1),
});

const agreementUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  body: z.string().min(1).optional(),
});

agreementsRouter.get("/agreements/tenants-summary", requireSuperUser, async (req, res) => {
  try {
    const allTenants = await db.select().from(tenants);
    
    const summary = await Promise.all(allTenants.map(async (tenant) => {
      const [activeAgreement] = await db.select()
        .from(tenantAgreements)
        .where(and(
          eq(tenantAgreements.tenantId, tenant.id),
          eq(tenantAgreements.status, "active")
        ))
        .limit(1);
      
      let acceptedCount = 0;
      let totalUsers = 0;
      
      if (activeAgreement) {
        const acceptances = await db.select({ count: count() })
          .from(tenantAgreementAcceptances)
          .where(eq(tenantAgreementAcceptances.agreementId, activeAgreement.id));
        acceptedCount = acceptances[0]?.count || 0;
      }
      
      const userCount = await db.select({ count: count() })
        .from(users)
        .where(eq(users.tenantId, tenant.id));
      totalUsers = userCount[0]?.count || 0;
      
      return {
        tenantId: tenant.id,
        tenantName: tenant.name,
        hasActiveAgreement: !!activeAgreement,
        currentVersion: activeAgreement?.version || null,
        effectiveDate: activeAgreement?.effectiveAt?.toISOString() || null,
        acceptedCount,
        totalUsers,
      };
    }));
    
    res.json(summary);
  } catch (error) {
    console.error("[agreements] Failed to get tenant agreements summary:", error);
    res.status(500).json({ error: "Failed to get agreements summary" });
  }
});

agreementsRouter.get("/agreements", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, status } = req.query;
    
    let query = db.select({
      id: tenantAgreements.id,
      tenantId: tenantAgreements.tenantId,
      title: tenantAgreements.title,
      body: tenantAgreements.body,
      version: tenantAgreements.version,
      status: tenantAgreements.status,
      effectiveAt: tenantAgreements.effectiveAt,
      createdAt: tenantAgreements.createdAt,
      updatedAt: tenantAgreements.updatedAt,
    }).from(tenantAgreements);
    
    const conditions = [];
    if (tenantId && typeof tenantId === "string") {
      conditions.push(eq(tenantAgreements.tenantId, tenantId));
    }
    if (status && typeof status === "string") {
      conditions.push(eq(tenantAgreements.status, status));
    }
    
    const agreements = conditions.length > 0 
      ? await query.where(and(...conditions)).orderBy(desc(tenantAgreements.updatedAt))
      : await query.orderBy(desc(tenantAgreements.updatedAt));
    
    const tenantIds = Array.from(new Set(agreements.map(a => a.tenantId).filter((id): id is string => id !== null)));
    const tenantData = tenantIds.length > 0 
      ? await db.select({ id: tenants.id, name: tenants.name }).from(tenants)
      : [];
    const tenantMap = new Map(tenantData.map(t => [t.id, t.name]));
    
    const hasActiveGlobalAgreement = agreements.some(a => a.tenantId === null && a.status === AgreementStatus.ACTIVE);
    
    const enrichedAgreements = agreements.map(a => ({
      ...a,
      tenantName: a.tenantId ? (tenantMap.get(a.tenantId) || "Unknown") : "All Tenants",
      scope: a.tenantId ? "tenant" : "global",
      isGlobalDefault: a.tenantId === null && a.status === AgreementStatus.ACTIVE,
    }));
    
    res.json({ agreements: enrichedAgreements, total: enrichedAgreements.length });
  } catch (error) {
    console.error("[agreements] Failed to list agreements:", error);
    res.status(500).json({ error: "Failed to list agreements" });
  }
});

agreementsRouter.get("/agreements/:id", requireSuperUser, async (req, res) => {
  try {
    const { id } = req.params;
    
    const [agreement] = await db.select()
      .from(tenantAgreements)
      .where(eq(tenantAgreements.id, id))
      .limit(1);
    
    if (!agreement) {
      return res.status(404).json({ error: "Agreement not found" });
    }
    
    let tenantName = "All Tenants";
    let totalUsersCount = 0;
    
    if (agreement.tenantId) {
      const [tenant] = await db.select({ name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, agreement.tenantId))
        .limit(1);
      tenantName = tenant?.name || "Unknown";
      
      const totalUsers = await db.select({ count: count() })
        .from(users)
        .where(eq(users.tenantId, agreement.tenantId!));
      totalUsersCount = totalUsers[0]?.count || 0;
    } else {
      const totalUsers = await db.select({ count: count() })
        .from(users)
        .where(isNotNull(users.tenantId));
      totalUsersCount = totalUsers[0]?.count || 0;
    }
    
    const acceptances = await db.select({ count: count() })
      .from(tenantAgreementAcceptances)
      .where(eq(tenantAgreementAcceptances.agreementId, id));
    
    res.json({
      ...agreement,
      tenantName,
      scope: agreement.tenantId ? "tenant" : "global",
      isGlobalDefault: agreement.tenantId === null && agreement.status === AgreementStatus.ACTIVE,
      acceptedCount: acceptances[0]?.count || 0,
      totalUsers: totalUsersCount,
    });
  } catch (error) {
    console.error("[agreements] Failed to get agreement:", error);
    res.status(500).json({ error: "Failed to get agreement" });
  }
});

agreementsRouter.post("/agreements", requireSuperUser, async (req, res) => {
  try {
    const validation = agreementCreateSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "Invalid request body", details: validation.error.errors });
    }
    
    const { tenantId, title, body } = validation.data;
    const user = req.user!;
    
    const effectiveTenantId = tenantId || null;
    
    if (effectiveTenantId) {
      const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, effectiveTenantId)).limit(1);
      if (!tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }
    }
    
    let existingAgreements;
    if (effectiveTenantId) {
      existingAgreements = await db.select({ version: tenantAgreements.version })
        .from(tenantAgreements)
        .where(eq(tenantAgreements.tenantId, effectiveTenantId))
        .orderBy(desc(tenantAgreements.version))
        .limit(1);
    } else {
      existingAgreements = await db.select({ version: tenantAgreements.version })
        .from(tenantAgreements)
        .where(isNull(tenantAgreements.tenantId))
        .orderBy(desc(tenantAgreements.version))
        .limit(1);
    }
    
    const nextVersion = existingAgreements.length > 0 ? existingAgreements[0].version + 1 : 1;
    
    const [newAgreement] = await db.insert(tenantAgreements).values({
      tenantId: effectiveTenantId,
      title,
      body,
      version: nextVersion,
      status: AgreementStatus.DRAFT,
      createdByUserId: user.id,
    }).returning();
    
    res.status(201).json({ agreement: newAgreement });
  } catch (error) {
    console.error("[agreements] Failed to create agreement:", error);
    res.status(500).json({ error: "Failed to create agreement" });
  }
});

agreementsRouter.patch("/agreements/:id", requireSuperUser, async (req, res) => {
  try {
    const { id } = req.params;
    const validation = agreementUpdateSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "Invalid request body", details: validation.error.errors });
    }
    
    const [existing] = await db.select()
      .from(tenantAgreements)
      .where(eq(tenantAgreements.id, id))
      .limit(1);
    
    if (!existing) {
      return res.status(404).json({ error: "Agreement not found" });
    }
    
    if (existing.status !== AgreementStatus.DRAFT) {
      return res.status(400).json({ error: "Only draft agreements can be edited" });
    }
    
    const [updated] = await db.update(tenantAgreements)
      .set({ ...validation.data, updatedAt: new Date() })
      .where(eq(tenantAgreements.id, id))
      .returning();
    
    res.json({ agreement: updated });
  } catch (error) {
    console.error("[agreements] Failed to update agreement:", error);
    res.status(500).json({ error: "Failed to update agreement" });
  }
});

agreementsRouter.post("/agreements/:id/publish", requireSuperUser, async (req, res) => {
  try {
    const { id } = req.params;
    
    const [existing] = await db.select()
      .from(tenantAgreements)
      .where(eq(tenantAgreements.id, id))
      .limit(1);
    
    if (!existing) {
      return res.status(404).json({ error: "Agreement not found" });
    }
    
    if (existing.status !== AgreementStatus.DRAFT) {
      return res.status(400).json({ error: "Only draft agreements can be published" });
    }
    
    if (existing.tenantId) {
      await db.update(tenantAgreements)
        .set({ status: AgreementStatus.ARCHIVED, updatedAt: new Date() })
        .where(and(
          eq(tenantAgreements.tenantId, existing.tenantId),
          eq(tenantAgreements.status, AgreementStatus.ACTIVE)
        ));
    } else {
      await db.update(tenantAgreements)
        .set({ status: AgreementStatus.ARCHIVED, updatedAt: new Date() })
        .where(and(
          isNull(tenantAgreements.tenantId),
          eq(tenantAgreements.status, AgreementStatus.ACTIVE)
        ));
    }
    
    const [published] = await db.update(tenantAgreements)
      .set({ 
        status: AgreementStatus.ACTIVE, 
        effectiveAt: new Date(),
        updatedAt: new Date() 
      })
      .where(eq(tenantAgreements.id, id))
      .returning();
    
    if (existing.tenantId) {
      invalidateAgreementCache(existing.tenantId);
    } else {
      clearAgreementCache();
    }
    
    res.json({ agreement: published });
  } catch (error) {
    console.error("[agreements] Failed to publish agreement:", error);
    res.status(500).json({ error: "Failed to publish agreement" });
  }
});

agreementsRouter.post("/agreements/:id/archive", requireSuperUser, async (req, res) => {
  try {
    const { id } = req.params;
    
    const [existing] = await db.select()
      .from(tenantAgreements)
      .where(eq(tenantAgreements.id, id))
      .limit(1);
    
    if (!existing) {
      return res.status(404).json({ error: "Agreement not found" });
    }
    
    if (existing.status === AgreementStatus.ARCHIVED) {
      return res.status(400).json({ error: "Agreement is already archived" });
    }
    
    const [archived] = await db.update(tenantAgreements)
      .set({ status: AgreementStatus.ARCHIVED, updatedAt: new Date() })
      .where(eq(tenantAgreements.id, id))
      .returning();
    
    if (existing.tenantId) {
      invalidateAgreementCache(existing.tenantId);
    } else {
      clearAgreementCache();
    }
    
    res.json({ agreement: archived });
  } catch (error) {
    console.error("[agreements] Failed to archive agreement:", error);
    res.status(500).json({ error: "Failed to archive agreement" });
  }
});

agreementsRouter.delete("/agreements/:id", requireSuperUser, async (req, res) => {
  try {
    const { id } = req.params;
    
    const [existing] = await db.select()
      .from(tenantAgreements)
      .where(eq(tenantAgreements.id, id))
      .limit(1);
    
    if (!existing) {
      return res.status(404).json({ error: "Agreement not found" });
    }
    
    if (existing.status !== AgreementStatus.DRAFT) {
      return res.status(400).json({ error: "Only draft agreements can be deleted" });
    }
    
    await db.delete(tenantAgreements).where(eq(tenantAgreements.id, id));
    
    res.json({ success: true });
  } catch (error) {
    console.error("[agreements] Failed to delete agreement:", error);
    res.status(500).json({ error: "Failed to delete agreement" });
  }
});

agreementsRouter.get("/agreements/:id/signers", requireSuperUser, async (req, res) => {
  try {
    const { id } = req.params;
    
    const [agreement] = await db.select()
      .from(tenantAgreements)
      .where(eq(tenantAgreements.id, id))
      .limit(1);
    
    if (!agreement) {
      return res.status(404).json({ error: "Agreement not found" });
    }
    
    const acceptances = await db.select({
      id: tenantAgreementAcceptances.id,
      userId: tenantAgreementAcceptances.userId,
      version: tenantAgreementAcceptances.version,
      acceptedAt: tenantAgreementAcceptances.acceptedAt,
      ipAddress: tenantAgreementAcceptances.ipAddress,
    })
      .from(tenantAgreementAcceptances)
      .where(eq(tenantAgreementAcceptances.agreementId, id))
      .orderBy(desc(tenantAgreementAcceptances.acceptedAt));
    
    const tenantUsers = await db.select({
      id: users.id,
      email: users.email,
      name: users.name,
      firstName: users.firstName,
      lastName: users.lastName,
      isActive: users.isActive,
    })
      .from(users)
      .where(eq(users.tenantId, agreement.tenantId!));
    
    const acceptanceMap = new Map(acceptances.map(a => [a.userId, a]));
    
    const signers = tenantUsers.map(u => {
      const acceptance = acceptanceMap.get(u.id);
      return {
        userId: u.id,
        email: u.email,
        name: u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.name || u.email,
        isActive: u.isActive,
        status: acceptance ? "signed" : "pending",
        signedAt: acceptance?.acceptedAt || null,
        signedVersion: acceptance?.version || null,
        ipAddress: acceptance?.ipAddress || null,
      };
    });
    
    res.json({
      agreementId: id,
      agreementVersion: agreement.version,
      signers,
      stats: {
        total: signers.length,
        signed: signers.filter(s => s.status === "signed").length,
        pending: signers.filter(s => s.status === "pending").length,
      },
    });
  } catch (error) {
    console.error("[agreements] Failed to get signers:", error);
    res.status(500).json({ error: "Failed to get signers" });
  }
});
