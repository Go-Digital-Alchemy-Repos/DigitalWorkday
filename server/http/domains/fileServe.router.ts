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

const ALLOWED_PREFIXES = ["tenants/", "system/", "global/"];

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

    if (!ALLOWED_PREFIXES.some(p => decodedKey.startsWith(p))) {
      return res.status(400).json({ error: "Invalid file key" });
    }

    const tenantId = (req.user as any)?.tenantId ||
      req.tenant?.effectiveTenantId || null;

    const storageProvider = await getStorageProvider(tenantId);
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
