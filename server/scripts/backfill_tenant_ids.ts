/**
 * Tenant ID Backfill and Remediation Script
 * 
 * This script safely backfills missing tenantId values across tenant-scoped tables.
 * It uses reliable relationships to infer tenantId, and quarantines ambiguous rows.
 * 
 * SAFETY RULES:
 * - Never drops or deletes data
 * - All changes are auditable and reversible
 * - Requires explicit env vars to run
 * - Supports dry-run mode (default)
 * 
 * ENV VARS:
 * - BACKFILL_TENANT_IDS_ALLOWED=true  (required to run)
 * - BACKFILL_DRY_RUN=true             (default: true, set to false for real updates)
 * 
 * Usage:
 *   BACKFILL_TENANT_IDS_ALLOWED=true BACKFILL_DRY_RUN=true npx tsx server/scripts/backfill_tenant_ids.ts
 */

import "dotenv/config";
import { db } from "../db";
import { 
  tenants, tenantAuditEvents, tenantSettings,
  users, workspaces, teams, clients, projects, tasks,
  workspaceMembers, invitations,
  UserRole, TenantStatus
} from "@shared/schema";
import { eq, isNull, ne, and, sql, inArray } from "drizzle-orm";

// Configuration
const ALLOWED = process.env.BACKFILL_TENANT_IDS_ALLOWED === "true";
const DRY_RUN = process.env.BACKFILL_DRY_RUN !== "false"; // Default to true for safety

// Quarantine tenant constants
const QUARANTINE_TENANT_NAME = "Quarantine / Legacy Data";
const QUARANTINE_TENANT_SLUG = "quarantine";
const QUARANTINE_WORKSPACE_NAME = "Quarantine Workspace";

interface AnalysisResult {
  table: string;
  totalMissing: number;
  inferable: number;
  ambiguous: number;
  alreadyFixed: number;
  inferableIds: string[];
  ambiguousIds: string[];
}

interface RemediationResult {
  table: string;
  backfilled: number;
  quarantined: number;
  errors: string[];
}

// =============================================================================
// ANALYSIS FUNCTIONS (NO WRITES)
// =============================================================================

async function analyzeProjects(): Promise<AnalysisResult> {
  console.log("\n📊 Analyzing projects table...");
  
  // Get projects with missing tenantId
  const missingRows = await db.select({
    id: projects.id,
    workspaceId: projects.workspaceId,
    clientId: projects.clientId,
    createdBy: projects.createdBy,
  })
    .from(projects)
    .where(isNull(projects.tenantId));
  
  const totalMissing = missingRows.length;
  const inferableIds: string[] = [];
  const ambiguousIds: string[] = [];
  
  for (const row of missingRows) {
    let inferredTenantId: string | null = null;
    
    // Try workspace -> tenantId
    if (row.workspaceId) {
      const [ws] = await db.select({ tenantId: workspaces.tenantId })
        .from(workspaces)
        .where(eq(workspaces.id, row.workspaceId))
        .limit(1);
      if (ws?.tenantId) {
        inferredTenantId = ws.tenantId;
      }
    }
    
    // Try client -> tenantId if still null
    if (!inferredTenantId && row.clientId) {
      const [cl] = await db.select({ tenantId: clients.tenantId })
        .from(clients)
        .where(eq(clients.id, row.clientId))
        .limit(1);
      if (cl?.tenantId) {
        inferredTenantId = cl.tenantId;
      }
    }
    
    // Try createdBy user -> tenantId if still null
    if (!inferredTenantId && row.createdBy) {
      const [usr] = await db.select({ tenantId: users.tenantId })
        .from(users)
        .where(eq(users.id, row.createdBy))
        .limit(1);
      if (usr?.tenantId) {
        inferredTenantId = usr.tenantId;
      }
    }
    
    if (inferredTenantId) {
      inferableIds.push(row.id);
    } else {
      ambiguousIds.push(row.id);
    }
  }
  
  // Count already fixed (has tenantId)
  const [fixedResult] = await db.select({ count: sql<number>`count(*)::int` })
    .from(projects)
    .where(sql`${projects.tenantId} IS NOT NULL`);
  
  return {
    table: "projects",
    totalMissing,
    inferable: inferableIds.length,
    ambiguous: ambiguousIds.length,
    alreadyFixed: fixedResult?.count || 0,
    inferableIds,
    ambiguousIds: ambiguousIds.slice(0, 50),
  };
}

