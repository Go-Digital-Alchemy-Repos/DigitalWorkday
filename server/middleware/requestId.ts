/**
 * @module server/middleware/requestId
 * @description Attaches a unique request ID to each request for error correlation and logging.
 * 
 * INVARIANTS:
 * - Every request gets a requestId (either from X-Request-Id header or generated)
 * - Response always includes X-Request-Id header
 * - requestId is available via req.requestId for use in error responses
 */

import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";

const MAX_REQUEST_ID_LENGTH = 128;
const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;

export function normalizeRequestIdHeader(headerValue: unknown): string | null {
  const rawValue = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (typeof rawValue !== "string") {
    return null;
  }

  const requestId = rawValue.trim();
  if (
    requestId.length === 0 ||
    requestId.length > MAX_REQUEST_ID_LENGTH ||
    !SAFE_REQUEST_ID_PATTERN.test(requestId)
  ) {
    return null;
  }

  return requestId;
}

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = normalizeRequestIdHeader(req.headers["x-request-id"]) || randomUUID();
  
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  
  next();
}
