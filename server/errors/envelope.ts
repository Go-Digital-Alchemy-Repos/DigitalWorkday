/**
 * @module server/errors/envelope
 * @description Standard error envelope helper - single source of truth for error response formatting.
 * 
 * Re-exports from existing modules to provide a unified import location.
 * Use this module for all error-related imports in routes.
 */

export { AppError, type ErrorCode, assertTenantId, assertUserId, sendError, handleRouteError, toErrorResponse, type StandardErrorEnvelope } from "../lib/errors";
export { requestIdMiddleware } from "../middleware/requestId";
export { errorLoggingMiddleware, captureError, redactSecrets } from "../middleware/errorLogging";
export { errorHandler } from "../middleware/errorHandler";
