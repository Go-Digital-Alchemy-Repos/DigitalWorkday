import type { Request } from "express";
import { UserRole, type Client, type ClientUserAccess } from "@shared/schema";
import { getEffectiveTenantId } from "../middleware/tenantContext";
import { storage } from "../storage";

export interface ClientPortalContext {
  tenantId: string | null;
  clientsAccess: Array<{ client: Client; access: ClientUserAccess }>;
  clientIds: string[];
}

export async function getClientPortalContext(req: Request): Promise<ClientPortalContext> {
  const user = req.user;
  if (!user || user.role !== UserRole.CLIENT) {
    return { tenantId: null, clientsAccess: [], clientIds: [] };
  }

  const clientsAccess = await storage.getClientsForUser(user.id);
  const tenantId = getEffectiveTenantId(req)
    || user.tenantId
    || clientsAccess.find(({ client }) => client.tenantId)?.client.tenantId
    || null;

  return {
    tenantId,
    clientsAccess,
    clientIds: clientsAccess.map(({ client }) => client.id),
  };
}
