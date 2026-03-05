import { createApiRouter } from "../routerFactory";
import { z } from "zod";
import {
  isAIEnabled,
  getAIConfigStatus,
  suggestTaskBreakdown,
  suggestProjectPlan,
  generateTaskDescription,
} from "../../services/ai/aiService";
import { storage } from "../../storage";
import { getCurrentUserId, isSuperUser } from "../../routes/helpers";
import { AppError, sendError } from "../../lib/errors";
import { config } from "../../config";
import { db } from "../../db";
import { aiSummaries } from "@shared/schema";
import { and, eq, gt, desc } from "drizzle-orm";
import { getEmployeeProfileReport } from "../../reports/employeeProfileAggregator";
import { buildEmployeeSummaryPayload, hashPayload } from "../../ai/employeeSummary/buildEmployeeSummaryPayload";
import { generateEmployeeSummary, SUMMARY_VERSION } from "../../ai/employeeSummary/generateEmployeeSummary";
import { getAIProvider } from "../../services/ai/getAIProvider";
import { buildPmFocusPayload, hashPmFocusPayload } from "../../ai/pmFocus/buildPmFocusPayload";
import { generatePmFocusSummary, PM_FOCUS_SUMMARY_VERSION } from "../../ai/pmFocus/generatePmFocusSummary";

const router = createApiRouter({
  policy: "authTenant",
  skipEnvelope: true,
});

async function requireAdmin(req: any, res: any): Promise<boolean> {
  const currentUserId = getCurrentUserId(req);
  const currentUser = await storage.getUser(currentUserId);
  if (!currentUser) {
    sendError(res, AppError.unauthorized("User not found"), req);
    return false;
  }
  const isAdmin = currentUser.role === "admin" || currentUser.role === "tenant_owner" || isSuperUser(req);
  if (!isAdmin) {
    sendError(res, AppError.forbidden("Only admins can use AI features"), req);
    return false;
  }
  return true;
}

router.get("/v1/ai/status", async (req, res) => {
  try {
    const currentUserId = getCurrentUserId(req);
    const currentUser = await storage.getUser(currentUserId);
    const isAdmin = currentUser?.role === "admin" || currentUser?.role === "tenant_owner" || isSuperUser(req);
    if (!isAdmin) {
      return res.json({ enabled: false, isOperational: false, error: null });
    }

    const configStatus = await getAIConfigStatus();
    res.json({
      enabled: configStatus.config !== null,
      isOperational: configStatus.config !== null,
      error: configStatus.error || null,
    });
  } catch (error) {
    console.error("[AI] Failed to get AI status:", error);
    res.status(500).json({ error: "Failed to get AI status" });
  }
});

const taskBreakdownSchema = z.object({
  taskTitle: z.string().min(1),
  taskDescription: z.string().optional(),
  projectContext: z.string().optional(),
});

router.post("/v1/ai/suggest/task-breakdown", async (req, res) => {
  try {
    const allowed = await requireAdmin(req, res);
    if (!allowed) return;

    const enabled = await isAIEnabled();
    if (!enabled) {
      return res.status(400).json({
        error: "AI features are not enabled",
        code: "AI_DISABLED",
      });
    }

    const parsed = taskBreakdownSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request body",
        details: parsed.error.issues,
      });
    }

    const { taskTitle, taskDescription, projectContext } = parsed.data;
    const suggestion = await suggestTaskBreakdown(taskTitle, taskDescription, projectContext);

    if (!suggestion) {
      return res.status(500).json({ error: "Failed to generate suggestions" });
    }

    res.json(suggestion);
  } catch (error: any) {
    console.error("[AI] Task breakdown suggestion failed:", error);
    res.status(500).json({
      error: error.message || "Failed to generate task breakdown suggestions",
    });
  }
});

const projectPlanSchema = z.object({
  projectName: z.string().min(1),
  projectDescription: z.string().optional(),
  clientName: z.string().optional(),
  teamSize: z.number().optional(),
});

