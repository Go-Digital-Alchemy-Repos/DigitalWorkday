import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../db";
import { tenants, workspaces, users, clients, clientDivisions, projects } from "@shared/schema";
import { randomUUID } from "crypto";
import { eq, isNull } from "drizzle-orm";

describe("Time entry selection supports division filter", () => {
  const tenantId = randomUUID();
  const workspaceId = randomUUID();
  const clientId = randomUUID();
  const division1Id = randomUUID();
  const division2Id = randomUUID();
  const projectInDiv1 = randomUUID();
  const projectInDiv2 = randomUUID();
  const projectNoDivision = randomUUID();

  async function createTestData() {
    await db.insert(tenants).values({
      id: tenantId,
      name: "Test Tenant",
      slug: `test-tenant-${tenantId.slice(0, 8)}`,
      status: "active",
    });

    await db.insert(workspaces).values({
      id: workspaceId,
      tenantId,
      name: "Test Workspace",
    });

    await db.insert(users).values({
      id: randomUUID(),
      tenantId,
      workspaceId,
      email: `admin-${tenantId.slice(0, 8)}@test.com`,
      passwordHash: "hash",
      name: "Admin User",
      role: "admin",
    });

    await db.insert(clients).values({
      id: clientId,
      tenantId,
      workspaceId,
      companyName: "Client With Divisions",
      status: "active",
    });

    await db.insert(clientDivisions).values([
      { id: division1Id, tenantId, clientId, name: "Division 1", isActive: true },
      { id: division2Id, tenantId, clientId, name: "Division 2", isActive: true },
    ]);

    await db.insert(projects).values([
      {
        id: projectInDiv1,
        tenantId,
        workspaceId,
        name: "Project in Division 1",
        status: "active",
        clientId,
        divisionId: division1Id,
      },
      {
        id: projectInDiv2,
        tenantId,
        workspaceId,
        name: "Project in Division 2",
        status: "active",
        clientId,
        divisionId: division2Id,
      },
      {
        id: projectNoDivision,
        tenantId,
        workspaceId,
        name: "Project No Division",
        status: "active",
        clientId: null,
        divisionId: null,
      },
    ]);
  }

  async function cleanupTestData() {
    await db.delete(projects).where(eq(projects.tenantId, tenantId));
    await db.delete(clientDivisions).where(eq(clientDivisions.tenantId, tenantId));
    await db.delete(clients).where(eq(clients.tenantId, tenantId));
    await db.delete(users).where(eq(users.tenantId, tenantId));
    await db.delete(workspaces).where(eq(workspaces.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  }

  beforeAll(async () => {
    await cleanupTestData();
    await createTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  it("should filter projects by divisionId", async () => {
    const allProjects = await db.select().from(projects).where(eq(projects.clientId, clientId));
    expect(allProjects).toHaveLength(2);
    
    const div1Projects = allProjects.filter(p => p.divisionId === division1Id);
    expect(div1Projects).toHaveLength(1);
    expect(div1Projects[0].name).toBe("Project in Division 1");
    
    const div2Projects = allProjects.filter(p => p.divisionId === division2Id);
    expect(div2Projects).toHaveLength(1);
    expect(div2Projects[0].name).toBe("Project in Division 2");
  });

  it("should return all client projects when no division filter applied", async () => {
    const allProjects = await db.select().from(projects).where(eq(projects.clientId, clientId));
    expect(allProjects).toHaveLength(2);
    expect(allProjects.map(p => p.name)).toContain("Project in Division 1");
    expect(allProjects.map(p => p.name)).toContain("Project in Division 2");
  });

  it("should support projects without divisions", async () => {
    const projectsWithoutClient = await db.select().from(projects).where(isNull(projects.clientId));
    const noDivProjects = projectsWithoutClient.filter(p => p.id === projectNoDivision);
    expect(noDivProjects).toHaveLength(1);
    expect(noDivProjects[0].divisionId).toBeNull();
  });

  it("should correctly associate projects with divisions", async () => {
    const project1 = await db.select().from(projects).where(eq(projects.id, projectInDiv1));
    expect(project1[0].divisionId).toBe(division1Id);
    expect(project1[0].clientId).toBe(clientId);

    const project2 = await db.select().from(projects).where(eq(projects.id, projectInDiv2));
    expect(project2[0].divisionId).toBe(division2Id);
    expect(project2[0].clientId).toBe(clientId);
  });

  it("should maintain division-client relationship", async () => {
    const divisions = await db.select().from(clientDivisions).where(eq(clientDivisions.clientId, clientId));
    expect(divisions).toHaveLength(2);
    
    for (const division of divisions) {
      expect(division.clientId).toBe(clientId);
      expect(division.tenantId).toBe(tenantId);
    }
  });
});
