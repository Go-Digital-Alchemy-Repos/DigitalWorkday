/**
 * Tenant Health Service
 * 
 * Provides comprehensive health checks and repair tooling for tenant data integrity.
 * 
 * Key Features:
 * - Missing tenantId detection per table
 * - Cross-tenant FK mismatch detection
 * - Orphaned reference detection
 * - High-confidence tenantId derivation
 * - Dry-run preview and safe repair application
 * 
 * Safety Rules:
 * - Read-only health checks
 * - Repair only applies high-confidence derivations
 * - All repairs are logged with requestId and actor
 * - No destructive operations (no deletes)
 * 
 * @see docs/TENANT_HEALTH_REPAIR.md for detailed documentation
 */

import { db } from "../db";
import { sql, eq, isNull, and, ne, inArray, count } from "drizzle-orm";
import {
  users, projects, tasks, teams, clients, workspaces,
  timeEntries, sections, projectMembers, teamMembers,
  divisionMembers, taskAssignees, UserRole, tenants
} from "@shared/schema";

// Types for health check results
export type Severity = "critical" | "warning" | "info";
export type Confidence = "high" | "low";

export interface HealthCheckResult {
  checkName: string;
  severity: Severity;
  count: number;
  sampleIds: string[];
  derivationPathHint?: string;
  recommendedAction: string;
}

export interface TableMissingTenantIds {
  table: string;
  missingCount: number;
  sampleIds: string[];
}

export interface CrossTenantMismatch {
  table: string;
  checkDescription: string;
  mismatchCount: number;
  sampleIds: string[];
}

export interface OrphanedReference {
  table: string;
  checkDescription: string;
  orphanCount: number;
  sampleIds: string[];
}

export interface TenantHealthSummary {
  tenantId: string;
  tenantName: string;
  status: string;
  isReady: boolean;
  blockerCount: number;
  missingTenantIds: TableMissingTenantIds[];
  crossTenantMismatches: CrossTenantMismatch[];
  orphanedReferences: OrphanedReference[];
  checks: HealthCheckResult[];
}

export interface GlobalHealthSummary {
  totalTenants: number;
  readyTenants: number;
  blockedTenants: number;
  totalOrphanRows: number;
  byTable: Record<string, number>;
  tenantSummaries: TenantHealthSummary[];
}

export interface ProposedUpdate {
  table: string;
  id: string;
  currentTenantId: string | null;
  derivedTenantId: string;
  confidence: Confidence;
  derivation: string;
  notes?: string;
}

export interface RepairPreviewResult {
  proposedUpdates: ProposedUpdate[];
  highConfidenceCount: number;
  lowConfidenceCount: number;
  byTable: Record<string, { high: number; low: number }>;
}

export interface RepairApplyResult {
  updatedCountByTable: Record<string, number>;
  skippedLowConfidenceCountByTable: Record<string, number>;
  sampleUpdatedIds: string[];
  totalUpdated: number;
  totalSkipped: number;
}

// Sample limit for IDs returned in checks
const SAMPLE_LIMIT = 10;

// ==============================================================================
// MISSING TENANTID CHECKS (per table)
// ==============================================================================

async function getMissingTenantIdRows(
  table: any,
  tableName: string,
  tenantIdFilter?: string
): Promise<TableMissingTenantIds> {
  try {
    // Count missing tenantId
    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(table)
      .where(isNull(table.tenantId));
    
    const missingCount = countResult[0]?.count || 0;
    
    // Get sample IDs
    let sampleIds: string[] = [];
    if (missingCount > 0) {
      const samples = await db
        .select({ id: table.id })
        .from(table)
        .where(isNull(table.tenantId))
        .limit(SAMPLE_LIMIT);
      sampleIds = samples.map(r => r.id);
    }
    
    return { table: tableName, missingCount, sampleIds };
  } catch (error) {
    console.error(`[tenancy-health] Error checking ${tableName}:`, error);
    return { table: tableName, missingCount: -1, sampleIds: [] };
  }
}