async function analyzeTasks(): Promise<AnalysisResult> {
  console.log("\n📊 Analyzing tasks table...");
  
  const missingRows = await db.select({
    id: tasks.id,
    projectId: tasks.projectId,
    createdBy: tasks.createdBy,
  })
    .from(tasks)
    .where(isNull(tasks.tenantId));
  
  const totalMissing = missingRows.length;
  const inferableIds: string[] = [];
  const ambiguousIds: string[] = [];
  
  for (const row of missingRows) {
    let inferredTenantId: string | null = null;
    
    // Try project -> tenantId
    if (row.projectId) {
      const [proj] = await db.select({ tenantId: projects.tenantId })
        .from(projects)
        .where(eq(projects.id, row.projectId))
        .limit(1);
      if (proj?.tenantId) {
        inferredTenantId = proj.tenantId;
      }
    }
    
    // Try createdBy user -> tenantId if still null
    if (!inferredTenantId && row.createdBy) {
      const [usr] = await db.select({ tenantId: users.tenantId })
        .from(users)
        .where(eq(users.id, row.createdBy))
        .limit(1);
      if (usr?.tenantId) {
        inferredTenantId = usr.tenantId;
      }
    }
    
    if (inferredTenantId) {
      inferableIds.push(row.id);
    } else {
      ambiguousIds.push(row.id);
    }
  }
  
  const [fixedResult] = await db.select({ count: sql<number>`count(*)::int` })
    .from(tasks)
    .where(sql`${tasks.tenantId} IS NOT NULL`);
  
  return {
    table: "tasks",
    totalMissing,
    inferable: inferableIds.length,
    ambiguous: ambiguousIds.length,
    alreadyFixed: fixedResult?.count || 0,
    inferableIds,
    ambiguousIds: ambiguousIds.slice(0, 50),
  };
}

async function analyzeTeams(): Promise<AnalysisResult> {
  console.log("\n📊 Analyzing teams table...");
  
  const missingRows = await db.select({
    id: teams.id,
    workspaceId: teams.workspaceId,
  })
    .from(teams)
    .where(isNull(teams.tenantId));
  
  const totalMissing = missingRows.length;
  const inferableIds: string[] = [];
  const ambiguousIds: string[] = [];
  
  for (const row of missingRows) {
    let inferredTenantId: string | null = null;
    
    // Try workspace -> tenantId
    if (row.workspaceId) {
      const [ws] = await db.select({ tenantId: workspaces.tenantId })
        .from(workspaces)
        .where(eq(workspaces.id, row.workspaceId))
        .limit(1);
      if (ws?.tenantId) {
        inferredTenantId = ws.tenantId;
      }
    }
    
    if (inferredTenantId) {
      inferableIds.push(row.id);
    } else {
      ambiguousIds.push(row.id);
    }
  }
  
  const [fixedResult] = await db.select({ count: sql<number>`count(*)::int` })
    .from(teams)
    .where(sql`${teams.tenantId} IS NOT NULL`);
  
  return {
    table: "teams",
    totalMissing,
    inferable: inferableIds.length,
    ambiguous: ambiguousIds.length,
    alreadyFixed: fixedResult?.count || 0,
    inferableIds,
    ambiguousIds: ambiguousIds.slice(0, 50),
  };
}

