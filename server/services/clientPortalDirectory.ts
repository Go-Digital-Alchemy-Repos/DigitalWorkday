import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { db } from "../db";
import { AppError } from "../lib/errors";
import {
  ClientAccessStatus,
  UserRole,
  clientUserAccess,
  clientUserProjectAccess,
  clients,
  userClientAccess,
  users,
} from "@shared/schema";

const CLIENT_PORTAL_DIRECTORY_KEY = "clientPortalDirectory";

export type ClientPortalDirectoryUser = {
  id: string;
  name: string | null;
  avatarUrl: string | null;
};

type ClientPortalDirectoryPermissions = Record<string, unknown> & {
  clientPortalDirectory?: boolean;
};

function asPermissions(value: unknown): ClientPortalDirectoryPermissions {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

export function isClientPortalDirectoryEnabled(value: unknown): boolean {
  return asPermissions(value)[CLIENT_PORTAL_DIRECTORY_KEY] === true;
}

export function setClientPortalDirectoryEnabled(value: unknown, enabled: boolean): ClientPortalDirectoryPermissions {
  const permissions = asPermissions(value);
  if (enabled) permissions[CLIENT_PORTAL_DIRECTORY_KEY] = true;
  else delete permissions[CLIENT_PORTAL_DIRECTORY_KEY];
  return permissions;
}

/** Internal users intentionally exposed to portal users for a client account. */
export async function getClientPortalInternalDirectory(clientId: string): Promise<ClientPortalDirectoryUser[]> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
      permissions: userClientAccess.permissions,
    })
    .from(userClientAccess)
    .innerJoin(users, eq(users.id, userClientAccess.userId))
    .innerJoin(clients, eq(clients.id, userClientAccess.clientId))
    .where(and(
      eq(userClientAccess.clientId, clientId),
      eq(userClientAccess.tenantId, clients.tenantId),
      eq(users.tenantId, clients.tenantId),
      eq(users.isActive, true),
      ne(users.role, UserRole.CLIENT),
    ))
    .orderBy(asc(users.name));

  return rows
    .filter((row) => isClientPortalDirectoryEnabled(row.permissions))
    .map(({ permissions: _permissions, ...user }) => user);
}

/** Portal users who are active for this client and allowed into this exact project. */
export async function getProjectScopedPortalUsers(
  clientId: string,
  projectId: string,
): Promise<ClientPortalDirectoryUser[]> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
      projectScope: clientUserAccess.projectScope,
    })
    .from(clientUserAccess)
    .innerJoin(users, eq(users.id, clientUserAccess.userId))
    .innerJoin(clients, eq(clients.id, clientUserAccess.clientId))
    .where(and(
      eq(clientUserAccess.clientId, clientId),
      eq(users.tenantId, clients.tenantId),
      eq(clientUserAccess.status, ClientAccessStatus.ACTIVE),
      eq(users.isActive, true),
      eq(users.role, UserRole.CLIENT),
    ))
    .orderBy(asc(users.name));

  const selectedUserIds = rows
    .filter((row) => row.projectScope === "selected")
    .map((row) => row.id);
  const explicitlyGranted = selectedUserIds.length
    ? await db
        .select({ userId: clientUserProjectAccess.userId })
        .from(clientUserProjectAccess)
        .where(and(
          eq(clientUserProjectAccess.clientId, clientId),
          eq(clientUserProjectAccess.projectId, projectId),
          inArray(clientUserProjectAccess.userId, selectedUserIds),
        ))
    : [];
  const grantedIds = new Set(explicitlyGranted.map((row) => row.userId));

  return rows
    .filter((row) => row.projectScope !== "selected" || grantedIds.has(row.id))
    .map(({ projectScope: _projectScope, ...user }) => user);
}

export async function getClientPortalProjectDirectory(
  clientId: string,
  projectId: string,
): Promise<ClientPortalDirectoryUser[]> {
  const [internalUsers, portalUsers] = await Promise.all([
    getClientPortalInternalDirectory(clientId),
    getProjectScopedPortalUsers(clientId, projectId),
  ]);
  return [...new Map([...internalUsers, ...portalUsers].map((user) => [user.id, user])).values()];
}

/** People who may be identified in client-level conversations (not tied to a project). */
export async function getClientPortalConversationDirectory(
  clientId: string,
): Promise<ClientPortalDirectoryUser[]> {
  const [internalUsers, portalUsers] = await Promise.all([
    getClientPortalInternalDirectory(clientId),
    db
      .select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl })
      .from(clientUserAccess)
      .innerJoin(users, eq(users.id, clientUserAccess.userId))
      .innerJoin(clients, eq(clients.id, clientUserAccess.clientId))
      .where(and(
        eq(clientUserAccess.clientId, clientId),
        eq(users.tenantId, clients.tenantId),
        eq(clientUserAccess.status, ClientAccessStatus.ACTIVE),
        eq(users.isActive, true),
        eq(users.role, UserRole.CLIENT),
      ))
      .orderBy(asc(users.name)),
  ]);
  return [...new Map([...internalUsers, ...portalUsers].map((user) => [user.id, user])).values()];
}

export async function canUseClientPortalDirectoryUser(
  clientId: string,
  projectId: string,
  userId: string,
): Promise<boolean> {
  const directory = await getClientPortalProjectDirectory(clientId, projectId);
  return directory.some((user) => user.id === userId);
}

export async function assertClientPortalDirectoryUsers(
  clientId: string,
  projectId: string,
  userIds: string[],
): Promise<void> {
  if (!userIds.length) return;
  const allowed = new Set((await getClientPortalProjectDirectory(clientId, projectId)).map((user) => user.id));
  if (userIds.some((userId) => !allowed.has(userId))) {
    throw AppError.forbidden("One or more assignees are not available to this client project");
  }
}