async function getMissingTenantIdRowsExcludingSuperUsers(): Promise<TableMissingTenantIds> {
  try {
    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(and(isNull(users.tenantId), ne(users.role, UserRole.SUPER_USER)));
    
    const missingCount = countResult[0]?.count || 0;
    
    let sampleIds: string[] = [];
    if (missingCount > 0) {
      const samples = await db
        .select({ id: users.id })
        .from(users)
        .where(and(isNull(users.tenantId), ne(users.role, UserRole.SUPER_USER)))
        .limit(SAMPLE_LIMIT);
      sampleIds = samples.map(r => r.id);
    }
    
    return { table: "users", missingCount, sampleIds };
  } catch (error) {
    console.error("[tenancy-health] Error checking users:", error);
    return { table: "users", missingCount: -1, sampleIds: [] };
  }
}

// ==============================================================================
// CROSS-TENANT FK MISMATCH CHECKS
// ==============================================================================

async function checkProjectClientTenantMismatch(): Promise<CrossTenantMismatch> {
  try {
    // Projects where project.tenantId != clients.tenantId (via clientId)
    const result = await db.execute(sql`
      SELECT p.id 
      FROM projects p
      JOIN clients c ON p.client_id = c.id
      WHERE p.tenant_id IS NOT NULL 
        AND c.tenant_id IS NOT NULL 
        AND p.tenant_id != c.tenant_id
      LIMIT ${SAMPLE_LIMIT}
    `);
    
    const countResult = await db.execute(sql`
      SELECT count(*)::int as count
      FROM projects p
      JOIN clients c ON p.client_id = c.id
      WHERE p.tenant_id IS NOT NULL 
        AND c.tenant_id IS NOT NULL 
        AND p.tenant_id != c.tenant_id
    `);
    
    const mismatchCount = (countResult.rows[0] as any)?.count || 0;
    const sampleIds = (result.rows as any[]).map(r => r.id);
    
    return {
      table: "projects",
      checkDescription: "project.tenantId != client.tenantId via clientId",
      mismatchCount,
      sampleIds,
    };
  } catch (error) {
    console.error("[tenancy-health] Error checking project-client mismatch:", error);
    return { table: "projects", checkDescription: "project-client mismatch", mismatchCount: -1, sampleIds: [] };
  }
}

async function checkTaskProjectTenantMismatch(): Promise<CrossTenantMismatch> {
  try {
    const result = await db.execute(sql`
      SELECT t.id 
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      WHERE t.tenant_id IS NOT NULL 
        AND p.tenant_id IS NOT NULL 
        AND t.tenant_id != p.tenant_id
      LIMIT ${SAMPLE_LIMIT}
    `);
    
    const countResult = await db.execute(sql`
      SELECT count(*)::int as count
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      WHERE t.tenant_id IS NOT NULL 
        AND p.tenant_id IS NOT NULL 
        AND t.tenant_id != p.tenant_id
    `);
    
    const mismatchCount = (countResult.rows[0] as any)?.count || 0;
    const sampleIds = (result.rows as any[]).map(r => r.id);
    
    return {
      table: "tasks",
      checkDescription: "task.tenantId != project.tenantId via projectId",
      mismatchCount,
      sampleIds,
    };
  } catch (error) {
    console.error("[tenancy-health] Error checking task-project mismatch:", error);
    return { table: "tasks", checkDescription: "task-project mismatch", mismatchCount: -1, sampleIds: [] };
  }
}

async function checkTimeEntryProjectTenantMismatch(): Promise<CrossTenantMismatch> {
  try {
    const result = await db.execute(sql`
      SELECT te.id 
      FROM time_entries te
      JOIN projects p ON te.project_id = p.id
      WHERE te.tenant_id IS NOT NULL 
        AND p.tenant_id IS NOT NULL 
        AND te.tenant_id != p.tenant_id
      LIMIT ${SAMPLE_LIMIT}
    `);
    
    const countResult = await db.execute(sql`
      SELECT count(*)::int as count
      FROM time_entries te
      JOIN projects p ON te.project_id = p.id
      WHERE te.tenant_id IS NOT NULL 
        AND p.tenant_id IS NOT NULL 
        AND te.tenant_id != p.tenant_id
    `);
    
    const mismatchCount = (countResult.rows[0] as any)?.count || 0;
    const sampleIds = (result.rows as any[]).map(r => r.id);
    
    return {
      table: "time_entries",
      checkDescription: "timeEntry.tenantId != project.tenantId via projectId",
      mismatchCount,
      sampleIds,
    };
  } catch (error) {
    console.error("[tenancy-health] Error checking time entry-project mismatch:", error);
    return { table: "time_entries", checkDescription: "time entry-project mismatch", mismatchCount: -1, sampleIds: [] };
  }
}