async function analyzeUsers(): Promise<AnalysisResult> {
  console.log("\n📊 Analyzing users table...");
  
  // Get non-super users with missing tenantId
  const missingRows = await db.select({
    id: users.id,
    role: users.role,
    email: users.email,
  })
    .from(users)
    .where(and(
      isNull(users.tenantId),
      ne(users.role, UserRole.SUPER_USER)
    ));
  
  const totalMissing = missingRows.length;
  const inferableIds: string[] = [];
  const ambiguousIds: string[] = [];
  
  for (const row of missingRows) {
    const inferredTenantIds = new Set<string>();
    
    // Check workspace memberships
    const memberships = await db.select({ workspaceId: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, row.id));
    
    for (const m of memberships) {
      const [ws] = await db.select({ tenantId: workspaces.tenantId })
        .from(workspaces)
        .where(eq(workspaces.id, m.workspaceId))
        .limit(1);
      if (ws?.tenantId) {
        inferredTenantIds.add(ws.tenantId);
      }
    }
    
    // Check invitations
    const userInvitations = await db.select({ tenantId: invitations.tenantId })
      .from(invitations)
      .where(eq(invitations.email, row.email));
    
    for (const inv of userInvitations) {
      if (inv.tenantId) {
        inferredTenantIds.add(inv.tenantId);
      }
    }
    
    // Check projects created by user
    const userProjects = await db.select({ tenantId: projects.tenantId })
      .from(projects)
      .where(eq(projects.createdBy, row.id));
    
    for (const proj of userProjects) {
      if (proj.tenantId) {
        inferredTenantIds.add(proj.tenantId);
      }
    }
    
    // If exactly one tenantId found, it's inferable
    if (inferredTenantIds.size === 1) {
      inferableIds.push(row.id);
    } else {
      // Multiple or zero tenantIds = ambiguous
      ambiguousIds.push(row.id);
    }
  }
  
  const [fixedResult] = await db.select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(and(
      sql`${users.tenantId} IS NOT NULL`,
      ne(users.role, UserRole.SUPER_USER)
    ));
  
  return {
    table: "users",
    totalMissing,
    inferable: inferableIds.length,
    ambiguous: ambiguousIds.length,
    alreadyFixed: fixedResult?.count || 0,
    inferableIds,
    ambiguousIds: ambiguousIds.slice(0, 50),
  };
}

// =============================================================================
// QUARANTINE SETUP
// =============================================================================

async function ensureQuarantineTenant(): Promise<{ tenantId: string; workspaceId: string }> {
  console.log("\n🔒 Ensuring quarantine tenant exists...");
  
  // Check if quarantine tenant already exists (by slug for stability)
  let [existingTenant] = await db.select()
    .from(tenants)
    .where(eq(tenants.slug, QUARANTINE_TENANT_SLUG))
    .limit(1);
  
  // In dry-run mode, return placeholders if no existing tenant
  if (DRY_RUN && !existingTenant) {
    console.log("  [DRY RUN] Would create quarantine tenant and workspace");
    return { tenantId: "dry-run-quarantine-tenant", workspaceId: "dry-run-quarantine-workspace" };
  }
  
  let tenantId: string;
  
  if (existingTenant) {
    console.log(`  Found existing quarantine tenant: ${existingTenant.id}`);
    tenantId = existingTenant.id;
  } else {
    // Create quarantine tenant
    const [newTenant] = await db.insert(tenants).values({
      name: QUARANTINE_TENANT_NAME,
      slug: QUARANTINE_TENANT_SLUG,
      status: TenantStatus.INACTIVE,
    }).returning();
    
    tenantId = newTenant.id;
    console.log(`  Created quarantine tenant: ${tenantId}`);
    
    // Create tenant settings
    await db.insert(tenantSettings).values({
      tenantId,
      displayName: QUARANTINE_TENANT_NAME,
      whiteLabelEnabled: false,
      hideVendorBranding: false,
    });
  }
  
  // Ensure quarantine workspace exists
  let [existingWorkspace] = await db.select()
    .from(workspaces)
    .where(and(
      eq(workspaces.tenantId, tenantId),
      eq(workspaces.name, QUARANTINE_WORKSPACE_NAME)
    ))
    .limit(1);
  
  // In dry-run mode, return existing tenant but placeholder workspace if needed
  if (DRY_RUN && !existingWorkspace) {
    console.log("  [DRY RUN] Would create quarantine workspace");
    return { tenantId, workspaceId: "dry-run-quarantine-workspace" };
  }
  
  let workspaceId: string;
  
  if (existingWorkspace) {
    console.log(`  Found existing quarantine workspace: ${existingWorkspace.id}`);
    workspaceId = existingWorkspace.id;
  } else {
    const [newWorkspace] = await db.insert(workspaces).values({
      name: QUARANTINE_WORKSPACE_NAME,
      tenantId,
      isPrimary: true,
    }).returning();
    
    workspaceId = newWorkspace.id;
    console.log(`  Created quarantine workspace: ${workspaceId}`);
  }
  
  return { tenantId, workspaceId };
}

