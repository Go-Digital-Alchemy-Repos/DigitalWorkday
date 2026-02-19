import { db } from "../db";
import { backgroundJobs, BackgroundJobStatus } from "@shared/schema";
import { eq, and, sql, desc, inArray, lte } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface JobProgress {
  current: number;
  total: number;
  phase?: string;
}

export interface JobHandler {
  (ctx: JobContext): Promise<void>;
}

export interface JobContext {
  jobId: string;
  tenantId: string;
  userId: string;
  payload: any;
  updateProgress: (progress: JobProgress) => Promise<void>;
  setResult: (result: any) => Promise<void>;
  isCancelled: () => Promise<boolean>;
}

interface HandlerRegistration {
  handler: JobHandler;
  concurrency: number;
}

const handlers = new Map<string, HandlerRegistration>();
const runningCounts = new Map<string, number>();
let pollInterval: ReturnType<typeof setInterval> | null = null;
let isRunning = false;
const POLL_INTERVAL_MS = 3000;
const LOCK_TIMEOUT_MS = 30 * 60 * 1000;
const INSTANCE_ID = randomUUID().slice(0, 8);

export function registerHandler(type: string, handler: JobHandler, concurrency = 1): void {
  handlers.set(type, { handler, concurrency });
  runningCounts.set(type, 0);
}

export async function enqueueJob(options: {
  tenantId: string;
  userId: string;
  type: string;
  payload: any;
  maxAttempts?: number;
}): Promise<string> {
  const { tenantId, userId, type, payload, maxAttempts = 1 } = options;

  if (!handlers.has(type)) {
    throw new Error(`No handler registered for job type: ${type}`);
  }

  const [job] = await db.insert(backgroundJobs).values({
    tenantId,
    createdByUserId: userId,
    type,
    status: BackgroundJobStatus.PENDING,
    payload,
    maxAttempts,
  }).returning({ id: backgroundJobs.id });

  console.log(`[jobs] Enqueued job ${job.id} type=${type} tenant=${tenantId}`);

  setImmediate(() => pollOnce().catch(() => {}));

  return job.id;
}

export async function getJobById(jobId: string): Promise<any | null> {
  const [job] = await db.select().from(backgroundJobs).where(eq(backgroundJobs.id, jobId)).limit(1);
  return job || null;
}

export async function getJobsByTenant(tenantId: string, options?: {
  type?: string;
  status?: string[];
  limit?: number;
}): Promise<any[]> {
  const conditions = [eq(backgroundJobs.tenantId, tenantId)];

  if (options?.type) {
    conditions.push(eq(backgroundJobs.type, options.type));
  }
  if (options?.status?.length) {
    conditions.push(inArray(backgroundJobs.status, options.status));
  }

  return db.select()
    .from(backgroundJobs)
    .where(and(...conditions))
    .orderBy(desc(backgroundJobs.createdAt))
    .limit(options?.limit || 50);
}

