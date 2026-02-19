import { db } from "../db";
import { eq, and } from "drizzle-orm";
import { workspaces } from "@shared/schema";

const tenantWorkspaceCache = new Map<string, { workspaceId: string; expiry: number }>();
const WORKSPACE_CACHE_TTL = 60000; // 1 minute

export async function warmWorkspaceCache(tenantId: string): Promise<void> {
  const cached = tenantWorkspaceCache.get(tenantId);
  if (cached && cached.expiry > Date.now()) {
    return;
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
    return;
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
  }
}

export function getWorkspaceFromCache(tenantId: string): string | null {
  const cached = tenantWorkspaceCache.get(tenantId);
  if (cached && cached.expiry > Date.now()) {
    return cached.workspaceId;
  }
  return null;
}
