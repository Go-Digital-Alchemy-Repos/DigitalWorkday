import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { hasTenantAdminAccess } from "@shared/roles";
import { AppError } from "../lib/errors";

export const reportRangeSchema = z.object({
  startDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  endDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  timezone: z.string().optional(),
  userIds: z.string().optional(),
  teamIds: z.string().optional(),
  clientIds: z.string().optional(),
  projectIds: z.string().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  page: z.coerce.number().int().min(1).optional().default(1),
  sortBy: z.string().optional(),
  sortDir: z.enum(["asc", "desc"]).optional().default("desc"),
});

export type ReportRangeParams = z.infer<typeof reportRangeSchema>;

const DEFAULT_RANGE_DAYS = 30;
const MAX_PRESET_RANGE_DAYS = 366;

export function parsePresetReportRangeDays(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d+)d$/);
  if (!match) return null;
  const days = Number(match[1]);
  if (!Number.isInteger(days) || days < 1 || days > MAX_PRESET_RANGE_DAYS) return null;
  return days;
}

export function parseReportRange(query: Record<string, unknown>): {
  startDate: Date;
  endDate: Date;
  params: ReportRangeParams;
} {
  const now = new Date();
  const presetDays = parsePresetReportRangeDays(query.range);
  const rangeDays = presetDays ?? DEFAULT_RANGE_DAYS;
  const defaultEnd = now.toISOString();
  const defaultStart = new Date(now.getTime() - rangeDays * 24 * 60 * 60 * 1000).toISOString();

  const raw = {
    ...query,
    startDate: presetDays ? defaultStart : query.startDate ?? defaultStart,
    endDate: presetDays ? defaultEnd : query.endDate ?? defaultEnd,
  };

  const parsed = reportRangeSchema.parse(raw);
  const startDate = new Date(parsed.startDate);
  const endDate = new Date(parsed.endDate);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    throw AppError.badRequest("Invalid date range");
  }
  if (startDate >= endDate) {
    throw AppError.badRequest("startDate must be before endDate");
  }

  return { startDate, endDate, params: parsed };
}

export function normalizeFilters(params: ReportRangeParams) {
  return {
    userIds: params.userIds ? params.userIds.split(",").filter(Boolean) : [],
    teamIds: params.teamIds ? params.teamIds.split(",").filter(Boolean) : [],
    clientIds: params.clientIds ? params.clientIds.split(",").filter(Boolean) : [],
    projectIds: params.projectIds ? params.projectIds.split(",").filter(Boolean) : [],
    statuses: params.status ? params.status.split(",").filter(Boolean) : [],
  };
}

export function safePagination(params: ReportRangeParams): { limit: number; offset: number; page: number } {
  const limit = Math.min(params.limit ?? 50, 200);
  const page = Math.max(params.page ?? 1, 1);
  const offset = (page - 1) * limit;
  return { limit, offset, page };
}

export function reportingGuard(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
    return next(AppError.unauthorized("Authentication required"));
  }
  const user = req.user as any;
  if (!hasTenantAdminAccess(user.role)) {
    return next(AppError.forbidden("Admin access required for reports"));
  }
  next();
}

export function getTenantId(req: Request): string {
  const user = req.user as any;
  const tenantId = (req as any).tenant?.effectiveTenantId || user?.tenantId;
  if (!tenantId) throw AppError.forbidden("No tenant context");
  return tenantId;
}

export function formatHours(seconds: number): number {
  return Math.round((seconds / 3600) * 10) / 10;
}

export function formatMinutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 10) / 10;
}