// ==============================================================================
// ORPHANED REFERENCE CHECKS
// ==============================================================================

async function checkOrphanedProjectsWithMissingClient(): Promise<OrphanedReference> {
  try {
    // Projects with non-null clientId but client doesn't exist
    const result = await db.execute(sql`
      SELECT p.id 
      FROM projects p
      LEFT JOIN clients c ON p.client_id = c.id
      WHERE p.client_id IS NOT NULL AND c.id IS NULL
      LIMIT ${SAMPLE_LIMIT}
    `);
    
    const countResult = await db.execute(sql`
      SELECT count(*)::int as count
      FROM projects p
      LEFT JOIN clients c ON p.client_id = c.id
      WHERE p.client_id IS NOT NULL AND c.id IS NULL
    `);
    
    const orphanCount = (countResult.rows[0] as any)?.count || 0;
    const sampleIds = (result.rows as any[]).map(r => r.id);
    
    return {
      table: "projects",
      checkDescription: "projects with clientId referencing non-existent client",
      orphanCount,
      sampleIds,
    };
  } catch (error) {
    console.error("[tenancy-health] Error checking orphaned projects:", error);
    return { table: "projects", checkDescription: "orphaned clientId", orphanCount: -1, sampleIds: [] };
  }
}

async function checkOrphanedTasksWithMissingProject(): Promise<OrphanedReference> {
  try {
    // Non-personal tasks with projectId but project doesn't exist
    const result = await db.execute(sql`
      SELECT t.id 
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.project_id IS NOT NULL 
        AND p.id IS NULL 
        AND t.is_personal = false
      LIMIT ${SAMPLE_LIMIT}
    `);
    
    const countResult = await db.execute(sql`
      SELECT count(*)::int as count
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.project_id IS NOT NULL 
        AND p.id IS NULL 
        AND t.is_personal = false
    `);
    
    const orphanCount = (countResult.rows[0] as any)?.count || 0;
    const sampleIds = (result.rows as any[]).map(r => r.id);
    
    return {
      table: "tasks",
      checkDescription: "non-personal tasks with projectId referencing non-existent project",
      orphanCount,
      sampleIds,
    };
  } catch (error) {
    console.error("[tenancy-health] Error checking orphaned tasks:", error);
    return { table: "tasks", checkDescription: "orphaned projectId", orphanCount: -1, sampleIds: [] };
  }
}

// ==============================================================================
// TENANTID DERIVATION RULES
// ==============================================================================

/**
 * Derive tenantId for a project
 * 
 * Derivation path (in order of preference):
 * 1. clientId -> clients.tenantId (if client has tenantId)
 * 2. workspaceId -> workspaces.tenantId (if workspace has tenantId)
 * 
 * High confidence: exactly one valid tenantId found via unambiguous path
 * Low confidence: ambiguous or missing parent chain
 */
async function deriveProjectTenantId(projectId: string): Promise<ProposedUpdate | null> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project || project.tenantId) return null; // Already has tenantId
  
  // Try clientId first
  if (project.clientId) {
    const [client] = await db.select({ tenantId: clients.tenantId }).from(clients).where(eq(clients.id, project.clientId)).limit(1);
    if (client?.tenantId) {
      return {
        table: "projects",
        id: projectId,
        currentTenantId: null,
        derivedTenantId: client.tenantId,
        confidence: "high",
        derivation: "clientId -> clients.tenantId",
      };
    }
  }
  
  // Try workspaceId
  if (project.workspaceId) {
    const [workspace] = await db.select({ tenantId: workspaces.tenantId }).from(workspaces).where(eq(workspaces.id, project.workspaceId)).limit(1);
    if (workspace?.tenantId) {
      return {
        table: "projects",
        id: projectId,
        currentTenantId: null,
        derivedTenantId: workspace.tenantId,
        confidence: "high",
        derivation: "workspaceId -> workspaces.tenantId",
      };
    }
  }
  
  // Cannot derive with high confidence
  return {
    table: "projects",
    id: projectId,
    currentTenantId: null,
    derivedTenantId: "",
    confidence: "low",
    derivation: "no valid derivation path",
    notes: "manual review required - missing clientId/workspaceId chain",
  };
}

