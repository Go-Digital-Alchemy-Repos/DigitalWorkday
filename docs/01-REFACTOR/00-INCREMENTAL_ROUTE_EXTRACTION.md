# Incremental Route Extraction Workflow

**Status:** Active  
**Last Updated:** 2026-02-05

---

## Overview

This document defines the standard workflow for extracting route domains from monolithic route files into modular, domain-specific route files. **Every extraction must include documentation updates.**

---

## Extraction Checklist

### 1. Identify Domain

- [ ] Identify the domain to extract (e.g., `timer`, `chat`, `notifications`)
- [ ] Confirm the source file(s) containing the routes
- [ ] List all endpoints to be extracted

### 2. Create Module File

- [ ] Create `server/routes/modules/<domain>.routes.ts`
- [ ] Move all domain-specific routes to the new file
- [ ] Update imports in the new file
- [ ] Export the router

### 3. Update Route Index

- [ ] Import new router in `server/routes/index.ts`
- [ ] Mount router with correct base path
- [ ] Remove migrated routes from source file
- [ ] Verify no duplicate routes exist

### 4. Update Documentation (REQUIRED)

> ⚠️ **NO EXTRACTION IS COMPLETE WITHOUT THIS STEP**

#### 4a. Update Super Admin App Docs Entry

Navigate to Super Admin > App Docs (or edit `docs/17-API-REGISTRY/<DOMAIN>.md`):

- [ ] **Confirm/update base path(s)** - Match the mount path in routes/index.ts
- [ ] **Confirm/update endpoint list** - Use "Sync API Docs" button or manual update
- [ ] **Add auth/tenant notes** - Document authentication requirements
- [ ] **Mark status** - Update status to `Active` once verified

If the docs entry does not exist:
- [ ] Click "Sync API Docs" to auto-generate, OR
- [ ] Create manually using template at `docs/17-API-REGISTRY/01-TEMPLATE.md`

#### 4b. Create Extraction Log

Create `docs/01-REFACTOR/<DOMAIN>_EXTRACTION.md` with the following sections:

```markdown
# <Domain> Route Extraction

**Date:** YYYY-MM-DD
**Status:** Complete

## Summary

Brief description of what was extracted and why.

## Files Changed

| File | Change |
|------|--------|
| `server/routes/modules/<domain>.routes.ts` | Created - new route module |
| `server/routes/index.ts` | Updated - added router mount |
| `server/routes/<source>.ts` | Updated - removed migrated routes |

## Endpoints Moved

| Method | Path | Notes |
|--------|------|-------|
| GET | /api/v1/<domain>/... | Description |

## Docs Updated

- **App Docs Entry:** `docs/17-API-REGISTRY/<DOMAIN>.md`
- **Changes Made:**
  - Updated base path to `/api/v1/<domain>`
  - Added X endpoints to endpoint table
  - Confirmed auth requirements: Session-based

## Testing

- [ ] All endpoints respond correctly
- [ ] No 404 errors on moved routes
- [ ] No duplicate route warnings in logs

## Notes

Any additional notes or gotchas discovered during extraction.
```

### 5. Verify & Test

- [ ] Restart the application
- [ ] Test all extracted endpoints
- [ ] Check for any 404 errors
- [ ] Verify no console warnings about duplicate routes

---

## Quick Reference: Base Path Mapping

When updating docs, verify the base path matches the mount chain:

| Mount Location | Base Path |
|----------------|-----------|
| `router.use("/timer", ...)` | `/api/timer` |
| `router.use("/v1/super", ...)` | `/api/v1/super` |
| `router.use("/v1/chat", ...)` | `/api/v1/chat` |
| `router.use("/v1", ...)` | `/api/v1` |
| `featuresRouter.use("/clients", ...)` | `/api/clients` |

The main router is mounted at `/api`, so all paths are relative to that.

---

## Route Scanner Integration

The route scanner (`server/utils/routeScanner.ts`) is configured with:

1. **DOMAIN_MAP** - Maps filename to domain/display name
2. **BASE_PATH_MAP** - Maps filename to base path prefix

When adding a new domain module:

1. Add entry to `DOMAIN_MAP`:
   ```typescript
   "<domain>.routes.ts": { domain: "<domain>", displayName: "<Display Name>" },
   ```

2. Add entry to `BASE_PATH_MAP`:
   ```typescript
   "<domain>.routes.ts": "/api/v1/<domain>",
   ```

3. Run "Sync API Docs" to generate the docs entry

---

## Completed Extractions

Track all completed domain extractions here:

| Domain | Date | Docs Entry | Extraction Log |
|--------|------|------------|----------------|
| *None yet* | - | - | - |

---

## See Also

- [App Docs System](../00-AUDIT/APP_DOCS_SYSTEM.md)
- [API Registry](../17-API-REGISTRY/)
- [Route Scanner](../../server/utils/routeScanner.ts)
