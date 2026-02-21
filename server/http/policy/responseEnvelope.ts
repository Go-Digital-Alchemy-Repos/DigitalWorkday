import type { Request, Response, NextFunction } from "express";
import type { ErrorCode } from "../../lib/errors";

declare global {
  namespace Express {
    interface Response {
      ok: (data: unknown, statusCode?: number) => Response;
      fail: (code: string, message: string, statusCode?: number, details?: unknown) => Response;
      sendSuccess: (data: unknown, statusCode?: number) => Response;
      sendError: (error: import("../../lib/errors").AppError) => Response;
    }
  }
}

export function responseEnvelopeMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  res.ok = function (data: unknown, statusCode = 200): Response {
    return this.status(statusCode).json({
      ok: true,
      requestId: req.requestId || "unknown",
      data,
    });
  };

  res.fail = function (
    code: string,
    message: string,
    statusCode = 400,
    details?: unknown
  ): Response {
    const requestId = req.requestId || "unknown";
    return this.status(statusCode).json({
      ok: false,
      requestId,
      error: {
        code,
        message,
        status: statusCode,
        requestId,
        details,
      },
      message,
      code,
    });
  };

  res.sendSuccess = function(data: unknown, statusCode = 200): Response {
    return this.status(statusCode).json({
      success: true,
      data,
      requestId: req.requestId || "unknown",
    });
  };

  res.sendError = function(error: any): Response {
    const requestId = req.requestId || "unknown";
    const statusCode = error.statusCode || 500;
    const code = error.code || "INTERNAL_ERROR";
    const message = error.message || "Internal server error";
    const details = error.details;

    return this.status(statusCode).json({
      success: false,
      error: {
        code,
        message,
        details,
      },
      requestId,
    });
  };

  next();
}