/**
 * Derive tenantId for a task
 * 
 * Derivation path:
 * 1. projectId -> projects.tenantId (for non-personal tasks)
 * 2. createdBy -> users.tenantId (for personal tasks only)
 * 
 * High confidence: unambiguous derivation via projectId
 * Low confidence: personal tasks without valid user tenantId
 */
async function deriveTaskTenantId(taskId: string): Promise<ProposedUpdate | null> {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task || task.tenantId) return null;
  
  // Non-personal tasks: derive from projectId
  if (task.projectId) {
    const [project] = await db.select({ tenantId: projects.tenantId }).from(projects).where(eq(projects.id, task.projectId)).limit(1);
    if (project?.tenantId) {
      return {
        table: "tasks",
        id: taskId,
        currentTenantId: null,
        derivedTenantId: project.tenantId,
        confidence: "high",
        derivation: "projectId -> projects.tenantId",
      };
    }
  }
  
  // Personal tasks: derive from createdBy user
  if (task.isPersonal && task.createdBy) {
    const [user] = await db.select({ tenantId: users.tenantId }).from(users).where(eq(users.id, task.createdBy)).limit(1);
    if (user?.tenantId) {
      return {
        table: "tasks",
        id: taskId,
        currentTenantId: null,
        derivedTenantId: user.tenantId,
        confidence: "high",
        derivation: "createdBy -> users.tenantId (personal task)",
      };
    }
  }
  
  return {
    table: "tasks",
    id: taskId,
    currentTenantId: null,
    derivedTenantId: "",
    confidence: "low",
    derivation: "no valid derivation path",
    notes: "manual review required - missing projectId or user chain",
  };
}

/**
 * Derive tenantId for a team
 * 
 * Derivation path:
 * 1. workspaceId -> workspaces.tenantId
 * 
 * High confidence: workspace has tenantId
 */
async function deriveTeamTenantId(teamId: string): Promise<ProposedUpdate | null> {
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!team || team.tenantId) return null;
  
  if (team.workspaceId) {
    const [workspace] = await db.select({ tenantId: workspaces.tenantId }).from(workspaces).where(eq(workspaces.id, team.workspaceId)).limit(1);
    if (workspace?.tenantId) {
      return {
        table: "teams",
        id: teamId,
        currentTenantId: null,
        derivedTenantId: workspace.tenantId,
        confidence: "high",
        derivation: "workspaceId -> workspaces.tenantId",
      };
    }
  }
  
  return {
    table: "teams",
    id: teamId,
    currentTenantId: null,
    derivedTenantId: "",
    confidence: "low",
    derivation: "no valid derivation path",
    notes: "manual review required - workspace has no tenantId",
  };
}

/**
 * Derive tenantId for a client
 * 
 * Derivation path:
 * 1. workspaceId -> workspaces.tenantId
 * 
 * High confidence: workspace has tenantId
 */
async function deriveClientTenantId(clientId: string): Promise<ProposedUpdate | null> {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client || client.tenantId) return null;
  
  if (client.workspaceId) {
    const [workspace] = await db.select({ tenantId: workspaces.tenantId }).from(workspaces).where(eq(workspaces.id, client.workspaceId)).limit(1);
    if (workspace?.tenantId) {
      return {
        table: "clients",
        id: clientId,
        currentTenantId: null,
        derivedTenantId: workspace.tenantId,
        confidence: "high",
        derivation: "workspaceId -> workspaces.tenantId",
      };
    }
  }
  
  return {
    table: "clients",
    id: clientId,
    currentTenantId: null,
    derivedTenantId: "",
    confidence: "low",
    derivation: "no valid derivation path",
    notes: "manual review required - workspace has no tenantId",
  };
}

/**
 * Derive tenantId for a time entry
 * 
 * Derivation path:
 * 1. projectId -> projects.tenantId
 * 2. userId -> users.tenantId
 * 3. workspaceId -> workspaces.tenantId
 */
