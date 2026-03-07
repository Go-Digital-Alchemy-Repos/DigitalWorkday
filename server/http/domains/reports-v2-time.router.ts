import { Router, Request, Response } from "express";
import { db } from "../../db";
import { sql } from "drizzle-orm";
import { handleRouteError } from "../../lib/errors";
import {
  parseReportRange,
  reportingGuard,
  getTenantId,
} from "../../reports/utils";
import {
  buildCacheKey,
  getCached,
  setCache,
  shouldBypassCache,
  setCacheHeaders,
} from "../../lib/reportCache";

const router = Router();

router.use(reportingGuard);

async function dbRows<T extends Record<string, unknown>>(
  q: Parameters<typeof db.execute>[0]
): Promise<T[]> {
  const result = await db.execute<T>(q);
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: T[] }).rows;
  }
  return result as unknown as T[];
}

function firstRow<T>(result: unknown): T | null {
  if (Array.isArray(result)) return (result[0] ?? null) as T | null;
  if (result && typeof result === "object" && "rows" in result) {
    return ((result as { rows: T[] }).rows[0] ?? null);
  }
  return null;
}

router.get("/time/summary", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { startDate, endDate } = parseReportRange(req.query as Record<string, unknown>);
    const bypass = shouldBypassCache(req.query as Record<string, unknown>);
    const cacheKey = buildCacheKey(tenantId, "time-summary", { startDate, endDate });

    if (!bypass) {
      const cached = getCached(cacheKey);
      if (cached) {
        setCacheHeaders(res, true);
        return res.json(cached);
      }
    }

    const days = Math.max(
      1,
      Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    );

    const row = firstRow<{
      total_seconds: string;
      in_scope_seconds: string;
      out_of_scope_seconds: string;
      active_users: string;
      active_projects: string;
      entry_count: string;
    }>(await db.execute(sql`
      SELECT
        COALESCE(SUM(duration_seconds), 0)::bigint AS total_seconds,
        COALESCE(SUM(duration_seconds) FILTER (WHERE scope = 'in_scope'), 0)::bigint AS in_scope_seconds,
        COALESCE(SUM(duration_seconds) FILTER (WHERE scope != 'in_scope'), 0)::bigint AS out_of_scope_seconds,
        COUNT(DISTINCT user_id)::int AS active_users,
        COUNT(DISTINCT project_id)::int AS active_projects,
        COUNT(id)::int AS entry_count
      FROM time_entries
      WHERE tenant_id = ${tenantId}
        AND start_time >= ${startDate.toISOString()}::timestamptz
        AND start_time <= ${endDate.toISOString()}::timestamptz
    `));

    const totalSeconds = parseInt(row?.total_seconds ?? "0", 10);
    const inScopeSeconds = parseInt(row?.in_scope_seconds ?? "0", 10);
    const outOfScopeSeconds = parseInt(row?.out_of_scope_seconds ?? "0", 10);
    const activeUsers = parseInt(row?.active_users ?? "0", 10);
    const activeProjects = parseInt(row?.active_projects ?? "0", 10);
    const entryCount = parseInt(row?.entry_count ?? "0", 10);

    const payload = {
      totalSeconds,
      totalHours: parseFloat((totalSeconds / 3600).toFixed(2)),
      inScopeSeconds,
      inScopeHours: parseFloat((inScopeSeconds / 3600).toFixed(2)),
      outOfScopeSeconds,
      outOfScopeHours: parseFloat((outOfScopeSeconds / 3600).toFixed(2)),
      billablePct: totalSeconds > 0 ? parseFloat(((inScopeSeconds / totalSeconds) * 100).toFixed(1)) : 0,
      avgHoursPerDay: parseFloat((totalSeconds / 3600 / days).toFixed(2)),
      activeUsers,
      activeProjects,
      entryCount,
    };

    setCache(cacheKey, payload);
    setCacheHeaders(res, false);
    return res.json(payload);
  } catch (err) {
    return handleRouteError(res, err, "GET /time/summary");
  }
});