export async function cancelJob(jobId: string): Promise<boolean> {
  const result = await db.update(backgroundJobs)
    .set({
      status: BackgroundJobStatus.CANCELLED,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(
      eq(backgroundJobs.id, jobId),
      inArray(backgroundJobs.status, [BackgroundJobStatus.PENDING]),
    ))
    .returning({ id: backgroundJobs.id });

  return result.length > 0;
}

async function claimJob(): Promise<any | null> {
  for (const [type, reg] of handlers) {
    const running = runningCounts.get(type) || 0;
    if (running >= reg.concurrency) continue;

    const now = new Date();
    const staleLockCutoff = new Date(now.getTime() - LOCK_TIMEOUT_MS);

    const claimed = await claimSingleJob(type, BackgroundJobStatus.PENDING, now);
    if (claimed) {
      runningCounts.set(type, running + 1);
      return claimed;
    }

    const stale = await claimSingleJob(type, BackgroundJobStatus.RUNNING, now, staleLockCutoff);
    if (stale) {
      console.warn(`[jobs] Reclaimed stale job ${stale.id} type=${type}`);
      runningCounts.set(type, running + 1);
      return stale;
    }
  }

  return null;
}

async function claimSingleJob(
  type: string,
  status: string,
  now: Date,
  staleLockCutoff?: Date,
): Promise<any | null> {
  const lockCondition = staleLockCutoff
    ? sql`AND ${backgroundJobs.lockedAt} <= ${staleLockCutoff}`
    : sql``;

  const result = await db.execute(sql`
    UPDATE ${backgroundJobs}
    SET
      status = ${BackgroundJobStatus.RUNNING},
      locked_at = ${now},
      started_at = ${now},
      attempts = attempts + 1,
      updated_at = ${now}
    WHERE id = (
      SELECT id FROM ${backgroundJobs}
      WHERE type = ${type}
        AND status = ${status}
        ${lockCondition}
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `);

  const rows = (result as any).rows || result;
  return rows?.[0] || null;
}

async function executeJob(job: any): Promise<void> {
  const reg = handlers.get(job.type);
  if (!reg) {
    console.error(`[jobs] No handler for type=${job.type}, marking failed`);
    await db.update(backgroundJobs).set({
      status: BackgroundJobStatus.FAILED,
      error: `No handler registered for type: ${job.type}`,
      completedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(backgroundJobs.id, job.id));
    return;
  }

  const ctx: JobContext = {
    jobId: job.id,
    tenantId: job.tenantId,
    userId: job.createdByUserId,
    payload: job.payload,

    async updateProgress(progress: JobProgress) {
      await db.update(backgroundJobs).set({
        progress,
        updatedAt: new Date(),
      }).where(eq(backgroundJobs.id, job.id));
    },

    async setResult(result: any) {
      await db.update(backgroundJobs).set({
        result,
        updatedAt: new Date(),
      }).where(eq(backgroundJobs.id, job.id));
    },

    async isCancelled() {
      const [current] = await db.select({ status: backgroundJobs.status })
        .from(backgroundJobs)
        .where(eq(backgroundJobs.id, job.id))
        .limit(1);
      return current?.status === BackgroundJobStatus.CANCELLED;
    },
  };

  try {
    console.log(`[jobs] Executing job ${job.id} type=${job.type} attempt=${job.attempts}`);
    await reg.handler(ctx);

    const [current] = await db.select({ status: backgroundJobs.status })
      .from(backgroundJobs)
      .where(eq(backgroundJobs.id, job.id))
      .limit(1);

    if (current?.status === BackgroundJobStatus.CANCELLED) {
      console.log(`[jobs] Job ${job.id} was cancelled during execution`);
    } else {
      await db.update(backgroundJobs).set({
        status: BackgroundJobStatus.COMPLETED,
        completedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(backgroundJobs.id, job.id));
      console.log(`[jobs] Job ${job.id} completed successfully`);
    }
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    console.error(`[jobs] Job ${job.id} failed: ${errorMsg}`);

    const shouldRetry = job.attempts < job.maxAttempts;

    await db.update(backgroundJobs).set({
      status: shouldRetry ? BackgroundJobStatus.PENDING : BackgroundJobStatus.FAILED,
      error: errorMsg,
      lockedAt: null,
      completedAt: shouldRetry ? null : new Date(),
      updatedAt: new Date(),
    }).where(eq(backgroundJobs.id, job.id));

    if (shouldRetry) {
      console.log(`[jobs] Job ${job.id} will retry (attempt ${job.attempts}/${job.maxAttempts})`);
    }
  } finally {
    const count = runningCounts.get(job.type) || 0;
    runningCounts.set(job.type, Math.max(0, count - 1));
  }
}

async function pollOnce(): Promise<void> {
  if (!isRunning) return;

  try {
    const job = await claimJob();
    if (job) {
      executeJob(job).catch((err) => {
        console.error(`[jobs] Unhandled error in job execution:`, err);
      });
    }
  } catch (err) {
    console.error(`[jobs] Error polling for jobs:`, err);
  }
}

export function startJobQueue(): void {
  if (isRunning) return;
  isRunning = true;

  console.log(`[jobs] Starting job queue (instance=${INSTANCE_ID}, poll=${POLL_INTERVAL_MS}ms)`);
  console.log(`[jobs] Registered handlers: ${Array.from(handlers.entries()).map(([t, r]) => `${t}(concurrency=${r.concurrency})`).join(", ")}`);

  pollInterval = setInterval(() => pollOnce(), POLL_INTERVAL_MS);
  pollOnce().catch(() => {});
}

export async function stopJobQueue(): Promise<void> {
  if (!isRunning) return;
  isRunning = false;

  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }

  console.log(`[jobs] Job queue stopped (instance=${INSTANCE_ID})`);
}

export function getQueueStats(): { handlers: string[]; running: Record<string, number> } {
  const running: Record<string, number> = {};
  for (const [type, count] of runningCounts) {
    running[type] = count;
  }
  return {
    handlers: Array.from(handlers.keys()),
    running,
  };
}
