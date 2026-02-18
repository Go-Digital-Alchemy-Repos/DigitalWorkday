import { useState, useCallback, useRef } from "react";
import { apiRequest } from "@/lib/queryClient";

export type UploadStatus = "queued" | "uploading" | "completing" | "complete" | "error";

export interface QueuedUpload {
  id: string;
  file: File;
  status: UploadStatus;
  attachmentId?: string;
  error?: string;
}

const BLOCKED_EXTENSIONS = new Set([
  "exe", "bat", "cmd", "msi", "sh", "dmg", "iso", "apk",
  "com", "scr", "pif", "vbs", "js", "ws", "wsf",
]);

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_FILES = 10;
const MAX_CONCURRENT = 2;

function getExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
}

interface UseAttachmentUploadQueueOptions {
  projectId: string | null | undefined;
  taskId: string | null | undefined;
  onValidationError?: (message: string) => void;
}

export function useAttachmentUploadQueue({
  projectId,
  taskId,
  onValidationError,
}: UseAttachmentUploadQueueOptions) {
  const [uploads, setUploads] = useState<QueuedUpload[]>([]);
  const activeCountRef = useRef(0);
  const queueRef = useRef<QueuedUpload[]>([]);

  const processNext = useCallback(async () => {
    if (activeCountRef.current >= MAX_CONCURRENT) return;
    if (!projectId || !taskId) return;

    const next = queueRef.current.find((u) => u.status === "queued");
    if (!next) return;

    activeCountRef.current++;
    next.status = "uploading";

    setUploads((prev) =>
      prev.map((u) => (u.id === next.id ? { ...u, status: "uploading" as UploadStatus } : u))
    );

    try {
      const presignRes = await apiRequest(
        "POST",
        `/api/projects/${projectId}/tasks/${taskId}/attachments/presign`,
        {
          fileName: next.file.name,
          mimeType: next.file.type || "application/octet-stream",
          fileSizeBytes: next.file.size,
        }
      );
      const { attachment, upload } = await presignRes.json();

      const s3Res = await fetch(upload.url, {
        method: upload.method,
        headers: upload.headers,
        body: next.file,
      });

      if (!s3Res.ok) throw new Error("Upload to storage failed");

      setUploads((prev) =>
        prev.map((u) => (u.id === next.id ? { ...u, status: "completing" as UploadStatus } : u))
      );

      await apiRequest(
        "POST",
        `/api/projects/${projectId}/tasks/${taskId}/attachments/${attachment.id}/complete`,
        {}
      );

      const updatedItem = queueRef.current.find((u) => u.id === next.id);
      if (updatedItem) {
        updatedItem.status = "complete";
        updatedItem.attachmentId = attachment.id;
      }

      setUploads((prev) =>
        prev.map((u) =>
          u.id === next.id
            ? { ...u, status: "complete" as UploadStatus, attachmentId: attachment.id }
            : u
        )
      );
    } catch (err: any) {
      const updatedItem = queueRef.current.find((u) => u.id === next.id);
      if (updatedItem) {
        updatedItem.status = "error";
        updatedItem.error = err.message;
      }

      setUploads((prev) =>
        prev.map((u) =>
          u.id === next.id
            ? { ...u, status: "error" as UploadStatus, error: err.message }
            : u
        )
      );
    } finally {
      activeCountRef.current--;
      processNext();
    }
  }, [projectId, taskId]);

  const enqueueFiles = useCallback(
    (files: File[]) => {
      const currentCount = queueRef.current.length;
      const remaining = MAX_FILES - currentCount;
      if (remaining <= 0) {
        onValidationError?.(`Maximum ${MAX_FILES} files per comment.`);
        return;
      }

      const accepted: QueuedUpload[] = [];
      for (const file of files.slice(0, remaining)) {
        const ext = getExtension(file.name);
        if (BLOCKED_EXTENSIONS.has(ext)) {
          onValidationError?.(`"${file.name}" is a blocked file type.`);
          continue;
        }
        if (file.size > MAX_FILE_SIZE) {
          onValidationError?.(`"${file.name}" exceeds the 25 MB size limit.`);
          continue;
        }
        accepted.push({
          id: crypto.randomUUID(),
          file,
          status: "queued",
        });
      }

      if (files.length > remaining) {
        onValidationError?.(`Only ${remaining} more file(s) allowed. ${files.length - remaining} skipped.`);
      }

      if (accepted.length > 0) {
        queueRef.current = [...queueRef.current, ...accepted];
        setUploads((prev) => [...prev, ...accepted]);
        for (let i = 0; i < Math.min(accepted.length, MAX_CONCURRENT); i++) {
          processNext();
        }
      }
    },
    [processNext, onValidationError]
  );

  const removeUpload = useCallback((id: string) => {
    queueRef.current = queueRef.current.filter((u) => u.id !== id);
    setUploads((prev) => prev.filter((u) => u.id !== id));
  }, []);

  const retryUpload = useCallback(
    (id: string) => {
      const item = queueRef.current.find((u) => u.id === id);
      if (item && item.status === "error") {
        item.status = "queued";
        item.error = undefined;
        setUploads((prev) =>
          prev.map((u) => (u.id === id ? { ...u, status: "queued" as UploadStatus, error: undefined } : u))
        );
        processNext();
      }
    },
    [processNext]
  );

  const clearQueue = useCallback(() => {
    queueRef.current = [];
    setUploads([]);
    activeCountRef.current = 0;
  }, []);

  const completedIds = uploads
    .filter((u) => u.status === "complete" && u.attachmentId)
    .map((u) => u.attachmentId!);

  const isUploading = uploads.some(
    (u) => u.status === "queued" || u.status === "uploading" || u.status === "completing"
  );

  const hasErrors = uploads.some((u) => u.status === "error");

  return {
    uploads,
    enqueueFiles,
    removeUpload,
    retryUpload,
    clearQueue,
    completedIds,
    isUploading,
    hasErrors,
  };
}
