import { Router, type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db";
import { handleRouteError } from "../../lib/errors";
import { getDeliveryOperationsReport, getPeopleCapacityReport } from "../../reports/reportingV3";
import { getTenantId, parseReportRange, reportingGuard, safePagination } from "../../reports/utils";

const router = Router();
router.use(reportingGuard);

function rangeFor(req: Request) {
  return parseReportRange(req.query as Record<string, unknown>);
}

router.get("/home", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { startDate, endDate } = rangeFor(req);
    const [delivery, people] = await Promise.all([
      getDeliveryOperationsReport({ tenantId, startDate, endDate }),
      getPeopleCapacityReport({ tenantId, startDate, endDate }),
    ]);
    res.json({
      metadata: delivery.metadata,
      delivery: delivery.snapshot,
      people: people.summary,
      attentionQueue: delivery.attentionQueue.slice(0, 12),
      coverage: { ...delivery.coverage, estimatePct: people.summary.estimateCoveragePct },
    });
  } catch (error) {
    handleRouteError(res, error, "reports-v3/home", req);
  }
});

router.get("/delivery", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { startDate, endDate } = rangeFor(req);
    res.json(await getDeliveryOperationsReport({ tenantId, startDate, endDate }));
  } catch (error) {
    handleRouteError(res, error, "reports-v3/delivery", req);
  }
});

router.get("/people", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { startDate, endDate } = rangeFor(req);
    res.json(await getPeopleCapacityReport({ tenantId, startDate, endDate }));
  } catch (error) {
    handleRouteError(res, error, "reports-v3/people", req);
  }
});

const capacitySchema = z.object({ weeklyCapacityHours: z.coerce.number().min(1).max(100) });
const capacityExceptionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  availableHours: z.coerce.number().min(0).max(24),
  note: z.string().trim().max(200).optional(),
});

router.patch("/people/:userId/capacity", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { weeklyCapacityHours } = capacitySchema.parse(req.body);
    const weeklyCapacityMinutes = Math.round(weeklyCapacityHours * 60);
    const result = await db.execute(sql`
      UPDATE workspace_members wm
      SET weekly_capacity_minutes = ${weeklyCapacityMinutes}
      FROM workspaces w
      WHERE wm.workspace_id = w.id
        AND w.tenant_id = ${tenantId}
        AND wm.user_id = ${req.params.userId}
      RETURNING wm.user_id
    `);
    const updated = Array.isArray(result) ? result : (result as unknown as { rows?: unknown[] }).rows ?? [];
    if (updated.length === 0) return res.status(404).json({ message: "Workspace member not found" });
    res.json({ userId: req.params.userId, weeklyCapacityHours });
  } catch (error) {
    handleRouteError(res, error, "reports-v3/people/:userId/capacity", req);
  }
});

router.put("/people/:userId/capacity-exceptions", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const input = capacityExceptionSchema.parse(req.body);
    const result = await db.execute(sql`
      INSERT INTO member_capacity_exceptions (tenant_id, user_id, capacity_date, available_minutes, note)
      SELECT ${tenantId}, u.id, ${input.date}::date, ${Math.round(input.availableHours * 60)}, ${input.note ?? null}
      FROM users u
      WHERE u.id = ${req.params.userId} AND u.tenant_id = ${tenantId}
      ON CONFLICT (tenant_id, user_id, capacity_date)
      DO UPDATE SET available_minutes = EXCLUDED.available_minutes, note = EXCLUDED.note
      RETURNING id
    `);
    const updated = Array.isArray(result) ? result : (result as unknown as { rows?: unknown[] }).rows ?? [];
    if (updated.length === 0) return res.status(404).json({ message: "Employee not found" });
    res.json({ userId: req.params.userId, ...input });
  } catch (error) {
    handleRouteError(res, error, "reports-v3/people/:userId/capacity-exceptions", req);
  }
});

