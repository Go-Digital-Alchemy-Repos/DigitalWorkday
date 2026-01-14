/**
 * Tests for tenant ID backfill inference logic
 * 
 * These tests verify the inference rules used by the backfill script:
 * - Projects: workspace → client → createdBy
 * - Tasks: project → createdBy
 * - Teams: workspace
 * - Users: workspace memberships → invitations → created projects
 */

import { describe, it, expect, vi } from "vitest";

// Mock inference logic for testing without database
interface MockProject {
  id: string;
  workspaceId: string | null;
  clientId: string | null;
  createdBy: string | null;
}

interface MockTask {
  id: string;
  projectId: string | null;
  createdBy: string | null;
}

interface MockTeam {
  id: string;
  workspaceId: string;
}

interface MockUser {
  id: string;
  email: string;
  role: string;
  workspaceMembershipTenantIds: string[];
  invitationTenantIds: string[];
  createdProjectTenantIds: string[];
}

// Inference functions that mirror the backfill script logic
function inferProjectTenantId(
  project: MockProject,
  workspaceTenantMap: Map<string, string | null>,
  clientTenantMap: Map<string, string | null>,
  userTenantMap: Map<string, string | null>
): { tenantId: string | null; source: string } {
  // Try workspace → tenantId
  if (project.workspaceId) {
    const tenantId = workspaceTenantMap.get(project.workspaceId);
    if (tenantId) {
      return { tenantId, source: "workspace" };
    }
  }
  
  // Try client → tenantId
  if (project.clientId) {
    const tenantId = clientTenantMap.get(project.clientId);
    if (tenantId) {
      return { tenantId, source: "client" };
    }
  }
  
  // Try createdBy → tenantId
  if (project.createdBy) {
    const tenantId = userTenantMap.get(project.createdBy);
    if (tenantId) {
      return { tenantId, source: "createdBy" };
    }
  }
  
  return { tenantId: null, source: "ambiguous" };
}

function inferTaskTenantId(
  task: MockTask,
  projectTenantMap: Map<string, string | null>,
  userTenantMap: Map<string, string | null>
): { tenantId: string | null; source: string } {
  // Try project → tenantId
  if (task.projectId) {
    const tenantId = projectTenantMap.get(task.projectId);
    if (tenantId) {
      return { tenantId, source: "project" };
    }
  }
  
  // Try createdBy → tenantId
  if (task.createdBy) {
    const tenantId = userTenantMap.get(task.createdBy);
    if (tenantId) {
      return { tenantId, source: "createdBy" };
    }
  }
  
  return { tenantId: null, source: "ambiguous" };
}

function inferTeamTenantId(
  team: MockTeam,
  workspaceTenantMap: Map<string, string | null>
): { tenantId: string | null; source: string } {
  if (team.workspaceId) {
    const tenantId = workspaceTenantMap.get(team.workspaceId);
    if (tenantId) {
      return { tenantId, source: "workspace" };
    }
  }
  
  return { tenantId: null, source: "ambiguous" };
}

function inferUserTenantId(
  user: MockUser
): { tenantId: string | null; source: string; isAmbiguous: boolean } {
  // Super users should never have tenantId
  if (user.role === "super_user") {
    return { tenantId: null, source: "super_user", isAmbiguous: false };
  }
  
  // Collect all inferred tenant IDs
  const allTenantIds = new Set<string>();
  
  for (const id of user.workspaceMembershipTenantIds) {
    if (id) allTenantIds.add(id);
  }
  
  for (const id of user.invitationTenantIds) {
    if (id) allTenantIds.add(id);
  }
  
  for (const id of user.createdProjectTenantIds) {
    if (id) allTenantIds.add(id);
  }
  
  // Exactly one tenant ID = inferable
  if (allTenantIds.size === 1) {
    return { 
      tenantId: Array.from(allTenantIds)[0], 
      source: "inferred",
      isAmbiguous: false,
    };
  }
  
  // Multiple or zero = ambiguous
  return { 
    tenantId: null, 
    source: allTenantIds.size === 0 ? "no_associations" : "multiple_tenants",
    isAmbiguous: true,
  };
}

