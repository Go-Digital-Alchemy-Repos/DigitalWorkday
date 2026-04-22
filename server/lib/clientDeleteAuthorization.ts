import type { Request } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { clientCrm, tenants, UserRole } from "@shared/schema";
import { hasTenantAdminAccess } from "@shared/roles";

export async function canDeleteClientInTenant(
  req: Request,
  clientId: string,
  tenantId: string,
): Promise<boolean> {
  const user = req.user;
  if (!user) return false;

  if (hasTenantAdminAccess(user.role)) {
    return true;
  }

  const [tenant] = await db
    .select({ ownerUserId: tenants.ownerUserId })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (tenant?.ownerUserId === user.id) {
    return true;
  }

  const [crmOwner] = await db
    .select({ ownerUserId: clientCrm.ownerUserId })
    .from(clientCrm)
    .where(and(eq(clientCrm.clientId, clientId), eq(clientCrm.tenantId, tenantId)))
    .limit(1);

  return crmOwner?.ownerUserId === user.id;
}
