import { Router } from "express";
import { getJobById, getJobsByTenant, cancelJob, getQueueStats } from "./queue";

export const jobsRouter = Router();

jobsRouter.get("/v1/jobs", async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Not authenticated" });

    const tenantId = user.tenantId;
    if (!tenantId) return res.status(400).json({ error: "No tenant context" });

    const { type, status, limit } = req.query;

    const jobs = await getJobsByTenant(tenantId, {
      type: type as string | undefined,
      status: status ? (status as string).split(",") : undefined,
      limit: limit ? parseInt(limit as string, 10) : 50,
    });

    res.json({
      jobs: jobs.map(formatJobDTO),
    });
  } catch (error: any) {
    console.error("[jobs-api] List jobs failed:", error);
    res.status(500).json({ error: "Failed to list jobs" });
  }
});

jobsRouter.get("/v1/jobs/:jobId", async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Not authenticated" });

    const job = await getJobById(req.params.jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });

    if (job.tenantId !== user.tenantId && user.role !== "super_user") {
      return res.status(403).json({ error: "Access denied" });
    }

    res.json(formatJobDTO(job));
  } catch (error: any) {
    console.error("[jobs-api] Get job failed:", error);
    res.status(500).json({ error: "Failed to get job" });
  }
});

jobsRouter.post("/v1/jobs/:jobId/cancel", async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Not authenticated" });

    const job = await getJobById(req.params.jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });

    if (job.tenantId !== user.tenantId && user.role !== "super_user") {
      return res.status(403).json({ error: "Access denied" });
    }

    const cancelled = await cancelJob(req.params.jobId);
    if (!cancelled) {
      return res.status(409).json({ error: "Job cannot be cancelled (may already be running or completed)" });
    }

    res.json({ cancelled: true });
  } catch (error: any) {
    console.error("[jobs-api] Cancel job failed:", error);
    res.status(500).json({ error: "Failed to cancel job" });
  }
});

jobsRouter.get("/v1/jobs-queue/stats", async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Not authenticated" });

    if (user.role !== "super_user") {
      return res.status(403).json({ error: "Super user access required" });
    }

    const stats = getQueueStats();
    res.json(stats);
  } catch (error: any) {
    console.error("[jobs-api] Queue stats failed:", error);
    res.status(500).json({ error: "Failed to get queue stats" });
  }
});

function formatJobDTO(job: any) {
  return {
    id: job.id,
    tenantId: job.tenantId,
    type: job.type,
    status: job.status,
    progress: job.progress,
    result: job.result,
    error: job.error,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    createdAt: job.createdAt?.toISOString?.() || job.createdAt,
    startedAt: job.startedAt?.toISOString?.() || job.startedAt,
    completedAt: job.completedAt?.toISOString?.() || job.completedAt,
    updatedAt: job.updatedAt?.toISOString?.() || job.updatedAt,
  };
}
