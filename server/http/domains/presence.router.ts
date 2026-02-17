import { createApiRouter } from "../routerFactory";
import { asyncHandler } from "../../middleware/asyncHandler";
import { getCurrentUserId } from "../../middleware/authContext";
import { getEffectiveTenantId } from "../../middleware/tenantContext";
import { AppError } from "../../lib/errors";
import { getPresenceForUsers, getAllPresenceForTenant, toPresencePayload } from "../../realtime/presence";

const router = createApiRouter({
  policy: "authTenant",
  skipEnvelope: true,
});

router.get(
  "/v1/presence",
  asyncHandler(async (req, res) => {
    const tenantId = getEffectiveTenantId(req);
    const userId = getCurrentUserId(req);

    if (!tenantId) {
      throw AppError.forbidden("Tenant context required");
    }

    const { userIds } = req.query;

    if (typeof userIds === "string" && userIds.length > 0) {
      const ids = userIds.split(",").map(id => id.trim()).filter(id => id.length > 0);
      if (ids.length > 100) {
        throw AppError.badRequest("Cannot query more than 100 users at once");
      }
      const presenceInfos = getPresenceForUsers(tenantId, ids);
      res.json(presenceInfos.map(toPresencePayload));
    } else {
      const presenceInfos = getAllPresenceForTenant(tenantId);
      res.json(presenceInfos.map(toPresencePayload));
    }
  })
);

export default router;
