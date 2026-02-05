/**
 * Super Admin Chat Export Routes
 * 
 * API endpoints for managing chat data exports before purge operations.
 * Only accessible by Super Admins.
 */
import { Router, Request, Response, NextFunction } from "express";
import { storage } from "../../storage";
import { startChatExport } from "../../services/chatExport.service";
import { createPresignedDownloadUrl, isR2Configured } from "../../s3";
import { z } from "zod";
import { UserRole } from "@shared/schema";

const router = Router();

function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== UserRole.SUPER_USER) {
    return res.status(403).json({ error: "Super Admin access required" });
  }
  next();
}

router.use(requireSuperAdmin);

const createExportSchema = z.object({
  scopeType: z.enum(["tenant", "all"]),
  tenantId: z.string().optional(),
  cutoffType: z.enum(["date", "retention"]),
  cutoffDate: z.string().datetime().optional(),
  retainDays: z.number().int().positive().optional(),
  includeAttachmentFiles: z.boolean().optional(),
});

router.post("/exports", async (req: Request, res: Response) => {
  try {
    if (!isR2Configured()) {
      return res.status(503).json({ error: "Cloudflare R2 storage is not configured" });
    }

    const parsed = createExportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    }

    const { scopeType, tenantId, cutoffType, cutoffDate, retainDays, includeAttachmentFiles } = parsed.data;

    if (scopeType === "tenant" && !tenantId) {
      return res.status(400).json({ error: "tenantId is required when scopeType is 'tenant'" });
    }

    if (cutoffType === "date" && !cutoffDate) {
      return res.status(400).json({ error: "cutoffDate is required when cutoffType is 'date'" });
    }

    if (cutoffType === "retention" && !retainDays) {
      return res.status(400).json({ error: "retainDays is required when cutoffType is 'retention'" });
    }

    const job = await startChatExport(req.user!.id, {
      scopeType,
      tenantId,
      cutoffType,
      cutoffDate: cutoffDate ? new Date(cutoffDate) : undefined,
      retainDays,
      includeAttachmentFiles,
    });

    res.status(201).json({
      success: true,
      job: {
        id: job.id,
        status: job.status,
        scopeType: job.scopeType,
        tenantId: job.tenantId,
        cutoffType: job.cutoffType,
        cutoffDate: job.cutoffDate,
        retainDays: job.retainDays,
        createdAt: job.createdAt,
      },
    });
  } catch (error: any) {
    console.error("[chatExport] Error creating export job:", error);
    res.status(500).json({ error: "Failed to create export job", details: error?.message });
  }
});

router.get("/exports", async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

    const jobs = await storage.listChatExportJobs({ status, limit });

    res.json({
      success: true,
      jobs: jobs.map((job) => ({
        id: job.id,
        status: job.status,
        scopeType: job.scopeType,
        tenantId: job.tenantId,
        cutoffType: job.cutoffType,
        cutoffDate: job.cutoffDate,
        retainDays: job.retainDays,
        progress: job.progress,
        outputLocation: job.outputLocation,
        error: job.error,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        createdAt: job.createdAt,
      })),
    });
  } catch (error: any) {
    console.error("[chatExport] Error listing export jobs:", error);
    res.status(500).json({ error: "Failed to list export jobs", details: error?.message });
  }
});

router.get("/exports/:id", async (req: Request, res: Response) => {
  try {
    const job = await storage.getChatExportJob(req.params.id);
    if (!job) {
      return res.status(404).json({ error: "Export job not found" });
    }

    res.json({
      success: true,
      job: {
        id: job.id,
        status: job.status,
        scopeType: job.scopeType,
        tenantId: job.tenantId,
        cutoffType: job.cutoffType,
        cutoffDate: job.cutoffDate,
        retainDays: job.retainDays,
        includeAttachmentFiles: job.includeAttachmentFiles,
        format: job.format,
        progress: job.progress,
        outputLocation: job.outputLocation,
        error: job.error,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      },
    });
  } catch (error: any) {
    console.error("[chatExport] Error getting export job:", error);
    res.status(500).json({ error: "Failed to get export job", details: error?.message });
  }
});

router.get("/exports/:id/download", async (req: Request, res: Response) => {
  try {
    const job = await storage.getChatExportJob(req.params.id);
    if (!job) {
      return res.status(404).json({ error: "Export job not found" });
    }

    if (job.status !== "completed") {
      return res.status(400).json({ error: "Export is not yet complete", status: job.status });
    }

    const outputLocation = job.outputLocation as { bucket: string; key: string } | null;
    if (!outputLocation?.key) {
      return res.status(500).json({ error: "Export file location not found" });
    }

    const downloadUrl = await createPresignedDownloadUrl(outputLocation.key, job.tenantId);

    res.json({
      success: true,
      downloadUrl,
      expiresIn: 300,
    });
  } catch (error: any) {
    console.error("[chatExport] Error generating download URL:", error);
    res.status(500).json({ error: "Failed to generate download URL", details: error?.message });
  }
});

export default router;
