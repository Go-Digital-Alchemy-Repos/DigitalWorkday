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
  "/readyz",
  "/livez",
  "/api/health",
  "/favicon.ico",
];

/**
 * High-frequency polling endpoints that generate significant log volume.
 * These are sampled at a low rate to reduce noise — only 1 in N successful
 * GET requests are logged. Errors (4xx/5xx) are always logged regardless.
 */
const HIGH_FREQUENCY_PATHS = [
  "/api/notifications/unread-count",
  "/api/tasks/my",
  "/api/communication/followups",
  "/api/communication/health-summary",
];
const HIGH_FREQUENCY_SAMPLE_RATE = 0.05; // Log ~5% of successful polling requests

function shouldExclude(path: string): boolean {
  return EXCLUDED_PATHS.some(excluded => path === excluded || path.startsWith("/assets/"));
}

function isHighFrequency(method: string, path: string): boolean {
  return method === "GET" && HIGH_FREQUENCY_PATHS.some(p => path === p || path.startsWith(p + "?"));
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

  const highFreq = isHighFrequency(req.method, req.path);

  res.on("finish", () => {
    const durationMs = perfMs(start);
    const status = res.statusCode;

    // For high-frequency polling endpoints, skip successful responses unless sampled.
    // Always log errors regardless.
    if (highFreq && status < 400 && Math.random() > HIGH_FREQUENCY_SAMPLE_RATE) {
      return;
    }

    const ctx: LogContext = {
      requestId: req.requestId || "unknown",
      tenantId: getTenantId(req),
      userId: getUserId(req),
      method: req.method,
      path: req.path,
      status,
      durationMs,
      ...(highFreq ? { sampled: true } : {}),
    };

    if (status >= 500) {
      reqLog.error("Request failed", ctx);
    } else if (status >= 400) {
      reqLog.warn("Request client error", ctx);
    } else {
      reqLog.info("Request completed", ctx);
    }
  });

  next();
}
