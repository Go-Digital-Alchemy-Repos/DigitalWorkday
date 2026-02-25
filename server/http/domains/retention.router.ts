import { createApiRouter } from "../routerFactory";
import { getRetentionAuditSummary, getAllTenantsAuditSummary } from "../../retention/retentionAudit";
import { runSoftArchive } from "../../retention/softArchiveRunner";
import { db } from "../../db";
import { dataRetentionPolicies } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const retentionRouter = createApiRouter({ policy: "superUser" });

// GET /api/v1/super/retention/audit
retentionRouter.get("/audit", async (req, res) => {
  const summaries = await getAllTenantsAuditSummary();
  res.json(summaries);
});

// GET /api/v1/super/retention/audit/:tenantId
retentionRouter.get("/audit/:tenantId", async (req, res) => {
  const summary = await getRetentionAuditSummary(req.params.tenantId);
  res.json(summary);
});

// POST /api/v1/super/retention/run/:tenantId
retentionRouter.post("/run/:tenantId", async (req, res) => {
  const result = await runSoftArchive(req.params.tenantId);
  res.json(result);
});

// CRUD for policies
retentionRouter.get("/policies", async (req, res) => {
  const policies = await db.select().from(dataRetentionPolicies);
  res.json(policies);
});

retentionRouter.get("/policies/:tenantId", async (req, res) => {
  const policies = await db.select().from(dataRetentionPolicies).where(eq(dataRetentionPolicies.tenantId, req.params.tenantId));
  res.json(policies);
});

const policySchema = z.object({
  entityType: z.enum(["tasks", "chat_messages"]),
  isEnabled: z.boolean(),
  retentionDays: z.number().int().min(1),
  archiveMode: z.enum(["soft", "hard"]).default("soft"),
});

retentionRouter.post("/policies/:tenantId", async (req, res) => {
  const tenantId = req.params.tenantId;
  const validated = policySchema.parse(req.body);

  const [existing] = await db.select().from(dataRetentionPolicies).where(
    and(
      eq(dataRetentionPolicies.tenantId, tenantId),
      eq(dataRetentionPolicies.entityType, validated.entityType)
    )
  ).limit(1);

  if (existing) {
    const [updated] = await db.update(dataRetentionPolicies)
      .set({
        retentionDays: validated.retentionDays,
        isEnabled: validated.isEnabled,
        archiveMode: validated.archiveMode,
        updatedAt: new Date(),
        updatedByUserId: (req.user as any)?.id,
      })
      .where(eq(dataRetentionPolicies.id, existing.id))
      .returning();
    res.json(updated);
  } else {
    const [inserted] = await db.insert(dataRetentionPolicies)
      .values({
        tenantId,
        entityType: validated.entityType,
        retentionDays: validated.retentionDays,
        isEnabled: validated.isEnabled,
        archiveMode: validated.archiveMode,
        createdByUserId: (req.user as any)?.id,
        updatedByUserId: (req.user as any)?.id,
      })
      .returning();
    res.json(inserted);
  }
});

export default retentionRouter;
