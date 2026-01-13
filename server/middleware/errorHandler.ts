import type { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/errors";
import { ZodError } from "zod";

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (process.env.NODE_ENV !== "production") {
    console.error("[Error]", err);
  }

  let response: ErrorResponse;
  let statusCode: number;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    response = {
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    };
  } else if (err instanceof ZodError) {
    statusCode = 400;
    response = {
      error: {
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        details: err.errors.map((e) => ({
          path: e.path.join("."),
          message: e.message,
        })),
      },
    };
  } else {
    statusCode = 500;
    response = {
      error: {
        code: "INTERNAL_ERROR",
        message:
          process.env.NODE_ENV === "production"
            ? "Internal server error"
            : err.message || "Internal server error",
      },
    };
  }

  res.status(statusCode).json(response);
}
