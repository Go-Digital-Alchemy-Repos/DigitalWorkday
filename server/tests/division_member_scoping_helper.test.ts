/**
 * @module server/tests/division_member_scoping_helper.test.ts
 * @description Tests for division member scoping helpers.
 * Tests: getEffectiveDivisionScope, validateDivisionBelongsToClientTenant, validateUserBelongsToTenant
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "../db";
import {
  users,
  tenants,
  workspaces,
  clients,
  clientDivisions,
  divisionMembers,
} from "../../shared/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { storage } from "../storage";

let testTenantId: string;
let testOtherTenantId: string;
let testWorkspaceId: string;
let testClientId: string;
let testAdminId: string;
let testEmployeeId: string;
let testEmployee2Id: string;
let testDivision1Id: string;
let testDivision2Id: string;

async function createTestData() {
  testTenantId = randomUUID();
  testOtherTenantId = randomUUID();
  testWorkspaceId = randomUUID();
  testClientId = randomUUID();
  testAdminId = randomUUID();
  testEmployeeId = randomUUID();
  testEmployee2Id = randomUUID();
  testDivision1Id = randomUUID();
  testDivision2Id = randomUUID();

  await db.insert(tenants).values([
    { id: testTenantId, name: "Test Tenant", slug: `test-${testTenantId.slice(0, 8)}`, status: "active" },
    { id: testOtherTenantId, name: "Other Tenant", slug: `other-${testOtherTenantId.slice(0, 8)}`, status: "active" },
  ]);

  await db.insert(workspaces).values({
    id: testWorkspaceId,
    tenantId: testTenantId,
    name: "Test Workspace",
    slug: "test-workspace",
  });

  await db.insert(users).values([
    {
      id: testAdminId,
      tenantId: testTenantId,
      name: "Test Admin",
      email: `admin-${testAdminId.slice(0, 8)}@test.com`,
      passwordHash: "test",
      role: "admin",
    },
    {
      id: testEmployeeId,
      tenantId: testTenantId,
      name: "Test Employee",
      email: `employee-${testEmployeeId.slice(0, 8)}@test.com`,
      passwordHash: "test",
      role: "employee",
    },
    {
      id: testEmployee2Id,
      tenantId: testTenantId,
      name: "Test Employee 2",
      email: `employee2-${testEmployee2Id.slice(0, 8)}@test.com`,
      passwordHash: "test",
      role: "employee",
    },
  ]);

  await db.insert(clients).values({
    id: testClientId,
    tenantId: testTenantId,
    workspaceId: testWorkspaceId,
    companyName: "Test Client",
    status: "active",
  });

  await db.insert(clientDivisions).values([
    {
      id: testDivision1Id,
      tenantId: testTenantId,
      clientId: testClientId,
      name: "Division 1",
      isActive: true,
    },
    {
      id: testDivision2Id,
      tenantId: testTenantId,
      clientId: testClientId,
      name: "Division 2",
      isActive: true,
    },
  ]);

  await db.insert(divisionMembers).values([
    {
      tenantId: testTenantId,
      divisionId: testDivision1Id,
      userId: testEmployeeId,
      role: "member",
    },
    {
      tenantId: testTenantId,
      divisionId: testDivision2Id,
      userId: testEmployeeId,
      role: "member",
    },
  ]);
}

async function cleanupTestData() {
  await db.delete(divisionMembers).where(eq(divisionMembers.tenantId, testTenantId));
  await db.delete(clientDivisions).where(eq(clientDivisions.tenantId, testTenantId));
  await db.delete(clients).where(eq(clients.tenantId, testTenantId));
  await db.delete(users).where(eq(users.tenantId, testTenantId));
  await db.delete(workspaces).where(eq(workspaces.tenantId, testTenantId));
  await db.delete(tenants).where(eq(tenants.id, testTenantId));
  await db.delete(tenants).where(eq(tenants.id, testOtherTenantId));
}

describe("Division Member Scoping Helper Tests", () => {
  beforeEach(async () => {
    await createTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe("getEffectiveDivisionScope", () => {
    it("should return 'ALL' for tenant admin", async () => {
      const scope = await storage.getEffectiveDivisionScope(testAdminId, testTenantId);
      expect(scope).toBe("ALL");
    });

    it("should return division IDs for employee with memberships", async () => {
      const scope = await storage.getEffectiveDivisionScope(testEmployeeId, testTenantId);
      expect(scope).toBeInstanceOf(Array);
      expect(scope).toContain(testDivision1Id);
      expect(scope).toContain(testDivision2Id);
      expect(scope).toHaveLength(2);
    });

    it("should return empty array for employee without division memberships", async () => {
      const scope = await storage.getEffectiveDivisionScope(testEmployee2Id, testTenantId);
      expect(scope).toBeInstanceOf(Array);
      expect(scope).toHaveLength(0);
    });

    it("should return empty array for non-existent user", async () => {
      const scope = await storage.getEffectiveDivisionScope(randomUUID(), testTenantId);
      expect(scope).toBeInstanceOf(Array);
      expect(scope).toHaveLength(0);
    });
  });

  describe("validateDivisionBelongsToClientTenant", () => {
    it("should return true for valid division-client-tenant combo", async () => {
      const result = await storage.validateDivisionBelongsToClientTenant(
        testDivision1Id,
        testClientId,
        testTenantId
      );
      expect(result).toBe(true);
    });

    it("should return false for mismatched client", async () => {
      const otherClientId = randomUUID();
      const result = await storage.validateDivisionBelongsToClientTenant(
        testDivision1Id,
        otherClientId,
        testTenantId
      );
      expect(result).toBe(false);
    });

    it("should return false for mismatched tenant", async () => {
      const result = await storage.validateDivisionBelongsToClientTenant(
        testDivision1Id,
        testClientId,
        testOtherTenantId
      );
      expect(result).toBe(false);
    });

    it("should return false for non-existent division", async () => {
      const result = await storage.validateDivisionBelongsToClientTenant(
        randomUUID(),
        testClientId,
        testTenantId
      );
      expect(result).toBe(false);
    });
  });

  describe("validateUserBelongsToTenant", () => {
    it("should return true for user in tenant", async () => {
      const result = await storage.validateUserBelongsToTenant(testEmployeeId, testTenantId);
      expect(result).toBe(true);
    });

    it("should return false for user in different tenant", async () => {
      const result = await storage.validateUserBelongsToTenant(testEmployeeId, testOtherTenantId);
      expect(result).toBe(false);
    });

    it("should return false for non-existent user", async () => {
      const result = await storage.validateUserBelongsToTenant(randomUUID(), testTenantId);
      expect(result).toBe(false);
    });
  });

  describe("Division CRUD Operations", () => {
    it("should get divisions by client", async () => {
      const divisions = await storage.getClientDivisionsByClient(testClientId, testTenantId);
      expect(divisions).toHaveLength(2);
      expect(divisions.map(d => d.name)).toContain("Division 1");
      expect(divisions.map(d => d.name)).toContain("Division 2");
    });

    it("should get divisions by tenant", async () => {
      const divisions = await storage.getClientDivisionsByTenant(testTenantId);
      expect(divisions).toHaveLength(2);
    });

    it("should add and remove division member", async () => {
      const member = await storage.addDivisionMember({
        tenantId: testTenantId,
        divisionId: testDivision1Id,
        userId: testEmployee2Id,
        role: "member",
      });
      expect(member).toBeDefined();
      expect(member.userId).toBe(testEmployee2Id);

      const isMember = await storage.isDivisionMember(testDivision1Id, testEmployee2Id);
      expect(isMember).toBe(true);

      await storage.removeDivisionMember(testDivision1Id, testEmployee2Id);
      const isStillMember = await storage.isDivisionMember(testDivision1Id, testEmployee2Id);
      expect(isStillMember).toBe(false);
    });

    it("should get user divisions", async () => {
      const divisions = await storage.getUserDivisions(testEmployeeId, testTenantId);
      expect(divisions).toHaveLength(2);
      expect(divisions.map(d => d.id)).toContain(testDivision1Id);
      expect(divisions.map(d => d.id)).toContain(testDivision2Id);
    });
  });
});
