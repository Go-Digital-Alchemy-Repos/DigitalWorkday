/**
 * useS3Upload Hook
 * 
 * Provides a unified interface for uploading files to S3 via presigned URLs.
 * Uses the backend presign endpoint to get upload URLs, then uploads directly to S3.
 * 
 * Usage:
 * const { upload, progress, error, isUploading, reset } = useS3Upload({
 *   category: "user-avatar",
 *   context: { projectId, taskId }  // optional, for task attachments
 * });
 * 
 * const { fileUrl, key } = await upload(file);
 */

import { useState, useCallback } from "react";
import { apiRequest } from "@/lib/queryClient";

export type UploadCategory =
  | "global-branding-logo"
  | "global-branding-icon"
  | "global-branding-favicon"
  | "tenant-branding-logo"
  | "tenant-branding-icon"
  | "tenant-branding-favicon"
  | "user-avatar"
  | "task-attachment";

export type AssetType = "logo" | "icon" | "favicon";

interface UploadContext {
  projectId?: string;
  taskId?: string;
  assetType?: AssetType;
}

interface UseS3UploadOptions {
  category: UploadCategory;
  context?: UploadContext;
}

interface PresignResponse {
  uploadUrl: string;
  fileUrl: string;
  key: string;
  expiresInSeconds: number;
}

interface UploadResult {
  fileUrl: string;
  key: string;
}

interface UploadError {
  code: string;
  message: string;
}

interface UseS3UploadReturn {
  upload: (file: File) => Promise<UploadResult>;
  progress: number;
  isUploading: boolean;
  error: UploadError | null;
  reset: () => void;
}

export function useS3Upload({ category, context }: UseS3UploadOptions): UseS3UploadReturn {
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<UploadError | null>(null);

  const reset = useCallback(() => {
    setProgress(0);
    setIsUploading(false);
    setError(null);
  }, []);

  const upload = useCallback(async (file: File): Promise<UploadResult> => {
    setIsUploading(true);
    setError(null);
    setProgress(0);

    try {
      const presignResponse = await apiRequest("POST", "/api/v1/uploads/presign", {
        category,
        filename: file.name,
        contentType: file.type,
        size: file.size,
        context,
      });

      if (!presignResponse.ok) {
        const errorData = await presignResponse.json();
        throw {
          code: errorData.code || "PRESIGN_FAILED",
          message: errorData.message || "Failed to get upload URL",
        };
      }

      const { uploadUrl, fileUrl, key }: PresignResponse = await presignResponse.json();

      setProgress(10);

      const xhr = new XMLHttpRequest();
      
      await new Promise<void>((resolve, reject) => {
        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            const percentComplete = Math.round((event.loaded / event.total) * 80) + 10;
            setProgress(percentComplete);
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setProgress(100);
            resolve();
          } else {
            reject({
              code: "UPLOAD_FAILED",
              message: `Upload failed with status ${xhr.status}`,
            });
          }
        });

        xhr.addEventListener("error", () => {
          reject({
            code: "UPLOAD_FAILED",
            message: "Network error during upload",
          });
        });

        xhr.addEventListener("abort", () => {
          reject({
            code: "UPLOAD_ABORTED",
            message: "Upload was aborted",
          });
        });

        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.send(file);
      });

      setIsUploading(false);
      return { fileUrl, key };
    } catch (err: any) {
      const uploadError: UploadError = {
        code: err.code || "UPLOAD_ERROR",
        message: err.message || "Failed to upload file",
      };
      setError(uploadError);
      setIsUploading(false);
      throw uploadError;
    }
  }, [category, context]);

  return {
    upload,
    progress,
    isUploading,
    error,
    reset,
  };
}