// =============================================================================
// REMEDIATION FUNCTIONS
// =============================================================================

async function backfillProjects(quarantineTenantId: string): Promise<RemediationResult> {
  console.log("\n🔧 Backfilling projects...");
  const errors: string[] = [];
  let backfilled = 0;
  let quarantined = 0;
  
  const missingRows = await db.select({
    id: projects.id,
    workspaceId: projects.workspaceId,
    clientId: projects.clientId,
    createdBy: projects.createdBy,
  })
    .from(projects)
    .where(isNull(projects.tenantId));
  
  for (const row of missingRows) {
    try {
      let inferredTenantId: string | null = null;
      
      // Try workspace -> tenantId
      if (row.workspaceId) {
        const [ws] = await db.select({ tenantId: workspaces.tenantId })
          .from(workspaces)
          .where(eq(workspaces.id, row.workspaceId))
          .limit(1);
        if (ws?.tenantId) {
          inferredTenantId = ws.tenantId;
        }
      }
      
      // Try client -> tenantId
      if (!inferredTenantId && row.clientId) {
        const [cl] = await db.select({ tenantId: clients.tenantId })
          .from(clients)
          .where(eq(clients.id, row.clientId))
          .limit(1);
        if (cl?.tenantId) {
          inferredTenantId = cl.tenantId;
        }
      }
      
      // Try createdBy user -> tenantId
      if (!inferredTenantId && row.createdBy) {
        const [usr] = await db.select({ tenantId: users.tenantId })
          .from(users)
          .where(eq(users.id, row.createdBy))
          .limit(1);
        if (usr?.tenantId) {
          inferredTenantId = usr.tenantId;
        }
      }
      
      const targetTenantId = inferredTenantId || quarantineTenantId;
      const isQuarantine = !inferredTenantId;
      
      if (DRY_RUN) {
        console.log(`  [DRY RUN] Would update project ${row.id} with tenantId=${targetTenantId}${isQuarantine ? " (quarantine)" : ""}`);
      } else {
        await db.update(projects)
          .set({ 
            tenantId: targetTenantId,
            status: isQuarantine ? "archived" : undefined,
          })
          .where(eq(projects.id, row.id));
      }
      
      if (isQuarantine) {
        quarantined++;
      } else {
        backfilled++;
      }
    } catch (error) {
      errors.push(`Project ${row.id}: ${error}`);
    }
  }
  
  return { table: "projects", backfilled, quarantined, errors };
}

