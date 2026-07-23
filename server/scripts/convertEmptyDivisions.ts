/**
 * Phase 1 division retirement utility.
 *
 * Dry-run is the default and requires a tenant id or slug:
 *   npx tsx server/scripts/convertEmptyDivisions.ts --tenant <id-or-slug>
 *
 * Apply only after reviewing the dry-run:
 *   npx tsx server/scripts/convertEmptyDivisions.ts --tenant <id-or-slug> --apply
 */
import { eq, or } from "drizzle-orm";
import { db, pool } from "../db";
import { tenants } from "@shared/schema";
import { convertEmptyDivisions, getDivisionConversionPlan } from "../services/divisionProjectConversion";

function getArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const tenantInput = getArgument("--tenant");
  const apply = process.argv.includes("--apply");
  if (!tenantInput) throw new Error("Missing required --tenant <id-or-slug>");

  const [tenant] = await db
    .select({ id: tenants.id, name: tenants.name, slug: tenants.slug })
    .from(tenants)
    .where(or(eq(tenants.id, tenantInput), eq(tenants.slug, tenantInput)))
    .limit(1);
  if (!tenant) throw new Error(`Tenant not found: ${tenantInput}`);

  const plan = await getDivisionConversionPlan(tenant.id);
  const eligible = plan.filter(item => item.eligible);
  const retained = plan.filter(item => !item.eligible);

  console.log(`${apply ? "APPLY" : "DRY RUN"}: ${tenant.name} (${tenant.id})`);
  console.table(plan.map(item => ({
    divisionId: item.divisionId,
    clientId: item.clientId,
    division: item.name,
    projects: item.projectCount,
    members: item.memberCount,
    action: item.eligible ? "convert" : "retain",
  })));
  console.log(`Eligible empty divisions: ${eligible.length}`);
  console.log(`Retained divisions with projects: ${retained.length}`);

  if (!apply) {
    console.log("No changes made. Re-run with --apply after reviewing this plan.");
    return;
  }

  const converted = await convertEmptyDivisions(tenant.id);
  console.table(converted);
  console.log(`Converted ${converted.length} division(s).`);
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
