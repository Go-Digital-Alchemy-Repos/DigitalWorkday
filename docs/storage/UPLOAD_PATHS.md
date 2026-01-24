# Upload Paths

**Status:** Current  
**Last Updated:** January 2026  
**Related:** [Storage Overview](./STORAGE_OVERVIEW.md)

---

## Overview

All file uploads follow a consistent path structure for organization and tenant isolation.

---

## Path Patterns

| Upload Type | Path Pattern | Example |
|-------------|--------------|---------|
| User Avatar | `avatars/{userId}/{filename}` | `avatars/abc123/profile.jpg` |
| Tenant Logo | `branding/{tenantId}/logo/{filename}` | `branding/xyz789/logo/logo.png` |
| Tenant Favicon | `branding/{tenantId}/favicon/{filename}` | `branding/xyz789/favicon/icon.ico` |
| System Branding | `system/branding/{type}/{filename}` | `system/branding/logo/default.png` |
| Task Attachment | `attachments/{tenantId}/{projectId}/{taskId}/{filename}` | `attachments/xyz789/proj1/task1/doc.pdf` |
| Chat Attachment | `chat/{tenantId}/{threadId}/{filename}` | `chat/xyz789/ch123/image.png` |
| Export | `exports/{tenantId}/{type}/{filename}` | `exports/xyz789/time-entries/export.csv` |

---

## Upload Endpoints

### User Avatar
```
POST /api/users/:userId/avatar
Content-Type: multipart/form-data
```

### Task Attachment
```
POST /api/tasks/:taskId/attachments
Content-Type: multipart/form-data
```

### Chat Attachment
```
POST /api/chat/attachments
Content-Type: multipart/form-data
Body: { threadId, threadType }
```

---

## File Restrictions

| Type | Max Size | Allowed Types |
|------|----------|---------------|
| Avatar | 5MB | image/jpeg, image/png, image/gif |
| Branding | 2MB | image/png, image/svg+xml, image/x-icon |
| Task Attachment | 25MB | Common document types |
| Chat Attachment | 10MB | Images, documents, audio |

---

## Related Documentation

- [Storage Overview](./STORAGE_OVERVIEW.md)
- [Signed URLs](./SIGNED_URLS.md)
