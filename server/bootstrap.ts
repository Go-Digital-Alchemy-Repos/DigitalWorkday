import { db } from "./db";
import { users, workspaces, workspaceMembers, teams } from "@shared/schema";
import { hashPassword } from "./auth";
import { eq, and } from "drizzle-orm";

const ADMIN_EMAIL = "admin@dasana.com";
const ADMIN_PASSWORD = "admin123";
const DEFAULT_WORKSPACE_ID = "demo-workspace-id";

const DEFAULT_TEAMS = [
  { id: "engineering-team-id", name: "Engineering" },
  { id: "design-team-id", name: "Design" },
  { id: "marketing-team-id", name: "Marketing" },
];

export async function bootstrapAdminUser(): Promise<void> {
  try {
    let adminId = "admin-user-id";
    
    const existingAdmin = await db.select().from(users).where(eq(users.email, ADMIN_EMAIL)).limit(1);
    
    if (existingAdmin.length === 0) {
      console.log("[bootstrap] Creating admin user...");
      
      const passwordHash = await hashPassword(ADMIN_PASSWORD);
      
      const [admin] = await db.insert(users).values({
        id: adminId,
        email: ADMIN_EMAIL,
        name: "Admin User",
        firstName: "Admin",
        lastName: "User",
        passwordHash,
        role: "admin",
        isActive: true,
      }).returning();
      
      adminId = admin.id;
      console.log("[bootstrap] Admin user created");
    } else {
      adminId = existingAdmin[0].id;
      console.log("[bootstrap] Admin user already exists");
    }

    const existingWorkspace = await db.select().from(workspaces).where(eq(workspaces.id, DEFAULT_WORKSPACE_ID)).limit(1);
    
    if (existingWorkspace.length === 0) {
      console.log("[bootstrap] Creating default workspace...");
      await db.insert(workspaces).values({
        id: DEFAULT_WORKSPACE_ID,
        name: "DASANA Workspace",
        createdBy: adminId,
      });
    }

    const existingMembership = await db.select().from(workspaceMembers)
      .where(and(
        eq(workspaceMembers.userId, adminId),
        eq(workspaceMembers.workspaceId, DEFAULT_WORKSPACE_ID)
      ))
      .limit(1);
    
    if (existingMembership.length === 0) {
      console.log("[bootstrap] Adding admin to workspace...");
      await db.insert(workspaceMembers).values({
        workspaceId: DEFAULT_WORKSPACE_ID,
        userId: adminId,
        role: "owner",
        status: "active",
      });
    }

    for (const team of DEFAULT_TEAMS) {
      const existingTeam = await db.select().from(teams).where(eq(teams.id, team.id)).limit(1);
      
      if (existingTeam.length === 0) {
        console.log(`[bootstrap] Creating team: ${team.name}`);
        await db.insert(teams).values({
          id: team.id,
          workspaceId: DEFAULT_WORKSPACE_ID,
          name: team.name,
        });
      }
    }

    console.log("[bootstrap] Bootstrap complete");
    console.log("[bootstrap] Login: admin@dasana.com / admin123");
  } catch (error) {
    console.error("[bootstrap] Error during bootstrap:", error);
  }
}
