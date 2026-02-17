import type { RequestHandler } from "express";
import path from "path";
import { AppError } from "../../lib/errors";

const DANGEROUS_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".com", ".msi", ".scr", ".pif",
  ".vbs", ".vbe", ".js", ".jse", ".ws", ".wsf", ".wsc",
  ".ps1", ".psm1", ".reg",
]);

export type UploadGuardMode = "warn" | "enforce";

function resolveGuardMode(explicit?: UploadGuardMode): UploadGuardMode {
  if (explicit) return explicit;
  const env = process.env.UPLOAD_GUARDS_MODE;
  if (env === "enforce") return "enforce";
  return "warn";
}

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

export interface UploadGuardOptions {
  maxBytes?: number;
  allowedMimeTypes?: string[];
  allowUnsafeExtensions?: boolean;
  mode?: UploadGuardMode;
  filenameField?: string;
  mimeTypeField?: string;
  sizeField?: string;
}

export function validateUploadRequest(options: UploadGuardOptions = {}): RequestHandler {
  const {
    allowUnsafeExtensions = false,
    filenameField = "fileName",
    mimeTypeField = "mimeType",
    sizeField = "fileSizeBytes",
  } = options;

  return (req, _res, next) => {
    const mode = resolveGuardMode(options.mode);
    const body = req.body || {};
    const rawFilename = body[filenameField];
    const mimeType = body[mimeTypeField];
    const fileSize = body[sizeField];
    const reqId = (req as any).requestId;
    const logCtx = { requestId: reqId, path: req.path, mode };

    if (typeof rawFilename === "string") {
      const hasTraversal = rawFilename.includes("..") || rawFilename.includes("/") || rawFilename.includes("\\");
      if (hasTraversal) {
        if (mode === "enforce") {
          return next(AppError.badRequest("Invalid filename: path traversal detected"));
        }
        console.warn(`[upload-guard] Path traversal in filename: ${rawFilename}`, logCtx);
      }

      if (!allowUnsafeExtensions && isFilenameUnsafe(rawFilename)) {
        if (mode === "enforce") {
          return next(AppError.badRequest("File type not allowed"));
        }
        console.warn(`[upload-guard] Potentially unsafe file extension: ${rawFilename}`, logCtx);
      }

      body[filenameField] = sanitizeFilename(rawFilename);
    } else if (rawFilename !== undefined) {
      if (mode === "enforce") {
        return next(AppError.badRequest("Filename must be a string"));
      }
      console.warn(`[upload-guard] Non-string filename provided`, logCtx);
    }

    if (options.maxBytes && typeof fileSize === "number" && fileSize > options.maxBytes) {
      if (mode === "enforce") {
        return next(AppError.badRequest(`File size ${fileSize} exceeds maximum ${options.maxBytes}`));
      }
      console.warn(`[upload-guard] File size ${fileSize} exceeds max ${options.maxBytes}`, logCtx);
    }

    if (
      options.allowedMimeTypes &&
      typeof mimeType === "string" &&
      !options.allowedMimeTypes.includes(mimeType)
    ) {
      if (mode === "enforce") {
        return next(AppError.badRequest(`MIME type not allowed: ${mimeType}`));
      }
      console.warn(`[upload-guard] Unexpected MIME type: ${mimeType}`, logCtx);
    }

    next();
  };
}
