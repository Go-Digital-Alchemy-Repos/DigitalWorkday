import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { getCurrentUserId } from "../middleware/authContext";
import { 
  isAIEnabled,
  getAIConfigStatus,
  suggestTaskBreakdown, 
  suggestProjectPlan, 
  generateTaskDescription 
} from "../services/ai/aiService";

const router = Router();

function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    getCurrentUserId(req);
    next();
  } catch (error) {
    res.status(401).json({ error: "Authentication required" });
  }
}

router.get("/status", requireAuth, async (req, res) => {
  try {
    const configStatus = await getAIConfigStatus();
    res.json({ 
      enabled: configStatus.config !== null,
      isOperational: configStatus.config !== null,
      error: configStatus.error || null
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

router.post("/suggest/task-breakdown", requireAuth, async (req, res) => {
  try {
    const enabled = await isAIEnabled();
    if (!enabled) {
      return res.status(400).json({ 
        error: "AI features are not enabled",
        code: "AI_DISABLED" 
      });
    }

    const parsed = taskBreakdownSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        error: "Invalid request body", 
        details: parsed.error.issues 
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
      error: error.message || "Failed to generate task breakdown suggestions" 
    });
  }
});

const projectPlanSchema = z.object({
  projectName: z.string().min(1),
  projectDescription: z.string().optional(),
  clientName: z.string().optional(),
  teamSize: z.number().optional(),
});

router.post("/suggest/project-plan", requireAuth, async (req, res) => {
  try {
    const enabled = await isAIEnabled();
    if (!enabled) {
      return res.status(400).json({ 
        error: "AI features are not enabled",
        code: "AI_DISABLED" 
      });
    }

    const parsed = projectPlanSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        error: "Invalid request body", 
        details: parsed.error.issues 
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
      error: error.message || "Failed to generate project plan suggestions" 
    });
  }
});

const descriptionSchema = z.object({
  taskTitle: z.string().min(1),
  projectContext: z.string().optional(),
});

router.post("/suggest/task-description", requireAuth, async (req, res) => {
  try {
    const enabled = await isAIEnabled();
    if (!enabled) {
      return res.status(400).json({ 
        error: "AI features are not enabled",
        code: "AI_DISABLED" 
      });
    }

    const parsed = descriptionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        error: "Invalid request body", 
        details: parsed.error.issues 
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
      error: error.message || "Failed to generate task description" 
    });
  }
});

export default router;
