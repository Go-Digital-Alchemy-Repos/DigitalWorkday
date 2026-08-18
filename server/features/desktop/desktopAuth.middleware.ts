import type { NextFunction, Request, Response } from "express";
import { config } from "../../config";
import { authenticateDesktopAccessToken } from "./desktopAuth.service";

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}

export async function desktopBearerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = bearerToken(req);
  if (!token) return next();
  if (!config.features.enableDesktopApi) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  try {
    const authenticated = await authenticateDesktopAccessToken(token);
    if (!authenticated) {
      res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Desktop session is expired or revoked",
          status: 401,
          requestId: req.requestId || "unknown",
        },
      });
      return;
    }

    req.user = authenticated.user as Express.User;
    req.desktopAuth = {
      sessionId: authenticated.sessionId,
      userId: authenticated.user.id,
      tenantId: authenticated.tenantId,
      workspaceId: authenticated.workspaceId,
      accessExpiresAt: authenticated.accessExpiresAt,
    };
    next();
  } catch (error) {
    next(error);
  }
}

export function isAuthenticatedRequest(req: Request): boolean {
  return Boolean(req.desktopAuth || (req.isAuthenticated && req.isAuthenticated()));
}
