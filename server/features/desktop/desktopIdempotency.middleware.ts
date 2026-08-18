import type { NextFunction, Request, Response } from "express";
import { and, eq, gt } from "drizzle-orm";
import { db } from "../../db";
import { desktopIdempotencyKeys } from "@shared/schema";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export async function desktopIdempotencyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (SAFE_METHODS.has(req.method) || !req.desktopAuth) return next();

  const key = req.header("Idempotency-Key")?.trim();
  if (!key || key.length < 8 || key.length > 200) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Idempotency-Key header must contain 8-200 characters",
        status: 400,
        requestId: req.requestId || "unknown",
      },
    });
    return;
  }

  const scope = {
    sessionId: req.desktopAuth.sessionId,
    idempotencyKey: key,
    method: req.method,
    path: req.originalUrl.split("?")[0],
  };

  try {
    const now = new Date();
    const [existing] = await db.select().from(desktopIdempotencyKeys).where(and(
      eq(desktopIdempotencyKeys.sessionId, scope.sessionId),
      eq(desktopIdempotencyKeys.idempotencyKey, scope.idempotencyKey),
      eq(desktopIdempotencyKeys.method, scope.method),
      eq(desktopIdempotencyKeys.path, scope.path),
      gt(desktopIdempotencyKeys.expiresAt, now),
    )).limit(1);
    if (existing) {
      if (existing.responseStatus === null) {
        res.status(409).json({
          error: {
            code: "CONFLICT",
            message: "An identical request is still being processed",
            status: 409,
            requestId: req.requestId || "unknown",
          },
        });
        return;
      }
      res.set("Idempotency-Replayed", "true");
      res.status(existing.responseStatus).json(existing.responseBody);
      return;
    }

    const [reservation] = await db.insert(desktopIdempotencyKeys).values({
      ...scope,
      expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
    }).onConflictDoNothing().returning({ id: desktopIdempotencyKeys.id });
    if (!reservation) {
      res.status(409).json({
        error: {
          code: "CONFLICT",
          message: "An identical request is already being processed",
          status: 409,
          requestId: req.requestId || "unknown",
        },
      });
      return;
    }

    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);
    let finalized = false;
    const finalize = async (body: unknown, send: (body?: any) => Response) => {
      if (!finalized) {
        finalized = true;
        await db.update(desktopIdempotencyKeys).set({
          responseStatus: res.statusCode,
          responseBody: body === undefined ? null : body,
        }).where(eq(desktopIdempotencyKeys.id, reservation.id));
      }
      return send(body as any);
    };

    res.json = ((body: unknown) => {
      void finalize(body, originalJson).catch(next);
      return res;
    }) as Response["json"];
    res.send = ((body?: unknown) => {
      void finalize(body ?? null, originalSend).catch(next);
      return res;
    }) as Response["send"];
    next();
  } catch (error) {
    next(error);
  }
}
