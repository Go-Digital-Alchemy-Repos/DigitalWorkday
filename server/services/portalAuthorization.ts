import { and, count, eq } from "drizzle-orm";
import { db } from "../db";
import { AppError } from "../lib/errors";
import {
  ClientAccessLevel,
  ClientAccessStatus,
  UserRole,
  clientUserAccess,
  clients,
  users,
  type ClientUserAccess,
} from "@shared/schema";

export type PortalAccessLevel = "collaborator" | "client_admin";

export type PortalCapabilities = {
  viewAccount: true;
  manageTasks: true;
  completeTasks: true;
  useMessages: true;
  useApprovals: true;
  useSupport: true;
  manageClientVisibleAssets: true;
  manageProjects: boolean;
  viewActivity: boolean;
  editOverview: boolean;
  editContacts: boolean;
  managePortalUsers: boolean;
};

export function normalizePortalAccessLevel(level: string): PortalAccessLevel {
  return level === ClientAccessLevel.CLIENT_ADMIN ? "client_admin" : "collaborator";
}

export function getPortalCapabilities(level: string): PortalCapabilities {
  const isAdmin = normalizePortalAccessLevel(level) === "client_admin";
  return {
    viewAccount: true,
    manageTasks: true,
    completeTasks: true,
    useMessages: true,
    useApprovals: true,
    useSupport: true,
    manageClientVisibleAssets: true,
    manageProjects: isAdmin,
    viewActivity: isAdmin,
    editOverview: isAdmin,
    editContacts: isAdmin,
    managePortalUsers: isAdmin,
  };
}

export async function requireActivePortalAccess(
  userId: string,
  clientId: string,
  options: { admin?: boolean } = {},
): Promise<ClientUserAccess> {
  const [row] = await db
    .select({ access: clientUserAccess, userRole: users.role, userTenantId: users.tenantId, clientTenantId: clients.tenantId })
    .from(clientUserAccess)
    .innerJoin(users, eq(users.id, clientUserAccess.userId))
    .innerJoin(clients, eq(clients.id, clientUserAccess.clientId))
    .where(and(eq(clientUserAccess.userId, userId), eq(clientUserAccess.clientId, clientId)))
    .limit(1);

  if (
    !row ||
    row.userRole !== UserRole.CLIENT ||
    !row.userTenantId ||
    row.userTenantId !== row.clientTenantId ||
    row.access.status === ClientAccessStatus.SUSPENDED
  ) {
    throw AppError.forbidden("Active access to this client account is required");
  }

  if (options.admin && normalizePortalAccessLevel(row.access.accessLevel) !== ClientAccessLevel.CLIENT_ADMIN) {
    throw AppError.forbidden("Client Admin access is required");
  }

  return row.access;
}

export async function countActiveClientAdmins(clientId: string): Promise<number> {
  const [result] = await db
    .select({ value: count() })
    .from(clientUserAccess)
    .where(and(
      eq(clientUserAccess.clientId, clientId),
      eq(clientUserAccess.accessLevel, ClientAccessLevel.CLIENT_ADMIN),
      eq(clientUserAccess.status, ClientAccessStatus.ACTIVE),
    ));
  return Number(result?.value || 0);
}
