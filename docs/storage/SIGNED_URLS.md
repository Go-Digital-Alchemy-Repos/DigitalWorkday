# Signed URLs

**Status:** Current  
**Last Updated:** January 2026  
**Related:** [Storage Overview](./STORAGE_OVERVIEW.md)

---

## Overview

Signed URLs provide time-limited access to private files without exposing storage credentials.

---

## When to Use

| File Type | URL Type | Reason |
|-----------|----------|--------|
| User avatars | Public (CDN) | Frequently accessed, no sensitive data |
| Branding | Public (CDN) | Must be fast, used in every page load |
| Task attachments | Signed | May contain sensitive data |
| Chat attachments | Signed | Private conversations |
| Exports | Signed | Contains business data |

---

## Generating Signed URLs

```typescript
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand } from "@aws-sdk/client-s3";

async function getSignedDownloadUrl(
  config: S3Config,
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  const client = createS3ClientFromConfig(config);
  
  const command = new GetObjectCommand({
    Bucket: config.bucketName,
    Key: key,
  });
  
  return await getSignedUrl(client, command, { expiresIn });
}
```

---

## Expiration Times

| Use Case | Expiration | Reason |
|----------|------------|--------|
| Immediate download | 1 hour | User actively downloading |
| Email links | 24 hours | User may read email later |
| Preview in app | 15 minutes | Should be short for security |

---

## Public URLs

For public assets using CDN:

```typescript
function getPublicUrl(publicBaseUrl: string, key: string): string {
  return `${publicBaseUrl}/${key}`;
}

// Example
const avatarUrl = getPublicUrl(
  "https://cdn.myworkday.com",
  `avatars/${userId}/profile.jpg`
);
```

---

## Security Considerations

1. **Never expose raw bucket URLs** - Always use signed or CDN URLs
2. **Validate file ownership** - Check tenant before generating URL
3. **Log access** - Track who is downloading what
4. **Short expiration** - Use minimum viable expiration time

---

## Related Documentation

- [Storage Overview](./STORAGE_OVERVIEW.md)
- [Upload Paths](./UPLOAD_PATHS.md)