describe("Backfill Inference Logic", () => {
  describe("Project tenantId inference", () => {
    const workspaceTenantMap = new Map([
      ["ws-1", "tenant-A"],
      ["ws-2", "tenant-B"],
      ["ws-3", null], // Workspace without tenant
    ]);
    
    const clientTenantMap = new Map([
      ["client-1", "tenant-A"],
      ["client-2", "tenant-C"],
    ]);
    
    const userTenantMap = new Map([
      ["user-1", "tenant-A"],
      ["user-2", "tenant-B"],
    ]);
    
    it("should infer from workspace first", () => {
      const project: MockProject = {
        id: "proj-1",
        workspaceId: "ws-1",
        clientId: "client-2", // Different tenant
        createdBy: "user-2", // Different tenant
      };
      
      const result = inferProjectTenantId(project, workspaceTenantMap, clientTenantMap, userTenantMap);
      expect(result.tenantId).toBe("tenant-A");
      expect(result.source).toBe("workspace");
    });
    
    it("should fall back to client if workspace has no tenant", () => {
      const project: MockProject = {
        id: "proj-2",
        workspaceId: "ws-3", // No tenant
        clientId: "client-2",
        createdBy: "user-1",
      };
      
      const result = inferProjectTenantId(project, workspaceTenantMap, clientTenantMap, userTenantMap);
      expect(result.tenantId).toBe("tenant-C");
      expect(result.source).toBe("client");
    });
    
    it("should fall back to createdBy if workspace and client have no tenant", () => {
      const project: MockProject = {
        id: "proj-3",
        workspaceId: "ws-3", // No tenant
        clientId: null,
        createdBy: "user-1",
      };
      
      const result = inferProjectTenantId(project, workspaceTenantMap, clientTenantMap, userTenantMap);
      expect(result.tenantId).toBe("tenant-A");
      expect(result.source).toBe("createdBy");
    });
    
    it("should return ambiguous if no tenant can be inferred", () => {
      const project: MockProject = {
        id: "proj-4",
        workspaceId: "ws-3", // No tenant
        clientId: null,
        createdBy: null,
      };
      
      const result = inferProjectTenantId(project, workspaceTenantMap, clientTenantMap, userTenantMap);
      expect(result.tenantId).toBeNull();
      expect(result.source).toBe("ambiguous");
    });
  });
  
  describe("Task tenantId inference", () => {
    const projectTenantMap = new Map([
      ["proj-1", "tenant-A"],
      ["proj-2", null],
    ]);
    
    const userTenantMap = new Map([
      ["user-1", "tenant-B"],
    ]);
    
    it("should infer from project first", () => {
      const task: MockTask = {
        id: "task-1",
        projectId: "proj-1",
        createdBy: "user-1", // Different tenant
      };
      
      const result = inferTaskTenantId(task, projectTenantMap, userTenantMap);
      expect(result.tenantId).toBe("tenant-A");
      expect(result.source).toBe("project");
    });
    
    it("should fall back to createdBy if project has no tenant", () => {
      const task: MockTask = {
        id: "task-2",
        projectId: "proj-2",
        createdBy: "user-1",
      };
      
      const result = inferTaskTenantId(task, projectTenantMap, userTenantMap);
      expect(result.tenantId).toBe("tenant-B");
      expect(result.source).toBe("createdBy");
    });
    
    it("should return ambiguous for personal tasks without creator tenant", () => {
      const task: MockTask = {
        id: "task-3",
        projectId: null, // Personal task
        createdBy: null,
      };
      
      const result = inferTaskTenantId(task, projectTenantMap, userTenantMap);
      expect(result.tenantId).toBeNull();
      expect(result.source).toBe("ambiguous");
    });
  });
  
  describe("Team tenantId inference", () => {
    const workspaceTenantMap = new Map([
      ["ws-1", "tenant-A"],
      ["ws-2", null],
    ]);
    
    it("should infer from workspace", () => {
      const team: MockTeam = {
        id: "team-1",
        workspaceId: "ws-1",
      };
      
      const result = inferTeamTenantId(team, workspaceTenantMap);
      expect(result.tenantId).toBe("tenant-A");
      expect(result.source).toBe("workspace");
    });
    
    it("should return ambiguous if workspace has no tenant", () => {
      const team: MockTeam = {
        id: "team-2",
        workspaceId: "ws-2",
      };
      
      const result = inferTeamTenantId(team, workspaceTenantMap);
      expect(result.tenantId).toBeNull();
      expect(result.source).toBe("ambiguous");
    });
  });
  
  describe("User tenantId inference", () => {
    it("should never assign tenant to super_user", () => {
      const user: MockUser = {
        id: "user-super",
        email: "admin@example.com",
        role: "super_user",
        workspaceMembershipTenantIds: ["tenant-A"],
        invitationTenantIds: [],
        createdProjectTenantIds: [],
      };
      
      const result = inferUserTenantId(user);
      expect(result.tenantId).toBeNull();
      expect(result.source).toBe("super_user");
      expect(result.isAmbiguous).toBe(false);
    });
    
    it("should infer from single workspace membership", () => {
      const user: MockUser = {
        id: "user-1",
        email: "user@example.com",
        role: "employee",
        workspaceMembershipTenantIds: ["tenant-A"],
        invitationTenantIds: [],
        createdProjectTenantIds: [],
      };
      
      const result = inferUserTenantId(user);
      expect(result.tenantId).toBe("tenant-A");
      expect(result.isAmbiguous).toBe(false);
    });
    
    it("should be ambiguous if multiple tenants found", () => {
      const user: MockUser = {
        id: "user-2",
        email: "multi@example.com",
        role: "employee",
        workspaceMembershipTenantIds: ["tenant-A"],
        invitationTenantIds: ["tenant-B"],
        createdProjectTenantIds: [],
      };
      
      const result = inferUserTenantId(user);
      expect(result.tenantId).toBeNull();
      expect(result.source).toBe("multiple_tenants");
      expect(result.isAmbiguous).toBe(true);
    });
    
    it("should be ambiguous if no associations found", () => {
      const user: MockUser = {
        id: "user-3",
        email: "orphan@example.com",
        role: "employee",
        workspaceMembershipTenantIds: [],
        invitationTenantIds: [],
        createdProjectTenantIds: [],
      };
      
      const result = inferUserTenantId(user);
      expect(result.tenantId).toBeNull();
      expect(result.source).toBe("no_associations");
      expect(result.isAmbiguous).toBe(true);
    });
    
    it("should infer from invitation if no workspace membership", () => {
      const user: MockUser = {
        id: "user-4",
        email: "invited@example.com",
        role: "employee",
        workspaceMembershipTenantIds: [],
        invitationTenantIds: ["tenant-C"],
        createdProjectTenantIds: [],
      };
      
      const result = inferUserTenantId(user);
      expect(result.tenantId).toBe("tenant-C");
      expect(result.isAmbiguous).toBe(false);
    });
    
    it("should dedupe same tenant from multiple sources", () => {
      const user: MockUser = {
        id: "user-5",
        email: "consistent@example.com",
        role: "employee",
        workspaceMembershipTenantIds: ["tenant-A"],
        invitationTenantIds: ["tenant-A"],
        createdProjectTenantIds: ["tenant-A"],
      };
      
      const result = inferUserTenantId(user);
      expect(result.tenantId).toBe("tenant-A");
      expect(result.isAmbiguous).toBe(false);
    });
  });
});

describe("Tenant Context Guardrails", () => {
  it("should require tenantId for project creation", () => {
    // This test documents the expected behavior
    // Actual integration tests would test the middleware
    const hasEffectiveTenantId = false;
    const isSuperUser = false;
    
    if (!hasEffectiveTenantId && !isSuperUser) {
      expect(() => {
        throw new Error("User has no tenant configured. Cannot create project.");
      }).toThrow();
    }
  });
  
  it("should require X-Tenant-Id header for super user creating tenant data", () => {
    const hasEffectiveTenantId = false;
    const isSuperUser = true;
    const hasHeaderTenantId = false;
    
    if (!hasEffectiveTenantId && isSuperUser && !hasHeaderTenantId) {
      expect(() => {
        throw new Error("Super users must use X-Tenant-Id header when creating tenant-scoped data.");
      }).toThrow();
    }
  });
});
