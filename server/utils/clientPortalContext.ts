import type { Request } from "express";
import { UserRole, type Client, type ClientUserAccess } from "@shared/schema";
import { getEffectiveTenantId } from "../middleware/tenantContext";
import { storage } from "../storage";

export interface ClientPortalContext {
  tenantId: string | null;
  clientsAccess: Array<{ client: Client; access: ClientUserAccess }>;
  clientIds: string[];
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

export async function getClientPortalContext(req: Request): Promise<ClientPortalContext> {
  const user = req.user;
  if (!user || user.role !== UserRole.CLIENT) {
    return { tenantId: null, clientsAccess: [], clientIds: [] };
  }

  const clientsAccess = await storage.getClientsForUser(user.id);
  const accessTenantIds = uniqueStrings(clientsAccess.map(({ client }) => client.tenantId));
  const contextualTenantId = getEffectiveTenantId(req);

  const tenantId = accessTenantIds.length === 1
    ? accessTenantIds[0]
    : user.tenantId && (accessTenantIds.length === 0 || accessTenantIds.includes(user.tenantId))
      ? user.tenantId
      : contextualTenantId && (accessTenantIds.length === 0 || accessTenantIds.includes(contextualTenantId))
        ? contextualTenantId
        : accessTenantIds[0] || user.tenantId || contextualTenantId || null;

  return {
    tenantId,
    clientsAccess,
    clientIds: clientsAccess.map(({ client }) => client.id),
  };
}
