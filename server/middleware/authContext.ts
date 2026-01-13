import type { Request, Response, NextFunction, RequestHandler } from "express";
import { AppError } from "../lib/errors";

export interface AuthContext {
  userId: string;
  workspaceId: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export function getAuth(req: Request): AuthContext {
  if (req.auth) {
    return req.auth;
  }

  if (req.user) {
    return {
      userId: req.user.id,
      workspaceId: "demo-workspace-id",
      role: req.user.role || "employee",
    };
  }

  if (process.env.NODE_ENV !== "production") {
    const fallbackUserId = process.env.DEMO_USER_ID || "demo-user-id";
    const fallbackWorkspaceId = process.env.DEMO_WORKSPACE_ID || "demo-workspace-id";
    return {
      userId: fallbackUserId,
      workspaceId: fallbackWorkspaceId,
      role: "admin",
    };
  }

  throw AppError.unauthorized("Authentication required");
}

export function getCurrentUserId(req: Request): string {
  return getAuth(req).userId;
}

export function getCurrentWorkspaceId(req: Request): string {
  return getAuth(req).workspaceId;
}

export const attachAuthContext: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    req.auth = getAuth(req);
    next();
  } catch (error) {
    next(error);
  }
};
