import { Router } from 'express';
import { requireSuperUser } from '../../../middleware/tenantContext';
import { db } from '../../../db';
import { sql } from 'drizzle-orm';

export const systemPurgeRouter = Router();

const PURGE_CONFIRM_PHRASE = "YES_PURGE_APP_DATA";

const TABLES_TO_PURGE = [
  "user_sessions",
  "task_comments",
  "task_attachments",
  "subtasks",
  "task_assignees",
  "task_tags",
  "time_entries",
  "activity_logs",
  "personal_task_sections",
  "tasks",
  "tags",
  "sections",
  "projects",
  "client_contacts",
  "clients",
  "team_members",
  "teams",
  "workspace_members",
  "workspaces",
  "invitations",
  "tenant_integrations",
  "tenant_settings",
  "users",
  "tenants",
] as const;

systemPurgeRouter.post("/system/purge-app-data", requireSuperUser, async (req, res) => {
  try {
    if (process.env.PURGE_APP_DATA_ALLOWED !== "true") {
      return res.status(403).json({
        error: "Purge not allowed",
        message: "PURGE_APP_DATA_ALLOWED environment variable must be set to 'true'",
      });
    }

    const isProduction = process.env.NODE_ENV === "production";
    const prodAllowed = process.env.PURGE_PROD_ALLOWED === "true";

    if (isProduction && !prodAllowed) {
      return res.status(403).json({
        error: "Purge not allowed in production",
        message: "PURGE_PROD_ALLOWED environment variable must be set to 'true' for production",
      });
    }

    const confirmHeader = req.headers["x-confirm-purge"];
    if (confirmHeader !== PURGE_CONFIRM_PHRASE) {
      return res.status(400).json({
        error: "Invalid confirmation",
        message: `X-Confirm-Purge header must be set to '${PURGE_CONFIRM_PHRASE}'`,
      });
    }

    console.log("[purge] Starting application data purge via API...");
    console.log(`[purge] Requested by user: ${(req.user!)?.email}`);

    const results: Array<{ table: string; rowsDeleted: number; status: string }> = [];
    let totalRowsDeleted = 0;

    for (const table of TABLES_TO_PURGE) {
      try {
        const tableExists = await db.execute(sql`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = ${table}
          ) as exists
        `);

        if (!(tableExists.rows[0] as { exists: boolean }).exists) {
          results.push({ table, rowsDeleted: 0, status: "skipped" });
          continue;
        }

        const countResult = await db.execute(sql.raw(`SELECT COUNT(*)::int as count FROM "${table}"`));
        const rowCount = (countResult.rows[0] as { count: number }).count;

        if (rowCount > 0) {
          await db.execute(sql.raw(`DELETE FROM "${table}"`));
        }

        results.push({ table, rowsDeleted: rowCount, status: "success" });
        totalRowsDeleted += rowCount;
      } catch (error) {
        results.push({ table, rowsDeleted: 0, status: "error" });
      }
    }

    console.log(`[purge] Purge complete. ${totalRowsDeleted} total rows deleted.`);

    res.json({
      success: true,
      message: "Application data purged successfully",
      summary: {
        tablesProcessed: results.length,
        totalRowsDeleted,
        results,
      },
    });
  } catch (error) {
    console.error("[purge] Purge failed:", error);
    res.status(500).json({ error: "Purge failed" });
  }
});
