import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";
import pg from "pg";

async function preDeploySchemaCleanup() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log("[pre-deploy] No DATABASE_URL, skipping schema cleanup");
    return;
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  try {
    await client.connect();

    const checks = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'division_id'`
    );
    const hasDivisionTables = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('client_divisions', 'division_members')`
    );

    if (checks.rows.length === 0 && hasDivisionTables.rows.length === 0) {
      console.log("[pre-deploy] Division artifacts already removed, skipping");
      return;
    }

    console.log("[pre-deploy] Running division cleanup in transaction...");
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
  } catch (err: any) {
    try { await client.query("ROLLBACK"); } catch { /* ignore */ }
    console.warn("[pre-deploy] Schema cleanup error (non-fatal):", err?.message);
  } finally {
    await client.end();
  }
}

const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await preDeploySchemaCleanup();
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
