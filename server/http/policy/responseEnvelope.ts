import type { Request, Response, NextFunction } from "express";
import type { ErrorCode } from "../../lib/errors";

declare global {
  namespace Express {
    interface Response {
      ok: (data: unknown, statusCode?: number) => Response;
      fail: (code: string, message: string, statusCode?: number, details?: unknown) => Response;
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

  next();
}
