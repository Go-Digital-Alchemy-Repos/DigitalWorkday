/**
 * Super Admin Debug Tools Routes
 * 
 * Purpose: Provides diagnostic and remediation tools for super administrators.
 * 
 * Key Invariants:
 * - ALL endpoints require super_user role (enforced by requireSuperUser middleware)
 * - Destructive operations require environment flags AND confirmation headers
 * - All mutations write audit events for compliance
 * 
 * Security Guards:
 * - Delete: SUPER_DEBUG_DELETE_ALLOWED=true + X-Confirm-Delete header + confirmPhrase body
 * - Backfill Apply: BACKFILL_TENANT_IDS_ALLOWED=true + X-Confirm-Backfill header
 * - Cache/Health: SUPER_DEBUG_ACTIONS_ALLOWED=true + confirmation headers
 * 
 * Sharp Edges:
 * - Quarantine operations use tenant slug "quarantine" for stability (not ID)
 * - Backfill defaults to dry_run mode; apply mode requires explicit flags
 * - Never expose these endpoints to non-super users
 * 
 * Module Structure:
 * - quarantine.router.ts: Quarantine summary, list, assign, archive, delete
 * - backfill.router.ts: TenantId scan and backfill operations
 * - diagnostics.router.ts: Integrity checks, health recompute, cache, config
 * - superDebug.helpers.ts: Shared helpers (getQuarantineTenantId, writeAuditEvent)
 */
import { Router } from "express";
import superDebugSubModules from "./modules/superDebug";

const router = Router();

router.use(superDebugSubModules);

export default router;
