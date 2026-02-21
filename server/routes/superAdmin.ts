/**
 * Super Admin API Routes — Thin Aggregator
 *
 * All route handlers have been extracted into domain-specific modules
 * under server/routes/modules/super-admin/*.router.ts.
 *
 * This file mounts all sub-routers and exports shared helpers.
 */
import { createApiRouter } from "../http/routerFactory";
import { db } from "../db";
import { tenantAuditEvents } from "@shared/schema";

import {
  bootstrapRouter,
  tenantsRouter,
  tenantWorkspacesRouter,
  tenantUsersRouter,
  tenantInvitationsRouter,
  superUsersRouter,
  superInvitationsRouter,
  impersonationRouter,
  tenantSettingsRouter,
  tenantIntegrationsRouter,
  tenantNotesRouter,
  tenantAuditRouter,
  tenantHealthRouter,
  tenantClientsRouter,
  tenantProjectsRouter,
  bulkOperationsRouter,
  seedingRouter,
  systemSettingsRouter,
  systemPurgeRouter,
  adminsRouter,
  agreementsRouter,
  reportsRouter,
  tenancyHealthRouter,
  tenantPickerRouter,
  docsRouter,
  exportImportRouter,
  aiConfigRouter,
  diagnosticsRouter,
  asanaImportRouter,
} from "./modules/super-admin";

const router = createApiRouter({ policy: "superUser", allowlist: ["/bootstrap"] });

router.use(bootstrapRouter);
router.use(tenantsRouter);
router.use(tenantWorkspacesRouter);
router.use(tenantUsersRouter);
router.use(tenantInvitationsRouter);
router.use(superUsersRouter);
router.use(superInvitationsRouter);
router.use(impersonationRouter);
router.use(tenantSettingsRouter);
router.use(tenantIntegrationsRouter);
router.use(tenantNotesRouter);
router.use(tenantAuditRouter);
router.use(tenantHealthRouter);
router.use(tenantClientsRouter);
router.use(tenantProjectsRouter);
router.use(bulkOperationsRouter);
router.use(seedingRouter);
router.use(systemSettingsRouter);
router.use(systemPurgeRouter);
router.use(adminsRouter);
router.use(agreementsRouter);
router.use(reportsRouter);
router.use(tenancyHealthRouter);
router.use(tenantPickerRouter);
router.use(docsRouter);
router.use(exportImportRouter);
router.use(aiConfigRouter);
router.use(diagnosticsRouter);
router.use(asanaImportRouter);

// =============================================================================
// SHARED HELPERS — Exported for use by sub-routers
// =============================================================================

export async function recordTenantAuditEvent(
  tenantId: string,
  eventType: string,
  message: string,
  actorUserId?: string | null,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await db.insert(tenantAuditEvents).values({
      tenantId,
      actorUserId: actorUserId || null,
      eventType,
      message,
      metadata: metadata || null,
    });
  } catch (error) {
    console.error(`[Audit] Failed to record event ${eventType} for tenant ${tenantId}:`, error);
  }
}

export default router;