async function deriveTimeEntryTenantId(timeEntryId: string): Promise<ProposedUpdate | null> {
  const [entry] = await db.select().from(timeEntries).where(eq(timeEntries.id, timeEntryId)).limit(1);
  if (!entry || entry.tenantId) return null;
  
  // Try projectId first
  if (entry.projectId) {
    const [project] = await db.select({ tenantId: projects.tenantId }).from(projects).where(eq(projects.id, entry.projectId)).limit(1);
    if (project?.tenantId) {
      return {
        table: "time_entries",
        id: timeEntryId,
        currentTenantId: null,
        derivedTenantId: project.tenantId,
        confidence: "high",
        derivation: "projectId -> projects.tenantId",
      };
    }
  }
  
  // Try userId
  if (entry.userId) {
    const [user] = await db.select({ tenantId: users.tenantId }).from(users).where(eq(users.id, entry.userId)).limit(1);
    if (user?.tenantId) {
      return {
        table: "time_entries",
        id: timeEntryId,
        currentTenantId: null,
        derivedTenantId: user.tenantId,
        confidence: "high",
        derivation: "userId -> users.tenantId",
      };
    }
  }
  
  // Try workspaceId
  if (entry.workspaceId) {
    const [workspace] = await db.select({ tenantId: workspaces.tenantId }).from(workspaces).where(eq(workspaces.id, entry.workspaceId)).limit(1);
    if (workspace?.tenantId) {
      return {
        table: "time_entries",
        id: timeEntryId,
        currentTenantId: null,
        derivedTenantId: workspace.tenantId,
        confidence: "high",
        derivation: "workspaceId -> workspaces.tenantId",
      };
    }
  }
  
  return {
    table: "time_entries",
    id: timeEntryId,
    currentTenantId: null,
    derivedTenantId: "",
    confidence: "low",
    derivation: "no valid derivation path",
    notes: "manual review required",
  };
}

// ==============================================================================
// PUBLIC SERVICE FUNCTIONS
// ==============================================================================

/**
 * Get global health summary across all tenants
 */
export async function getGlobalHealthSummary(): Promise<GlobalHealthSummary> {
  // Get all tables' missing tenantId counts
  const [
    usersMissing,
    projectsMissing,
    tasksMissing,
    teamsMissing,
    clientsMissing,
    workspacesMissing,
    timeEntriesMissing,
  ] = await Promise.all([
    getMissingTenantIdRowsExcludingSuperUsers(),
    getMissingTenantIdRows(projects, "projects"),
    getMissingTenantIdRows(tasks, "tasks"),
    getMissingTenantIdRows(teams, "teams"),
    getMissingTenantIdRows(clients, "clients"),
    getMissingTenantIdRows(workspaces, "workspaces"),
    getMissingTenantIdRows(timeEntries, "time_entries"),
  ]);
  
  // Count tenants
  const [tenantCounts] = await db.select({ count: sql<number>`count(*)::int` }).from(tenants);
  const totalTenants = tenantCounts?.count || 0;
  
  // For now, consider "blocked" as any tenant with missing tenantId data
  // A proper implementation would check per-tenant
  const totalOrphanRows = 
    usersMissing.missingCount + 
    projectsMissing.missingCount + 
    tasksMissing.missingCount + 
    teamsMissing.missingCount +
    clientsMissing.missingCount +
    workspacesMissing.missingCount +
    timeEntriesMissing.missingCount;
  
  return {
    totalTenants,
    readyTenants: totalOrphanRows === 0 ? totalTenants : 0, // Simplified
    blockedTenants: totalOrphanRows > 0 ? totalTenants : 0, // Simplified
    totalOrphanRows,
    byTable: {
      users: usersMissing.missingCount,
      projects: projectsMissing.missingCount,
      tasks: tasksMissing.missingCount,
      teams: teamsMissing.missingCount,
      clients: clientsMissing.missingCount,
      workspaces: workspacesMissing.missingCount,
      time_entries: timeEntriesMissing.missingCount,
    },
    tenantSummaries: [], // Would require per-tenant breakdown
  };
}

/**
 * Get health summary for a specific tenant
 */
