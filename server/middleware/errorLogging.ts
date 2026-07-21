/**
 * @module server/middleware/errorLogging
 * @description Error capture middleware for centralized error logging.
 * 
 * INVARIANTS:
 * - All 500+ errors are logged to error_logs table
 * - Key 4xx errors (403, 404, 429) are also logged for debugging
 * - Secrets are redacted from messages and meta
 * - Stack traces are stored server-side only, never sent to tenant users
 * - requestId is always included for correlation
 */

import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import type { InsertErrorLog } from "@shared/schema";
import { redactSecrets, redactSecretsFromObject } from "../lib/redaction";

function getErrorLogTenantId(req: Request): string | null {
  return req.tenant?.effectiveTenantId 
    || req.tenant?.tenantId 
    || req.user?.tenantId 
    || null;
}

export { redactSecrets, redactSecretsFromObject };

/**
 * Extract Postgres error details if present
 */
function extractDbError(err: Error): { dbCode?: string; dbConstraint?: string } {
  const pgError = err as any;
  return {
    dbCode: pgError.code || undefined,
    dbConstraint: pgError.constraint || undefined,
  };
}

/**
 * Get the current environment
 */
function getEnvironment(): string {
  return process.env.NODE_ENV || "development";
}

/**
 * Get user ID from request
 */
function getUserId(req: Request): string | null {
  return req.user?.id || null;
}

/**
 * Capture an error to the error_logs table
 */
export async function captureError(
  req: Request,
  err: Error,
  status: number,
  meta?: Record<string, unknown>
): Promise<void> {
  try {
    const requestId = req.requestId || "unknown";
    const sanitizedMessage = redactSecrets(err.message || "Unknown error");
    const sanitizedStack = redactSecrets(err.stack || "");
    const sanitizedMeta = meta ? redactSecretsFromObject(meta) : null;
    const { dbCode, dbConstraint } = extractDbError(err);
    
    const errorLog: InsertErrorLog = {
      requestId,
      tenantId: getErrorLogTenantId(req),
      userId: getUserId(req),
      method: req.method,
      path: req.path,
      status,
      errorName: err.name || "Error",
      message: sanitizedMessage,
      stack: sanitizedStack,
      dbCode,
      dbConstraint,
      meta: sanitizedMeta,
      environment: getEnvironment(),
      resolved: false,
    };

    await storage.createErrorLog(errorLog);
  } catch (logError) {
    // Don't let logging errors break the app
    console.error("[errorLogging] Failed to capture error:", logError);
  }
}

/**
 * Key 4xx status codes worth capturing for debugging
 * - 403: Forbidden (potential security issues or permission misconfigurations)
 * - 404: Not Found (may indicate broken links or invalid API calls)  
 * - 429: Rate Limited (may indicate abuse or need for rate limit tuning)
 */
const KEY_4XX_STATUSES = [403, 404, 429];

/**
 * Determines if an error should be captured to the error_logs table
 */
function shouldCaptureError(status: number): boolean {
  return status >= 500 || KEY_4XX_STATUSES.includes(status);
}

/**
 * Middleware that captures errors to the error_logs table.
 * Captures all 500+ errors and key 4xx errors (403, 404, 429).
 */
export function errorLoggingMiddleware(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const status = (err as any).statusCode || (err as any).status || 500;
  
  if (shouldCaptureError(status)) {
    // Fire and forget - don't block the response
    captureError(req, err, status).catch(() => {
      // Ignore errors from error logging
    });
  }
  
  // Continue to the actual error handler
  next(err);
}