router.post("/v1/ai/suggest/project-plan", async (req, res) => {
  try {
    const allowed = await requireAdmin(req, res);
    if (!allowed) return;

    const enabled = await isAIEnabled();
    if (!enabled) {
      return res.status(400).json({
        error: "AI features are not enabled",
        code: "AI_DISABLED",
      });
    }

    const parsed = projectPlanSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request body",
        details: parsed.error.issues,
      });
    }

    const { projectName, projectDescription, clientName, teamSize } = parsed.data;
    const suggestion = await suggestProjectPlan(projectName, projectDescription, clientName, teamSize);

    if (!suggestion) {
      return res.status(500).json({ error: "Failed to generate project plan" });
    }

    res.json(suggestion);
  } catch (error: any) {
    console.error("[AI] Project plan suggestion failed:", error);
    res.status(500).json({
      error: error.message || "Failed to generate project plan suggestions",
    });
  }
});

const descriptionSchema = z.object({
  taskTitle: z.string().min(1),
  projectContext: z.string().optional(),
});

router.post("/v1/ai/suggest/task-description", async (req, res) => {
  try {
    const allowed = await requireAdmin(req, res);
    if (!allowed) return;

    const enabled = await isAIEnabled();
    if (!enabled) {
      return res.status(400).json({
        error: "AI features are not enabled",
        code: "AI_DISABLED",
      });
    }

    const parsed = descriptionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request body",
        details: parsed.error.issues,
      });
    }

    const { taskTitle, projectContext } = parsed.data;
    const description = await generateTaskDescription(taskTitle, projectContext);

    if (!description) {
      return res.status(500).json({ error: "Failed to generate description" });
    }

    res.json({ description });
  } catch (error: any) {
    console.error("[AI] Description generation failed:", error);
    res.status(500).json({
      error: error.message || "Failed to generate task description",
    });
  }
});

// ============================================================
// EMPLOYEE AI SUMMARY — Cached, grounded, cost-controlled
// ============================================================

const AI_SUMMARY_TTL_MS = 24 * 60 * 60 * 1000;

const tenantGenerationCounts = new Map<string, { count: number; resetAt: number }>();
const userGenerationCounts = new Map<string, { count: number; resetAt: number }>();
const TENANT_DAILY_LIMIT = 30;
const USER_DAILY_LIMIT = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

function checkAiRateLimit(tenantId: string, userId: string): { allowed: boolean; reason?: string } {
  const now = Date.now();

  const tEntry = tenantGenerationCounts.get(tenantId);
  if (!tEntry || tEntry.resetAt <= now) {
    tenantGenerationCounts.set(tenantId, { count: 0, resetAt: now + DAY_MS });
  }
  const tState = tenantGenerationCounts.get(tenantId)!;
  if (tState.count >= TENANT_DAILY_LIMIT) {
    return { allowed: false, reason: `Tenant AI generation limit reached (${TENANT_DAILY_LIMIT}/day). Try again tomorrow.` };
  }

  const uEntry = userGenerationCounts.get(userId);
  if (!uEntry || uEntry.resetAt <= now) {
    userGenerationCounts.set(userId, { count: 0, resetAt: now + DAY_MS });
  }
  const uState = userGenerationCounts.get(userId)!;
  if (uState.count >= USER_DAILY_LIMIT) {
    return { allowed: false, reason: `Your AI generation limit reached (${USER_DAILY_LIMIT}/day). Try again tomorrow.` };
  }

  return { allowed: true };
}

function incrementAiRateLimit(tenantId: string, userId: string) {
  const now = Date.now();
  const tEntry = tenantGenerationCounts.get(tenantId);
  if (tEntry && tEntry.resetAt > now) tEntry.count++;
  const uEntry = userGenerationCounts.get(userId);
  if (uEntry && uEntry.resetAt > now) uEntry.count++;
}

