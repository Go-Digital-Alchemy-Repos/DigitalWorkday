/**
 * @module server/middleware/apiJsonGuard
 * @description Ensures all /api routes ALWAYS respond with JSON, never HTML.
 * 
 * This middleware intercepts 404s and other non-JSON responses for /api routes
 * and converts them to proper JSON error envelopes.
 * 
 * INVARIANTS:
 * - All /api requests receive JSON responses
 * - Never returns HTML for API routes
 * - Includes requestId for error correlation
 * - Works with the standard error envelope format
 */

import type { Request, Response, NextFunction } from "express";

/**
 * Middleware that catches any /api route that falls through without a response
 * and returns a proper JSON 404 instead of allowing it to hit the SPA fallback.
 * 
 * Must be registered AFTER all API routes but BEFORE static/SPA fallback.
 */
export function apiNotFoundHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (req.path.startsWith("/api")) {
    const requestId = req.requestId || "unknown";
    res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: `API endpoint not found: ${req.method} ${req.path}`,
        status: 404,
        requestId,
      },
      message: `API endpoint not found: ${req.method} ${req.path}`,
      code: "NOT_FOUND",
    });
    return;
  }
  next();
}

/**
 * Middleware to ensure JSON Content-Type on all /api responses.
 * Wraps res.send to detect HTML responses and convert them.
 * 
 * This catches edge cases where a route might accidentally send HTML.
 */
export function apiJsonResponseGuard(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.path.startsWith("/api")) {
    next();
    return;
  }

  const originalSend = res.send;
  
  res.send = function(body: any): Response {
    // If response is a string that looks like HTML, convert to JSON error
    if (typeof body === "string" && (body.includes("<!DOCTYPE") || body.includes("<html"))) {
      const requestId = req.requestId || "unknown";
      const statusCode = res.statusCode || 500;
      
      console.error(`[apiJsonGuard] Intercepted HTML response on API route: ${req.method} ${req.path}`);
      
      res.setHeader("Content-Type", "application/json");
      return originalSend.call(this, JSON.stringify({
        error: {
          code: statusCode === 404 ? "NOT_FOUND" : "INTERNAL_ERROR",
          message: statusCode === 404 
            ? `API endpoint not found: ${req.method} ${req.path}`
            : "An unexpected error occurred",
          status: statusCode,
          requestId,
        },
        message: statusCode === 404 
          ? `API endpoint not found: ${req.method} ${req.path}`
          : "An unexpected error occurred",
        code: statusCode === 404 ? "NOT_FOUND" : "INTERNAL_ERROR",
      }));
    }
    
    return originalSend.call(this, body);
  };
  
  next();
}
