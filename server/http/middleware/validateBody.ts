import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";

/**
 * Express middleware factory that validates request body against a Zod schema.
 * 
 * On validation success: parsed data is set on `req.body` and next() is called.
 * On validation failure: returns standardized ApiErrorEnvelope with field-level details.
 * 
 * Usage:
 *   router.post("/items", validateBody(insertItemSchema), (req, res) => {
 *     // req.body is now typed and validated
 *   });
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const details = result.error.errors.map((e) => ({
        path: e.path.join("."),
        message: e.message,
        code: e.code,
      }));

      const requestId = req.requestId || "unknown";

      res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details,
        },
        requestId,
      });
      return;
    }

    req.body = result.data;
    next();
  };
}

/**
 * Express middleware factory that validates request query parameters.
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      const details = result.error.errors.map((e) => ({
        path: e.path.join("."),
        message: e.message,
        code: e.code,
      }));

      const requestId = req.requestId || "unknown";

      res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Query validation failed",
          details,
        },
        requestId,
      });
      return;
    }

    (req as any).validatedQuery = result.data;
    next();
  };
}

/**
 * Express middleware factory that validates request params.
 */
export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      const details = result.error.errors.map((e) => ({
        path: e.path.join("."),
        message: e.message,
        code: e.code,
      }));

      const requestId = req.requestId || "unknown";

      res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Parameter validation failed",
          details,
        },
        requestId,
      });
      return;
    }

    next();
  };
}
