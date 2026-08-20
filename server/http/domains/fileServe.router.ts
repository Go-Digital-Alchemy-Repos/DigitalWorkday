import { Router, Request, Response } from "express";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import mime from "mime-types";
import {
  getStorageProvider,
  createS3ClientFromConfig,
  StorageNotConfiguredError,
} from "../../storage/getStorageProvider";

const router = Router();

const SERVE_CACHE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

const PUBLIC_PREFIXES = ["system/", "global/"];
const TENANT_KEY_PATTERN = /^tenants\/([^/]+)\//;
const PUBLIC_TENANT_ASSET_PATTERN = /^tenants\/[^/]+\/branding\/(?:logo|icon|favicon)\//;

function getEffectiveTenantId(req: Request): string | null {
  return req.tenant?.effectiveTenantId || (req.user as any)?.tenantId || null;
}

function isAuthenticated(req: Request): boolean {
  return Boolean(req.desktopAuth) || (typeof req.isAuthenticated === "function" && req.isAuthenticated());
}

function authorizeFileKey(req: Request, key: string): { ok: true; tenantId: string | null } | { ok: false; status: number; error: string } {
  if (PUBLIC_PREFIXES.some(prefix => key.startsWith(prefix)) || PUBLIC_TENANT_ASSET_PATTERN.test(key)) {
    return { ok: true, tenantId: null };
  }

  const tenantMatch = TENANT_KEY_PATTERN.exec(key);
  if (!tenantMatch) {
    return { ok: false, status: 400, error: "Invalid file key" };
  }

  if (!isAuthenticated(req)) {
    return { ok: false, status: 401, error: "Authentication required" };
  }

  const keyTenantId = tenantMatch[1];
  const effectiveTenantId = getEffectiveTenantId(req);
  if (!effectiveTenantId || effectiveTenantId !== keyTenantId) {
    return { ok: false, status: 403, error: "File access denied" };
  }

  return { ok: true, tenantId: effectiveTenantId };
}

router.get("/*", async (req: Request, res: Response) => {
  try {
    const key = req.params[0];
    if (!key) {
      return res.status(400).json({ error: "Missing file key" });
    }

    const decodedKey = decodeURIComponent(key);

    if (decodedKey.includes("..")) {
      return res.status(400).json({ error: "Invalid file key" });
    }

    const authorization = authorizeFileKey(req, decodedKey);
    if (!authorization.ok) {
      return res.status(authorization.status).json({ error: authorization.error });
    }

    const storageProvider = await getStorageProvider(authorization.tenantId);
    const client = createS3ClientFromConfig(storageProvider.config);

    const command = new GetObjectCommand({
      Bucket: storageProvider.config.bucketName,
      Key: decodedKey,
    });

    const response = await client.send(command);

    if (!response.Body) {
      return res.status(404).json({ error: "File not found" });
    }

    const contentType = response.ContentType ||
      (mime.lookup(decodedKey) as string) || "application/octet-stream";

    res.set("Content-Type", contentType);
    res.set("Cache-Control", `public, max-age=${SERVE_CACHE_MAX_AGE}, immutable`);
    res.set("X-Content-Type-Options", "nosniff");
    if (contentType === "image/svg+xml") {
      res.set("Content-Security-Policy", "sandbox; script-src 'none'");
    }
    if (response.ContentLength) {
      res.set("Content-Length", String(response.ContentLength));
    }

    const stream = response.Body as NodeJS.ReadableStream;
    stream.pipe(res);
  } catch (error: any) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === "NoSuchKey") {
      return res.status(404).json({ error: "File not found" });
    }

    if (error instanceof StorageNotConfiguredError) {
      return res.status(503).json({ error: "Storage not configured" });
    }

    console.error("[file-serve] Error:", error);
    res.status(500).json({ error: "Failed to serve file" });
  }
});

export default router;
