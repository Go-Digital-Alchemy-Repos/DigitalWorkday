/**
 * Shared Route Helpers
 * 
 * Common utilities used across domain routers.
 * These were extracted from routes.ts to enable modular routing.
 */
import type { Request } from "express";
import { UserRole } from "@shared/schema";
import { getEffectiveTenantId } from "../middleware/tenantContext";
import { warmWorkspaceCache, getWorkspaceFromCache } from "../lib/workspaceCache";
import { AppError } from "../lib/errors";

export { warmWorkspaceCache };

export async function getCurrentWorkspaceIdAsync(req: Request): Promise<string> {
  const tenantId = req.tenant?.effectiveTenantId || req.user?.tenantId;
  
  if (!tenantId) {
    return "demo-workspace-id";
  }
  
  await warmWorkspaceCache(tenantId);
  
  const cached = getWorkspaceFromCache(tenantId);
  if (cached) {
    return cached;
  }
  
  console.warn(`[getCurrentWorkspaceIdAsync] No workspace found for tenant ${tenantId}`);
  return "demo-workspace-id";
}

export async function getCurrentWorkspaceIdOrThrow(req: Request): Promise<string> {
  const tenantId = req.tenant?.effectiveTenantId || req.user?.tenantId;

  if (!tenantId) {
    throw AppError.tenantRequired("Tenant context required to resolve workspace");
  }

  await warmWorkspaceCache(tenantId);

  const cached = getWorkspaceFromCache(tenantId);
  if (cached) {
    return cached;
  }

  const requestIdInfo = req.requestId ? ` requestId=${req.requestId}` : "";
  console.error(`[getCurrentWorkspaceIdOrThrow] No workspace found for tenant ${tenantId}.${requestIdInfo}`);
  throw AppError.internal(`No workspace found for tenant ${tenantId}`);
}

export function getCurrentWorkspaceId(req: Request): string {
  const tenantId = req.tenant?.effectiveTenantId || req.user?.tenantId;
  
  if (!tenantId) {
    return "demo-workspace-id";
  }
  
  const cached = getWorkspaceFromCache(tenantId);
  if (cached) {
    return cached;
  }
  
  warmWorkspaceCache(tenantId).catch(() => {});
  return "demo-workspace-id";
}

export function getCurrentUserId(req: Request): string {
  return req.user?.id || "demo-user-id";
}

export function isSuperUser(req: Request): boolean {
  return (req.user as any)?.role === UserRole.SUPER_USER;
}

export { getEffectiveTenantId };
