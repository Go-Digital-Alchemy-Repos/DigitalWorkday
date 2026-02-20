# Client Workspace Migration — Phases 0–2

## Current State Inventory

### Client Detail Entry Points
- **Route**: `/clients/:clientId` → `client/src/pages/client-detail.tsx`
- **Tabs**: Overview, Contacts, Projects, Divisions, Portal, Notes, Documents
- **Drawer**: `client/src/features/clients/client-drawer.tsx` (quick-view)
- **Profile Drawer**: `client/src/features/clients/client-profile-drawer.tsx`

### Client 360 View
- **Route**: `/clients/:clientId/360` → `client/src/pages/client-360.tsx`
- Includes Files tab aggregation

### Current Documents Module
- **Table**: `client_documents` (per-client document uploads)
- **Folders Table**: `client_document_folders` (per-client folder tree)
- **Categories Table**: `client_document_categories`
- **Router**: `server/http/domains/clientDocuments.router.ts`
- **API Base**: `/api/v1/client-documents/...`
- Uses Cloudflare R2 via presign → direct upload → complete flow

### Existing Attachment Systems
| System | Table | Router |
|--------|-------|--------|
| Task attachments | `task_attachments` | `server/http/domains/attachments.router.ts` |
| Client documents | `client_documents` | `server/http/domains/clientDocuments.router.ts` |
| Chat messages | inline in chat message data | `server/http/domains/chat.router.ts` |
| Support tickets | support message attachments | `server/http/domains/support.router.ts` |

### R2 Upload Pipeline References
- `server/s3.ts` — Core R2 client, presign, download, delete, validate
- `server/http/middleware/uploadGuards.ts` — Filename sanitization, unsafe extension blocking
- `server/http/domains/attachments.router.ts` — Task attachment presign/upload/download
- `server/http/domains/clientDocuments.router.ts` — Client document presign/upload/download
- `server/http/domains/uploads.router.ts` — Unified upload proxy

## Phase 0: Safety Rails (Complete)
- Feature flags added: `ASSET_LIBRARY_V2`, `CLIENT_WORKSPACE_V2`
- Server: `server/config.ts` → `config.features.assetLibraryV2/clientWorkspaceV2`
- Client: `client/src/hooks/use-feature-flags.ts` → `useAssetLibraryEnabled()`
- API: `GET /api/features/flags`
- Inventory documentation (this file)

## Phase 1: Backend Model + Services (Complete)
- New tables: `asset_folders`, `assets`, `asset_links`
- Service layer: `server/features/assetLibrary/`
- Asset indexer: `server/features/assetLibrary/assetIndexer.ts`
- Backfill script: `server/scripts/backfillAssetsFromAttachments.ts`
- API router: `server/http/domains/assets.router.ts`

## Phase 2: Beta UI (Complete)
- New "Asset Library" tab in Client Detail (behind ASSET_LIBRARY_V2 flag)
- Components: `client/src/features/assetLibrary/`
- Folder tree + asset grid + preview panel
- Upload via existing R2 presign pipeline
- Source chips + open-in-context linking

## What Remains Legacy & Unchanged
- `client_documents` table and all existing document operations
- `client_document_folders` table
- `task_attachments` table and existing task attachment flows
- All existing routers and components — no removals or renames
- Chat/support attachment systems untouched
