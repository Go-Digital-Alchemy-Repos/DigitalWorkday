import { randomUUID } from "crypto";
import type { EntityType, ColumnMapping, ValidationSummary, ImportSummary, ImportJobDTO } from "../../shared/imports/fieldCatalog";

export interface ImportJob {
  id: string;
  tenantId: string;
  createdByUserId: string;
  entityType: EntityType;
  status: "draft" | "validated" | "running" | "completed" | "failed";
  createdAt: Date;
  updatedAt: Date;
  fileName?: string;
  rawRows: Record<string, string>[];
  columns: string[];
  sampleRows: Record<string, string>[];
  mapping: ColumnMapping[];
  validationSummary?: ValidationSummary;
  importSummary?: ImportSummary;
  progress?: { processed: number; total: number };
  errorRows?: Array<{ row: number; primaryKey: string; errorCode: string; message: string }>;
}

const jobs = new Map<string, ImportJob>();
const JOB_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_JOBS_PER_TENANT = 50;

function cleanupExpired() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt.getTime() > JOB_TTL_MS) {
      jobs.delete(id);
    }
  }
}

export function createJob(tenantId: string, createdByUserId: string, entityType: EntityType): ImportJob {
  cleanupExpired();

  const tenantJobs: ImportJob[] = [];
  for (const job of jobs.values()) {
    if (job.tenantId === tenantId) tenantJobs.push(job);
  }
  if (tenantJobs.length >= MAX_JOBS_PER_TENANT) {
    tenantJobs.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    for (let i = 0; i <= tenantJobs.length - MAX_JOBS_PER_TENANT; i++) {
      jobs.delete(tenantJobs[i].id);
    }
  }

  const id = randomUUID();
  const now = new Date();
  const job: ImportJob = {
    id,
    tenantId,
    createdByUserId,
    entityType,
    status: "draft",
    createdAt: now,
    updatedAt: now,
    rawRows: [],
    columns: [],
    sampleRows: [],
    mapping: [],
  };
  jobs.set(id, job);
  return job;
}

export function getJob(jobId: string): ImportJob | undefined {
  return jobs.get(jobId);
}

export function getJobsForTenant(tenantId: string, limit = 20): ImportJob[] {
  const tenantJobs: ImportJob[] = [];
  for (const job of jobs.values()) {
    if (job.tenantId === tenantId) {
      tenantJobs.push(job);
    }
  }
  return tenantJobs
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
}

export function updateJob(jobId: string, updates: Partial<ImportJob>): ImportJob | undefined {
  const job = jobs.get(jobId);
  if (!job) return undefined;
  Object.assign(job, updates, { updatedAt: new Date() });
  return job;
}

export function deleteJob(jobId: string): boolean {
  return jobs.delete(jobId);
}

export function jobToDTO(job: ImportJob): ImportJobDTO {
  return {
    id: job.id,
    tenantId: job.tenantId,
    entityType: job.entityType,
    status: job.status,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    fileName: job.fileName,
    rowCount: job.rawRows.length,
    columns: job.columns,
    sampleRows: job.sampleRows,
    mapping: job.mapping,
    validationSummary: job.validationSummary,
    importSummary: job.importSummary,
  };
}