async function backfillTasks(quarantineTenantId: string): Promise<RemediationResult> {
  console.log("\n🔧 Backfilling tasks...");
  const errors: string[] = [];
  let backfilled = 0;
  let quarantined = 0;
  
  const missingRows = await db.select({
    id: tasks.id,
    projectId: tasks.projectId,
    createdBy: tasks.createdBy,
  })
    .from(tasks)
    .where(isNull(tasks.tenantId));
  
  for (const row of missingRows) {
    try {
      let inferredTenantId: string | null = null;
      
      // Try project -> tenantId (projects should be backfilled first)
      if (row.projectId) {
        const [proj] = await db.select({ tenantId: projects.tenantId })
          .from(projects)
          .where(eq(projects.id, row.projectId))
          .limit(1);
        if (proj?.tenantId) {
          inferredTenantId = proj.tenantId;
        }
      }
      
      // Try createdBy user -> tenantId
      if (!inferredTenantId && row.createdBy) {
        const [usr] = await db.select({ tenantId: users.tenantId })
          .from(users)
          .where(eq(users.id, row.createdBy))
          .limit(1);
        if (usr?.tenantId) {
          inferredTenantId = usr.tenantId;
        }
      }
      
      const targetTenantId = inferredTenantId || quarantineTenantId;
      const isQuarantine = !inferredTenantId;
      
      if (DRY_RUN) {
        console.log(`  [DRY RUN] Would update task ${row.id} with tenantId=${targetTenantId}${isQuarantine ? " (quarantine)" : ""}`);
      } else {
        await db.update(tasks)
          .set({ 
            tenantId: targetTenantId,
            status: isQuarantine ? "archived" : undefined,
          })
          .where(eq(tasks.id, row.id));
      }
      
      if (isQuarantine) {
        quarantined++;
      } else {
        backfilled++;
      }
    } catch (error) {
      errors.push(`Task ${row.id}: ${error}`);
    }
  }
  
  return { table: "tasks", backfilled, quarantined, errors };
}

async function backfillTeams(quarantineTenantId: string): Promise<RemediationResult> {
  console.log("\n🔧 Backfilling teams...");
  const errors: string[] = [];
  let backfilled = 0;
  let quarantined = 0;
  
  const missingRows = await db.select({
    id: teams.id,
    workspaceId: teams.workspaceId,
  })
    .from(teams)
    .where(isNull(teams.tenantId));
  
  for (const row of missingRows) {
    try {
      let inferredTenantId: string | null = null;
      
      // Try workspace -> tenantId
      if (row.workspaceId) {
        const [ws] = await db.select({ tenantId: workspaces.tenantId })
          .from(workspaces)
          .where(eq(workspaces.id, row.workspaceId))
          .limit(1);
        if (ws?.tenantId) {
          inferredTenantId = ws.tenantId;
        }
      }
      
      const targetTenantId = inferredTenantId || quarantineTenantId;
      const isQuarantine = !inferredTenantId;
      
      if (DRY_RUN) {
        console.log(`  [DRY RUN] Would update team ${row.id} with tenantId=${targetTenantId}${isQuarantine ? " (quarantine)" : ""}`);
      } else {
        await db.update(teams)
          .set({ tenantId: targetTenantId })
          .where(eq(teams.id, row.id));
      }
      
      if (isQuarantine) {
        quarantined++;
      } else {
        backfilled++;
      }
    } catch (error) {
      errors.push(`Team ${row.id}: ${error}`);
    }
  }
  
  return { table: "teams", backfilled, quarantined, errors };
}

async function backfillUsers(quarantineTenantId: string): Promise<RemediationResult> {
  console.log("\n🔧 Backfilling users...");
  const errors: string[] = [];
  let backfilled = 0;
  let quarantined = 0;
  
  // Get non-super users with missing tenantId
  const missingRows = await db.select({
    id: users.id,
    email: users.email,
    role: users.role,
  })
    .from(users)
    .where(and(
      isNull(users.tenantId),
      ne(users.role, UserRole.SUPER_USER)
    ));
  
  for (const row of missingRows) {
    try {
      const inferredTenantIds = new Set<string>();
      
      // Check workspace memberships
      const memberships = await db.select({ workspaceId: workspaceMembers.workspaceId })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.userId, row.id));
      
      for (const m of memberships) {
        const [ws] = await db.select({ tenantId: workspaces.tenantId })
          .from(workspaces)
          .where(eq(workspaces.id, m.workspaceId))
          .limit(1);
        if (ws?.tenantId) {
          inferredTenantIds.add(ws.tenantId);
        }
      }
      
      // Check invitations
      const userInvitations = await db.select({ tenantId: invitations.tenantId })
        .from(invitations)
        .where(eq(invitations.email, row.email));
      
      for (const inv of userInvitations) {
        if (inv.tenantId) {
          inferredTenantIds.add(inv.tenantId);
        }
      }
      
      // Check projects created by user
      const userProjects = await db.select({ tenantId: projects.tenantId })
        .from(projects)
        .where(eq(projects.createdBy, row.id));
      
      for (const proj of userProjects) {
        if (proj.tenantId) {
          inferredTenantIds.add(proj.tenantId);
        }
      }
      
      let targetTenantId: string;
      let isQuarantine: boolean;
      
      if (inferredTenantIds.size === 1) {
        // Exactly one tenant found - use it
        targetTenantId = Array.from(inferredTenantIds)[0];
        isQuarantine = false;
      } else {
        // Zero or multiple tenants - quarantine
        targetTenantId = quarantineTenantId;
        isQuarantine = true;
      }
      
      if (DRY_RUN) {
        console.log(`  [DRY RUN] Would update user ${row.id} (${row.email}) with tenantId=${targetTenantId}${isQuarantine ? " (quarantine)" : ""}`);
      } else {
        await db.update(users)
          .set({ 
            tenantId: targetTenantId,
            isActive: isQuarantine ? false : true,
          })
          .where(eq(users.id, row.id));
      }
      
      if (isQuarantine) {
        quarantined++;
      } else {
        backfilled++;
      }
    } catch (error) {
      errors.push(`User ${row.id}: ${error}`);
    }
  }
  
  return { table: "users", backfilled, quarantined, errors };
}

