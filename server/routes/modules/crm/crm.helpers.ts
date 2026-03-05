import { Request } from "express";
import { db } from "../../../db";
import { eq, and } from "drizzle-orm";
import { clients, UserRole } from "@shared/schema";

export function isAdminOrSuper(req: Request): boolean {
  return req.user?.role === UserRole.ADMIN || req.user?.role === UserRole.SUPER_USER;
}

export async function verifyClientTenancy(clientId: string, tenantId: string): Promise<typeof clients.$inferSelect | null> {
  const [client] = await db.select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.tenantId, tenantId)))
    .limit(1);
  return client || null;
}
