import { Request, Response, NextFunction } from "express";
import { UserRole } from "@shared/schema";

export interface TenantContext {
  tenantId: string | null;
  isSuperUser: boolean;
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

  if (!user) {
    req.tenant = {
      tenantId: null,
      isSuperUser: false,
    };
    return next();
  }

  const isSuperUser = user.role === UserRole.SUPER_USER;

  if (isSuperUser) {
    const headerTenantId = req.headers["x-tenant-id"] as string | undefined;
    req.tenant = {
      tenantId: headerTenantId || null,
      isSuperUser: true,
    };
  } else {
    req.tenant = {
      tenantId: user.tenantId || null,
      isSuperUser: false,
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
