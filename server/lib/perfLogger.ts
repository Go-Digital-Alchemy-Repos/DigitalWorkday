import type { Request, Response, NextFunction } from "express";
import { createLogger, perfMark, perfMs, type LogContext } from "./logger";
import { createHash } from "crypto";

const log = createLogger("perf");
const queryLog = createLogger("perf:query");

const IS_PRODUCTION = process.env.NODE_ENV === "production";
const SAMPLE_RATE = Number(process.env.PERF_SAMPLE_RATE) || (IS_PRODUCTION ? 0.05 : 1);
const SLOW_REQUEST_MS = Number(process.env.PERF_SLOW_THRESHOLD_MS) || 300;
const SLOW_QUERY_MS = Number(process.env.PERF_SLOW_QUERY_MS) || 300;

let slowRequestCount = 0;
let totalRequestCount = 0;
let sampledRequestCount = 0;
let slowQueryCount = 0;
let totalQueryCount = 0;

function shouldSample(): boolean {
  if (SAMPLE_RATE >= 1) return true;
  return Math.random() < SAMPLE_RATE;
}

function hashTenant(tenantId: string | undefined): string | undefined {
  if (!tenantId) return undefined;
  return createHash("sha256").update(tenantId).digest("hex").slice(0, 8);
}

export function perfLoggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const sampled = shouldSample();
  totalRequestCount++;
  if (sampled) sampledRequestCount++;

  const start = perfMark();

  res.on("finish", () => {
    const durationMs = perfMs(start);

    if (durationMs >= SLOW_REQUEST_MS || sampled) {
      const tenantId =
        req.tenant?.effectiveTenantId ||
        req.tenant?.tenantId ||
        req.user?.tenantId ||
        undefined;

      const ctx: LogContext = {
        requestId: req.requestId || "unknown",
        tenantHash: hashTenant(tenantId),
        method: req.method,
        route: req.route?.path || req.path,
        path: req.path,
        status: res.statusCode,
        durationMs,
        sampled,
      };

      if (durationMs >= SLOW_REQUEST_MS) {
        slowRequestCount++;
        ctx.slow = true;
        log.warn("Slow request", ctx);
      } else if (sampled) {
        log.info("Request", ctx);
      }
    }
  });

  next();
}

export function instrumentDbPool(pool: import("pg").Pool): void {
  const origQuery = pool.query.bind(pool);

  (pool as any).query = function (...args: any[]) {
    totalQueryCount++;
    const start = performance.now();

    const result = origQuery(...args);

    if (result && typeof result.then === "function") {
      return result.then((res: any) => {
        const durationMs =
          Math.round((performance.now() - start) * 100) / 100;
        if (durationMs >= SLOW_QUERY_MS) {
          slowQueryCount++;
          const queryText =
            typeof args[0] === "string"
              ? args[0].slice(0, 120)
              : typeof args[0]?.text === "string"
                ? args[0].text.slice(0, 120)
                : "(prepared)";
          queryLog.warn("Slow query", {
            durationMs,
            query: queryText,
            thresholdMs: SLOW_QUERY_MS,
          });
        }
        return res;
      });
    }
    return result;
  };
}

export function getPerfStats() {
  return {
    requests: {
      total: totalRequestCount,
      sampled: sampledRequestCount,
      slow: slowRequestCount,
      sampleRate: SAMPLE_RATE,
      slowThresholdMs: SLOW_REQUEST_MS,
    },
    queries: {
      total: totalQueryCount,
      slow: slowQueryCount,
      slowThresholdMs: SLOW_QUERY_MS,
    },
  };
}