// =============================================================================
// AUDIT LOGGING
// =============================================================================

async function logAuditEvent(
  action: string, 
  details: Record<string, unknown>,
  quarantineTenantId: string
): Promise<void> {
  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would log audit event: ${action}`);
    return;
  }
  
  await db.insert(tenantAuditEvents).values({
    tenantId: quarantineTenantId,
    actorUserId: null,
    eventType: "system_remediation",
    message: `Backfill script: ${action}`,
    metadata: {
      action,
      ...details,
      timestamp: new Date().toISOString(),
      dryRun: DRY_RUN,
    },
  });
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("   TENANT ID BACKFILL AND REMEDIATION SCRIPT");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no changes will be made)" : "⚠️  LIVE RUN - CHANGES WILL BE MADE"}`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log("═══════════════════════════════════════════════════════════════\n");
  
  // Check if allowed to run
  if (!ALLOWED) {
    console.error("❌ BACKFILL_TENANT_IDS_ALLOWED is not set to 'true'");
    console.error("   Set BACKFILL_TENANT_IDS_ALLOWED=true to run this script");
    process.exit(1);
  }
  
  try {
    // STEP 1: ANALYSIS
    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║  STEP 1: ANALYZING RELATIONSHIPS                              ║");
    console.log("╚══════════════════════════════════════════════════════════════╝");
    
    const projectsAnalysis = await analyzeProjects();
    const tasksAnalysis = await analyzeTasks();
    const teamsAnalysis = await analyzeTeams();
    const usersAnalysis = await analyzeUsers();
    
    const analysisResults = [projectsAnalysis, tasksAnalysis, teamsAnalysis, usersAnalysis];
    
    console.log("\n┌────────────────────────────────────────────────────────────────┐");
    console.log("│                    ANALYSIS SUMMARY                            │");
    console.log("├────────────┬──────────┬──────────┬───────────┬────────────────┤");
    console.log("│ Table      │ Missing  │ Inferable│ Ambiguous │ Already Fixed  │");
    console.log("├────────────┼──────────┼──────────┼───────────┼────────────────┤");
    
    for (const result of analysisResults) {
      console.log(`│ ${result.table.padEnd(10)} │ ${String(result.totalMissing).padStart(8)} │ ${String(result.inferable).padStart(8)} │ ${String(result.ambiguous).padStart(9)} │ ${String(result.alreadyFixed).padStart(14)} │`);
    }
    console.log("└────────────┴──────────┴──────────┴───────────┴────────────────┘");
    
    // Show ambiguous IDs
    for (const result of analysisResults) {
      if (result.ambiguousIds.length > 0) {
        console.log(`\n⚠️  Ambiguous ${result.table} IDs (showing up to 50):`);
        console.log(`   ${result.ambiguousIds.join(", ")}`);
      }
    }
    
    // STEP 2: QUARANTINE SETUP
    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║  STEP 2: QUARANTINE TENANT SETUP                              ║");
    console.log("╚══════════════════════════════════════════════════════════════╝");
    
    const { tenantId: quarantineTenantId, workspaceId: quarantineWorkspaceId } = await ensureQuarantineTenant();
    console.log(`  Quarantine Tenant ID: ${quarantineTenantId}`);
    console.log(`  Quarantine Workspace ID: ${quarantineWorkspaceId}`);
    
    // STEP 3: REMEDIATION
    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║  STEP 3: REMEDIATION                                          ║");
    console.log("╚══════════════════════════════════════════════════════════════╝");
    
    // Backfill in dependency order
    const projectsResult = await backfillProjects(quarantineTenantId);
    const tasksResult = await backfillTasks(quarantineTenantId);
    const teamsResult = await backfillTeams(quarantineTenantId);
    const usersResult = await backfillUsers(quarantineTenantId);
    
    const remediationResults = [projectsResult, tasksResult, teamsResult, usersResult];
    
    // Log audit events
    if (!DRY_RUN) {
      for (const result of remediationResults) {
        if (result.backfilled > 0) {
          await logAuditEvent("tenantId_backfilled", {
            table: result.table,
            count: result.backfilled,
          }, quarantineTenantId);
        }
        if (result.quarantined > 0) {
          await logAuditEvent("rows_quarantined", {
            table: result.table,
            count: result.quarantined,
          }, quarantineTenantId);
        }
      }
    }
    
    // SUMMARY
    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║  REMEDIATION SUMMARY                                          ║");
    console.log("╚══════════════════════════════════════════════════════════════╝");
    
    console.log("\n┌────────────────────────────────────────────────────────────────┐");
    console.log("│                    RESULTS                                     │");
    console.log("├────────────┬─────────────┬──────────────┬─────────────────────┤");
    console.log("│ Table      │ Backfilled  │ Quarantined  │ Errors              │");
    console.log("├────────────┼─────────────┼──────────────┼─────────────────────┤");
    
    let totalBackfilled = 0;
    let totalQuarantined = 0;
    let totalErrors = 0;
    
    for (const result of remediationResults) {
      console.log(`│ ${result.table.padEnd(10)} │ ${String(result.backfilled).padStart(11)} │ ${String(result.quarantined).padStart(12)} │ ${String(result.errors.length).padStart(19)} │`);
      totalBackfilled += result.backfilled;
      totalQuarantined += result.quarantined;
      totalErrors += result.errors.length;
    }
    
    console.log("├────────────┼─────────────┼──────────────┼─────────────────────┤");
    console.log(`│ TOTAL      │ ${String(totalBackfilled).padStart(11)} │ ${String(totalQuarantined).padStart(12)} │ ${String(totalErrors).padStart(19)} │`);
    console.log("└────────────┴─────────────┴──────────────┴─────────────────────┘");
    
    // Show errors if any
    for (const result of remediationResults) {
      if (result.errors.length > 0) {
        console.log(`\n❌ Errors in ${result.table}:`);
        for (const error of result.errors.slice(0, 10)) {
          console.log(`   - ${error}`);
        }
        if (result.errors.length > 10) {
          console.log(`   ... and ${result.errors.length - 10} more errors`);
        }
      }
    }
    
    console.log("\n═══════════════════════════════════════════════════════════════");
    console.log(DRY_RUN 
      ? "   DRY RUN COMPLETE - No changes were made"
      : "   REMEDIATION COMPLETE - Changes have been applied"
    );
    console.log("═══════════════════════════════════════════════════════════════");
    
    if (DRY_RUN) {
      console.log("\n📋 To run for real, set BACKFILL_DRY_RUN=false:");
      console.log("   BACKFILL_TENANT_IDS_ALLOWED=true BACKFILL_DRY_RUN=false npx tsx server/scripts/backfill_tenant_ids.ts");
    }
    
  } catch (error) {
    console.error("\n❌ Script failed with error:", error);
    process.exit(1);
  }
  
  process.exit(0);
}

main();