function parseRangeForSummary(req: any): { startDate: Date; endDate: Date } {
  const endDate = new Date();
  endDate.setHours(23, 59, 59, 999);
  const days = parseInt(req.query.days || "30", 10);
  const startDate = new Date(endDate.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  startDate.setHours(0, 0, 0, 0);
  return { startDate, endDate };
}

async function buildAndStoreSummary(
  tenantId: string,
  employeeId: string,
  userId: string,
  startDate: Date,
  endDate: Date
) {
  const profileData = await getEmployeeProfileReport({ tenantId, employeeId, startDate, endDate });
  if (!profileData) throw new Error("Employee not found");

  const payload = buildEmployeeSummaryPayload(profileData, startDate, endDate);
  const inputHash = hashPayload(payload);

  const providerResult = await getAIProvider(tenantId);
  if (!providerResult) {
    throw new Error("AI is not configured for this tenant. Contact your administrator.");
  }

  const generated = await generateEmployeeSummary(
    tenantId,
    payload,
    config.features.enableAiSummaryRedaction
  );

  const expiresAt = new Date(Date.now() + AI_SUMMARY_TTL_MS);

  await db.delete(aiSummaries).where(
    and(
      eq(aiSummaries.tenantId, tenantId),
      eq(aiSummaries.entityType, "employee"),
      eq(aiSummaries.entityId, employeeId),
      eq(aiSummaries.rangeStart, startDate.toISOString().split("T")[0]),
      eq(aiSummaries.rangeEnd, endDate.toISOString().split("T")[0])
    )
  );

  const [inserted] = await db.insert(aiSummaries).values({
    tenantId,
    entityType: "employee",
    entityId: employeeId,
    viewerScope: "tenant_admins",
    rangeStart: startDate.toISOString().split("T")[0],
    rangeEnd: endDate.toISOString().split("T")[0],
    inputHash,
    model: providerResult.config.model,
    summaryVersion: SUMMARY_VERSION,
    headline: generated.headline,
    summaryMarkdown: generated.markdown,
    bulletsJson: {
      wins: generated.wins,
      risks: generated.risks,
      notableChanges: generated.notableChanges,
      recommendedActions: generated.recommendedActions,
      confidence: generated.confidence,
      supportingMetrics: generated.supportingMetrics,
    },
    createdByUserId: userId,
    expiresAt,
  }).returning();

  return inserted;
}

function formatCacheRow(row: any) {
  const bullets = (row.bulletsJson as any) ?? {};
  return {
    cached: true,
    headline: row.headline,
    markdown: row.summaryMarkdown,
    wins: bullets.wins ?? [],
    risks: bullets.risks ?? [],
    notableChanges: bullets.notableChanges ?? [],
    recommendedActions: bullets.recommendedActions ?? [],
    confidence: bullets.confidence ?? "Medium",
    supportingMetrics: bullets.supportingMetrics ?? [],
    model: row.model,
    summaryVersion: row.summaryVersion,
    generatedAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
}

router.get("/v1/ai/employee/:employeeId/summary", async (req, res) => {
  try {
    const allowed = await requireAdmin(req, res);
    if (!allowed) return;

    if (!config.features.enableAiEmployeeSummary) {
      return res.status(403).json({ error: "AI Employee Summary feature is not enabled.", code: "FEATURE_DISABLED" });
    }

    const tenantId = (req as any).tenant?.effectiveTenantId || (req.user as any)?.tenantId;
    const userId = getCurrentUserId(req);
    const { employeeId } = req.params;
    const { startDate, endDate } = parseRangeForSummary(req);

    const targetUser = await storage.getUserByIdAndTenant(employeeId, tenantId);
    if (!targetUser) {
      return res.status(404).json({ error: "Employee not found in your organization." });
    }

    if (config.features.enableAiSummaryCache) {
      const [cached] = await db
        .select()
        .from(aiSummaries)
        .where(
          and(
            eq(aiSummaries.tenantId, tenantId),
            eq(aiSummaries.entityType, "employee"),
            eq(aiSummaries.entityId, employeeId),
            eq(aiSummaries.rangeStart, startDate.toISOString().split("T")[0]),
            eq(aiSummaries.rangeEnd, endDate.toISOString().split("T")[0]),
            gt(aiSummaries.expiresAt, new Date())
          )
        )
        .orderBy(desc(aiSummaries.createdAt))
        .limit(1);

      if (cached) {
        return res.json({ ...formatCacheRow(cached), cached: true });
      }
    }

    const rateCheck = checkAiRateLimit(tenantId, userId);
    if (!rateCheck.allowed) {
      return res.status(429).json({ error: rateCheck.reason, code: "RATE_LIMITED" });
    }

    incrementAiRateLimit(tenantId, userId);

    const inserted = await buildAndStoreSummary(tenantId, employeeId, userId, startDate, endDate);
    res.json({ ...formatCacheRow(inserted), cached: false });
  } catch (error: any) {
    console.error("[AI:employeeSummary] GET failed:", error);
    res.status(500).json({ error: error.message || "Failed to generate AI summary." });
  }
});

router.post("/v1/ai/employee/:employeeId/summary/refresh", async (req, res) => {
  try {
    const allowed = await requireAdmin(req, res);
    if (!allowed) return;

    if (!config.features.enableAiEmployeeSummary) {
      return res.status(403).json({ error: "AI Employee Summary feature is not enabled.", code: "FEATURE_DISABLED" });
    }

    const tenantId = (req as any).tenant?.effectiveTenantId || (req.user as any)?.tenantId;
    const userId = getCurrentUserId(req);
    const { employeeId } = req.params;
    const { startDate, endDate } = parseRangeForSummary(req);

    const targetUser = await storage.getUserByIdAndTenant(employeeId, tenantId);
    if (!targetUser) {
      return res.status(404).json({ error: "Employee not found in your organization." });
    }

    const rateCheck = checkAiRateLimit(tenantId, userId);
    if (!rateCheck.allowed) {
      return res.status(429).json({ error: rateCheck.reason, code: "RATE_LIMITED" });
    }

    incrementAiRateLimit(tenantId, userId);

    const inserted = await buildAndStoreSummary(tenantId, employeeId, userId, startDate, endDate);
    res.json({ ...formatCacheRow(inserted), cached: false });
  } catch (error: any) {
    console.error("[AI:employeeSummary] Refresh failed:", error);
    res.status(500).json({ error: error.message || "Failed to refresh AI summary." });
  }
});

// ============================================================
// PM FOCUS SUMMARY — Cached, grounded, rate-limited
// entity_type = "pm_portfolio", entity_id = pmUserId
// ============================================================

const PM_FOCUS_TTL_MS = 24 * 60 * 60 * 1000;

function parsePmFocusRange(req: any): { rangeStart: string; rangeEnd: string } {
  const today = new Date();
  const defaultEnd = today.toISOString().split("T")[0];
  const sevenDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
  const defaultStart = sevenDaysAgo.toISOString().split("T")[0];
  return {
    rangeStart: (req.query.rangeStart as string) || defaultStart,
    rangeEnd: (req.query.rangeEnd as string) || defaultEnd,
  };
}

async function buildAndStorePmFocusSummary(
  tenantId: string,
  pmUserId: string,
  requestingUserId: string,
  rangeStart: string,
  rangeEnd: string
) {
  const payload = await buildPmFocusPayload({ tenantId, pmUserId, rangeStart, rangeEnd });
  const inputHash = hashPmFocusPayload(payload);

  const providerResult = await getAIProvider(tenantId);
  if (!providerResult) {
    throw new Error("AI is not configured for this tenant. Contact your administrator.");
  }

  const generated = await generatePmFocusSummary(
    tenantId,
    payload,
    config.features.enableAiSummaryRedaction
  );

  const expiresAt = new Date(Date.now() + PM_FOCUS_TTL_MS);

  await db.delete(aiSummaries).where(
    and(
      eq(aiSummaries.tenantId, tenantId),
      eq(aiSummaries.entityType, "pm_portfolio"),
      eq(aiSummaries.entityId, pmUserId),
      eq(aiSummaries.rangeStart, rangeStart),
      eq(aiSummaries.rangeEnd, rangeEnd)
    )
  );

  const [inserted] = await db.insert(aiSummaries).values({
    tenantId,
    entityType: "pm_portfolio",
    entityId: pmUserId,
    viewerScope: "tenant_admins",
    rangeStart,
    rangeEnd,
    inputHash,
    model: providerResult.config.model,
    summaryVersion: PM_FOCUS_SUMMARY_VERSION,
    headline: generated.headline,
    summaryMarkdown: generated.markdown,
    bulletsJson: {
      topPriorities: generated.topPriorities,
      risksToAddress: generated.risksToAddress,
      capacityConcerns: generated.capacityConcerns,
      budgetConcerns: generated.budgetConcerns,
      confidence: generated.confidence,
      supportingMetrics: generated.supportingMetrics,
    },
    createdByUserId: requestingUserId,
    expiresAt,
  }).returning();

  return inserted;
}

function formatPmFocusRow(row: any) {
  const bullets = (row.bulletsJson as any) ?? {};
  return {
    id: row.id,
    headline: row.headline,
    topPriorities: bullets.topPriorities ?? [],
    risksToAddress: bullets.risksToAddress ?? [],
    capacityConcerns: bullets.capacityConcerns ?? [],
    budgetConcerns: bullets.budgetConcerns ?? [],
    confidence: bullets.confidence ?? "Medium",
    supportingMetrics: bullets.supportingMetrics ?? [],
    summaryMarkdown: row.summaryMarkdown,
    rangeStart: row.rangeStart,
    rangeEnd: row.rangeEnd,
    model: row.model,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
}

// GET /v1/ai/pm/focus-summary — fetch cached (auto-generate if not cached)
router.get("/v1/ai/pm/focus-summary", async (req, res) => {
  try {
    if (!config.features.enableAiPmFocusSummary) {
      return res.status(404).json({ error: "Feature not enabled", code: "FEATURE_DISABLED" });
    }

    const tenantId = (req as any).tenant?.effectiveTenantId || (req.user as any)?.tenantId;
    const userId = getCurrentUserId(req);
    const { rangeStart, rangeEnd } = parsePmFocusRange(req);

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const currentUser = req.user as any;
    if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "tenant_owner" && currentUser.role !== "super_user")) {
      return res.status(403).json({ error: "PM Portfolio is only available to tenant admins.", code: "FORBIDDEN" });
    }

    if (config.features.enableAiSummaryCache) {
      const [cached] = await db
        .select()
        .from(aiSummaries)
        .where(
          and(
            eq(aiSummaries.tenantId, tenantId),
            eq(aiSummaries.entityType, "pm_portfolio"),
            eq(aiSummaries.entityId, userId),
            eq(aiSummaries.rangeStart, rangeStart),
            eq(aiSummaries.rangeEnd, rangeEnd),
            gt(aiSummaries.expiresAt, new Date())
          )
        )
        .orderBy(desc(aiSummaries.createdAt))
        .limit(1);

      if (cached) {
        return res.json({ ...formatPmFocusRow(cached), cached: true });
      }
    }

    const rateCheck = checkAiRateLimit(tenantId, userId);
    if (!rateCheck.allowed) {
      return res.status(429).json({ error: rateCheck.reason, code: "RATE_LIMITED" });
    }

    incrementAiRateLimit(tenantId, userId);

    const inserted = await buildAndStorePmFocusSummary(tenantId, userId, userId, rangeStart, rangeEnd);
    return res.json({ ...formatPmFocusRow(inserted), cached: false });
  } catch (error: any) {
    console.error("[AI:pmFocus] GET failed:", error);
    return res.status(500).json({ error: error.message || "Failed to generate PM Focus summary." });
  }
});

// POST /v1/ai/pm/focus-summary/refresh — force regeneration (rate limited)
router.post("/v1/ai/pm/focus-summary/refresh", async (req, res) => {
  try {
    if (!config.features.enableAiPmFocusSummary) {
      return res.status(404).json({ error: "Feature not enabled", code: "FEATURE_DISABLED" });
    }

    const tenantId = (req as any).tenant?.effectiveTenantId || (req.user as any)?.tenantId;
    const userId = getCurrentUserId(req);
    const { rangeStart, rangeEnd } = parsePmFocusRange(req);

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const currentUser = req.user as any;
    if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "tenant_owner" && currentUser.role !== "super_user")) {
      return res.status(403).json({ error: "PM Portfolio is only available to tenant admins.", code: "FORBIDDEN" });
    }

    const rateCheck = checkAiRateLimit(tenantId, userId);
    if (!rateCheck.allowed) {
      return res.status(429).json({ error: rateCheck.reason, code: "RATE_LIMITED" });
    }

    incrementAiRateLimit(tenantId, userId);

    const inserted = await buildAndStorePmFocusSummary(tenantId, userId, userId, rangeStart, rangeEnd);
    return res.json({ ...formatPmFocusRow(inserted), cached: false });
  } catch (error: any) {
    console.error("[AI:pmFocus] Refresh failed:", error);
    return res.status(500).json({ error: error.message || "Failed to refresh PM Focus summary." });
  }
});

export default router;
