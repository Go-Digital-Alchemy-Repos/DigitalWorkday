import type { Request, Response, NextFunction } from "express";
import { createLogger, perfMark, perfMs, type LogContext } from "../lib/logger";
import { createHash } from "crypto";

const perfLog = createLogger("perf");

const PERF_TELEMETRY = process.env.PERF_TELEMETRY === "1";
const SLOW_THRESHOLD_MS = Number(process.env.PERF_SLOW_THRESHOLD_MS) || 800;

function hashTenant(tenantId: string | undefined): string | undefined {
  if (!tenantId) return undefined;
  return createHash("sha256").update(tenantId).digest("hex").slice(0, 8);
}

let slowRequestCount = 0;
let totalRequestCount = 0;

export function getRequestPerfStats() {
  return { slowRequestCount, totalRequestCount };
}

export function requestPerfMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!PERF_TELEMETRY) return next();

  const start = perfMark();
  totalRequestCount++;

  res.on("finish", () => {
    const durationMs = perfMs(start);

    if (durationMs >= SLOW_THRESHOLD_MS) {
      slowRequestCount++;

      const tenantId = req.tenant?.effectiveTenantId
        || req.tenant?.tenantId
        || req.user?.tenantId
        || undefined;

      const ctx: LogContext = {
        requestId: req.requestId || "unknown",
        tenantHash: hashTenant(tenantId),
        method: req.method,
        route: req.route?.path || req.path,
        path: req.path,
        status: res.statusCode,
        durationMs,
        slow: true,
      };

      perfLog.warn("Slow request", ctx);
    }
  });

  next();
}
