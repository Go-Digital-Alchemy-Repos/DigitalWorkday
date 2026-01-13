import { db } from "../db";
import { 
  tenants, users, teams, clients, projects, tasks, 
  timeEntries, activeTimers, invitations, appSettings,
  TenantStatus
} from "@shared/schema";
import { eq, sql, isNull } from "drizzle-orm";

const DEFAULT_TENANT_ID = "default-tenant";
const DEFAULT_TENANT_SLUG = "default";
const DEFAULT_TENANT_NAME = "Default Organization";

async function backfillTenants() {
  console.log("Starting tenant backfill migration...");

  let existingTenant = await db.select().from(tenants).where(eq(tenants.id, DEFAULT_TENANT_ID));
  
  if (existingTenant.length === 0) {
    console.log("Creating default tenant...");
    await db.insert(tenants).values({
      id: DEFAULT_TENANT_ID,
      name: DEFAULT_TENANT_NAME,
      slug: DEFAULT_TENANT_SLUG,
      status: TenantStatus.ACTIVE,
    });
    console.log("Default tenant created.");
  } else {
    console.log("Default tenant already exists.");
  }

  console.log("Backfilling users...");
  await db.update(users)
    .set({ tenantId: DEFAULT_TENANT_ID })
    .where(isNull(users.tenantId));

  console.log("Backfilling teams...");
  await db.update(teams)
    .set({ tenantId: DEFAULT_TENANT_ID })
    .where(isNull(teams.tenantId));

  console.log("Backfilling clients...");
  await db.update(clients)
    .set({ tenantId: DEFAULT_TENANT_ID })
    .where(isNull(clients.tenantId));

  console.log("Backfilling projects...");
  await db.update(projects)
    .set({ tenantId: DEFAULT_TENANT_ID })
    .where(isNull(projects.tenantId));

  console.log("Backfilling tasks...");
  await db.update(tasks)
    .set({ tenantId: DEFAULT_TENANT_ID })
    .where(isNull(tasks.tenantId));

  console.log("Backfilling time entries...");
  await db.update(timeEntries)
    .set({ tenantId: DEFAULT_TENANT_ID })
    .where(isNull(timeEntries.tenantId));

  console.log("Backfilling active timers...");
  await db.update(activeTimers)
    .set({ tenantId: DEFAULT_TENANT_ID })
    .where(isNull(activeTimers.tenantId));

  console.log("Backfilling invitations...");
  await db.update(invitations)
    .set({ tenantId: DEFAULT_TENANT_ID })
    .where(isNull(invitations.tenantId));

  console.log("Backfilling app settings...");
  await db.update(appSettings)
    .set({ tenantId: DEFAULT_TENANT_ID })
    .where(isNull(appSettings.tenantId));

  console.log("Tenant backfill migration completed successfully!");
}

backfillTenants()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Backfill migration failed:", error);
    process.exit(1);
  });