export async function getTenantHealthSummary(tenantId: string): Promise<TenantHealthSummary | null> {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) return null;
  
  // Check missing tenantIds where records SHOULD belong to this tenant but don't have tenantId
  // This is tricky - we check by workspace ownership
  const tenantWorkspaces = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.tenantId, tenantId));
  const workspaceIds = tenantWorkspaces.map(w => w.id);
  
  const checks: HealthCheckResult[] = [];
  const missingTenantIds: TableMissingTenantIds[] = [];
  const crossTenantMismatches: CrossTenantMismatch[] = [];
  const orphanedReferences: OrphanedReference[] = [];
  
  // Cross-tenant mismatches (global checks relevant to this tenant)
  const [projectClientMismatch, taskProjectMismatch, timeEntryProjectMismatch] = await Promise.all([
    checkProjectClientTenantMismatch(),
    checkTaskProjectTenantMismatch(),
    checkTimeEntryProjectTenantMismatch(),
  ]);
  
  if (projectClientMismatch.mismatchCount > 0) {
    crossTenantMismatches.push(projectClientMismatch);
    checks.push({
      checkName: "project_client_tenant_mismatch",
      severity: "critical",
      count: projectClientMismatch.mismatchCount,
      sampleIds: projectClientMismatch.sampleIds,
      recommendedAction: "Review project-client relationships for tenant consistency",
    });
  }
  
  if (taskProjectMismatch.mismatchCount > 0) {
    crossTenantMismatches.push(taskProjectMismatch);
    checks.push({
      checkName: "task_project_tenant_mismatch",
      severity: "critical",
      count: taskProjectMismatch.mismatchCount,
      sampleIds: taskProjectMismatch.sampleIds,
      recommendedAction: "Review task-project relationships for tenant consistency",
    });
  }
  
  // Orphaned references
  const [orphanedProjects, orphanedTasks] = await Promise.all([
    checkOrphanedProjectsWithMissingClient(),
    checkOrphanedTasksWithMissingProject(),
  ]);
  
  if (orphanedProjects.orphanCount > 0) {
    orphanedReferences.push(orphanedProjects);
    checks.push({
      checkName: "orphaned_project_clientId",
      severity: "warning",
      count: orphanedProjects.orphanCount,
      sampleIds: orphanedProjects.sampleIds,
      recommendedAction: "Clear or reassign clientId for orphaned projects",
    });
  }
  
  if (orphanedTasks.orphanCount > 0) {
    orphanedReferences.push(orphanedTasks);
    checks.push({
      checkName: "orphaned_task_projectId",
      severity: "warning",
      count: orphanedTasks.orphanCount,
      sampleIds: orphanedTasks.sampleIds,
      recommendedAction: "Reassign or mark as personal for orphaned tasks",
    });
  }
  
  const blockerCount = checks.filter(c => c.severity === "critical").reduce((sum, c) => sum + c.count, 0);
  
  return {
    tenantId,
    tenantName: tenant.name,
    status: tenant.status,
    isReady: blockerCount === 0,
    blockerCount,
    missingTenantIds,
    crossTenantMismatches,
    orphanedReferences,
    checks,
  };
}

/**
 * Generate repair preview (dry run)
 */
export async function generateRepairPreview(
  options: {
    tenantId?: string;
    tables?: string[];
    limit?: number;
  }
): Promise<RepairPreviewResult> {
  const limit = options.limit || 500;
  const tables = options.tables || ["projects", "tasks", "teams", "clients", "time_entries"];
  
  const proposedUpdates: ProposedUpdate[] = [];
  const byTable: Record<string, { high: number; low: number }> = {};
  
  for (const tableName of tables) {
    byTable[tableName] = { high: 0, low: 0 };
    
    let missingRows: { id: string }[] = [];
    
    switch (tableName) {
      case "projects":
        missingRows = await db.select({ id: projects.id }).from(projects).where(isNull(projects.tenantId)).limit(limit);
        for (const row of missingRows) {
          const update = await deriveProjectTenantId(row.id);
          if (update) {
            proposedUpdates.push(update);
            byTable[tableName][update.confidence]++;
          }
        }
        break;
      
      case "tasks":
        missingRows = await db.select({ id: tasks.id }).from(tasks).where(isNull(tasks.tenantId)).limit(limit);
        for (const row of missingRows) {
          const update = await deriveTaskTenantId(row.id);
          if (update) {
            proposedUpdates.push(update);
            byTable[tableName][update.confidence]++;
          }
        }
        break;
      
      case "teams":
        missingRows = await db.select({ id: teams.id }).from(teams).where(isNull(teams.tenantId)).limit(limit);
        for (const row of missingRows) {
          const update = await deriveTeamTenantId(row.id);
          if (update) {
            proposedUpdates.push(update);
            byTable[tableName][update.confidence]++;
          }
        }
        break;
      
      case "clients":
        missingRows = await db.select({ id: clients.id }).from(clients).where(isNull(clients.tenantId)).limit(limit);
        for (const row of missingRows) {
          const update = await deriveClientTenantId(row.id);
          if (update) {
            proposedUpdates.push(update);
            byTable[tableName][update.confidence]++;
          }
        }
        break;
      
      case "time_entries":
        missingRows = await db.select({ id: timeEntries.id }).from(timeEntries).where(isNull(timeEntries.tenantId)).limit(limit);
        for (const row of missingRows) {
          const update = await deriveTimeEntryTenantId(row.id);
          if (update) {
            proposedUpdates.push(update);
            byTable[tableName][update.confidence]++;
          }
        }
        break;
    }
  }
  
  const highConfidenceCount = proposedUpdates.filter(u => u.confidence === "high").length;
  const lowConfidenceCount = proposedUpdates.filter(u => u.confidence === "low").length;
  
  return {
    proposedUpdates,
    highConfidenceCount,
    lowConfidenceCount,
    byTable,
  };
}

