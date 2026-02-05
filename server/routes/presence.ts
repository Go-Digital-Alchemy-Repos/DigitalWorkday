/**
 * Presence API Routes
 * 
 * Provides REST endpoints for querying user presence status.
 * This is useful for initial page loads where socket might not be connected yet.
 */

import { Router, Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { getCurrentUserId } from "../middleware/authContext";
import { getEffectiveTenantId } from "../middleware/tenantContext";
import { AppError } from "../lib/errors";
import { getPresenceForUsers, getAllPresenceForTenant, toPresencePayload } from "../realtime/presence";

const router = Router();

/**
 * GET /api/presence
 * Query presence for specific users or all users in tenant
 * 
 * Query params:
 * - userIds: comma-separated user IDs (optional, if not provided returns all tenant users)
 */
router.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getEffectiveTenantId(req);
    const userId = getCurrentUserId(req);
    
    if (!tenantId) {
      throw AppError.forbidden("Tenant context required");
    }

    const { userIds } = req.query;

    if (typeof userIds === "string" && userIds.length > 0) {
      // Query specific users
      const ids = userIds.split(",").map(id => id.trim()).filter(id => id.length > 0);
      if (ids.length > 100) {
        throw AppError.badRequest("Cannot query more than 100 users at once");
      }
      const presenceInfos = getPresenceForUsers(tenantId, ids);
      res.json(presenceInfos.map(toPresencePayload));
    } else {
      // Return all presence for tenant
      const presenceInfos = getAllPresenceForTenant(tenantId);
      res.json(presenceInfos.map(toPresencePayload));
    }
  })
);

export default router;
