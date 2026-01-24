# Storage Overview

**Status:** Current  
**Last Updated:** January 2026  
**Related:** [Upload Paths](./UPLOAD_PATHS.md), [Signed URLs](./SIGNED_URLS.md)

---

## Overview

MyWorkDay uses **Cloudflare R2** as the primary storage provider for all file uploads. R2 is S3-compatible, providing familiar APIs with Cloudflare's global edge network.

---

## Storage Architecture

### Provider Priority (Hierarchical Resolution)

The storage resolver checks configurations in this order:

```
1. Tenant R2 Configuration (enabled) → Use tenant's R2
2. System R2 Configuration (enabled) → Use system R2
3. No configuration → Error: STORAGE_NOT_CONFIGURED
```

### Storage Resolver

All file operations MUST go through the unified storage resolver:

```typescript
// server/storage/getStorageProvider.ts
export async function getStorageConfig(tenantId: string | null): Promise<S3Config> {
  // 1. Check tenant-specific R2 config
  if (tenantId) {
    const tenantConfig = await getTenantR2Config(tenantId);
    if (tenantConfig?.enabled) {
      return tenantConfig;
    }
  }
  
  // 2. Check system-level R2 config
  const systemConfig = await getSystemR2Config();
  if (systemConfig?.enabled) {
    return systemConfig;
  }
  
  // 3. No configuration available
  throw new StorageNotConfiguredError();
}
```

---

## R2 Configuration

### System-Level Configuration

Super admins configure system-wide R2 in the integrations panel:

| Setting | Description |
|---------|-------------|
| Account ID | Cloudflare account ID |
| Access Key ID | R2 API token key ID |
| Secret Access Key | R2 API token secret (encrypted) |
| Bucket Name | Target bucket name |
| Public Base URL | Optional CDN URL for public assets |

### Tenant-Level Override

Tenants can configure their own R2 bucket to keep files in their infrastructure:

- Same settings as system-level
- Takes priority over system config when enabled
- Allows enterprise tenants to manage their own storage

---

## R2 Client Configuration

The S3 client is configured for R2 compatibility:

```typescript
const client = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  },
  forcePathStyle: true,
});
```

---

## Upload Categories

| Category | Path Pattern | Access |
|----------|--------------|--------|
| User Avatars | `avatars/{userId}/{filename}` | Public (CDN) |
| Tenant Branding | `branding/{tenantId}/{type}/{filename}` | Public (CDN) |
| System Branding | `system/branding/{type}/{filename}` | Public (CDN) |
| Task Attachments | `attachments/{tenantId}/{projectId}/{taskId}/{filename}` | Signed URL |
| Chat Attachments | `chat/{tenantId}/{threadId}/{filename}` | Signed URL |
| Exports | `exports/{tenantId}/{type}/{filename}` | Signed URL |

---

## What NOT to Do

### Never Bypass the Storage Resolver
```typescript
// WRONG - Direct S3 client usage
const client = new S3Client({ /* hardcoded config */ });
await client.send(new PutObjectCommand({ /* ... */ }));

// CORRECT - Use storage resolver
const config = await getStorageConfig(tenantId);
const client = createS3ClientFromConfig(config);
await client.send(new PutObjectCommand({ /* ... */ }));
```

### Never Expose Credentials to Client
```typescript
// WRONG - Returns credentials
res.json({ 
  accessKeyId: config.accessKeyId,
  secretAccessKey: config.secretAccessKey // NEVER!
});

// CORRECT - Return signed URL only
const signedUrl = await getSignedUploadUrl(config, key);
res.json({ uploadUrl: signedUrl });
```

### Never Mix Tenant Storage
```typescript
// WRONG - Wrong tenant path
const key = `attachments/${otherTenantId}/${file.name}`;

// CORRECT - Use request tenant
const key = `attachments/${effectiveTenantId}/${projectId}/${file.name}`;
```

---

## Legacy S3 Compatibility

For existing records with S3 URLs:
- Legacy URLs remain readable
- No automatic migration (separate process)
- New uploads always go to R2

```typescript
// Check if URL is legacy S3
function isLegacyS3Url(url: string): boolean {
  return url.includes('.s3.') || url.includes('s3.amazonaws.com');
}
```

---

## Testing Storage Configuration

Super admins can test storage configuration:

```typescript
// POST /api/v1/super/integrations/storage/test
// Performs: HEAD bucket, small PUT+DELETE
// Returns: { success: boolean, error?: string }
```

---

## Related Documentation

- [Upload Paths](./UPLOAD_PATHS.md) - Specific upload endpoints
- [Signed URLs](./SIGNED_URLS.md) - URL signing for private files
