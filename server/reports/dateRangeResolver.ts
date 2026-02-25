/**
 * DATE RANGE RESOLVER — Reporting Governance Layer
 *
 * Centralises all date-range decisions for V2 reporting endpoints.
 * All V2 endpoints should resolve ranges through this module to guarantee
 * consistent field usage across Employee CC, Client CC, and Workload V2.
 *
 * Canonical field mapping (enforced):
 *  - Task completion  → tasks.updated_at  WHERE status = 'done'
 *    (no dedicated completed_at column exists in the current schema)
 *  - Task creation    → tasks.created_at
 *  - Time entries     → time_entries.start_time
 *  - Due-date checks  → tasks.due_date
 *  - Inactivity       → GREATEST(tasks.updated_at, time_entries.start_time, comments.created_at)
 *
 * Timezone handling:
 *  - Caller may pass ?timezone=America/New_York (IANA name)
 *  - If absent, falls back to DEFAULT_TIMEZONE (UTC)
 *  - Dates are stored in UTC in the DB; timezone only affects display/grouping
 *
 * @module server/reports/dateRangeResolver
 */

import { parseReportRange, type ReportRangeParams } from "./utils";
import { AppError } from "../lib/errors";

export const DEFAULT_TIMEZONE = "UTC";
export const DEFAULT_RANGE_DAYS = 30;

/** Maximum allowed range to prevent runaway queries */
export const MAX_RANGE_DAYS = 366;

export interface ResolvedDateRange {
  startDate: Date;
  endDate: Date;
  timezone: string;
  daysInRange: number;
  params: ReportRangeParams;
}

/**
 * Canonical date fields used in SQL queries.
 * Import and reference these in V2 routers instead of bare strings.
 */
export const DateFields = {
  taskCompletion: "t.updated_at",
  taskCreation: "t.created_at",
  taskDue: "t.due_date",
  timeEntry: "te.start_time",
  commentCreation: "c.created_at",
  lastActivity: "GREATEST(t.updated_at, te.start_time)",
} as const;

/**
 * Resolve and validate a reporting date range from Express query params.
 * Wraps parseReportRange with governance rules:
 *  - Enforces max range cap (MAX_RANGE_DAYS)
 *  - Resolves and validates timezone
 *  - Computes daysInRange
 *
 * @param query  req.query cast to Record<string, unknown>
 */
export function resolveDateRange(query: Record<string, unknown>): ResolvedDateRange {
  const { startDate, endDate, params } = parseReportRange(query);

  const daysInRange = Math.max(
    Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1,
    1
  );

  if (daysInRange > MAX_RANGE_DAYS) {
    throw AppError.badRequest(
      `Date range too large: ${daysInRange} days requested, maximum is ${MAX_RANGE_DAYS}`
    );
  }

  const timezone = resolveTimezone(params.timezone);

  return { startDate, endDate, timezone, daysInRange, params };
}

/**
 * Resolve a timezone string to a valid IANA name.
 * Falls back to DEFAULT_TIMEZONE if invalid or absent.
 */
export function resolveTimezone(tz?: string): string {
  if (!tz) return DEFAULT_TIMEZONE;
  try {
    // Intl.DateTimeFormat throws on unknown timezone names
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/**
 * Compute daysInRange from two Date objects.
 * Minimum value is 1 (same-day ranges count as 1 day).
 */
export function computeDaysInRange(startDate: Date, endDate: Date): number {
  return Math.max(
    Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1,
    1
  );
}

/**
 * Compute available work hours for a range (8h/day).
 * Used as denominator for utilizationPct.
 * Returns null if daysInRange <= 0 to prevent division by zero.
 */
export function computeAvailableHours(daysInRange: number): number | null {
  if (daysInRange <= 0) return null;
  return daysInRange * 8;
}

/**
 * Build a standard weekly series array covering startDate→endDate.
 * Each entry has { weekStart: Date, weekEnd: Date, label: string }.
 * Used by capacity and trends endpoints.
 */
export function buildWeeklySeries(
  startDate: Date,
  endDate: Date
): Array<{ weekStart: Date; weekEnd: Date; label: string }> {
  const weeks: Array<{ weekStart: Date; weekEnd: Date; label: string }> = [];
  const cursor = new Date(startDate);

  // Align to Monday of the start week
  const dayOfWeek = cursor.getUTCDay(); // 0=Sun
  const offsetToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  cursor.setUTCDate(cursor.getUTCDate() + offsetToMonday);

  while (cursor <= endDate) {
    const weekStart = new Date(cursor);
    const weekEnd = new Date(cursor);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);

    weeks.push({
      weekStart,
      weekEnd: weekEnd > endDate ? endDate : weekEnd,
      label: weekStart.toISOString().split("T")[0],
    });

    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }

  return weeks;
}
