import { createApiRouter } from "../routerFactory";
import { storage } from "../../storage";
import { z } from "zod";

const router = createApiRouter({ policy: "authTenant" });

// Helper to extract user + tenant from request (matching existing app conventions)
function getContext(req: any): { userId: string; tenantId: string } | null {
  const userId = req.user?.id;
  const tenantId = req.user?.tenantId;
  if (!userId || !tenantId) return null;
  return { userId, tenantId };
}

// ── Preferences ──────────────────────────────────────────────────────────────

const preferencesSchema = z.object({
  toursEnabled: z.boolean().optional(),
  contextualHintsEnabled: z.boolean().optional(),
  onboardingCompleted: z.boolean().optional(),
  lastSeenReleaseTourVersion: z.string().nullable().optional(),
});

// GET /api/guided-tours/preferences
router.get("/guided-tours/preferences", async (req, res) => {
  const ctx = getContext(req);
  if (!ctx) return res.status(401).json({ error: "Authentication required" });

  try {
    const prefs = await storage.getGuidedTourPreferences(ctx.userId, ctx.tenantId);
    // Return defaults if no row exists yet — never 404
    return res.json(prefs ?? {
      toursEnabled: true,
      contextualHintsEnabled: true,
      onboardingCompleted: false,
      lastSeenReleaseTourVersion: null,
    });
  } catch (err) {
    console.error("[guided-tours] GET preferences error:", err);
    return res.status(500).json({ error: "Failed to load preferences" });
  }
});

// PATCH /api/guided-tours/preferences
router.patch("/guided-tours/preferences", async (req, res) => {
  const ctx = getContext(req);
  if (!ctx) return res.status(401).json({ error: "Authentication required" });

  const parsed = preferencesSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
  }

  try {
    const result = await storage.upsertGuidedTourPreferences(ctx.userId, ctx.tenantId, parsed.data);
    return res.json(result);
  } catch (err) {
    console.error("[guided-tours] PATCH preferences error:", err);
    return res.status(500).json({ error: "Failed to save preferences" });
  }
});

// ── Progress ──────────────────────────────────────────────────────────────────

const progressUpdateSchema = z.object({
  tourVersion: z.number().int().min(1).optional(),
  status: z.enum(["not_started", "in_progress", "completed", "dismissed"]).optional(),
  currentStepIndex: z.number().int().min(0).optional(),
});

// GET /api/guided-tours/progress
router.get("/guided-tours/progress", async (req, res) => {
  const ctx = getContext(req);
  if (!ctx) return res.status(401).json({ error: "Authentication required" });

  try {
    const progress = await storage.getGuidedTourProgressList(ctx.userId, ctx.tenantId);
    return res.json(progress);
  } catch (err) {
    console.error("[guided-tours] GET progress list error:", err);
    return res.status(500).json({ error: "Failed to load tour progress" });
  }
});

// GET /api/guided-tours/progress/:tourKey
router.get("/guided-tours/progress/:tourKey", async (req, res) => {
  const ctx = getContext(req);
  if (!ctx) return res.status(401).json({ error: "Authentication required" });

  try {
    const record = await storage.getGuidedTourProgress(ctx.userId, ctx.tenantId, req.params.tourKey);
    if (!record) return res.json(null);
    return res.json(record);
  } catch (err) {
    console.error("[guided-tours] GET progress error:", err);
    return res.status(500).json({ error: "Failed to load tour progress" });
  }
});

// PUT /api/guided-tours/progress/:tourKey
router.put("/guided-tours/progress/:tourKey", async (req, res) => {
  const ctx = getContext(req);
  if (!ctx) return res.status(401).json({ error: "Authentication required" });

  const parsed = progressUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
  }

  try {
    const result = await storage.upsertGuidedTourProgress(
      ctx.userId, ctx.tenantId, req.params.tourKey, parsed.data
    );
    return res.json(result);
  } catch (err) {
    console.error("[guided-tours] PUT progress error:", err);
    return res.status(500).json({ error: "Failed to update tour progress" });
  }
});

// POST /api/guided-tours/progress/:tourKey/complete
router.post("/guided-tours/progress/:tourKey/complete", async (req, res) => {
  const ctx = getContext(req);
  if (!ctx) return res.status(401).json({ error: "Authentication required" });

  const { tourVersion } = z.object({ tourVersion: z.number().int().min(1).default(1) }).parse(req.body ?? {});

  try {
    const result = await storage.upsertGuidedTourProgress(
      ctx.userId, ctx.tenantId, req.params.tourKey,
      { status: "completed", tourVersion, currentStepIndex: 0, completedAt: new Date() }
    );
    return res.json(result);
  } catch (err) {
    console.error("[guided-tours] complete error:", err);
    return res.status(500).json({ error: "Failed to mark tour complete" });
  }
});

// POST /api/guided-tours/progress/:tourKey/dismiss
router.post("/guided-tours/progress/:tourKey/dismiss", async (req, res) => {
  const ctx = getContext(req);
  if (!ctx) return res.status(401).json({ error: "Authentication required" });

  const { tourVersion, currentStepIndex } = z.object({
    tourVersion: z.number().int().min(1).default(1),
    currentStepIndex: z.number().int().min(0).default(0),
  }).parse(req.body ?? {});

  try {
    const result = await storage.upsertGuidedTourProgress(
      ctx.userId, ctx.tenantId, req.params.tourKey,
      { status: "dismissed", tourVersion, currentStepIndex, dismissedAt: new Date() }
    );
    return res.json(result);
  } catch (err) {
    console.error("[guided-tours] dismiss error:", err);
    return res.status(500).json({ error: "Failed to dismiss tour" });
  }
});

// POST /api/guided-tours/progress/:tourKey/reset
router.post("/guided-tours/progress/:tourKey/reset", async (req, res) => {
  const ctx = getContext(req);
  if (!ctx) return res.status(401).json({ error: "Authentication required" });

  try {
    await storage.resetGuidedTourProgress(ctx.userId, ctx.tenantId, req.params.tourKey);
    return res.json({ success: true });
  } catch (err) {
    console.error("[guided-tours] reset error:", err);
    return res.status(500).json({ error: "Failed to reset tour" });
  }
});

export default router;
