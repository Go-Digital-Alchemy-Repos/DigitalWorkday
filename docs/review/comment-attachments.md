# Comment Attachments — Feature Review

## Overview

Adds file attachments to task and subtask comments using the existing Cloudflare R2 storage pipeline. Users can attach multiple files when posting a comment. Images show as thumbnails; non-image files display as downloadable chips.

## Architecture

### Upload Flow

```
User clicks attach → select files → presign (POST) → upload to R2 → complete (POST)
                                                                         ↓
                                                          attachmentIds stored in comment body
```

1. **Presign**: `POST /api/projects/:projectId/tasks/:taskId/attachments/presign`
   - Validates file type, size, and extension against blocklist
   - Creates a `task_attachments` row with `uploadStatus: "pending"`
   - Returns a presigned R2 PUT URL with headers

2. **Upload**: Client PUTs the file directly to R2 using the presigned URL

3. **Complete**: `POST /api/projects/:projectId/tasks/:taskId/attachments/:attachmentId/complete`
   - Verifies the object exists in R2
   - Updates `uploadStatus` to `"complete"`

4. **Associate**: Comment create (`POST /api/tasks/:taskId/comments`) accepts `attachmentIds?: string[]`
   - Validates each attachment belongs to the correct task and is complete
   - Embeds valid IDs into the ProseMirror JSON body as `attachmentIds` array

### Data Model

Attachments are stored in the existing `task_attachments` table. The association with comments is embedded in the comment body JSON:

```json
{
  "type": "doc",
  "content": [...],
  "attachmentIds": ["uuid-1", "uuid-2"]
}
```

On read, the comments endpoint extracts `attachmentIds` from each comment body, fetches the corresponding attachment records, and returns them as `attachments` metadata alongside the comment.

### File Validation

**Allowed types**: pdf, doc, docx, xls, xlsx, ppt, pptx, csv, txt, rtf, png, jpg, jpeg, webp, gif, ai, eps, psd, svg, json, xml, zip

**Blocked extensions**: exe, bat, cmd, msi, sh, dmg, iso, apk

**Max file size**: Configured via `MAX_FILE_SIZE_BYTES` in `server/s3.ts`

### Security

- Attachment IDs validated server-side: must belong to the same `taskId` and have `uploadStatus: "complete"`
- Cross-task attachment injection prevented by filtering on `taskId` match
- Blocked dangerous file extensions at presign time
- Download uses presigned R2 URLs (time-limited)

## Frontend Components

### `CommentThread` (`client/src/components/comment-thread.tsx`)

The main comment UI. Handles:
- Attach button (visible when `projectId` and `taskId` are available)
- Multi-file upload via hidden `<input type="file" multiple>`
- Pending upload list with status indicators (uploading, completing, complete, error)
- Retry button for failed uploads
- Remove button for pending files
- Blocks submit while uploads are in progress or have errors

### `CommentAttachments` (`client/src/components/comments/CommentAttachments.tsx`)

Renders attachments on posted comments:
- **Images**: 64x64 thumbnail buttons with filename overlay; click opens full-size preview dialog
- **Non-images**: File rows with icon (by type), filename, extension badge, size, and download button
- Download via presigned URL opened in new tab
- Error toasts on download/preview failure

### `CommentEditor` (`client/src/components/richtext/CommentEditor.tsx`)

Accepts an `attachButton` prop (rendered in the toolbar) to integrate the attach action into the editor chrome.

## Backend

### Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/tasks/:taskId/comments` | Returns comments with `attachments[]` metadata |
| POST | `/api/tasks/:taskId/comments` | Accepts `attachmentIds` in body, validates and embeds |
| POST | `/api/projects/:pid/tasks/:tid/attachments/presign` | Presign upload |
| POST | `/api/projects/:pid/tasks/:tid/attachments/:aid/complete` | Confirm upload |
| GET | `/api/projects/:pid/tasks/:tid/attachments/:aid/download` | Presigned download URL |

### Utilities (`server/utils/commentAttachments.ts`)

- `extractAttachmentIdsFromBody(body)` — Parses JSON body, returns `attachmentIds` array
- `embedAttachmentIdsInBody(body, ids)` — Adds `attachmentIds` to JSON body
- `toAttachmentMeta(attachment)` — Maps `TaskAttachment` to `CommentAttachmentMeta` DTO

## Tests

**File**: `server/tests/integration/commentAttachments.test.ts`

12 tests covering:

1. `extractAttachmentIdsFromBody` — plain text, JSON without IDs, JSON with IDs, non-string filtering
2. `embedAttachmentIdsInBody` — embed into JSON, empty array passthrough, non-JSON passthrough
3. `toAttachmentMeta` — field mapping
4. Cross-tenant validation — wrong task filtering, incomplete upload filtering
5. Blocked extensions — dangerous extensions blocked, safe extensions allowed

## Mobile Support

- Responsive layout: attachment thumbnails and file chips use `flex-wrap` for small screens
- Touch-friendly: minimum 44px tap targets on file rows, 64px on image thumbnails
- File input uses native mobile file picker via `<input type="file" multiple>`

## Integration Points

- Uses existing `task_attachments` table (no schema migration required)
- Uses existing R2/S3 presign infrastructure (`server/s3.ts`)
- Socket.IO events for real-time attachment notifications (`emitAttachmentAdded`, `emitAttachmentDeleted`)
- Both `task-detail-drawer.tsx` and `subtask-detail-drawer.tsx` pass `projectId` and `taskId` to enable attachments
