import { db } from "../db";
import {
  tenants,
  users,
  workspaces,
  workspaceMembers,
  projects,
  projectMembers,
  sections,
  tasks,
  taskAssignees,
  clients,
  clientCrm,
  tenantIntegrations,
} from "../../shared/schema";
import { hashPassword } from "../auth";
import { nanoid } from "nanoid";
import { eq, sql } from "drizzle-orm";

async function seed() {
  console.log("Seeding comprehensive tenant data...");

  // Clean up tenant-scoped data only — preserve dev workspace users (tenantId = null)
  await db.execute(sql`DELETE FROM task_assignees WHERE task_id IN (SELECT id FROM tasks WHERE tenant_id IS NOT NULL)`);
  await db.execute(sql`DELETE FROM tasks WHERE tenant_id IS NOT NULL`);
  await db.execute(sql`DELETE FROM sections WHERE project_id IN (SELECT id FROM projects WHERE tenant_id IS NOT NULL)`);
  await db.execute(sql`DELETE FROM project_members WHERE project_id IN (SELECT id FROM projects WHERE tenant_id IS NOT NULL)`);
  await db.execute(sql`DELETE FROM projects WHERE tenant_id IS NOT NULL`);
  await db.execute(sql`DELETE FROM workspace_members WHERE workspace_id IN (SELECT id FROM workspaces WHERE tenant_id IS NOT NULL)`);
  await db.execute(sql`DELETE FROM workspaces WHERE tenant_id IS NOT NULL`);
  await db.execute(sql`DELETE FROM client_crm WHERE tenant_id IS NOT NULL`);
  await db.execute(sql`DELETE FROM clients WHERE tenant_id IS NOT NULL`);
  await db.execute(sql`DELETE FROM tenant_integrations WHERE tenant_id IS NOT NULL`);
  await db.execute(sql`DELETE FROM users WHERE tenant_id IS NOT NULL`);
  await db.execute(sql`DELETE FROM tenants`);

  const passwordHash = await hashPassword("password123");

  // Create 5 different tenants with varying states
  const tenantData = [
    { name: "Alpha Corp", slug: "alpha", status: "active" },
    { name: "Beta Systems", slug: "beta", status: "active" },
    { name: "Gamma Creative", slug: "gamma", status: "inactive" },
    { name: "Delta Logistics", slug: "delta", status: "suspended" },
    { name: "Epsilon Health", slug: "epsilon", status: "active" },
  ];

  for (const t of tenantData) {
    const tenantId = nanoid();
    const [tenant] = await db.insert(tenants).values({
      id: tenantId,
      name: t.name,
      slug: t.slug,
      status: t.status as any,
      settings: {
        displayName: t.name,
        primaryColor: "#3b82f6",
        whiteLabelEnabled: Math.random() > 0.5,
      },
    }).returning();

    console.log(`Created tenant: ${t.name} (${tenantId})`);

    // Create an admin for each tenant
    const [admin] = await db.insert(users).values({
      id: nanoid(),
      tenantId: tenant.id,
      email: `admin@${t.slug}.com`,
      name: `${t.name} Admin`,
      passwordHash,
      role: "admin",
      isActive: true,
    }).returning();

    // Create some employees
    for (let i = 1; i <= 5; i++) {
      await db.insert(users).values({
        id: nanoid(),
        tenantId: tenant.id,
        email: `user${i}@${t.slug}.com`,
        name: `Employee ${i} (${t.name})`,
        passwordHash,
        role: "employee",
        isActive: Math.random() > 0.1,
      });
    }

    // Create workspace
    const [workspace] = await db.insert(workspaces).values({
      id: nanoid(),
      tenantId: tenant.id,
      name: `${t.name} Primary Workspace`,
      createdBy: admin.id,
    }).returning();

    await db.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: admin.id,
      role: "owner",
      status: "active",
    });

    // Create some clients for CRM reports
    for (let i = 1; i <= 3; i++) {
      const clientId = nanoid();
      await db.insert(clients).values({
        id: clientId,
        tenantId: tenant.id,
        workspaceId: workspace.id,
        companyName: `${t.name} Client ${i}`,
        status: i === 1 ? "active" : "lead",
      });

      await db.insert(clientCrm).values({
        clientId: clientId,
        tenantId: tenant.id,
        healthScore: Math.floor(Math.random() * 100),
        lifecycleStage: i === 1 ? "customer" : "prospect",
      });
    }

    // Create projects and tasks for workload reports
    for (let i = 1; i <= 3; i++) {
      const [project] = await db.insert(projects).values({
        id: nanoid(),
        tenantId: tenant.id,
        workspaceId: workspace.id,
        name: `${t.name} Project ${i}`,
        status: "active",
        createdBy: admin.id,
      }).returning();

      const [section] = await db.insert(sections).values({
        projectId: project.id,
        name: "To Do",
        orderIndex: 0,
      }).returning();

      // Create tasks
      for (let j = 1; j <= 10; j++) {
        const [task] = await db.insert(tasks).values({
          id: nanoid(),
          tenantId: tenant.id,
          projectId: project.id,
          sectionId: section.id,
          title: `Task ${j} for ${project.name}`,
          status: Math.random() > 0.5 ? "done" : "todo",
          priority: "medium",
          estimateMinutes: Math.floor(Math.random() * 480),
          createdBy: admin.id,
        }).returning();

        // Assign to random tenant user
        const tenantUsers = await db.select().from(users).where(eq(users.tenantId, tenant.id));
        if (tenantUsers.length > 0) {
          const randomUser = tenantUsers[Math.floor(Math.random() * tenantUsers.length)];
          await db.insert(taskAssignees).values({
            taskId: task.id,
            userId: randomUser.id,
          });
        }
      }
    }

    // Mock some integrations
    await db.insert(tenantIntegrations).values({
      id: nanoid(),
      tenantId: tenant.id,
      provider: "openai",
      status: "configured",
      secretConfigured: true,
      publicConfig: { enabled: true, model: "gpt-4o" },
    });
  }

  console.log("Comprehensive tenant seeding complete!");
}

seed().catch(console.error).finally(() => process.exit());
