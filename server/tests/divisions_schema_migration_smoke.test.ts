/**
 * @module server/tests/divisions_schema_migration_smoke.test.ts
 * @description Smoke tests for client divisions schema migration.
 * Verifies that the new tables (client_divisions, division_members) exist
 * and that the divisionId column was added to projects table.
 * Also verifies legacy clients/projects still work without divisions.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "../db";
import {
  users,
  tenants,
  workspaces,
  clients,
  projects,
  clientDivisions,
  divisionMembers,
} from "../../shared/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";

let testTenantId: string;
let testWorkspaceId: string;
let testClientId: string;
let testUserId: string;

async function createTestData() {
  testTenantId = randomUUID();
  testWorkspaceId = randomUUID();
  testClientId = randomUUID();
  testUserId = randomUUID();

  await db.insert(tenants).values({
    id: testTenantId,
    name: "Test Tenant",
    slug: `test-${testTenantId.slice(0, 8)}`,
    status: "active",
  });

  await db.insert(workspaces).values({
    id: testWorkspaceId,
    tenantId: testTenantId,
    name: "Test Workspace",
    slug: "test-workspace",
  });

  await db.insert(users).values({
    id: testUserId,
    tenantId: testTenantId,
    name: "Test User",
    email: `user-${testUserId.slice(0, 8)}@test.com`,
    passwordHash: "test",
    role: "employee",
  });

  await db.insert(clients).values({
    id: testClientId,
    tenantId: testTenantId,
    workspaceId: testWorkspaceId,
    companyName: "Test Client",
    status: "active",
  });
}

async function cleanupTestData() {
  await db.delete(divisionMembers).where(eq(divisionMembers.tenantId, testTenantId));
  await db.delete(projects).where(eq(projects.tenantId, testTenantId));
  await db.delete(clientDivisions).where(eq(clientDivisions.tenantId, testTenantId));
  await db.delete(clients).where(eq(clients.tenantId, testTenantId));
  await db.delete(users).where(eq(users.tenantId, testTenantId));
  await db.delete(workspaces).where(eq(workspaces.tenantId, testTenantId));
  await db.delete(tenants).where(eq(tenants.id, testTenantId));
}

describe("Divisions Schema Migration Smoke Tests", () => {
  beforeEach(async () => {
    await createTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it("should create client_divisions table successfully", async () => {
    const divisionId = randomUUID();
    
    const [created] = await db.insert(clientDivisions).values({
      id: divisionId,
      tenantId: testTenantId,
      clientId: testClientId,
      name: "Engineering Division",
      description: "Software engineering team",
      color: "#3B82F6",
      isActive: true,
    }).returning();

    expect(created).toBeDefined();
    expect(created.id).toBe(divisionId);
    expect(created.name).toBe("Engineering Division");
    expect(created.tenantId).toBe(testTenantId);
    expect(created.clientId).toBe(testClientId);
    expect(created.isActive).toBe(true);
  });

  it("should create division_members table successfully", async () => {
    const divisionId = randomUUID();
    
    await db.insert(clientDivisions).values({
      id: divisionId,
      tenantId: testTenantId,
      clientId: testClientId,
      name: "Marketing Division",
    });

    const [memberCreated] = await db.insert(divisionMembers).values({
      tenantId: testTenantId,
      divisionId: divisionId,
      userId: testUserId,
      role: "member",
    }).returning();

    expect(memberCreated).toBeDefined();
    expect(memberCreated.divisionId).toBe(divisionId);
    expect(memberCreated.userId).toBe(testUserId);
    expect(memberCreated.role).toBe("member");
  });

  it("should enforce unique constraint on division_members(divisionId, userId)", async () => {
    const divisionId = randomUUID();
    
    await db.insert(clientDivisions).values({
      id: divisionId,
      tenantId: testTenantId,
      clientId: testClientId,
      name: "Sales Division",
    });

    await db.insert(divisionMembers).values({
      tenantId: testTenantId,
      divisionId: divisionId,
      userId: testUserId,
      role: "member",
    });

    await expect(
      db.insert(divisionMembers).values({
        tenantId: testTenantId,
        divisionId: divisionId,
        userId: testUserId,
        role: "admin",
      })
    ).rejects.toThrow();
  });

  it("should allow projects with divisionId (nullable FK)", async () => {
    const divisionId = randomUUID();
    const projectId = randomUUID();
    
    await db.insert(clientDivisions).values({
      id: divisionId,
      tenantId: testTenantId,
      clientId: testClientId,
      name: "Product Division",
    });

    const [projectCreated] = await db.insert(projects).values({
      id: projectId,
      tenantId: testTenantId,
      workspaceId: testWorkspaceId,
      clientId: testClientId,
      divisionId: divisionId,
      name: "Division Project",
    }).returning();

    expect(projectCreated).toBeDefined();
    expect(projectCreated.divisionId).toBe(divisionId);
  });

  it("should allow projects without divisionId (backward compatibility)", async () => {
    const projectId = randomUUID();
    
    const [projectCreated] = await db.insert(projects).values({
      id: projectId,
      tenantId: testTenantId,
      workspaceId: testWorkspaceId,
      clientId: testClientId,
      divisionId: null,
      name: "Legacy Project Without Division",
    }).returning();

    expect(projectCreated).toBeDefined();
    expect(projectCreated.divisionId).toBeNull();
    expect(projectCreated.name).toBe("Legacy Project Without Division");
  });

  it("should allow clients without any divisions (backward compatibility)", async () => {
    const divisions = await db.select()
      .from(clientDivisions)
      .where(eq(clientDivisions.clientId, testClientId));
    
    expect(divisions).toHaveLength(0);

    const clientsWithoutDivisions = await db.select()
      .from(clients)
      .where(eq(clients.id, testClientId));
    
    expect(clientsWithoutDivisions).toHaveLength(1);
    expect(clientsWithoutDivisions[0].companyName).toBe("Test Client");
  });
});