router.get("/time/by-project", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { startDate, endDate } = parseReportRange(req.query as Record<string, unknown>);
    const bypass = shouldBypassCache(req.query as Record<string, unknown>);
    const cacheKey = buildCacheKey(tenantId, "time-by-project", { startDate, endDate });

    if (!bypass) {
      const cached = getCached(cacheKey);
      if (cached) {
        setCacheHeaders(res, true);
        return res.json(cached);
      }
    }

    const rows = await dbRows<{
      project_id: string | null;
      project_name: string;
      project_color: string | null;
      total_seconds: string;
      in_scope_seconds: string;
      out_of_scope_seconds: string;
      active_users: string;
      entry_count: string;
    }>(sql`
      SELECT
        te.project_id,
        COALESCE(p.name, '(No Project)') AS project_name,
        p.color AS project_color,
        SUM(te.duration_seconds)::bigint AS total_seconds,
        SUM(te.duration_seconds) FILTER (WHERE te.scope = 'in_scope')::bigint AS in_scope_seconds,
        SUM(te.duration_seconds) FILTER (WHERE te.scope != 'in_scope')::bigint AS out_of_scope_seconds,
        COUNT(DISTINCT te.user_id)::int AS active_users,
        COUNT(te.id)::int AS entry_count
      FROM time_entries te
      LEFT JOIN projects p ON p.id = te.project_id
      WHERE te.tenant_id = ${tenantId}
        AND te.start_time >= ${startDate.toISOString()}::timestamptz
        AND te.start_time <= ${endDate.toISOString()}::timestamptz
      GROUP BY te.project_id, p.name, p.color
      ORDER BY total_seconds DESC
      LIMIT 20
    `);

    const payload = rows.map((r) => {
      const total = parseInt(r.total_seconds ?? "0", 10);
      const inScope = parseInt(r.in_scope_seconds ?? "0", 10);
      return {
        projectId: r.project_id,
        projectName: r.project_name,
        projectColor: r.project_color ?? "#6366F1",
        totalSeconds: total,
        totalHours: parseFloat((total / 3600).toFixed(2)),
        inScopeSeconds: inScope,
        inScopeHours: parseFloat((inScope / 3600).toFixed(2)),
        outOfScopeSeconds: parseInt(r.out_of_scope_seconds ?? "0", 10),
        billablePct: total > 0 ? parseFloat(((inScope / total) * 100).toFixed(1)) : 0,
        activeUsers: parseInt(r.active_users ?? "0", 10),
        entryCount: parseInt(r.entry_count ?? "0", 10),
      };
    });

    setCache(cacheKey, payload);
    setCacheHeaders(res, false);
    return res.json(payload);
  } catch (err) {
    return handleRouteError(res, err, "GET /time/by-project");
  }
});

