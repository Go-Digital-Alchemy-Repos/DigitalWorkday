import React, { useRef, useState } from "react";
import { Download, File, FileText, Image, Loader2, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const MAX_FILES = 10;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const BLOCKED_EXTENSIONS = new Set([
  "exe", "bat", "cmd", "com", "msi", "scr", "pif", "vbs", "vbe", "js", "jse", "ws", "wsf", "wsc", "ps1", "psm1", "reg", "dmg", "iso", "apk", "sh",
]);

export type CommunicationAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return Image;
  if (mimeType.includes("pdf") || mimeType.includes("document") || mimeType.includes("text") || mimeType.includes("sheet") || mimeType.includes("presentation")) return FileText;
  return File;
}

export async function multipartRequest(
  method: "POST" | "PATCH",
  url: string,
  fields: Record<string, unknown>,
  files: File[],
): Promise<Response> {
  const form = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    form.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  });
  files.forEach((file) => form.append("files", file));

  const response = await fetch(url, { method, body: form, credentials: "include" });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const payload = await response.json();
      message = payload.message || payload.error?.message || message;
    } catch {}
    throw new Error(message);
  }
  return response;
}

export function AttachmentPicker({
  files,
  onFilesChange,
  disabled = false,
}: {
  files: File[];
  onFilesChange: (files: File[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const addFiles = (selected: FileList | null) => {
    if (!selected) return;
    const remaining = MAX_FILES - files.length;
    const accepted: File[] = [];
    for (const file of Array.from(selected).slice(0, Math.max(remaining, 0))) {
      const extension = file.name.split(".").pop()?.toLowerCase() || "";
      if (BLOCKED_EXTENSIONS.has(extension)) {
        toast({ title: "File type not allowed", description: file.name, variant: "destructive" });
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        toast({ title: "File is too large", description: `${file.name} exceeds the 25 MB limit.`, variant: "destructive" });
        continue;
      }
      accepted.push(file);
    }
    if (selected.length > remaining) {
      toast({ title: "Attachment limit reached", description: `You can attach up to ${MAX_FILES} files.`, variant: "destructive" });
    }
    if (accepted.length > 0) onFilesChange([...files, ...accepted]);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-2" data-testid="communication-attachment-picker">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.zip,.json,.xml,.ai,.psd"
        onChange={(event) => addFiles(event.target.files)}
        data-testid="input-communication-attachments"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || files.length >= MAX_FILES}
        onClick={() => inputRef.current?.click()}
        data-testid="button-attach-files"
      >
        <Paperclip className="mr-2 h-4 w-4" />
        Attach files
      </Button>
      {files.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2" data-testid="pending-communication-attachments">
          {files.map((file, index) => {
            const Icon = getFileIcon(file.type);
            return (
              <div key={`${file.name}-${file.size}-${index}`} className="flex items-center gap-2 rounded-md border bg-muted/20 p-2">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{file.name}</p>
                  <p className="text-[11px] text-muted-foreground">{formatFileSize(file.size)}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => onFilesChange(files.filter((_, fileIndex) => fileIndex !== index))}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-xs text-muted-foreground">Images and business documents, up to 10 files and 25 MB each.</p>
    </div>
  );
}

export function MessageAttachments({
  attachments,
  downloadPath,
}: {
  attachments?: CommunicationAttachment[];
  downloadPath: (attachmentId: string) => string;
}) {
  const { toast } = useToast();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  if (!attachments?.length) return null;

  const download = async (attachment: CommunicationAttachment) => {
    setDownloadingId(attachment.id);
    try {
      const response = await fetch(downloadPath(attachment.id), { credentials: "include" });
      if (!response.ok) throw new Error("Unable to download attachment");
      const payload = await response.json() as { url: string; fileName?: string };
      const link = document.createElement("a");
      link.href = payload.url;
      link.download = payload.fileName || attachment.fileName;
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      toast({ title: "Download failed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2" data-testid="message-attachments">
      {attachments.map((attachment) => {
        const Icon = getFileIcon(attachment.mimeType);
        return (
          <Button
            key={attachment.id}
            type="button"
            variant="outline"
            className="h-auto min-w-0 justify-start px-3 py-2 text-left"
            onClick={() => download(attachment)}
            disabled={downloadingId === attachment.id}
            data-testid={`button-download-attachment-${attachment.id}`}
          >
            {downloadingId === attachment.id ? <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" /> : <Icon className="mr-2 h-4 w-4 shrink-0" />}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium">{attachment.fileName}</span>
              <span className="block text-[11px] font-normal text-muted-foreground">{formatFileSize(attachment.sizeBytes)}</span>
            </span>
            <Download className="ml-2 h-3.5 w-3.5 shrink-0" />
          </Button>
        );
      })}
    </div>
  );
}
