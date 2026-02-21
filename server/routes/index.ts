/**
 * Legacy Routes Aggregator — DEPRECATED
 * 
 * All domain routes have been migrated to the registry-based model.
 * Routes are now mounted via server/http/mount.ts using createApiRouter.
 * 
 * This file is kept as a marker. It should not be imported by any production code.
 * 
 * @deprecated All routes consolidated into server/http/mount.ts
 */

import { Router } from "express";
const router = Router();
export default router;
