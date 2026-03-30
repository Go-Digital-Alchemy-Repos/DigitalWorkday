import type { Request, Response, NextFunction } from "express";
import { config } from "../config";
import { recordRequest, profilingStore, getRequestQueryCount } from "../observability/perfProfiler";

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const NANOID_PATTERN = /[A-Za-z0-9_-]{21}/g;
const NUMERIC_SEGMENT = /\/\d+(?=\/|$)/g;

function normalizePathToRoute(path: string): string {
  return path
    .replace(UUID_PATTERN, ":id")
    .replace(NANOID_PATTERN, ":id")
    .replace(NUMERIC_SEGMENT, "/:id");
}

export function profilingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!config.features.enablePerfProfiling) return next();
  if (!req.path.startsWith("/api")) return next();

  const start = performance.now();

  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);
  let payloadBytes = 0;

  res.json = function (body: unknown) {
    try {
      const str = JSON.stringify(body);
      payloadBytes = Buffer.byteLength(str, "utf8");
    } catch {}
    return originalJson(body);
  };

  res.send = function (body: unknown) {
    if (payloadBytes === 0) {
      try {
        if (typeof body === "string") {
          payloadBytes = Buffer.byteLength(body, "utf8");
        } else if (Buffer.isBuffer(body)) {
          payloadBytes = body.length;
        }
      } catch {}
    }
    return originalSend(body);
  };

  res.on("finish", () => {
    const durationMs = performance.now() - start;
    const route = req.route
      ? `${req.baseUrl}${req.route.path}`
      : normalizePathToRoute(req.path);
    const endpoint = `${req.method} ${route}`;
    const queryCount = getRequestQueryCount();
    recordRequest(endpoint, durationMs, payloadBytes, queryCount);
  });

  profilingStore.run({ queryCount: 0 }, () => {
    next();
  });
}
