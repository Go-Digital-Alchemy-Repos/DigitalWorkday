# Rollback Procedure for MyWorkDay

This document outlines the procedures for safely rolling back code, deployments, and database changes.

## Table of Contents
1. [Pre-Change Safety Workflow](#pre-change-safety-workflow)
2. [Local Code Rollback](#local-code-rollback)
3. [Reverting Bad Commits](#reverting-bad-commits)
4. [Railway Deployment Rollback](#railway-deployment-rollback)
5. [Database Rollback Guidance](#database-rollback-guidance)
6. [Emergency Checklist](#emergency-checklist)

---

## Pre-Change Safety Workflow

Before making any significant changes, follow this workflow:

### A) Before Any Prompt/Changes

1. **Create a safety branch:**
   ```bash
   git checkout -b safe/<YYYY-MM-DD>-<short-scope>
   # Example: git checkout -b safe/2026-01-27-schema-readiness
   ```

2. **Create a pre-change tag:**
   ```bash
   git tag pre/<YYYY-MM-DD>-<short-scope>
   # Example: git tag pre/2026-01-27-schema-readiness
   ```

3. **Push branch and tag to origin:**
   ```bash
   git push origin safe/<YYYY-MM-DD>-<short-scope>
   git push origin pre/<YYYY-MM-DD>-<short-scope>
   ```

### B) After Changes Pass Tests

1. **Commit with conventional format:**
   ```bash
   git commit -m "feat(scope): summary"
   git commit -m "fix(scope): summary"
   git commit -m "chore(scope): summary"
   ```

2. **Push the branch:**
   ```bash
   git push origin safe/<YYYY-MM-DD>-<short-scope>
   ```

3. **(Optional) Open PR into main if using pull requests.**

---

## Local Code Rollback

### Option 1: Checkout a Pre-Change Tag
```bash
# List available pre-change tags
git tag -l "pre/*"

# Checkout the desired tag
git checkout pre/2026-01-27-schema-readiness

# If you need to work from this point, create a new branch
git checkout -b fix/rollback-from-2026-01-27
```

### Option 2: Hard Reset to Tag (destructive)
```bash
# WARNING: This discards all uncommitted changes
git reset --hard pre/2026-01-27-schema-readiness
```

---

## Reverting Bad Commits

### Preferred: Git Revert (safe, creates new commit)
```bash
# Revert a specific commit (keeps history)
git revert <commit-sha>

# Revert multiple commits
git revert <oldest-sha>..<newest-sha>

# Revert a merge commit
git revert -m 1 <merge-commit-sha>
```

### Alternative: Git Reset (only if safe)
```bash
# Soft reset (keeps changes staged)
git reset --soft <commit-sha>

# Hard reset (discards all changes) - USE WITH CAUTION
git reset --hard <commit-sha>
```

**When to use reset:**
- Only on local branches not yet pushed
- When you're certain no one else has pulled the commits
- Never on shared/main branches

---

## Railway Deployment Rollback

### Step 1: Identify Last Good Commit SHA
```bash
# Find recent commits with their SHAs
git log --oneline -20

# Or check Railway deployment history in the dashboard
```

### Step 2: Redeploy Last Good SHA (Railway UI)
1. Go to Railway Dashboard → Your Project → Deployments
2. Find the last successful deployment
3. Click the three dots (⋮) menu
4. Select "Redeploy" or note the commit SHA
5. If redeploying a specific SHA:
   - Go to Settings → Deploy → Deploy from commit
   - Enter the commit SHA
   - Click Deploy

### Step 3: Verify Deployment
```bash
# Check health endpoint
curl https://your-app.railway.app/api/health

# Expected response:
# { "status": "ok", "ready": true, ... }

# Run railway smoke test locally
npm run safety:smoke
```

---

## Database Rollback Guidance

### Core Principle: Forward-Only Migrations

**DO NOT** attempt destructive down-migrations in production. Always prefer forward fixes.

### If a Migration Causes Problems

1. **Create a corrective migration:**
   ```bash
   # Generate a new migration that fixes the issue
   npx drizzle-kit generate
   
   # The new migration should:
   # - Add missing columns/tables
   # - Set correct defaults
   # - Fix constraints
   # - NOT drop data or columns without explicit backup
   ```

2. **Apply the fix:**
   ```bash
   npx drizzle-kit migrate
   ```

### Backup Before Major Schema Changes
```bash
# Export critical data before migrations
pg_dump -h $PGHOST -U $PGUSER -d $PGDATABASE --data-only -t critical_table > backup.sql
```

### Schema Verification
```bash
# Run database smoke test
npx tsx server/scripts/railway-smoke.ts

# Check schema status (Super Admin only)
curl -X GET https://your-app/api/v1/super/status/db
```

---

## Emergency Checklist

When something goes wrong, follow this checklist in order:

### 1. Assess the Situation
- [ ] What broke? (UI, API, DB, Auth?)
- [ ] When did it last work?
- [ ] What changed since then?

### 2. Rollback Code to Last Good Tag
```bash
# Find the last good tag
git tag -l "pre/*" --sort=-creatordate | head -5

# Checkout that tag
git checkout pre/<last-good-tag>
```

### 3. Run Smoke Tests
```bash
# Database connectivity and schema
npx tsx server/scripts/railway-smoke.ts

# Tenant CRUD operations
npx vitest run server/tests/tenant-crud-smoke.test.ts
```

### 4. Verify Core Functionality
- [ ] Can users log in?
- [ ] Can users create/read tenant data (clients, projects, tasks)?
- [ ] Is the health endpoint returning `ready: true`?
- [ ] Are real-time features (Socket.IO) working?

### 5. If Railway Deployment is Affected
1. Roll back to last good deployment in Railway UI
2. Verify `/api/health` returns `ready: true`
3. Test login flow manually
4. Check error logs for new issues

### 6. Document the Incident
Create an entry in `docs/INCIDENTS.md`:
```markdown
## YYYY-MM-DD: Brief Description

### What Happened
- Description of the issue

### Root Cause
- What caused it

### Resolution
- How it was fixed

### Prevention
- Steps to prevent recurrence
```

---

## Quick Reference Commands

```bash
# Check current status
npm run safety:status

# Print pre-change instructions
npm run safety:pre

# Run all smoke tests
npm run safety:smoke

# List recent tags
git tag -l "pre/*" --sort=-creatordate | head -10

# List recent commits
git log --oneline -10
```

---

## Notes for Replit Users

On Replit, Git operations are managed through the **Checkpoints** system:
- Checkpoints are created automatically during work
- Use "View Checkpoints" to see history and rollback options
- Rollback restores code, chat session, and database state

To manually create a checkpoint before risky changes:
1. Make a small commit with a clear message
2. The system will create a checkpoint automatically
