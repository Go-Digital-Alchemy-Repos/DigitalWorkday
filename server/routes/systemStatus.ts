import { Router, Request, Response } from "express";
import { requireSuperUser } from "../middleware/tenantContext";
import { requireAuth } from "../auth";
import { db } from "../db";
import { sql, isNull } from "drizzle-orm";
import { 
  clients, projects, tasks, teams, users, 
  timeEntries, activeTimers, appSettings
} from "@shared/schema";
import { isS3Configured, testS3Presign } from "../s3";

const router = Router();

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

interface OrphanCounts {
  totalMissing: number;
  totalQuarantined: number;
  byTable: Record<string, number>;
}

async function getOrphanCounts(): Promise<OrphanCounts> {
  const tables = [
    { name: "clients", table: clients },
    { name: "projects", table: projects },
    { name: "tasks", table: tasks },
    { name: "teams", table: teams },
    { name: "users", table: users },
    { name: "time_entries", table: timeEntries },
    { name: "active_timers", table: activeTimers },
    { name: "app_settings", table: appSettings },
  ];

  const byTable: Record<string, number> = {};
  let totalMissing = 0;

  for (const { name, table } of tables) {
    try {
      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(table)
        .where(isNull((table as any).tenantId));
      
      const count = countResult[0]?.count || 0;
      byTable[name] = count;
      totalMissing += count;
    } catch {
      byTable[name] = -1;
    }
  }

  return {
    totalMissing,
    totalQuarantined: 0,
    byTable,
  };
}

router.get("/summary", requireAuth, requireSuperUser, async (req: Request, res: Response) => {
  const requestId = generateRequestId();
  
  try {
    const checks: Record<string, any> = {};
    
    let dbStatus: "ok" | "failed" = "failed";
    let dbLatencyMs = 0;
    let dbError: string | undefined;
    
    try {
      const dbStart = Date.now();
      await db.execute(sql`SELECT 1`);
      dbLatencyMs = Date.now() - dbStart;
      dbStatus = "ok";
    } catch (e: any) {
      dbError = e.message || "Database connection failed";
      console.error("[status/summary] Database check failed:", e);
    }
    
    checks.db = {
      status: dbStatus,
      latencyMs: dbLatencyMs,
      ...(dbError && { error: dbError, requestId }),
    };

    let migrationsVersion: string | null = null;
    try {
      const migrationResult = await db.execute(
        sql`SELECT MAX(id) as version FROM drizzle.__drizzle_migrations LIMIT 1`
      );
      if (migrationResult.rows?.[0]) {
        migrationsVersion = String((migrationResult.rows[0] as any).version || "unknown");
      }
    } catch {
      try {
        const altResult = await db.execute(
          sql`SELECT COUNT(*)::int as count FROM drizzle.__drizzle_migrations`
        );
        if (altResult.rows?.[0]) {
          migrationsVersion = `${(altResult.rows[0] as any).count || 0} migrations applied`;
        }
      } catch {
        migrationsVersion = null;
      }
    }
    
    checks.migrations = {
      version: migrationsVersion,
      available: migrationsVersion !== null,
    };

    const s3Configured = isS3Configured();
    let s3PresignOk: "ok" | "failed" | "not_tested" = "not_tested";
    let s3Error: string | undefined;
    
    if (s3Configured) {
      try {
        const presignResult = await testS3Presign();
        s3PresignOk = presignResult.ok ? "ok" : "failed";
        if (!presignResult.ok) {
          s3Error = presignResult.error;
        }
      } catch (e: any) {
        s3PresignOk = "failed";
        s3Error = e.message || "Presign test failed";
      }
    }
    
    checks.s3 = {
      configured: s3Configured,
      presign: s3PresignOk,
      ...(s3Error && { error: s3Error, requestId }),
    };

    const mailgunApiKey = process.env.MAILGUN_API_KEY;
    const mailgunDomain = process.env.MAILGUN_DOMAIN;
    const mailgunConfigured = !!(mailgunApiKey && mailgunDomain);
    
    checks.mailgun = {
      configured: mailgunConfigured,
    };

    const nodeEnv = process.env.NODE_ENV || "development";
    const isProduction = nodeEnv === "production";
    const isRailway = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_NAME);
    
    checks.auth = {
      cookieSecure: isProduction,
      cookieHttpOnly: true,
      cookieSameSite: "lax",
      trustProxy: isProduction || isRailway,
      sessionSecretSet: !!process.env.SESSION_SECRET,
      environment: nodeEnv,
    };

    let orphanCounts: OrphanCounts | null = null;
    let orphanError: string | undefined;
    
    try {
      orphanCounts = await getOrphanCounts();
    } catch (e: any) {
      orphanError = e.message || "Failed to fetch orphan counts";
      console.error("[status/summary] Orphan counts failed:", e);
    }
    
    checks.orphanCounts = orphanCounts || {
      totalMissing: -1,
      totalQuarantined: -1,
      byTable: {},
      ...(orphanError && { error: orphanError, requestId }),
    };

    res.json({
      ok: true,
      requestId,
      timestamp: new Date().toISOString(),
      checks,
    });
  } catch (error: any) {
    console.error("[status/summary] Summary check failed:", error);
    res.status(500).json({
      ok: false,
      requestId,
      error: {
        code: "STATUS_CHECK_FAILED",
        message: "Failed to gather system status",
        requestId,
      },
    });
  }
});

export default router;
