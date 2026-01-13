import { Request, Response, NextFunction } from "express";
import { UserRole } from "@shared/schema";
import { tenancyMode } from "./tenancy";

export interface TenantContext {
  isSuperUser: boolean;
  userTenantId: string | null;
  actingTenantId: string | null;
  effectiveTenantId: string | null;
}

declare global {
  namespace Express {
    interface Request {
      tenant?: TenantContext;
    }
  }
}

export function tenantContextMiddleware(req: Request, res: Response, next: NextFunction) {
  const user = req.user as any;
  const mode = tenancyMode();

  if (!user) {
    req.tenant = {
      isSuperUser: false,
      userTenantId: null,
      actingTenantId: null,
      effectiveTenantId: null,
    };
    return next();
  }

  const isSuperUser = user.role === UserRole.SUPER_USER;
  const userTenantId = user.tenantId || null;

  if (isSuperUser) {
    const headerTenantId = req.headers["x-tenant-id"] as string | undefined;
    const actingTenantId = headerTenantId || null;
    
    req.tenant = {
      isSuperUser: true,
      userTenantId,
      actingTenantId,
      effectiveTenantId: actingTenantId,
    };
  } else {
    if (!userTenantId) {
      if (mode === "soft") {
        console.warn("[tenancy-warn]", JSON.stringify({
          mode: "soft",
          route: req.path,
          reason: "user-missing-tenantId",
          userId: user.id,
        }));
        res.setHeader("X-Tenancy-Warn", "missing-tenantId");
      } else if (mode === "strict") {
        return res.status(403).json({ error: "User tenant not configured" });
      }
    }

    req.tenant = {
      isSuperUser: false,
      userTenantId,
      actingTenantId: null,
      effectiveTenantId: userTenantId,
    };
  }

  next();
}

export function requireSuperUser(req: Request, res: Response, next: NextFunction) {
  const user = req.user as any;

  if (!user) {
    return res.status(401).json({ error: "Authentication required" });
  }

  if (user.role !== UserRole.SUPER_USER) {
    return res.status(403).json({ error: "Super user access required" });
  }

  next();
}
