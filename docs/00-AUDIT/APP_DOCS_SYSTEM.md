# App Docs System Audit

**Audit Date:** 2026-02-04  
**Status:** Non-destructive audit (no code changes)

---

## Overview

The "App Docs" feature is a **read-only documentation browser** in the Super Admin area that displays Markdown files from the `/docs` directory. It provides Super Admins with organized access to technical documentation, guides, and reference materials.

---

## System Components

### UI Route
| Item | Value |
|------|-------|
| **Route Path** | `/super-admin/docs` |
| **Page Component** | `client/src/pages/super-admin-docs.tsx` |
| **Sidebar Entry** | "App Docs" in `client/src/components/super-sidebar.tsx` |
| **Guard** | `SuperRouteGuard` (requires `super_user` role) |

### API Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/super/docs` | GET | List all documentation files organized by category |
| `/api/v1/super/docs/:docPath` | GET | Get content of a specific documentation file |

**Location:** `server/routes/superAdmin.ts` (lines 8155-8326)

### Database Tables
**None.** The system reads directly from the filesystem. No database tables are used.

### Storage
| Item | Value |
|------|-------|
| **Source** | `/docs` directory in project root |
| **File Type** | Markdown (`.md` files only) |
| **Organization** | Subdirectories are treated as categories |

---

## Data Model

### DocFile (Listing)
| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique ID derived from relative path (slashes replaced with `__`) |
| `filename` | string | Original filename (e.g., `README.md`) |
| `title` | string | Extracted from first `# ` line, or filename if none |
| `category` | string | Parent directory name (category ID) |
| `relativePath` | string | Path relative to `/docs` directory |
| `sizeBytes` | number | File size in bytes |
| `modifiedAt` | string | ISO 8601 timestamp of last modification |

### DocContent (Single File)
| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Same as DocFile.id |
| `filename` | string | Original filename |
| `title` | string | Extracted from first heading |
| `content` | string | Raw Markdown content |
| `relativePath` | string | Path relative to `/docs` |
| `sizeBytes` | number | File size |
| `modifiedAt` | string | Last modification timestamp |

### DocCategory
| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Directory name (e.g., `03-FEATURES`) |
| `displayName` | string | Human-readable name (e.g., "Features") |
| `icon` | string | Lucide icon name (e.g., `star`) |
| `order` | number | Sort order for display |
| `docs` | DocFile[] | Array of documents in this category |

---

## RBAC Rules

| Role | View | Edit | Publish | Delete |
|------|------|------|---------|--------|
| `super_user` | ✅ | ❌ | ❌ | ❌ |
| `admin` | ❌ | ❌ | ❌ | ❌ |
| `manager` | ❌ | ❌ | ❌ | ❌ |
| `member` | ❌ | ❌ | ❌ | ❌ |
| `viewer` | ❌ | ❌ | ❌ | ❌ |

**Access Control:**
- All routes protected by `requireSuperUser` middleware
- Frontend guarded by `SuperRouteGuard` component
- Client-side check: `user.role === "super_user"`

---

## Content Rendering

### Renderer Type
**Custom Markdown Parser** - The page includes an inline `MarkdownRenderer` component that manually parses Markdown.

### Supported Syntax
| Element | Supported | Notes |
|---------|-----------|-------|
| Headers (h1-h4) | ✅ | `#` through `####` |
| Bold | ✅ | `**text**` |
| Code (inline) | ✅ | `` `code` `` |
| Code blocks | ✅ | ``` ``` with language hint ignored |
| Links | ✅ | Opens in new tab with external icon |
| Unordered lists | ✅ | `-` or `*` |
| Ordered lists | ✅ | `1.`, `2.`, etc. |
| Blockquotes | ✅ | `>` prefix |
| Horizontal rules | ✅ | `---` or `***` |
| Tables | ⚠️ | Basic pipe-style, no alignment |
| Images | ❌ | Not rendered |
| Italic | ❌ | `*text*` not supported |
| Strikethrough | ❌ | `~~text~~` not supported |
| Nested lists | ❌ | Flat only |
| Task lists | ❌ | `- [ ]` not supported |

---

## Category Configuration

Categories are defined in `CATEGORY_CONFIG` (server-side):

| Directory | Display Name | Icon | Order |
|-----------|--------------|------|-------|
| `00-AUDIT` | Audit Reports | check-circle | 0 |
| `01-REFACTOR` | Refactor Workflows | git-branch | 0.5 |
| `01-GETTING-STARTED` | Getting Started | rocket | 1 |
| `02-ARCHITECTURE` | Architecture | layout | 2 |
| `03-FEATURES` | Features | star | 3 |
| `04-API` | API Reference | code | 4 |
| `05-FRONTEND` | Frontend | monitor | 5 |
| `06-BACKEND` | Backend | server | 6 |
| `07-SECURITY` | Security | shield | 7 |
| `08-DATABASE` | Database | database | 8 |
| `09-TESTING` | Testing | check-circle | 9 |
| `10-DEPLOYMENT` | Deployment | cloud | 10 |
| `11-DEVELOPMENT` | Development | wrench | 11 |
| `12-OPERATIONS` | Operations | activity | 12 |
| `13-INTEGRATIONS` | Integrations | plug | 13 |
| `14-TROUBLESHOOTING` | Troubleshooting | alert-triangle | 14 |
| `15-REFERENCE` | Reference | book | 15 |
| `16-CHANGELOG` | Changelog | clock | 16 |
| `_root` | General | file-text | 100 |

