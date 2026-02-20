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
  const isAdmin = currentUser.role === "admin" || isSuperUser(req);
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
    const isAdmin = currentUser?.role === "admin" || isSuperUser(req);
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

export default router;
