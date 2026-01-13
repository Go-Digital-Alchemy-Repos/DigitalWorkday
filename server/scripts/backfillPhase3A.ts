/**
 * Phase 3A Backfill Script
 * 
 * This script ensures existing tenants are not locked out by the new onboarding requirements:
 * 1. Sets status='active' for existing tenants with data
 * 2. Sets onboardedAt = now() for tenants that don't have it set
 * 3. Creates tenant_settings records for existing tenants that don't have them
 * 
 * Run with: npx tsx server/scripts/backfillPhase3A.ts
 */

import { db } from "../db";
import { tenants, tenantSettings, users } from "@shared/schema";
import { eq, isNull, sql, and } from "drizzle-orm";

async function backfillPhase3A() {
  console.log("Starting Phase 3A backfill...\n");

  try {
    // Step 1: Find all existing tenants
    const allTenants = await db.select().from(tenants);
    console.log(`Found ${allTenants.length} tenant(s) in database.\n`);

    for (const tenant of allTenants) {
      console.log(`Processing tenant: ${tenant.name} (${tenant.id})`);

      // Check if tenant has any users or data (consider it "existing" if it has users)
      const tenantUsers = await db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(eq(users.tenantId, tenant.id));

      const hasUsers = Number(tenantUsers[0]?.count || 0) > 0;

      // Step 2: If tenant has data and is not active, mark as active
      if (hasUsers && tenant.status !== "active") {
        console.log(`  - Activating tenant (has ${tenantUsers[0]?.count} users)`);
        await db
          .update(tenants)
          .set({ 
            status: "active",
            updatedAt: new Date()
          })
          .where(eq(tenants.id, tenant.id));
      }

      // Step 3: If onboardedAt is null but tenant is active or has data, set onboardedAt
      if (!tenant.onboardedAt && (tenant.status === "active" || hasUsers)) {
        console.log(`  - Setting onboardedAt to now()`);
        await db
          .update(tenants)
          .set({ 
            onboardedAt: new Date(),
            updatedAt: new Date()
          })
          .where(eq(tenants.id, tenant.id));
      }

      // Step 4: Create tenant_settings if missing
      const existingSettings = await db
        .select()
        .from(tenantSettings)
        .where(eq(tenantSettings.tenantId, tenant.id));

      if (existingSettings.length === 0) {
        console.log(`  - Creating tenant_settings record`);
        await db.insert(tenantSettings).values({
          tenantId: tenant.id,
          displayName: tenant.name,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } else {
        console.log(`  - tenant_settings already exists`);
      }

      console.log(`  ✓ Tenant ${tenant.name} processed\n`);
    }

    // Summary
    console.log("=".repeat(50));
    console.log("Phase 3A Backfill Complete!");
    console.log("=".repeat(50));
    
    // Show final state
    const finalTenants = await db.select().from(tenants);
    console.log("\nFinal tenant states:");
    for (const t of finalTenants) {
      console.log(`  - ${t.name}: status=${t.status}, onboardedAt=${t.onboardedAt ? "set" : "null"}`);
    }

  } catch (error) {
    console.error("Error during backfill:", error);
    process.exit(1);
  }

  process.exit(0);
}

backfillPhase3A();
