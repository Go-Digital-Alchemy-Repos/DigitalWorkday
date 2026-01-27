# Railway Deployment Checklist

This document provides a comprehensive guide for deploying MyWorkDay to Railway.

## Pre-Deployment Checklist

### 1. Required Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (provided by Railway) |
| `SESSION_SECRET` | Yes | Secret for session encryption (min 32 chars) |
| `NODE_ENV` | Yes | Set to `production` |
| `AUTO_MIGRATE` | Recommended | Set to `true` to run migrations on boot |
| `PORT` | No | Railway sets this automatically |

### 2. Optional Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FAIL_ON_SCHEMA_ISSUES` | `true` | Fail startup if schema is incomplete (always true in production) |
| `RATE_LIMIT_ENABLED` | `true` | Enable rate limiting |
| `MAILGUN_API_KEY` | - | For email functionality |
| `MAILGUN_DOMAIN` | - | Mailgun sending domain |
| `AWS_ACCESS_KEY_ID` | - | For S3 file storage |
| `AWS_SECRET_ACCESS_KEY` | - | For S3 file storage |
| `AWS_S3_BUCKET` | - | S3 bucket name |
| `GOOGLE_CLIENT_ID` | - | For Google OAuth |
| `GOOGLE_CLIENT_SECRET` | - | For Google OAuth |

### 3. AUTO_MIGRATE Guidance

**Recommended: Set `AUTO_MIGRATE=true`**

When enabled, the application will:
1. Run pending Drizzle migrations on startup
2. Validate schema readiness before serving traffic
3. Fail fast with clear error messages if migrations fail

**Without AUTO_MIGRATE:**
- You must manually run migrations before each deploy
- Run: `npx drizzle-kit migrate`
- Or apply SQL directly: `psql $DATABASE_URL -f migrations/0004_add_missing_production_tables.sql`

## Deployment Steps

### Step 1: Deploy to Railway

```bash
# Push code to Railway
railway up
```

### Step 2: Verify Migrations (if AUTO_MIGRATE=false)

```bash
# Connect to Railway and run migrations
railway run npx drizzle-kit migrate
```

### Step 3: Run Smoke Test

```bash
# Run the smoke test to verify deployment
railway run npx tsx server/scripts/railway-smoke.ts
```

### Step 4: Verify Super Admin Access

1. Navigate to your Railway deployment URL
2. If first deployment, register the first user (becomes Super Admin)
3. Or login with existing Super Admin credentials
4. Access `/super` dashboard to verify system status

## Health Endpoints

| Endpoint | Auth Required | Description |
|----------|---------------|-------------|
| `/api/health` | No | Basic health check |
| `/api/v1/super/status/db` | Super Admin | Database schema status |
| `/api/v1/super/tenants` | Super Admin | List all tenants |
| `/api/timer/current` | Authenticated | Timer endpoint (good smoke test) |

## Common Failure Modes & Fixes

### 1. "relation X does not exist"

**Cause:** Database schema out of sync with code.

**Fix:**
```bash
# Apply the safe additive migration
railway run psql $DATABASE_URL -f migrations/0004_add_missing_production_tables.sql
```

Or enable `AUTO_MIGRATE=true` and redeploy.

### 2. "column X does not exist"

**Cause:** Missing column in production database.

**Fix:** Same as above - run the additive migration.

### 3. Application crashes on startup

**Cause:** Usually schema issues or missing env vars.

**Fix:**
1. Check Railway logs for specific error
2. Verify all required env vars are set
3. Run smoke test: `railway run npx tsx server/scripts/railway-smoke.ts`

### 4. "FATAL: Schema is NOT ready"

**Cause:** Schema validation failed on startup.

**Fix:**
1. Set `AUTO_MIGRATE=true` to auto-run migrations
2. Or manually run: `railway run npx drizzle-kit migrate`

### 5. 500 errors on authenticated endpoints

**Cause:** Often tenant context issues or session problems.

**Fix:**
1. Verify `SESSION_SECRET` is set and consistent
2. Check database connectivity
3. Run: `railway run npx tsx server/scripts/db-smoke.ts`

### 6. Timer endpoint returns 500

**Cause:** Missing `title` column on `active_timers` table.

**Fix:**
```bash
railway run psql $DATABASE_URL -c "ALTER TABLE active_timers ADD COLUMN IF NOT EXISTS title text;"
```

## Post-Deploy Verification

### Automated Checks (DB/Service Layer)
Run the smoke test to verify database connectivity and service dependencies:
```bash
railway run npx tsx server/scripts/railway-smoke.ts
```
This validates: DB connectivity, migrations, tables/columns, and service-layer queries.

### Manual HTTP Endpoint Checks
After the smoke test passes, verify HTTP endpoints work:

```bash
# 1. Health Check (no auth required)
curl https://your-app.railway.app/api/health

# 2. Timer Endpoint (requires auth - test via browser)
# Login as any user, then visit /api/timer/current

# 3. Super Admin DB Status (requires super admin)
# Login as Super Admin, navigate to /super dashboard
# Or use browser DevTools to check /api/v1/super/status/db
```

### Verification Sequence
1. **Smoke Test**: `railway run npx tsx server/scripts/railway-smoke.ts`
2. **Health Check**: `curl https://your-app.railway.app/api/health`
3. **Login Test**: Manually verify Super Admin login works
4. **Timer Test**: Verify /api/timer/current returns 200 (not 500)
5. **DB Status**: Login as Super Admin and check `/super` dashboard

## Rollback Procedure

If deployment fails:

1. **Railway Dashboard**: Use "Rollback" to previous deployment
2. **Database**: Migrations are additive-only, no rollback needed
3. **Verify**: Run smoke test after rollback

## Monitoring

- Check Railway logs for startup messages
- Look for `[schema]` prefixed logs for migration status
- Look for `[bootstrap]` logs for first-user setup
- Monitor `/api/v1/super/status/db` endpoint for ongoing health

## Support Commands

```bash
# Check migration status
railway run npx tsx server/scripts/migration-status.ts

# Run database smoke test
railway run npx tsx server/scripts/db-smoke.ts

# Run full Railway smoke test
railway run npx tsx server/scripts/railway-smoke.ts

# Check table existence manually
railway run psql $DATABASE_URL -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public';"
```
