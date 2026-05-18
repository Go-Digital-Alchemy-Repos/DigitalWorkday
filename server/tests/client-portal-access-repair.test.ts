import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { ensureClientPortalAccess } from "../utils/clientPortalAccessRepair";
import {
  ClientAccessLevel,
  UserRole,
  clientContacts,
  clientUserAccess,
  clients,
  tenants,
  users,
  workspaces,
} from "../../shared/schema";

const TEST_PREFIX = `portal-repair-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const describeIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

const created = {
  tenantIds: [] as string[],
  workspaceIds: [] as string[],
  clientIds: [] as string[],
  userIds: [] as string[],
};

async function createTenantWorkspaceClient(options: { clientTenantId?: string | null } = {}) {
  const [tenant] = await db.insert(tenants).values({
    name: `${TEST_PREFIX}-tenant-${created.tenantIds.length}`,
    slug: `${TEST_PREFIX}-tenant-${created.tenantIds.length}`,
    status: "active",
  }).returning();
  created.tenantIds.push(tenant.id);

  const [workspace] = await db.insert(workspaces).values({
    name: `${TEST_PREFIX}-workspace-${created.workspaceIds.length}`,
    tenantId: tenant.id,
    isPrimary: true,
  }).returning();
  created.workspaceIds.push(workspace.id);

  const [client] = await db.insert(clients).values({
    tenantId: options.clientTenantId === undefined ? tenant.id : options.clientTenantId,
    workspaceId: workspace.id,
    companyName: `${TEST_PREFIX}-client-${created.clientIds.length}`,
  }).returning();
  created.clientIds.push(client.id);

  return { tenant, workspace, client };
}

async function createPortalUser(email: string) {
  const [user] = await db.insert(users).values({
    tenantId: null,
    email,
    name: "Portal Tester",
    firstName: "Portal",
    lastName: "Tester",
    role: UserRole.CLIENT,
    isActive: true,
  }).returning();
  created.userIds.push(user.id);
  return user;
}

afterEach(async () => {
  if (created.clientIds.length > 0) {
    await db.delete(clientUserAccess).where(inArray(clientUserAccess.clientId, created.clientIds));
    await db.delete(clientContacts).where(inArray(clientContacts.clientId, created.clientIds));
    await db.delete(clients).where(inArray(clients.id, created.clientIds));
  }
  if (created.userIds.length > 0) {
    await db.delete(users).where(inArray(users.id, created.userIds));
  }
  if (created.workspaceIds.length > 0) {
    await db.delete(workspaces).where(inArray(workspaces.id, created.workspaceIds));
  }
  if (created.tenantIds.length > 0) {
    await db.delete(tenants).where(inArray(tenants.id, created.tenantIds));
  }

  created.tenantIds = [];
  created.workspaceIds = [];
  created.clientIds = [];
  created.userIds = [];
});

describeIfDatabase("client portal access repair", () => {
  it("bootstraps client access from a matching client contact", async () => {
    const { tenant, workspace, client } = await createTenantWorkspaceClient();
    const email = `${TEST_PREFIX}-contact@example.com`;
    const user = await createPortalUser(email);

    await db.insert(clientContacts).values({
      tenantId: tenant.id,
      workspaceId: workspace.id,
      clientId: client.id,
      firstName: "Portal",
      lastName: "Tester",
      email,
      isPrimary: true,
    });

    const repaired = await ensureClientPortalAccess(user);
    const clientAccess = await storage.getClientsForUser(user.id);

    expect(repaired.tenantId).toBe(tenant.id);
    expect(repaired.createdAccessCount).toBe(1);
    expect(clientAccess).toHaveLength(1);
    expect(clientAccess[0].client.id).toBe(client.id);
    expect(clientAccess[0].access.accessLevel).toBe(ClientAccessLevel.PORTAL_ADMIN);
  });

  it("repairs missing tenant metadata from the client workspace", async () => {
    const { tenant, workspace, client } = await createTenantWorkspaceClient({ clientTenantId: null });
    const user = await createPortalUser(`${TEST_PREFIX}-existing@example.com`);

    await db.insert(clientUserAccess).values({
      workspaceId: workspace.id,
      clientId: client.id,
      userId: user.id,
      accessLevel: ClientAccessLevel.COLLABORATOR,
    });

    const repaired = await ensureClientPortalAccess(user);
    const [updatedClient] = await db.select().from(clients).where(eq(clients.id, client.id));
    const [updatedUser] = await db.select().from(users).where(eq(users.id, user.id));
    const clientAccess = await storage.getClientsForUser(user.id);

    expect(repaired.tenantId).toBe(tenant.id);
    expect(updatedClient.tenantId).toBe(tenant.id);
    expect(updatedUser.tenantId).toBe(tenant.id);
    expect(clientAccess).toHaveLength(1);
    expect(clientAccess[0].client.id).toBe(client.id);
  });
});
