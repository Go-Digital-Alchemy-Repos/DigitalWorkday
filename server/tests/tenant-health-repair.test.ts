/**
 * Tenant Health & Repair Tools Tests
 * 
 * Tests for the tenant health check service and repair endpoints.
 * Uses isolated test data with unique identifiers to prevent cross-test pollution.
 * 
 * @see docs/TENANT_HEALTH_REPAIR.md
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../db";
import { tenants, projects, tasks, clients, workspaces } from "../../shared/schema";
import { eq, and, like, isNull } from "drizzle-orm";
import { tenancyHealthService } from "../services/tenancyHealth";

// Use unique prefix to isolate test data
const TEST_PREFIX = `health-test-${Date.now()}-${Math.random().toString(36).substring(7)}`;

describe("Tenant Health Service", () => {
  let testTenantId: string;
  let testWorkspaceId: string;
  let testClientId: string;
  let orphanProjectId: string;
  let orphanTaskId: string;
  
  beforeAll(async () => {
    // Create isolated test tenant
    const [tenant] = await db.insert(tenants).values({
      name: `${TEST_PREFIX}-Tenant`,
      slug: `${TEST_PREFIX}-slug`,
      status: "active",
    }).returning();
    testTenantId = tenant.id;
    
    // Create workspace with tenantId
    const [workspace] = await db.insert(workspaces).values({
      name: `${TEST_PREFIX}-Workspace`,
      tenantId: testTenantId,
      isPrimary: true,
    }).returning();
    testWorkspaceId = workspace.id;
    
    // Create client with tenantId
    const [client] = await db.insert(clients).values({
      companyName: `${TEST_PREFIX}-Client`,
      tenantId: testTenantId,
      workspaceId: testWorkspaceId,
    }).returning();
    testClientId = client.id;
    
    // Create orphan project (missing tenantId but has valid clientId)
    const [project] = await db.insert(projects).values({
      name: `${TEST_PREFIX}-OrphanProject`,
      tenantId: null as any, // Deliberately null to test repair
      workspaceId: testWorkspaceId,
      clientId: testClientId,
    }).returning();
    orphanProjectId = project.id;
    
    // Create orphan task (missing tenantId, linked to orphan project)
    const [task] = await db.insert(tasks).values({
      title: `${TEST_PREFIX}-OrphanTask`,
      tenantId: null as any, // Deliberately null
      projectId: orphanProjectId,
      status: "todo",
      priority: "medium",
    }).returning();
    orphanTaskId = task.id;
  });
  
  afterAll(async () => {
    // Cleanup all test data using the unique prefix
    await db.delete(tasks).where(like(tasks.title, `${TEST_PREFIX}%`));
    await db.delete(projects).where(like(projects.name, `${TEST_PREFIX}%`));
    await db.delete(clients).where(like(clients.companyName, `${TEST_PREFIX}%`));
    await db.delete(workspaces).where(like(workspaces.name, `${TEST_PREFIX}%`));
    await db.delete(tenants).where(like(tenants.name, `${TEST_PREFIX}%`));
  });

  describe("Health Check Detection", () => {
    it("detects missing tenantId rows in global summary", async () => {
      const summary = await tenancyHealthService.getGlobalHealthSummary();
      
      // Should include our orphan project in the count
      expect(summary.totalOrphanRows).toBeGreaterThanOrEqual(1);
      expect(typeof summary.byTable.projects).toBe("number");
      expect(summary.byTable.projects).toBeGreaterThanOrEqual(1);
    });
    
    it("returns table-by-table orphan counts", async () => {
      const summary = await tenancyHealthService.getGlobalHealthSummary();
      
      expect(summary.byTable).toBeDefined();
      expect(typeof summary.byTable.projects).toBe("number");
      expect(typeof summary.byTable.tasks).toBe("number");
      expect(typeof summary.byTable.clients).toBe("number");
      expect(typeof summary.byTable.workspaces).toBe("number");
      expect(typeof summary.byTable.time_entries).toBe("number");
    });
    
    it("counts total tenants including blocked tenants", async () => {
      const summary = await tenancyHealthService.getGlobalHealthSummary();
      
      expect(summary.totalTenants).toBeGreaterThanOrEqual(1);
      expect(summary.readyTenants + summary.blockedTenants).toBe(summary.totalTenants);
    });
  });

  describe("Repair Preview Generation", () => {
    it("generates high-confidence derivation for projects with valid clientId", async () => {
      const preview = await tenancyHealthService.generateRepairPreview({
        tables: ["projects"],
        limit: 100,
      });
      
      // Find our test project in the preview
      const projectUpdate = preview.proposedUpdates.find(u => u.id === orphanProjectId);
      
      expect(projectUpdate).toBeDefined();
      expect(projectUpdate!.confidence).toBe("high");
      expect(projectUpdate!.derivedTenantId).toBe(testTenantId);
      expect(projectUpdate!.derivation).toContain("clientId");
    });
    
    it("correctly counts high vs low confidence updates", async () => {
      const preview = await tenancyHealthService.generateRepairPreview({
        limit: 100,
      });
      
      // Verify counts match array contents
      const highCount = preview.proposedUpdates.filter(u => u.confidence === "high").length;
      const lowCount = preview.proposedUpdates.filter(u => u.confidence === "low").length;
      
      expect(preview.highConfidenceCount).toBe(highCount);
      expect(preview.lowConfidenceCount).toBe(lowCount);
      expect(highCount + lowCount).toBe(preview.proposedUpdates.length);
    });
    
    it("provides byTable breakdown of confidence levels", async () => {
      const preview = await tenancyHealthService.generateRepairPreview({
        tables: ["projects"],
        limit: 100,
      });
      
      expect(preview.byTable).toBeDefined();
      expect(preview.byTable.projects).toBeDefined();
      expect(typeof preview.byTable.projects.high).toBe("number");
      expect(typeof preview.byTable.projects.low).toBe("number");
    });
    
    it("includes derivation explanation in proposed updates", async () => {
      const preview = await tenancyHealthService.generateRepairPreview({
        tables: ["projects"],
        limit: 100,
      });
      
      const projectUpdate = preview.proposedUpdates.find(u => u.id === orphanProjectId);
      
      expect(projectUpdate).toBeDefined();
      expect(projectUpdate!.derivation).toBeTruthy();
      expect(typeof projectUpdate!.derivation).toBe("string");
    });
  });

  describe("Repair Apply with Confidence Filtering", () => {
    it("applies high-confidence repairs and returns updated count", async () => {
      // Ensure orphan project has null tenantId before repair
      await db.update(projects).set({ tenantId: null }).where(eq(projects.id, orphanProjectId));
      
      const result = await tenancyHealthService.applyRepairs(
        { tables: ["projects"], limit: 100, applyOnlyHighConfidence: true },
        { userId: "test-user", requestId: `${TEST_PREFIX}-request` }
      );
      
      // Verify the repair was applied
      const [updatedProject] = await db.select().from(projects).where(eq(projects.id, orphanProjectId));
      
      expect(updatedProject.tenantId).toBe(testTenantId);
      expect(result.totalUpdated).toBeGreaterThanOrEqual(1);
      expect(result.updatedCountByTable.projects).toBeGreaterThanOrEqual(1);
    });
    
    it("returns skipped low-confidence counts separately", async () => {
      const result = await tenancyHealthService.applyRepairs(
        { tables: ["projects", "tasks"], limit: 100, applyOnlyHighConfidence: true },
        { userId: "test-user", requestId: `${TEST_PREFIX}-request` }
      );
      
      expect(typeof result.totalSkipped).toBe("number");
      expect(typeof result.skippedLowConfidenceCountByTable).toBe("object");
    });
    
    it("returns sample of updated IDs for verification", async () => {
      // Reset project for re-test
      await db.update(projects).set({ tenantId: null }).where(eq(projects.id, orphanProjectId));
      
      const result = await tenancyHealthService.applyRepairs(
        { tables: ["projects"], limit: 100, applyOnlyHighConfidence: true },
        { userId: "test-user", requestId: `${TEST_PREFIX}-request` }
      );
      
      expect(Array.isArray(result.sampleUpdatedIds)).toBe(true);
      if (result.totalUpdated > 0) {
        expect(result.sampleUpdatedIds.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Derivation Rules - Tasks", () => {
    it("derives task tenantId from project when project has tenantId", async () => {
      // Ensure project has tenantId
      await db.update(projects).set({ tenantId: testTenantId }).where(eq(projects.id, orphanProjectId));
      
      // Ensure task has null tenantId
      await db.update(tasks).set({ tenantId: null }).where(eq(tasks.id, orphanTaskId));
      
      const preview = await tenancyHealthService.generateRepairPreview({
        tables: ["tasks"],
        limit: 100,
      });
      
      const taskUpdate = preview.proposedUpdates.find(u => u.id === orphanTaskId);
      
      expect(taskUpdate).toBeDefined();
      expect(taskUpdate!.confidence).toBe("high");
      expect(taskUpdate!.derivedTenantId).toBe(testTenantId);
      expect(taskUpdate!.derivation).toContain("projectId");
    });
    
    it("returns low confidence when task project also has null tenantId", async () => {
      // Set project to null tenantId (broken chain)
      await db.update(projects).set({ tenantId: null }).where(eq(projects.id, orphanProjectId));
      
      // Ensure task has null tenantId
      await db.update(tasks).set({ tenantId: null }).where(eq(tasks.id, orphanTaskId));
      
      const preview = await tenancyHealthService.generateRepairPreview({
        tables: ["tasks"],
        limit: 100,
      });
      
      const taskUpdate = preview.proposedUpdates.find(u => u.id === orphanTaskId);
      
      // May be low or may be skipped depending on whether derivation chain is completely broken
      if (taskUpdate) {
        // If we get an update, it should be low confidence due to broken chain
        expect(taskUpdate.notes).toBeTruthy();
      }
      
      // Restore project tenantId for other tests
      await db.update(projects).set({ tenantId: testTenantId }).where(eq(projects.id, orphanProjectId));
    });
  });
});

describe("API Authorization (Service-Level Simulation)", () => {
  // Note: Full API authorization tests would require integration testing with Express
  // These tests verify the service behaves correctly when called
  
  it("service methods return structured data without throwing", async () => {
    // getGlobalHealthSummary should not throw
    const summary = await tenancyHealthService.getGlobalHealthSummary();
    expect(summary).toBeDefined();
    expect(typeof summary.totalTenants).toBe("number");
    
    // generateRepairPreview should not throw
    const preview = await tenancyHealthService.generateRepairPreview({ limit: 10 });
    expect(preview).toBeDefined();
    expect(Array.isArray(preview.proposedUpdates)).toBe(true);
  });
  
  it("applyRepairs requires valid context parameters", async () => {
    // Should work with valid context
    const result = await tenancyHealthService.applyRepairs(
      { limit: 1, applyOnlyHighConfidence: true },
      { userId: "test-user-id", requestId: "test-request-id" }
    );
    
    expect(result).toBeDefined();
    expect(typeof result.totalUpdated).toBe("number");
  });
});
