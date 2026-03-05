import type { Request, Response, NextFunction } from "express";
import { createLogger, perfMark, perfMs, type LogContext } from "../lib/logger";
import { getDbMetrics } from "../lib/dbTimer";

const reqLog = createLogger("request");

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

    if (hot && !isError && !isSlow && IS_PRODUCTION) {
      if (Math.random() >= HOT_PATH_SAMPLE_RATE) {
        return;
      }
    }

    const dbMetrics = getDbMetrics(req);

    const ctx: LogContext = {
      requestId: req.requestId || "unknown",
      tenantId: getTenantId(req),
      userId: getUserId(req),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs,
    };

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
