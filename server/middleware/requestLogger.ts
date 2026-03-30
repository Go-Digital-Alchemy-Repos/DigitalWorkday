import type { Request, Response, NextFunction } from "express";
import { createLogger, perfMark, perfMs, type LogContext } from "../lib/logger";
import { getDbMetrics } from "../lib/dbTimer";
import { getBudgetForRoute } from "../observability/perfBudgets";
import { recordEndpointMetrics } from "../observability/endpointLatencyTracker";

const reqLog = createLogger("request");
const budgetLog = createLogger("perf:budget");

const IS_PRODUCTION = process.env.NODE_ENV === "production";

const EXCLUDED_PATHS = [
  "/health",
  "/healthz",
  "/ready",
  "/readyz",
  "/livez",
  "/api/health",
  "/favicon.ico",
];

const HOT_PATHS = [
  "/api/notifications/unread-count",
  "/api/notifications",
  "/api/tasks/my",
  "/api/presence/heartbeat",
  "/api/typing/active",
  "/api/features/flags",
];

const HOT_PATH_SAMPLE_RATE = IS_PRODUCTION ? 0.01 : 1;
const SLOW_THRESHOLD_MS = 800;

function shouldExclude(path: string): boolean {
  return EXCLUDED_PATHS.some(excluded => path === excluded || path.startsWith("/assets/"));
}

function isHotPath(path: string): boolean {
  return HOT_PATHS.some(hp => path === hp || path.startsWith(hp));
}

function getTenantId(req: Request): string | undefined {
  return req.tenant?.effectiveTenantId 
    || req.tenant?.tenantId 
    || req.user?.tenantId 
    || undefined;
}

function getUserId(req: Request): string | undefined {
  return req.user?.id || undefined;
}

function getPayloadBytes(res: Response): number {
  const contentLength = res.getHeader("content-length");
  if (contentLength) {
    const parsed = Number(contentLength);
    if (!isNaN(parsed)) return parsed;
  }
  return 0;
}

export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (shouldExclude(req.path)) {
    return next();
  }

  const start = perfMark();

  res.on("finish", () => {
    const durationMs = perfMs(start);
    const isError = res.statusCode >= 500;
    const isClientError = res.statusCode >= 400;
    const isSlow = durationMs >= SLOW_THRESHOLD_MS;
    const hot = isHotPath(req.path);

    const dbMetrics = getDbMetrics(req);
    const payloadBytes = getPayloadBytes(res);
    const route = req.route?.path
      ? (req.baseUrl || "") + req.route.path
      : req.path;
    const dbQueryCount = dbMetrics?.queryCount ?? 0;

    if (route.startsWith("/api") && req.route) {
      recordEndpointMetrics(route, durationMs, payloadBytes, dbQueryCount);
    }

    const budget = getBudgetForRoute(route);
    if (budget) {
      const violations: string[] = [];
      if (durationMs > budget.p95Ms) {
        violations.push(`latency ${Math.round(durationMs)}ms > ${budget.p95Ms}ms`);
      }
      if (budget.maxPayloadBytes && payloadBytes > budget.maxPayloadBytes) {
        violations.push(`payload ${payloadBytes}B > ${budget.maxPayloadBytes}B`);
      }
      if (budget.maxDbQueries && dbQueryCount > budget.maxDbQueries) {
        violations.push(`queries ${dbQueryCount} > ${budget.maxDbQueries}`);
      }
      if (violations.length > 0) {
        budgetLog.warn("Budget exceeded", {
          requestId: req.requestId || "unknown",
          route,
          violations,
          durationMs,
          payloadBytes,
          dbQueryCount,
        });
      }
    }

    if (hot && !isError && !isSlow && IS_PRODUCTION) {
      if (Math.random() >= HOT_PATH_SAMPLE_RATE) {
        return;
      }
    }

    const ctx: LogContext = {
      requestId: req.requestId || "unknown",
      tenantId: getTenantId(req),
      userId: getUserId(req),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs,
    };

    if (payloadBytes > 0) {
      ctx.payloadBytes = payloadBytes;
    }

    if (dbMetrics && dbMetrics.queryCount > 0) {
      ctx.dbQueryCount = dbMetrics.queryCount;
      ctx.dbDurationMs = Math.round(dbMetrics.totalMs * 100) / 100;
    }

    if (isSlow) {
      ctx.slow = true;
    }

    if (isError) {
      reqLog.error("Request failed", ctx);
    } else if (isClientError) {
      reqLog.warn("Request client error", ctx);
    } else if (isSlow) {
      reqLog.warn("Slow request", ctx);
    } else {
      reqLog.info("Request completed", ctx);
    }
  });

  next();
}