router.delete("/people/:userId/capacity-exceptions/:date", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { date } = capacityExceptionSchema.pick({ date: true }).parse({ date: req.params.date });
    await db.execute(sql`
      DELETE FROM member_capacity_exceptions
      WHERE tenant_id = ${tenantId} AND user_id = ${req.params.userId} AND capacity_date = ${date}::date
    `);
    res.status(204).send();
  } catch (error) {
    handleRouteError(res, error, "reports-v3/people/:userId/capacity-exceptions/:date", req);
  }
});

const savedViewSchema = z.object({
  workspace: z.enum(["home", "delivery", "people", "clients"]),
  name: z.string().trim().min(1).max(80),
  query: z.string().max(2000),
  isShared: z.boolean().default(false),
});

router.get("/saved-views", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = (req.user as any).id as string;
    const workspace = savedViewSchema.shape.workspace.parse(req.query.workspace);
    const result = await db.execute(sql`
      SELECT id, name, workspace, query, is_shared AS "isShared", user_id AS "userId", created_at AS "createdAt"
      FROM report_saved_views
      WHERE tenant_id = ${tenantId} AND workspace = ${workspace}
        AND (user_id = ${userId} OR is_shared = true)
      ORDER BY is_shared DESC, name ASC
    `);
    res.json(Array.isArray(result) ? result : (result as unknown as { rows?: unknown[] }).rows ?? []);
  } catch (error) {
    handleRouteError(res, error, "reports-v3/saved-views", req);
  }
});

router.post("/saved-views", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = (req.user as any).id as string;
    const input = savedViewSchema.parse(req.body);
    const result = await db.execute(sql`
      INSERT INTO report_saved_views (tenant_id, user_id, workspace, name, query, is_shared)
      VALUES (${tenantId}, ${userId}, ${input.workspace}, ${input.name}, ${input.query}, ${input.isShared})
      ON CONFLICT (tenant_id, user_id, workspace, name)
      DO UPDATE SET query = EXCLUDED.query, is_shared = EXCLUDED.is_shared, updated_at = NOW()
      RETURNING id, name, workspace, query, is_shared AS "isShared", user_id AS "userId"
    `);
    const saved = Array.isArray(result) ? result[0] : (result as unknown as { rows?: unknown[] }).rows?.[0];
    res.status(201).json(saved);
  } catch (error) {
    handleRouteError(res, error, "reports-v3/saved-views", req);
  }
});

router.delete("/saved-views/:viewId", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = (req.user as any).id as string;
    await db.execute(sql`DELETE FROM report_saved_views WHERE id = ${req.params.viewId} AND tenant_id = ${tenantId} AND user_id = ${userId}`);
    res.status(204).send();
  } catch (error) {
    handleRouteError(res, error, "reports-v3/saved-views/:viewId", req);
  }
});

const detailResources = new Set(["projects", "tasks", "time-entries", "employees"]);
const taskMetrics = new Set(["all", "open", "overdue", "blocked", "unassigned", "completed"]);

