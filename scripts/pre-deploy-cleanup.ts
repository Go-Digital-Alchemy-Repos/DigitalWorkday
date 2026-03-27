import pg from "pg";

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log("[pre-deploy] No DATABASE_URL found, skipping schema cleanup");
    return;
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  try {
    await client.connect();

    const colCheck = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'division_id'`,
    );
    const tableCheck = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('client_divisions', 'division_members')`,
    );

    if (colCheck.rows.length === 0 && tableCheck.rows.length === 0) {
      console.log("[pre-deploy] Division artifacts already removed, no cleanup needed");
      return;
    }

    console.log("[pre-deploy] Removing division artifacts from database...");
    await client.query("BEGIN");

    await client.query(`ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_division_id_client_divisions_id_fk"`);
    await client.query(`ALTER TABLE "division_members" DROP CONSTRAINT IF EXISTS "division_members_division_id_client_divisions_id_fk"`);
    await client.query(`ALTER TABLE "division_members" DROP CONSTRAINT IF EXISTS "division_members_tenant_id_tenants_id_fk"`);
    await client.query(`ALTER TABLE "division_members" DROP CONSTRAINT IF EXISTS "division_members_user_id_users_id_fk"`);
    await client.query(`ALTER TABLE "client_divisions" DROP CONSTRAINT IF EXISTS "client_divisions_client_id_clients_id_fk"`);
    await client.query(`ALTER TABLE "client_divisions" DROP CONSTRAINT IF EXISTS "client_divisions_tenant_id_tenants_id_fk"`);
    await client.query(`UPDATE "projects" SET "division_id" = NULL WHERE "division_id" IS NOT NULL`);
    await client.query(`ALTER TABLE "projects" DROP COLUMN IF EXISTS "division_id"`);
    await client.query(`DROP TABLE IF EXISTS "division_members"`);
    await client.query(`DROP TABLE IF EXISTS "client_divisions"`);

    await client.query("COMMIT");
    console.log("[pre-deploy] Division cleanup complete");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await client.query("ROLLBACK");
    } catch {
      /* rollback best-effort */
    }
    console.error("[pre-deploy] Schema cleanup failed:", message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
