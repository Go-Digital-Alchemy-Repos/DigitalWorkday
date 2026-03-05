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
import {
  logCommunicationEvent,
  getProjectCommunicationEvents,
  getClientCommunicationEvents,
} from "../../services/communication/communicationTimelineService";
import { config } from "../../config";

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

    if (config.features.enableCommunicationTimeline) {
      const { description } = req.body;
      await logCommunicationEvent({
        tenantId,
        projectId: req.params.id,
        eventType: "client_contact_logged",
        eventDescription: description || "Client contact logged",
        createdByUserId: (req.user as any)?.id ?? null,
      }).catch(() => {});
    }

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

    if (config.features.enableCommunicationTimeline) {
      await logCommunicationEvent({
        tenantId,
        projectId: req.params.id,
        eventType: "status_report_sent",
        eventDescription: "Status report sent to client",
        createdByUserId: (req.user as any)?.id ?? null,
      }).catch(() => {});
    }

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

// ── Communication Timeline endpoints ─────────────────────────────────────────

router.get("/projects/:id/communication-events", requireAuth, async (req, res) => {
  try {
    const tenantId = (req.user as any)?.tenantId;
    if (!tenantId) return res.status(403).json({ error: "Tenant required" });
    if (!config.features.enableCommunicationTimeline) {
      return res.json([]);
    }
    const events = await getProjectCommunicationEvents(req.params.id, tenantId);
    return res.json(events);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/projects/:id/communication-events", req);
  }
});

router.get("/clients/:clientId/communication-events", requireAuth, async (req, res) => {
  try {
    const tenantId = (req.user as any)?.tenantId;
    if (!tenantId) return res.status(403).json({ error: "Tenant required" });
    if (!config.features.enableCommunicationTimeline) {
      return res.json([]);
    }
    const events = await getClientCommunicationEvents(req.params.clientId, tenantId);
    return res.json(events);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/clients/:clientId/communication-events", req);
  }
});

router.post("/projects/:id/communication-events", requireAuth, async (req, res) => {
  try {
    const tenantId = (req.user as any)?.tenantId;
    if (!tenantId) return res.status(403).json({ error: "Tenant required" });
    if (!config.features.enableCommunicationTimeline) {
      return res.status(403).json({ error: "Feature disabled" });
    }

    const role = (req.user as any)?.role;
    const allowedRoles = ["super_user", "tenant_owner", "admin", "employee"];
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const { eventType, eventDescription, clientId } = req.body;
    if (!eventType) return res.status(400).json({ error: "eventType is required" });

    await logCommunicationEvent({
      tenantId,
      projectId: req.params.id,
      clientId: clientId ?? null,
      eventType,
      eventDescription: eventDescription || null,
      createdByUserId: (req.user as any)?.id ?? null,
    });

    return res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, "POST /api/projects/:id/communication-events", req);
  }
});

export default router;