router.get("/details/:resource", async (req: Request, res: Response) => {
  try {
    const resource = req.params.resource;
    if (!detailResources.has(resource)) return res.status(404).json({ message: "Unknown report resource" });
    const tenantId = getTenantId(req);
    const { startDate, endDate, params } = rangeFor(req);
    const { limit, offset, page } = safePagination(params);

    if (resource === "projects") {
      const report = await getDeliveryOperationsReport({ tenantId, startDate, endDate });
      const metric = String(req.query.metric ?? "all");
      const filtered = report.projects.filter((project) => {
        if (metric === "at_risk") return project.riskReasons.length > 0;
        if (metric === "overdue") return project.overdueTasks > 0;
        if (metric === "stale") return (project.inactivityDays ?? 0) >= 14;
        return true;
      });
      return res.json({ metadata: report.metadata, page, total: filtered.length, rows: filtered.slice(offset, offset + limit) });
    }

    if (resource === "employees") {
      const report = await getPeopleCapacityReport({ tenantId, startDate, endDate });
      const metric = String(req.query.metric ?? "all");
      const filtered = report.people.filter((person) => {
        if (metric === "overloaded") return person.loadState === "overloaded";
        if (metric === "overdue") return person.overdueTasks > 0;
        if (metric === "underallocated") return person.loadState === "underallocated";
        return true;
      });
      return res.json({ metadata: report.metadata, page, total: filtered.length, rows: filtered.slice(offset, offset + limit) });
    }

    if (resource === "tasks") {
      const metric = taskMetrics.has(String(req.query.metric)) ? String(req.query.metric) : "all";
      const projectId = typeof req.query.projectId === "string" ? req.query.projectId : null;
      const clientId = typeof req.query.clientId === "string" ? req.query.clientId : null;
      const metricClause = metric === "open" ? sql`AND t.status NOT IN ('done','cancelled')`
        : metric === "overdue" ? sql`AND t.status NOT IN ('done','cancelled') AND t.due_date < ${endDate}`
        : metric === "blocked" ? sql`AND t.status = 'blocked'`
        : metric === "completed" ? sql`AND EXISTS (
            SELECT 1 FROM task_status_history tsh
            WHERE tsh.task_id = t.id AND tsh.tenant_id = ${tenantId} AND tsh.to_status = 'done'
              AND tsh.changed_at BETWEEN ${startDate} AND ${endDate}
          )`
        : metric === "unassigned" ? sql`AND t.status NOT IN ('done','cancelled') AND NOT EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.tenant_id = ${tenantId})`
        : sql``;
      const result = await db.execute(sql`
        SELECT t.id, t.title, t.status, t.priority, t.start_date AS "startDate", t.due_date AS "dueDate",
          t.estimate_minutes AS "estimateMinutes", p.id AS "projectId", p.name AS "projectName",
          c.id AS "clientId", c.company_name AS "clientName",
          (SELECT COUNT(*) FROM task_assignees ta WHERE ta.task_id = t.id AND ta.tenant_id = ${tenantId})::int AS "assigneeCount"
        FROM tasks t
        LEFT JOIN projects p ON p.id = t.project_id AND p.tenant_id = ${tenantId}
        LEFT JOIN clients c ON c.id = p.client_id AND c.tenant_id = ${tenantId}
        WHERE t.tenant_id = ${tenantId} AND t.archived_at IS NULL
          ${metricClause}
          ${projectId ? sql`AND p.id = ${projectId}` : sql``}
          ${clientId ? sql`AND c.id = ${clientId}` : sql``}
        ORDER BY t.due_date ASC NULLS LAST, t.updated_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `);
      const resultRows = Array.isArray(result) ? result : (result as unknown as { rows?: unknown[] }).rows ?? [];
      return res.json({ page, rows: resultRows, hasMore: resultRows.length === limit });
    }

    const userId = typeof req.query.userId === "string" ? req.query.userId : null;
    const projectId = typeof req.query.projectId === "string" ? req.query.projectId : null;
    const result = await db.execute(sql`
      SELECT te.id, te.title, te.start_time AS "startTime", te.duration_seconds AS "durationSeconds", te.scope,
        p.id AS "projectId", p.name AS "projectName", t.id AS "taskId", t.title AS "taskTitle",
        u.id AS "userId", COALESCE(NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''), u.email) AS "userName"
      FROM time_entries te
      LEFT JOIN projects p ON p.id = te.project_id AND p.tenant_id = ${tenantId}
      LEFT JOIN tasks t ON t.id = te.task_id AND t.tenant_id = ${tenantId}
      JOIN users u ON u.id = te.user_id AND u.tenant_id = ${tenantId}
      WHERE te.tenant_id = ${tenantId} AND te.start_time BETWEEN ${startDate} AND ${endDate}
        ${userId ? sql`AND te.user_id = ${userId}` : sql``}
        ${projectId ? sql`AND te.project_id = ${projectId}` : sql``}
      ORDER BY te.start_time DESC
      LIMIT ${limit} OFFSET ${offset}
    `);
    const resultRows = Array.isArray(result) ? result : (result as unknown as { rows?: unknown[] }).rows ?? [];
    res.json({ page, rows: resultRows, hasMore: resultRows.length === limit });
  } catch (error) {
    handleRouteError(res, error, "reports-v3/details/:resource", req);
  }
});

export default router;
