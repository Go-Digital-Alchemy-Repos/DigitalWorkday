import type { RequestHandler } from "express";
import path from "path";

const DANGEROUS_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".com", ".msi", ".scr", ".pif",
  ".vbs", ".vbe", ".js", ".jse", ".ws", ".wsf", ".wsc",
  ".ps1", ".psm1", ".reg",
]);

export function sanitizeFilename(raw: string): string {
  let name = path.basename(raw);
  name = name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
  name = name.replace(/\.{2,}/g, ".");
  name = name.trim().replace(/^\.+/, "");
  if (!name) name = "untitled";
  return name;
}

export function isFilenameUnsafe(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return DANGEROUS_EXTENSIONS.has(ext);
}

export function validateUploadRequest(options: {
  maxBytes: number;
  allowedMimeTypes?: string[];
}): RequestHandler {
  return (req, _res, next) => {
    const { fileName, mimeType, fileSizeBytes } = req.body || {};

    if (typeof fileName === "string" && isFilenameUnsafe(fileName)) {
      console.warn(
        `[upload-guard] Potentially unsafe file extension detected: ${fileName}`,
        { requestId: (req as any).requestId, path: req.path }
      );
    }

    if (typeof fileSizeBytes === "number" && fileSizeBytes > options.maxBytes) {
      console.warn(
        `[upload-guard] File size ${fileSizeBytes} exceeds max ${options.maxBytes}`,
        { requestId: (req as any).requestId, path: req.path }
      );
    }

    if (
      options.allowedMimeTypes &&
      typeof mimeType === "string" &&
      !options.allowedMimeTypes.includes(mimeType)
    ) {
      console.warn(
        `[upload-guard] Unexpected MIME type: ${mimeType}`,
        { requestId: (req as any).requestId, path: req.path }
      );
    }

    if (typeof fileName === "string") {
      req.body.fileName = sanitizeFilename(fileName);
    }

    next();
  };
}
