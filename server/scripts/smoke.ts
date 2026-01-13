import { Pool } from "pg";

const REQUIRED_TABLES = ["users", "workspaces", "user_sessions"];

async function smokeTest() {
  console.log("🔥 Running production smoke check...\n");

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("❌ FAIL: DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  const pool = new Pool({ connectionString });

  try {
    console.log("📡 Checking database connection...");
    const result = await pool.query("SELECT NOW() as time");
    console.log(`✅ Database connected at ${result.rows[0].time}\n`);

    console.log("📋 Checking required tables...");
    for (const table of REQUIRED_TABLES) {
      try {
        const tableCheck = await pool.query(
          `SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
          )`,
          [table]
        );
        
        if (tableCheck.rows[0].exists) {
          console.log(`✅ Table "${table}" exists`);
        } else {
          console.error(`❌ FAIL: Required table "${table}" is missing`);
          if (table === "user_sessions") {
            console.error("   Run: psql $DATABASE_URL < server/scripts/create_session_table.sql");
          }
          process.exit(1);
        }
      } catch (err) {
        console.error(`❌ FAIL: Error checking table "${table}":`, err);
        process.exit(1);
      }
    }

    console.log("\n🎉 All smoke checks passed!");
    process.exit(0);
  } catch (error) {
    console.error("❌ FAIL: Database connection error:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

smokeTest();