/**
 * Apply high-confidence repairs
 */
export async function applyRepairs(
  options: {
    tenantId?: string;
    tables?: string[];
    limit?: number;
    applyOnlyHighConfidence?: boolean;
  },
  actor: { userId: string; requestId: string }
): Promise<RepairApplyResult> {
  const preview = await generateRepairPreview(options);
  
  const highConfidenceUpdates = preview.proposedUpdates.filter(u => u.confidence === "high" && u.derivedTenantId);
  
  const updatedCountByTable: Record<string, number> = {};
  const skippedLowConfidenceCountByTable: Record<string, number> = {};
  const sampleUpdatedIds: string[] = [];
  
  // Apply updates per table
  for (const update of highConfidenceUpdates) {
    try {
      switch (update.table) {
        case "projects":
          await db.update(projects).set({ tenantId: update.derivedTenantId }).where(eq(projects.id, update.id));
          break;
        case "tasks":
          await db.update(tasks).set({ tenantId: update.derivedTenantId }).where(eq(tasks.id, update.id));
          break;
        case "teams":
          await db.update(teams).set({ tenantId: update.derivedTenantId }).where(eq(teams.id, update.id));
          break;
        case "clients":
          await db.update(clients).set({ tenantId: update.derivedTenantId }).where(eq(clients.id, update.id));
          break;
        case "time_entries":
          await db.update(timeEntries).set({ tenantId: update.derivedTenantId }).where(eq(timeEntries.id, update.id));
          break;
      }
      
      updatedCountByTable[update.table] = (updatedCountByTable[update.table] || 0) + 1;
      if (sampleUpdatedIds.length < SAMPLE_LIMIT) {
        sampleUpdatedIds.push(`${update.table}:${update.id}`);
      }
      
      // Log the repair
      console.log(`[tenancy-repair] Updated ${update.table}:${update.id} tenantId=${update.derivedTenantId} via ${update.derivation} (requestId=${actor.requestId}, actor=${actor.userId})`);
    } catch (error) {
      console.error(`[tenancy-repair] TENANCY_REPAIR_FAIL: Failed to update ${update.table}:${update.id} (requestId=${actor.requestId}, userId=${actor.userId}):`, error);
    }
  }
  
  // Count skipped low confidence
  for (const update of preview.proposedUpdates.filter(u => u.confidence === "low")) {
    skippedLowConfidenceCountByTable[update.table] = (skippedLowConfidenceCountByTable[update.table] || 0) + 1;
  }
  
  const totalUpdated = Object.values(updatedCountByTable).reduce((sum, c) => sum + c, 0);
  const totalSkipped = Object.values(skippedLowConfidenceCountByTable).reduce((sum, c) => sum + c, 0);
  
  return {
    updatedCountByTable,
    skippedLowConfidenceCountByTable,
    sampleUpdatedIds,
    totalUpdated,
    totalSkipped,
  };
}

export const tenancyHealthService = {
  getGlobalHealthSummary,
  getTenantHealthSummary,
  generateRepairPreview,
  applyRepairs,
};
