/**
 * PM Portfolio Domain Router
 *
 * Provides portfolio-level intelligence for Project Managers.
 * Shows projects where the current user has the 'owner' role in project_members.
 *
 * Endpoints:
 *   GET /api/reports/pm/portfolio — PM portfolio overview
 *
 * Auth: authTenant — available to any authenticated tenant user.
 * The aggregator scopes results to projects where the user is an owner.
 */

import { Router, Request, Response } from "express";
import { handleRouteError } from "../../lib/errors";
import { getEffectiveTenantId } from "../../middleware/tenantContext";
import { getCurrentUserId } from "../../routes/helpers";
import { getPmPortfolio } from "../../reports/pmPortfolioAggregator";
import { config } from "../../config";

const router = Router();

router.get("/pm/portfolio", async (req: Request, res: Response) => {
  try {
    if (!config.features.enablePmPortfolioDashboard) {
      return res.status(403).json({ error: "PM Portfolio Dashboard is not enabled." });
    }

    const tenantId = getEffectiveTenantId(req);
    const pmUserId = getCurrentUserId(req);

    if (!tenantId || !pmUserId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const result = await getPmPortfolio({ tenantId, pmUserId });
    return res.json(result);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/reports/pm/portfolio", req);
  }
});

export default router;
