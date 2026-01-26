/**
 * Production guard script - prevents running drizzle-kit push in production.
 * 
 * This script should be called before any db:push command.
 * If NODE_ENV=production, it fails fast with a clear error message.
 * 
 * Usage: npx tsx server/scripts/guard-production-push.ts
 */

const isProduction = process.env.NODE_ENV === "production";
const isRailway = !!process.env.RAILWAY_ENVIRONMENT;
const isCI = !!process.env.CI;

if (isProduction || isRailway || isCI) {
  console.error(`
╔══════════════════════════════════════════════════════════════════╗
║  ERROR: db:push is BLOCKED in production/CI environments        ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  drizzle-kit push is interactive and can cause data loss.       ║
║  Use migrations instead:                                        ║
║                                                                  ║
║  1. Generate migrations locally:                                 ║
║     npx drizzle-kit generate                                    ║
║                                                                  ║
║  2. Commit the migration files in ./migrations                  ║
║                                                                  ║
║  3. Migrations run automatically on deploy via:                 ║
║     npm run db:migrate                                          ║
║                                                                  ║
║  Environment detected:                                          ║
║    NODE_ENV: ${process.env.NODE_ENV || "not set"}
║    RAILWAY_ENVIRONMENT: ${process.env.RAILWAY_ENVIRONMENT || "not set"}
║    CI: ${process.env.CI || "not set"}
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
`);
  process.exit(1);
}

console.log("[guard] Development environment detected, db:push is allowed.");
process.exit(0);
