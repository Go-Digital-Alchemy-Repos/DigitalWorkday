import { Request, Response, NextFunction } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const CSRF_ENABLED = process.env.CSRF_ENABLED !== "false";
const IS_DEVELOPMENT = process.env.NODE_ENV !== "production";

function getOrigin(req: Request): string | null {
  return (req.headers["origin"] as string) || null;
}

function getReferer(req: Request): string | null {
  const referer = req.headers["referer"] as string;
  if (!referer) return null;
  try {
    const url = new URL(referer);
    return url.origin;
  } catch {
    return null;
  }
}

function getHost(req: Request): string {
  const forwardedHost = req.headers["x-forwarded-host"] as string;
  if (forwardedHost) return forwardedHost.split(",")[0].trim();
  return req.headers["host"] || "";
}

function getProtocol(req: Request): string {
  const forwardedProto = req.headers["x-forwarded-proto"] as string;
  if (forwardedProto) return forwardedProto.split(",")[0].trim();
  return req.protocol || "http";
}

function buildExpectedOrigin(req: Request): string {
  const protocol = getProtocol(req);
  const host = getHost(req);
  return `${protocol}://${host}`;
}

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (!CSRF_ENABLED) {
    next();
    return;
  }

  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  if (req.path.startsWith("/api/webhooks/") || req.path.startsWith("/api/v1/webhooks/")) {
    next();
    return;
  }

  if (req.path === "/health" || req.path === "/healthz" || req.path === "/ready") {
    next();
    return;
  }

  const origin = getOrigin(req);
  const referer = getReferer(req);
  const requestOrigin = origin || referer;

  if (!requestOrigin) {
    if (IS_DEVELOPMENT) {
      next();
      return;
    }
    const contentType = req.headers["content-type"] || "";
    if (contentType.includes("application/json") || contentType.includes("multipart/form-data")) {
      next();
      return;
    }
    res.status(403).json({
      ok: false,
      error: {
        code: "CSRF_VALIDATION_FAILED",
        message: "Missing origin header for state-changing request.",
      },
    });
    return;
  }

  const expectedOrigin = buildExpectedOrigin(req);

  if (requestOrigin === expectedOrigin) {
    next();
    return;
  }

  const hostWithoutPort = getHost(req).split(":")[0];
  const allowedPatterns = [
    expectedOrigin,
    `https://${hostWithoutPort}`,
    `http://${hostWithoutPort}`,
  ];

  try {
    const requestUrl = new URL(requestOrigin);
    const requestHost = requestUrl.hostname;
    if (requestHost === hostWithoutPort) {
      next();
      return;
    }
  } catch {
    // fall through to deny
  }

  if (allowedPatterns.includes(requestOrigin)) {
    next();
    return;
  }

  if (IS_DEVELOPMENT) {
    const localhostPatterns = ["http://localhost", "http://127.0.0.1", "http://0.0.0.0"];
    const isLocalOrigin = localhostPatterns.some(p => requestOrigin.startsWith(p));
    const isLocalHost = localhostPatterns.some(p => expectedOrigin.startsWith(p));
    if (isLocalOrigin && isLocalHost) {
      next();
      return;
    }
  }

  if (process.env.CSRF_DEBUG === "true") {
    console.warn(
      `[CSRF] Blocked: origin=${requestOrigin}, expected=${expectedOrigin}, path=${req.path}`
    );
  }

  res.status(403).json({
    ok: false,
    error: {
      code: "CSRF_ORIGIN_MISMATCH",
      message: "Cross-origin request blocked.",
    },
  });
}
