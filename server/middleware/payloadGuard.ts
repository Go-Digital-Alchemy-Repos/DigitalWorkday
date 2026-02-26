/**
 * @file server/middleware/payloadGuard.ts
 * @description Response payload size guard middleware.
 *
 * Wraps res.json and res.send to measure outgoing payload size.
 * - Warns if payload > 500 KB
 * - Logs error (but does NOT crash) if payload > 2 MB
 *
 * Gated by ENABLE_PAYLOAD_GUARDS feature flag.
 * Only applied to /api routes to avoid measuring static asset traffic.
 */

import type { Request, Response, NextFunction } from "express";
import { createLogger } from "../lib/logger";
import { getBudgetForRoute } from "../observability/perfBudgets";
import { config } from "../config";

const log = createLogger("payload:guard");

const WARN_BYTES = Number(process.env.PAYLOAD_WARN_BYTES) || 500_000;
const ERROR_BYTES = Number(process.env.PAYLOAD_ERROR_BYTES) || 2_000_000;

function byteLength(value: unknown): number {
  if (typeof value === "string") return Buffer.byteLength(value, "utf8");
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return 0;
  }
}

export function payloadGuardMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!config.features.enablePayloadGuards) return next();
  if (!req.path.startsWith("/api")) return next();

  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  function checkSize(body: unknown, method: string): void {
    const size = byteLength(body);
    if (size === 0) return;

    const route = req.route?.path || req.path;
    const budget = getBudgetForRoute(route);

    const ctx = {
      requestId: req.requestId || "unknown",
      method: req.method,
      route,
      payloadBytes: size,
    };

    if (size > ERROR_BYTES) {
      log.error(`Oversized response (${method})`, { ...ctx, threshold: ERROR_BYTES });
    } else if (size > WARN_BYTES || (budget?.maxPayloadBytes && size > budget.maxPayloadBytes)) {
      log.warn(`Large response (${method})`, { ...ctx, threshold: budget?.maxPayloadBytes ?? WARN_BYTES });
    }
  }

  res.json = function (body: unknown) {
    checkSize(body, "json");
    return originalJson(body);
  };

  res.send = function (body: unknown) {
    if (body && typeof body !== "string") {
      checkSize(body, "send");
    } else if (typeof body === "string" && body.length > WARN_BYTES) {
      checkSize(body, "send");
    }
    return originalSend(body);
  };

  next();
}
