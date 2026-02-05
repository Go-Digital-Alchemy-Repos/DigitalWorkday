/**
 * Shared Route Helpers
 * 
 * Common utilities used across domain routers.
 * These were extracted from routes.ts to enable modular routing.
 */
import type { Request } from "express";
import { db } from "../db";
import { eq, and } from "drizzle-orm";
import { workspaces, UserRole } from "@shared/schema";
import { getEffectiveTenantId } from "../middleware/tenantContext";

// Cache for tenant primary workspaces to avoid repeated DB lookups
const tenantWorkspaceCache = new Map<string, { workspaceId: string; expiry: number }>();
const WORKSPACE_CACHE_TTL = 60000; // 1 minute

export async function getCurrentWorkspaceIdAsync(req: Request): Promise<string> {
  const tenantId = req.tenant?.effectiveTenantId || req.user?.tenantId;
  
  if (!tenantId) {
    return "demo-workspace-id";
  }
  
  const cached = tenantWorkspaceCache.get(tenantId);
  if (cached && cached.expiry > Date.now()) {
    return cached.workspaceId;
  }
  
  const [primaryWorkspace] = await db.select()
    .from(workspaces)
    .where(and(eq(workspaces.tenantId, tenantId), eq(workspaces.isPrimary, true)))
    .limit(1);
  
  if (primaryWorkspace) {
    tenantWorkspaceCache.set(tenantId, {
      workspaceId: primaryWorkspace.id,
      expiry: Date.now() + WORKSPACE_CACHE_TTL
    });
    return primaryWorkspace.id;
  }
  
  const [anyWorkspace] = await db.select()
    .from(workspaces)
    .where(eq(workspaces.tenantId, tenantId))
    .limit(1);
  
  if (anyWorkspace) {
    tenantWorkspaceCache.set(tenantId, {
      workspaceId: anyWorkspace.id,
      expiry: Date.now() + WORKSPACE_CACHE_TTL
    });
    return anyWorkspace.id;
  }
  
  console.warn(`[getCurrentWorkspaceIdAsync] No workspace found for tenant ${tenantId}`);
  return "demo-workspace-id";
}

export function getCurrentWorkspaceId(req: Request): string {
  const tenantId = req.tenant?.effectiveTenantId || req.user?.tenantId;
  
  if (!tenantId) {
    return "demo-workspace-id";
  }
  
  const cached = tenantWorkspaceCache.get(tenantId);
  if (cached && cached.expiry > Date.now()) {
    return cached.workspaceId;
  }
  
  getCurrentWorkspaceIdAsync(req).catch(() => {});
  return "demo-workspace-id";
}

export function getCurrentUserId(req: Request): string {
  return req.user?.id || "demo-user-id";
}

export function isSuperUser(req: Request): boolean {
  return (req.user as any)?.role === UserRole.SUPER_USER;
}

export { getEffectiveTenantId };
