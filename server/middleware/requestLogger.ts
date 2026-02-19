/**
 * @module server/middleware/requestLogger
 * @description HTTP request logging middleware for observability.
 * 
 * Logs every request with structured JSON including:
 * - timestamp: ISO 8601
 * - level: info | warn | error
 * - requestId: Unique identifier for request correlation
 * - method: HTTP method (GET, POST, etc.)
 * - path: Request path
 * - status: HTTP response status code
 * - durationMs: Request duration in milliseconds
 * - tenantId: Tenant ID if present (from tenant context)
 * - userId: User ID if authenticated
 * 
 * INVARIANTS:
 * - All requests are logged on completion (response finish event)
 * - Health check endpoints are excluded to reduce noise
 * - Sensitive paths are not logged with query params
 */

import type { Request, Response, NextFunction } from "express";
import { createLogger, perfMark, perfMs, type LogContext } from "../lib/logger";

const reqLog = createLogger("request");

const EXCLUDED_PATHS = [
  "/health",
  "/healthz",
  "/ready",
  "/api/health",
  "/favicon.ico",
];

function shouldExclude(path: string): boolean {
  return EXCLUDED_PATHS.some(excluded => path === excluded || path.startsWith("/assets/"));
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

    const ctx: LogContext = {
      requestId: req.requestId || "unknown",
      tenantId: getTenantId(req),
      userId: getUserId(req),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs,
    };

    if (res.statusCode >= 500) {
      reqLog.error("Request failed", ctx);
    } else if (res.statusCode >= 400) {
      reqLog.warn("Request client error", ctx);
    } else {
      reqLog.info("Request completed", ctx);
    }
  });

  next();
}