Unlisted directories get auto-generated display names with `folder` icon and order 50.

---

## Missing Capabilities

### Not Implemented

| Capability | Status | Impact |
|------------|--------|--------|
| **Search** | ⚠️ Partial | Client-side title/filename filter only; no full-text search |
| **Editing** | ❌ Missing | No in-app editing; files must be modified on filesystem |
| **Rich Text Editor** | ❌ Missing | Uses read-only Markdown rendering |
| **Versioning** | ❌ Missing | No version history; relies on git |
| **Drafts** | ❌ Missing | All files are always visible (no draft/publish workflow) |
| **Status Field** | ❌ Missing | No draft/active/archived states |
| **Version Field** | ❌ Missing | No version numbering |
| **UpdatedBy Field** | ❌ Missing | No author tracking |
| **Tags** | ❌ Missing | No tagging system |
| **Slug** | ❌ N/A | Uses file paths instead |
| **User Permissions** | ⚠️ Binary | Super users only; no granular permissions |
| **Create New Docs** | ❌ Missing | Cannot create new docs from UI |
| **Delete Docs** | ❌ Missing | Cannot delete docs from UI |
| **Reorder Docs** | ❌ Missing | Order determined by title alphabetically |
| **Custom Categories** | ❌ Missing | Categories are fixed in code |
| **Image Support** | ❌ Missing | Images in Markdown not rendered |
| **Attachments** | ❌ Missing | No file attachment support |
| **Print/Export** | ❌ Missing | No PDF or print functionality |

### Partially Implemented

| Capability | Current State | Gap |
|------------|---------------|-----|
| **Categories** | Directory-based | Cannot create/edit categories from UI |
| **Search** | Title/filename filter | No content search, no indexing |
| **Metadata** | File stats only | No custom fields (author, tags, etc.) |

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                        Super Admin UI                            │
│  ┌─────────────────────────┐    ┌─────────────────────────────┐  │
│  │   Sidebar (Categories)  │    │   Content Viewer            │  │
│  │   - Category collapsible│    │   - MarkdownRenderer        │  │
│  │   - Doc list            │    │   - File metadata           │  │
│  │   - Search filter       │    │   - Back navigation         │  │
│  └─────────────────────────┘    └─────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                         API Layer                                │
│  GET /api/v1/super/docs         - List all docs by category     │
│  GET /api/v1/super/docs/:path   - Get single doc content        │
│                                                                  │
│  Middleware: requireSuperUser                                    │
└──────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                       Filesystem                                 │
│  /docs/                                                          │
│    ├── 01-GETTING-STARTED/                                       │
│    │     └── *.md                                                │
│    ├── 03-FEATURES/                                              │
│    │     └── *.md                                                │
│    ├── 07-SECURITY/                                              │
│    │     └── *.md                                                │
│    ├── AGREEMENTS.md                                             │
│    └── ...                                                       │
└──────────────────────────────────────────────────────────────────┘
```

---

## Recommendations for Enhancement

### High Priority
1. **Full-text search** - Index document content for searchability
2. **Rich text editing** - Add TipTap editor for in-app editing (like other editors in the app)
3. **Database storage** - Move docs to DB for versioning, drafts, and metadata

### Medium Priority
4. **Versioning** - Track document history with ability to compare/restore
5. **Draft/Publish workflow** - Support draft state before publishing
6. **Author tracking** - Record who created/updated each document
7. **Tags** - Add tagging for cross-category organization

### Low Priority
8. **Custom categories** - Allow creating/editing categories from UI
9. **Image support** - Handle inline images in Markdown
10. **Export** - Add PDF/print export functionality
11. **Permissions** - Granular access control beyond super_user

---

## Files Referenced

| File | Purpose |
|------|---------|
| `client/src/pages/super-admin-docs.tsx` | UI component |
| `client/src/components/super-sidebar.tsx` | Sidebar navigation |
| `client/src/App.tsx` | Route definition |
| `server/routes/superAdmin.ts` | API endpoints (lines 8155-8326) |
| `server/middleware/tenantContext.ts` | `requireSuperUser` middleware |

---

## API Registry Integration

The App Docs system includes an **API Registry** category (`17-API-REGISTRY`) that documents all API endpoints. These docs can be auto-generated from route files.

### Sync API Docs Feature

| Item | Value |
|------|-------|
| **Button Location** | Super Admin > App Docs (top right) |
| **Endpoint** | `POST /api/v1/super/docs/sync` |
| **Scanner** | `server/utils/routeScanner.ts` |

**How it works:**
1. Scans route files in `server/routes/` and `server/features/`
2. Extracts HTTP method and path from `router.get/post/patch/put/delete()` calls
3. Generates/updates docs in `docs/17-API-REGISTRY/`
4. Uses HTML comment markers for safe merge (preserves manual sections)

### Process Enforcement

All route extractions must include documentation updates. See:
- [Incremental Route Extraction Workflow](../01-REFACTOR/00-INCREMENTAL_ROUTE_EXTRACTION.md)

---

*End of Audit*
