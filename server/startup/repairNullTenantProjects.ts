import { db } from "../db";
import { projects, workspaces, users, projectMembers, projectAccess } from "@shared/schema";
import { eq, isNull, and } from "drizzle-orm";

/**
 * One-time startup repair: fix projects created via POST /api/clients/:clientId/projects
 * that were saved without a tenant_id due to a bug in the legacy endpoint.
 *
 * Safe to run repeatedly — only acts on rows where tenant_id IS NULL.
 */
export async function repairNullTenantProjects(): Promise<void> {
  try {
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

    if (broken.length === 0) return;

    console.log(`[repairNullTenantProjects] Found ${broken.length} project(s) with NULL tenant_id — repairing...`);

    for (const project of broken) {
      if (!project.workspaceId) {
        console.warn(`[repairNullTenantProjects] SKIP ${project.id} (${project.name}) — no workspaceId`);
        continue;
      }

      const [ws] = await db
        .select({ tenantId: workspaces.tenantId })
        .from(workspaces)
        .where(eq(workspaces.id, project.workspaceId))
        .limit(1);

      if (!ws?.tenantId) {
        console.warn(`[repairNullTenantProjects] SKIP ${project.id} (${project.name}) — workspace has no tenantId`);
        continue;
      }

      const tenantId = ws.tenantId;

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
      } else {
        if (project.createdBy) {
          await db
            .insert(projectMembers)
            .values({ projectId: project.id, userId: project.createdBy, role: "owner" })
            .onConflictDoNothing();
          await db
            .insert(projectAccess)
            .values({ tenantId, projectId: project.id, userId: project.createdBy, role: "admin" })
            .onConflictDoNothing();
        }
      }

      console.log(`[repairNullTenantProjects] Fixed project ${project.id} (${project.name}) → tenant=${tenantId}`);
    }

    console.log(`[repairNullTenantProjects] Repair complete.`);
  } catch (err) {
    console.error("[repairNullTenantProjects] Error during repair:", err instanceof Error ? err.message : err);
  }
}
