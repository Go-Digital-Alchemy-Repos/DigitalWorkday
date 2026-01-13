import { Request, Response, NextFunction } from "express";
import { UserRole } from "@shared/schema";
import { db } from "../db";
import { tenants } from "@shared/schema";
import { eq } from "drizzle-orm";

export interface TenantContext {
  tenantId: string | null;
  effectiveTenantId: string | null;
  isSuperUser: boolean;
}

declare global {
  namespace Express {
    interface Request {
      tenant?: TenantContext;
    }
  }
}

export async function tenantContextMiddleware(req: Request, res: Response, next: NextFunction) {
  const user = req.user as any;

  if (!user) {
    req.tenant = {
      tenantId: null,
      effectiveTenantId: null,
      isSuperUser: false,
    };
    return next();
  }

  const isSuperUser = user.role === UserRole.SUPER_USER;

  if (isSuperUser) {
    const headerTenantId = req.headers["x-tenant-id"] as string | undefined;
    
    if (headerTenantId) {
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, headerTenantId));
      if (!tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }
      if (tenant.status !== "active") {
        return res.status(403).json({ error: "Tenant is not active" });
      }
    }
    
    req.tenant = {
      tenantId: user.tenantId || null,
      effectiveTenantId: headerTenantId || null,
      isSuperUser: true,
    };
  } else {
    req.tenant = {
      tenantId: user.tenantId || null,
      effectiveTenantId: user.tenantId || null,
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

export function getEffectiveTenantId(req: Request): string | null {
  return req.tenant?.effectiveTenantId || null;
}

export function requireEffectiveTenantId(req: Request): string {
  const tenantId = getEffectiveTenantId(req);
  if (!tenantId) {
    throw new Error("Tenant context required but not available");
  }
  return tenantId;
}

export function requireTenantContext(req: Request, res: Response, next: NextFunction) {
  const user = req.user as any;
  
  if (!user) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const isSuperUser = user.role === UserRole.SUPER_USER;
  
  if (isSuperUser) {
    return next();
  }

  if (!req.tenant?.effectiveTenantId) {
    console.error(`[tenantContext] User ${user.id} has no tenantId configured`);
    return res.status(500).json({ error: "User tenant not configured" });
  }

  next();
}
