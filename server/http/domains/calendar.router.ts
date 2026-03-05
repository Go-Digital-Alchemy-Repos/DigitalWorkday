import { Router } from "express";
import { requireAuth } from "../../auth";
import * as calendarService from "../../services/calendarIntegrationService";
import { handleRouteError } from "../../lib/errors";
import { z } from "zod";

const router = Router();

router.get("/calendar/configured", requireAuth, (_req, res) => {
  res.json({ configured: calendarService.isConfigured() });
});

router.get("/calendar/status", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const status = await calendarService.getConnectionStatus(userId);
    res.json(status);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/calendar/status", req);
  }
});

router.get("/calendar/auth-url", requireAuth, (req, res) => {
  try {
    if (!calendarService.isConfigured()) {
      return res.status(503).json({ error: "Google Calendar integration is not configured" });
    }
    const host = req.get("host") ?? "localhost:5000";
    const returnTo = typeof req.query.returnTo === "string" ? req.query.returnTo : "/";
    const state = Buffer.from(JSON.stringify({ userId: req.user!.id, tenantId: req.user!.tenantId, returnTo })).toString("base64");
    const url = calendarService.getAuthUrl(host, state);
    res.json({ url });
  } catch (error) {
    return handleRouteError(res, error, "GET /api/calendar/auth-url", req);
  }
});

router.get("/calendar/callback", async (req, res) => {
  try {
    const { code, state } = req.query;
    if (typeof code !== "string" || typeof state !== "string") {
      return res.status(400).send("Invalid callback parameters");
    }

    let parsed: { userId: string; tenantId: string; returnTo: string };
    try {
      parsed = JSON.parse(Buffer.from(state, "base64").toString("utf8"));
    } catch {
      return res.status(400).send("Invalid state parameter");
    }

    const host = req.get("host") ?? "localhost:5000";
    await calendarService.handleCallback(code, host, parsed.userId, parsed.tenantId);

    const returnTo = parsed.returnTo || "/";
    res.redirect(returnTo + (returnTo.includes("?") ? "&" : "?") + "calendarConnected=1");
  } catch (error) {
    return handleRouteError(res, error, "GET /api/calendar/callback", req);
  }
});

const createEventSchema = z.object({
  clientName: z.string().min(1),
  projectName: z.string().min(1),
  projectId: z.string().min(1),
  followupDueAt: z.string().min(1),
  notes: z.string().optional(),
});

router.post("/calendar/events/followup", requireAuth, async (req, res) => {
  try {
    if (!calendarService.isConfigured()) {
      return res.status(503).json({ error: "Google Calendar integration is not configured" });
    }

    const parsed = createEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body", details: parsed.error.format() });
    }

    const host = req.get("host") ?? "localhost:5000";
    const proto = host.includes("localhost") ? "http" : "https";

    const result = await calendarService.createFollowUpEvent(req.user!.id, {
      ...parsed.data,
      appBaseUrl: `${proto}://${host}`,
    });

    res.json({ success: true, eventId: result.eventId, htmlLink: result.htmlLink });
  } catch (error) {
    if (error instanceof Error && error.message === "Google Calendar not connected") {
      return res.status(401).json({ error: "Google Calendar not connected" });
    }
    return handleRouteError(res, error, "POST /api/calendar/events/followup", req);
  }
});

router.delete("/calendar/disconnect", requireAuth, async (req, res) => {
  try {
    await calendarService.disconnect(req.user!.id);
    res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/calendar/disconnect", req);
  }
});

export default router;
