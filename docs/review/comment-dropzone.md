# Comment Dropzone — Feature Spec & Discovery

**Date**: 2026-02-18
**Status**: Implementation

---

## Phase 0 — Discovery Findings

### 1. Comment Composer Components

Both **Task Drawer** (`client/src/features/tasks/task-detail-drawer.tsx`) and **Subtask Drawer** (`client/src/features/tasks/subtask-detail-drawer.tsx`) use the **same shared component** for comments:

- `client/src/components/comment-thread.tsx` — `CommentThread`

This means adding dropzone support to `CommentThread` automatically covers both drawers.

### 2. Existing Attachment Pipeline

The existing upload flow in `CommentThread` (lines 144-200):

1. **Presign**: `POST /api/projects/:projectId/tasks/:taskId/attachments/presign` with `{ fileName, mimeType, fileSizeBytes }`
2. **PUT to R2**: Direct upload to presigned URL
3. **Complete**: `POST /api/projects/:projectId/tasks/:taskId/attachments/:id/complete`
4. **Download**: `GET /api/projects/:projectId/tasks/:taskId/attachments/:id/download`

Upload validation is enforced server-side via `s3UploadService.ts` (category configs, MIME types, size limits).

### 3. Attachment Association Model

Attachments are linked to comments **without schema changes** using the existing pattern:

- `task_attachments` table stores files with `taskId`, `projectId`, `uploadedByUserId`, etc.
- Attachment IDs are **embedded in the comment body JSON** via `server/utils/commentAttachments.ts`:
  - `embedAttachmentIdsInBody(body, attachmentIds)` — adds `attachmentIds` array to JSON body
  - `extractAttachmentIdsFromBody(body)` — extracts IDs from JSON body
  - `toAttachmentMeta(attachment)` — converts `TaskAttachment` to display DTO

### 4. Existing UI Components

- `CommentAttachments` (`client/src/components/comments/CommentAttachments.tsx`) — renders attachments under comments (image thumbnails + file rows with download)
- `CommentThread` already has: paperclip button, hidden file input, pending upload list with status/retry/remove, attachment IDs passed to `onAdd` callback

### 5. What's Missing (Scope of Work)

- **Drag-and-drop zone** — the composer only has a paperclip icon button + hidden `<input type="file">`
- No visual dropzone area for drag-and-drop
- No concurrency throttling on uploads
- No client-side file type blocking (relies on server guards only)

---

## Implementation

### Components & Hooks

| File | Purpose |
|------|---------|
| `client/src/components/comment-thread.tsx` | Enhanced with dropzone wrapper around comment compose area |

### Approach

Rather than creating a separate `CommentDropzone` component, the dropzone behavior is integrated directly into the existing `CommentThread` component since:
1. It already manages the full upload lifecycle (presign → upload → complete)
2. It already renders pending uploads with status/retry/remove
3. Both task and subtask drawers already use it

### Drag-and-Drop Behavior

- Native `dragenter`/`dragover`/`dragleave`/`drop` events on the compose area
- Visual feedback: dashed border highlight on drag over
- Files dropped are enqueued into the existing upload pipeline
- Click-to-browse still works via the existing paperclip button
- Max 10 files per comment, 25MB per file (matches server limits)
- Client-side extension blocking for dangerous types (exe, bat, cmd, msi, sh, dmg, iso, apk)

### Upload Queue

- Concurrency limit: 2 concurrent uploads
- Per-file states: `uploading` | `completing` | `complete` | `error`
- Retry failed uploads
- Remove pending files
- "Post Comment" disabled while uploads in progress

### Endpoints Used

- `POST /api/projects/:projectId/tasks/:taskId/attachments/presign`
- `PUT <presigned-url>` (direct to R2)
- `POST /api/projects/:projectId/tasks/:taskId/attachments/:id/complete`
- `GET /api/projects/:projectId/tasks/:taskId/attachments/:id/download`

### Backend Comment Routes

- `POST /api/tasks/:taskId/comments` — accepts `attachmentIds` in body, embeds in comment JSON
- `POST /api/subtasks/:subtaskId/comments` — same pattern
- `GET /api/tasks/:taskId/comments` — returns comments with attachment metadata
- `GET /api/subtasks/:subtaskId/comments` — same pattern

### Verification Steps

1. Open Task Drawer → Comments section
2. Drag a file over the comment compose area → dashed border appears
3. Drop file → appears in pending list with upload progress
4. Click paperclip → browse dialog opens, select file → same behavior
5. Post comment with attachments → attachments render under comment
6. Click image thumbnail → preview modal opens
7. Click download on non-image → file downloads
8. Repeat all steps in Subtask Drawer → identical behavior
9. Try dropping >10 files → shows toast warning
10. Try dropping .exe file → shows toast warning
