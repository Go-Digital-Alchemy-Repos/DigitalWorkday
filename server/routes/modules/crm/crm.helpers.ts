import { Request } from "express";
import { db } from "../../../db";
import { eq, and } from "drizzle-orm";
import { clients } from "@shared/schema";
import { hasTenantAdminAccess } from "@shared/roles";

export function isAdminOrSuper(req: Request): boolean {
  return hasTenantAdminAccess(req.user?.role);
}

export async function verifyClientTenancy(clientId: string, tenantId: string): Promise<typeof clients.$inferSelect | null> {
  const [client] = await db.select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.tenantId, tenantId)))
    .limit(1);
  return client || null;
}