router.get("/time/by-user", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { startDate, endDate } = parseReportRange(req.query as Record<string, unknown>);
    const bypass = shouldBypassCache(req.query as Record<string, unknown>);
    const cacheKey = buildCacheKey(tenantId, "time-by-user", { startDate, endDate });

    if (!bypass) {
      const cached = getCached(cacheKey);
      if (cached) {
        setCacheHeaders(res, true);
        return res.json(cached);
      }
    }

    const rows = await dbRows<{
      user_id: string;
      user_name: string;
      user_email: string;
      total_seconds: string;
      in_scope_seconds: string;
      out_of_scope_seconds: string;
      active_projects: string;
      entry_count: string;
    }>(sql`
      SELECT
        te.user_id,
        COALESCE(u.name, u.email, 'Unknown') AS user_name,
        COALESCE(u.email, '') AS user_email,
        SUM(te.duration_seconds)::bigint AS total_seconds,
        SUM(te.duration_seconds) FILTER (WHERE te.scope = 'in_scope')::bigint AS in_scope_seconds,
        SUM(te.duration_seconds) FILTER (WHERE te.scope != 'in_scope')::bigint AS out_of_scope_seconds,
        COUNT(DISTINCT te.project_id)::int AS active_projects,
        COUNT(te.id)::int AS entry_count
      FROM time_entries te
      JOIN users u ON u.id = te.user_id
      WHERE te.tenant_id = ${tenantId}
        AND te.start_time >= ${startDate.toISOString()}::timestamptz
        AND te.start_time <= ${endDate.toISOString()}::timestamptz
      GROUP BY te.user_id, u.name, u.email
      ORDER BY total_seconds DESC
    `);

    const payload = rows.map((r) => {
      const total = parseInt(r.total_seconds ?? "0", 10);
      const inScope = parseInt(r.in_scope_seconds ?? "0", 10);
      return {
        userId: r.user_id,
        userName: r.user_name,
        userEmail: r.user_email,
        totalSeconds: total,
        totalHours: parseFloat((total / 3600).toFixed(2)),
        inScopeSeconds: inScope,
        inScopeHours: parseFloat((inScope / 3600).toFixed(2)),
        outOfScopeSeconds: parseInt(r.out_of_scope_seconds ?? "0", 10),
        billablePct: total > 0 ? parseFloat(((inScope / total) * 100).toFixed(1)) : 0,
        activeProjects: parseInt(r.active_projects ?? "0", 10),
        entryCount: parseInt(r.entry_count ?? "0", 10),
      };
    });

    setCache(cacheKey, payload);
    setCacheHeaders(res, false);
    return res.json(payload);
  } catch (err) {
    return handleRouteError(res, err, "GET /time/by-user");
  }
});

router.get("/time/trend", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { startDate, endDate } = parseReportRange(req.query as Record<string, unknown>);
    const bypass = shouldBypassCache(req.query as Record<string, unknown>);
    const cacheKey = buildCacheKey(tenantId, "time-trend", { startDate, endDate });

    if (!bypass) {
      const cached = getCached(cacheKey);
      if (cached) {
        setCacheHeaders(res, true);
        return res.json(cached);
      }
    }

    const rows = await dbRows<{
      day: string;
      total_seconds: string;
      in_scope_seconds: string;
      entry_count: string;
    }>(sql`
      SELECT
        gs.day::date AS day,
        COALESCE(SUM(te.duration_seconds), 0)::bigint AS total_seconds,
        COALESCE(SUM(te.duration_seconds) FILTER (WHERE te.scope = 'in_scope'), 0)::bigint AS in_scope_seconds,
        COUNT(te.id)::int AS entry_count
      FROM generate_series(
        ${startDate.toISOString()}::timestamptz,
        ${endDate.toISOString()}::timestamptz,
        '1 day'::interval
      ) AS gs(day)
      LEFT JOIN time_entries te
        ON te.tenant_id = ${tenantId}
        AND te.start_time >= gs.day
        AND te.start_time < gs.day + INTERVAL '1 day'
      GROUP BY gs.day
      ORDER BY gs.day ASC
    `);

    const payload = rows.map((r) => ({
      date: r.day,
      totalSeconds: parseInt(r.total_seconds ?? "0", 10),
      totalHours: parseFloat((parseInt(r.total_seconds ?? "0", 10) / 3600).toFixed(2)),
      inScopeSeconds: parseInt(r.in_scope_seconds ?? "0", 10),
      inScopeHours: parseFloat((parseInt(r.in_scope_seconds ?? "0", 10) / 3600).toFixed(2)),
      entryCount: parseInt(r.entry_count ?? "0", 10),
    }));

    setCache(cacheKey, payload);
    setCacheHeaders(res, false);
    return res.json(payload);
  } catch (err) {
    return handleRouteError(res, err, "GET /time/trend");
  }
});

export default router;
