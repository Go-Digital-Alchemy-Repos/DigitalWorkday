# Migrations and Data Safety Audit - 2026-07-21

## Scope

Reviewed the committed Drizzle migrations, migration journal, Railway startup path, schema-readiness checks, rollback guidance, migration verification script, and deployment documentation. The pass focused on forward-only deploy safety, staging/production parity, transactional migration compatibility, large-table index risk, and operator instructions.

## Findings

### High - Railway docs still recommended schema push

`docs/DEPLOYMENT_RAILWAY.md` and `docs/deployment/DEPLOYMENT.md` instructed operators to run `railway run npx drizzle-kit push`. That command applies live schema diffs outside the reviewed migration chain and can create staging/production drift or make recovery harder.

Resolution: both guides now require `railway run npx drizzle-kit migrate` or `AUTO_MIGRATE=true`, and explicitly prohibit `drizzle-kit push` against staging or production.

### Medium - Online index guidance needed a guardrail

Drizzle's Postgres migration runner wraps pending migrations in a transaction. That means `CREATE INDEX CONCURRENTLY` cannot be committed to the normal `migrations/` folder even though it is the safer PostgreSQL strategy for very large hot tables. Recent index migrations use idempotent plain `CREATE INDEX IF NOT EXISTS`, which is compatible with startup migrations, but future large-table index work should be evaluated before deploy.

Resolution: migration smoke tests and `server/scripts/verify-migrations.ts` now reject `CREATE INDEX CONCURRENTLY` and `DROP INDEX CONCURRENTLY` inside committed Drizzle migrations. Large online index builds should be run as explicitly reviewed operational steps outside the startup migrator, then followed by an idempotent schema/migration representation if needed for fresh environments.

### Low - Migration history remains forward-only

The committed SQL migrations are additive/idempotent in the current post-legacy set. Rollback posture remains checkpoint rollback plus forward repair, not destructive down migrations.

## Verification Added

- Committed migrations must remain compatible with Drizzle's transactional migrator.
- Railway deployment docs must point to committed migrations and must not reintroduce the production/staging `drizzle-kit push` command.
- The standalone migration verifier now treats transactional-incompatible index statements as deployment-blocking issues.

## Verification Run

- `npx vitest run server/tests/migrations-smoke.test.ts server/tests/database-query-performance.test.ts`
- `npx tsx server/scripts/verify-migrations.ts --strict`
- `npm run check`
- `npm test`
- `npm run test:client`
- `npm run build`
- `npm audit --omit=dev`
- `git diff --check`

## Residual Risk

Plain `CREATE INDEX IF NOT EXISTS` can still acquire locks on large tables while it builds. Because the app's normal migrator is transactional, online index creation requires a separate operational runbook and a maintenance decision per index. Before adding indexes to high-volume tables such as notifications, messages, tasks, time entries, or audit-style tables, review table size and write volume, then choose either:

1. normal committed migration for small or moderate tables, or
2. manual `CREATE INDEX CONCURRENTLY` outside the Drizzle migrator for hot large tables, with deployment notes and verification.

## Roadmap

1. Add a documented online-index runbook with preflight checks for table size, lock monitoring, and verification queries.
2. Add a restore rehearsal checklist for Railway Postgres backups before major schema releases.
3. Expand schema-readiness checks to include required indexes when query latency becomes part of release gating.
