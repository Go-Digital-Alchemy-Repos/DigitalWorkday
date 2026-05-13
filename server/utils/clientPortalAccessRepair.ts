import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  ClientAccessLevel,
  UserRole,
  clientContacts,
  clientUserAccess,
  clients,
  users,
  workspaces,
  type User,
} from "@shared/schema";

type ClientPortalIdentity = Pick<User, "id" | "email" | "role" | "tenantId">;

type AccessTenantRow = {
  clientId: string;
  accessWorkspaceId: string;
  clientWorkspaceId: string | null;
  clientTenantId: string | null;
  workspaceTenantId: string | null;
};

type ContactMatchRow = {
  clientId: string;
  contactWorkspaceId: string;
  clientWorkspaceId: string | null;
  clientTenantId: string | null;
  contactTenantId: string | null;
  workspaceTenantId: string | null;
};

function normalizeEmail(email: string | null | undefined): string {
  return email?.trim().toLowerCase() || "";
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function resolvedTenantId(row: Pick<AccessTenantRow, "clientTenantId" | "workspaceTenantId">): string | null {
  return row.clientTenantId || row.workspaceTenantId || null;
}

function resolvedContactTenantId(row: ContactMatchRow): string | null {
  return row.clientTenantId || row.contactTenantId || row.workspaceTenantId || null;
}

async function getExistingAccessTenantRows(userId: string): Promise<AccessTenantRow[]> {
  return db
    .select({
      clientId: clientUserAccess.clientId,
      accessWorkspaceId: clientUserAccess.workspaceId,
      clientWorkspaceId: clients.workspaceId,
      clientTenantId: clients.tenantId,
      workspaceTenantId: sql<string | null>`COALESCE(
        (SELECT tenant_id FROM workspaces WHERE id = ${clients.workspaceId}),
        ${workspaces.tenantId}
      )`,
    })
    .from(clientUserAccess)
    .innerJoin(clients, eq(clientUserAccess.clientId, clients.id))
    .leftJoin(workspaces, eq(clientUserAccess.workspaceId, workspaces.id))
    .where(eq(clientUserAccess.userId, userId));
}

async function getContactMatches(email: string): Promise<ContactMatchRow[]> {
  return db
    .select({
      clientId: clientContacts.clientId,
      contactWorkspaceId: clientContacts.workspaceId,
      clientWorkspaceId: clients.workspaceId,
      clientTenantId: clients.tenantId,
      contactTenantId: clientContacts.tenantId,
      workspaceTenantId: sql<string | null>`COALESCE(
        (SELECT tenant_id FROM workspaces WHERE id = ${clients.workspaceId}),
        ${workspaces.tenantId}
      )`,
    })
    .from(clientContacts)
    .innerJoin(clients, eq(clientContacts.clientId, clients.id))
    .leftJoin(workspaces, eq(clientContacts.workspaceId, workspaces.id))
    .where(sql`lower(${clientContacts.email}) = ${email}`);
}

async function setClientTenantIdIfMissing(clientId: string, tenantId: string | null): Promise<void> {
  if (!tenantId) return;
  await db.execute(sql`
    UPDATE clients
    SET tenant_id = ${tenantId}, updated_at = now()
    WHERE id = ${clientId} AND tenant_id IS NULL
  `);
}

async function setUserTenantId(userId: string, tenantId: string | null): Promise<void> {
  if (!tenantId) return;
  await db
    .update(users)
    .set({ tenantId, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

async function getDefaultAccessLevelForClient(clientId: string): Promise<string> {
  const existingAccess = await db
    .select({ accessLevel: clientUserAccess.accessLevel })
    .from(clientUserAccess)
    .where(eq(clientUserAccess.clientId, clientId));

  const hasPortalAdmin = existingAccess.some(access => access.accessLevel === ClientAccessLevel.PORTAL_ADMIN);
  return hasPortalAdmin ? ClientAccessLevel.COLLABORATOR : ClientAccessLevel.PORTAL_ADMIN;
}

async function inferTenantFromExistingAccess(user: ClientPortalIdentity): Promise<string | null> {
  const accessRows = await getExistingAccessTenantRows(user.id);
  if (accessRows.length === 0) {
    return null;
  }

  for (const row of accessRows) {
    await setClientTenantIdIfMissing(row.clientId, resolvedTenantId(row));
  }

  const tenantIds = unique(accessRows.map(resolvedTenantId).filter(Boolean));
  if (tenantIds.length === 0) {
    return user.tenantId || null;
  }

  if (tenantIds.length > 1) {
    if (user.tenantId && tenantIds.includes(user.tenantId)) {
      return user.tenantId;
    }

    console.warn("[clientPortalAccessRepair] Client user has access across multiple tenants; tenant was not auto-repaired", {
      userId: user.id,
      tenantIds,
    });
    return user.tenantId || null;
  }

  const tenantId = tenantIds[0];
  if (tenantId && user.tenantId !== tenantId) {
    await setUserTenantId(user.id, tenantId);
  }

  return tenantId || user.tenantId || null;
}

async function bootstrapAccessFromMatchingContacts(user: ClientPortalIdentity): Promise<{ tenantId: string | null; createdAccessCount: number }> {
  const email = normalizeEmail(user.email);
  if (!email) {
    return { tenantId: user.tenantId || null, createdAccessCount: 0 };
  }

  const matches = await getContactMatches(email);
  const candidates = matches
    .map(row => ({
      ...row,
      tenantId: resolvedContactTenantId(row),
      workspaceId: row.clientWorkspaceId || row.contactWorkspaceId,
    }))
    .filter(row => Boolean(row.tenantId && row.workspaceId));

  if (candidates.length === 0) {
    return { tenantId: user.tenantId || null, createdAccessCount: 0 };
  }

  const tenantIds = unique(candidates.map(row => row.tenantId).filter(Boolean));
  if (tenantIds.length !== 1) {
    console.warn("[clientPortalAccessRepair] Matching contacts span multiple tenants; access was not auto-created", {
      userId: user.id,
      email,
      tenantIds,
    });
    return { tenantId: user.tenantId || null, createdAccessCount: 0 };
  }

  const tenantId = tenantIds[0] || user.tenantId || null;
  if (tenantId && user.tenantId !== tenantId) {
    await setUserTenantId(user.id, tenantId);
  }

  const clientsById = new Map<string, { clientId: string; workspaceId: string; tenantId: string }>();
  for (const candidate of candidates) {
    if (!candidate.tenantId || !candidate.workspaceId) continue;
    clientsById.set(candidate.clientId, {
      clientId: candidate.clientId,
      workspaceId: candidate.workspaceId,
      tenantId: candidate.tenantId,
    });
  }

  let createdAccessCount = 0;
  for (const candidate of clientsById.values()) {
    await setClientTenantIdIfMissing(candidate.clientId, candidate.tenantId);
    const accessLevel = await getDefaultAccessLevelForClient(candidate.clientId);
    const inserted = await db
      .insert(clientUserAccess)
      .values({
        workspaceId: candidate.workspaceId,
        clientId: candidate.clientId,
        userId: user.id,
        accessLevel,
      })
      .onConflictDoNothing()
      .returning({ id: clientUserAccess.id });

    createdAccessCount += inserted.length;
  }

  return { tenantId, createdAccessCount };
}

export async function ensureClientPortalAccess(user: ClientPortalIdentity): Promise<{ tenantId: string | null; createdAccessCount: number }> {
  if (user.role !== UserRole.CLIENT) {
    return { tenantId: user.tenantId || null, createdAccessCount: 0 };
  }

  const tenantIdFromAccess = await inferTenantFromExistingAccess(user);
  if (tenantIdFromAccess) {
    return { tenantId: tenantIdFromAccess, createdAccessCount: 0 };
  }

  return bootstrapAccessFromMatchingContacts(user);
}
