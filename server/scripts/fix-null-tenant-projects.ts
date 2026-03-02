/**
 * One-time repair script: fix projects created via POST /api/clients/:clientId/projects
 * that were saved without a tenant_id.
 *
 * Backfills tenant_id from the workspace and adds all tenant users as project members.
 *
 * Run with: npx tsx server/scripts/fix-null-tenant-projects.ts [--dry-run]
 */
import { db } from "../db";
import { projects, workspaces, users, projectMembers } from "@shared/schema";
import { eq, isNull, and, sql } from "drizzle-orm";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  console.log(`[fix-null-tenant-projects] Starting (${DRY_RUN ? "DRY RUN" : "LIVE"})...`);

  const broken = await db
    .select({
      id: projects.id,
      name: projects.name,
      workspaceId: projects.workspaceId,
      createdBy: projects.createdBy,
      visibility: projects.visibility,
    })
    .from(projects)
    .where(isNull(projects.tenantId));

  console.log(`[fix-null-tenant-projects] Found ${broken.length} project(s) with NULL tenant_id`);

  for (const project of broken) {
    if (!project.workspaceId) {
      console.warn(`  SKIP ${project.id} (${project.name}) — no workspaceId`);
      continue;
    }

    const [ws] = await db
      .select({ tenantId: workspaces.tenantId })
      .from(workspaces)
      .where(eq(workspaces.id, project.workspaceId))
      .limit(1);

    if (!ws?.tenantId) {
      console.warn(`  SKIP ${project.id} (${project.name}) — workspace has no tenantId`);
      continue;
    }

    const tenantId = ws.tenantId;
    console.log(`  FIX  ${project.id} (${project.name}) → tenant=${tenantId}`);

    if (!DRY_RUN) {
      await db
        .update(projects)
        .set({ tenantId })
        .where(eq(projects.id, project.id));

      if (project.visibility !== "private") {
        const tenantUsers = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.tenantId, tenantId), eq(users.isActive, true)));

        for (const u of tenantUsers) {
          const role = u.id === project.createdBy ? "owner" : "member";
          await db
            .insert(projectMembers)
            .values({ projectId: project.id, userId: u.id, role })
            .onConflictDoNothing();
        }
        console.log(`    → Added ${tenantUsers.length} tenant member(s)`);
      } else {
        if (project.createdBy) {
          await db
            .insert(projectMembers)
            .values({ projectId: project.id, userId: project.createdBy, role: "owner" })
            .onConflictDoNothing();
          console.log(`    → Added creator as owner (private project)`);
        }
      }
    }
  }

  console.log(`[fix-null-tenant-projects] Done.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[fix-null-tenant-projects] Fatal error:", err);
  process.exit(1);
});
