# Uploads & Files

**Status:** Draft  
**Last Updated:** 2026-02-05

---

## What It Is

The file upload system handles all file storage for the application using Cloudflare R2 (S3-compatible object storage). It supports user avatars, client documents, task attachments, and chat file sharing with presigned URL uploads for security.

---

## Who Uses It

| Role | Capabilities |
|------|--------------|
| **All Users** | Upload profile avatars, task attachments |
| **Member+** | Upload task attachments, comment files |
| **Manager+** | Upload client documents |
| **Admin** | Manage all tenant files, set policies |
| **Super Admin** | System-wide storage configuration |

---

## Data Model

### Documents (Client Documents)

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `tenantId` | UUID | Tenant scope |
| `clientId` | UUID | Associated client |
| `filename` | string | Original filename |
| `category` | string | Document category |
| `storageKey` | string | R2 object key |
| `mimeType` | string | File MIME type |
| `sizeBytes` | integer | File size |
| `uploadedBy` | UUID | Uploader user ID |
| `createdAt` | timestamp | Upload timestamp |

### Task Attachments

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `taskId` | UUID | Associated task |
| `filename` | string | Original filename |
| `storageKey` | string | R2 object key |
| `mimeType` | string | File MIME type |
| `sizeBytes` | integer | File size |
| `uploadedBy` | UUID | Uploader user ID |

---

## Key Flows

### 1. Presigned Upload (Preferred)

```
Client requests upload → POST /api/v1/uploads/presign
    ↓
Server validates: file type, size, permissions
    ↓
Generate presigned PUT URL (5 min expiry)
    ↓
Client uploads directly to R2
    ↓
Client confirms upload → POST /api/v1/uploads/confirm
    ↓
Create document/attachment record
```

### 2. Proxy Upload (Fallback)

```
Client sends file → POST /api/v1/uploads/proxy
    ↓
Server receives file, validates
    ↓
Compress images if applicable
    ↓
Upload to R2 from server
    ↓
Return file metadata
```

### 3. Download

```
User requests file → GET /api/v1/documents/:id/download
    ↓
Verify permissions (tenant, access level)
    ↓
Generate presigned GET URL (15 min expiry)
    ↓
Redirect to presigned URL
```

### 4. Image Compression

```
Image upload detected
    ↓
Apply compression based on type:
  - Avatars: 400x400, WebP, 85% quality
  - Logos: 1200x400 max
  - Attachments: 2000x2000 max
    ↓
Upload compressed version
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| **File too large** | 413 error, max 50MB default |
| **Invalid file type** | 415 error, whitelist validation |
| **Upload timeout** | Client retry with new presigned URL |
| **Orphaned files** | Cleanup job removes unconfirmed uploads |
| **R2 unavailable** | Queue upload, retry with backoff |
| **Duplicate filename** | Append UUID to storage key |

---

## Admin Controls

| Control | Location | Description |
|---------|----------|-------------|
| **Upload Files** | Various locations | Context-specific upload buttons |
| **View Documents** | Client > Documents | Document list with download |
| **Delete Files** | Context menu | Remove file (soft delete) |
| **Storage Settings** | Super Admin > Integrations | R2 configuration |
| **File Limits** | Super Admin > Settings | Max size, allowed types |
| **Storage Usage** | Super Admin > Tenants | Per-tenant storage metrics |

---

## Storage Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `maxFileSize` | 50 MB | Maximum upload size |
| `allowedTypes` | Various | Whitelist of MIME types |
| `avatarMaxSize` | 5 MB | Max avatar size |
| `compressionQuality` | 85% | JPEG/WebP quality |

### Resolution Order

```
1. Tenant R2 settings (if configured)
2. System R2 settings (Super Admin configured)
3. Environment variables (CF_R2_*)
```

---

## Allowed File Types

| Category | Extensions |
|----------|------------|
| **Images** | jpg, jpeg, png, gif, webp, svg |
| **Documents** | pdf, doc, docx, xls, xlsx, ppt, pptx |
| **Text** | txt, csv, md, json |
| **Archives** | zip, tar, gz |

---

## Related Documentation

- [Uploads & S3](../UPLOADS_S3.md)
- [Integrations](../INTEGRATIONS.md)
