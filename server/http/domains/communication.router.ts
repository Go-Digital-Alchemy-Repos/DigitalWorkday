import { Router } from "express";
import { handleRouteError } from "../../lib/errors";
import { requireAuth } from "../../auth";
import {
  recordClientContact,
  updateStatusReportSent,
  calculateCommunicationHealth,
  getCommunicationHealthSummary,
} from "../../services/communication/communicationHealthService";
import { getProjectsNeedingFollowup } from "../../services/communication/followUpService";

const router = Router();

router.get("/projects/:id/communication-health", requireAuth, async (req, res) => {
  try {
    const tenantId = (req.user as any)?.tenantId;
    if (!tenantId) return res.status(403).json({ error: "Tenant required" });

    const health = await calculateCommunicationHealth(req.params.id, tenantId);
    if (!health) return res.status(404).json({ error: "Project not found" });

    return res.json(health);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/projects/:id/communication-health", req);
  }
});

router.post("/projects/:id/client-contact", requireAuth, async (req, res) => {
  try {
    const tenantId = (req.user as any)?.tenantId;
    if (!tenantId) return res.status(403).json({ error: "Tenant required" });

    const role = (req.user as any)?.role;
    const allowedRoles = ["super_user", "tenant_owner", "admin"];
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    await recordClientContact(req.params.id, tenantId);
    const health = await calculateCommunicationHealth(req.params.id, tenantId);
    return res.json({ success: true, health });
  } catch (error) {
    return handleRouteError(res, error, "POST /api/projects/:id/client-contact", req);
  }
});

router.post("/projects/:id/status-report-sent", requireAuth, async (req, res) => {
  try {
    const tenantId = (req.user as any)?.tenantId;
    if (!tenantId) return res.status(403).json({ error: "Tenant required" });

    const role = (req.user as any)?.role;
    const allowedRoles = ["super_user", "tenant_owner", "admin"];
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    await updateStatusReportSent(req.params.id, tenantId);
    return res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, "POST /api/projects/:id/status-report-sent", req);
  }
});

router.get("/communication/health-summary", requireAuth, async (req, res) => {
  try {
    const tenantId = (req.user as any)?.tenantId;
    if (!tenantId) return res.status(403).json({ error: "Tenant required" });

    const summary = await getCommunicationHealthSummary(tenantId);
    return res.json(summary);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/communication/health-summary", req);
  }
});

router.get("/communication/followups", requireAuth, async (req, res) => {
  try {
    const tenantId = (req.user as any)?.tenantId;
    if (!tenantId) return res.status(403).json({ error: "Tenant required" });

    const role = (req.user as any)?.role;
    const allowedRoles = ["super_user", "tenant_owner", "admin"];
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const projects = await getProjectsNeedingFollowup(tenantId);
    return res.json(projects);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/communication/followups", req);
  }
});

export default router;
