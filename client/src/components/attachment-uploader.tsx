import { useState, useCallback, useRef, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { 
  Paperclip, 
  Upload, 
  X, 
  FileText, 
  Image, 
  File, 
  FileSpreadsheet,
  FileArchive,
  FileCode2,
  Download, 
  Eye,
  Trash2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { TaskAttachmentWithUser } from "@shared/schema";

interface AttachmentUploaderProps {
  taskId: string;
  projectId: string | null;
  subtaskId?: string | null;
  onUploadSuccess?: () => void;
  onDeleteSuccess?: () => void;
}

interface UploadingFile {
  id: string;
  name: string;
  status: "uploading" | "error";
  error?: string;
}

interface AttachmentConfig {
  configured: boolean;
  maxFileSizeBytes: number;
  allowedMimeTypes: string[];
}

interface PreviewAttachment {
  id: string;
  url: string;
  fileName: string;
  fileSizeBytes: number;
  uploadedByName?: string | null;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) {
    return Image;
  }
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("sheet") || mimeType.includes("csv")) {
    return FileSpreadsheet;
  }
  if (mimeType.includes("zip") || mimeType.includes("archive") || mimeType.includes("compressed")) {
    return FileArchive;
  }
  if (mimeType.includes("json") || mimeType.includes("javascript") || mimeType.includes("typescript") || mimeType.includes("html") || mimeType.includes("xml")) {
    return FileCode2;
  }
  if (mimeType.includes("pdf") || mimeType.includes("document") || mimeType.includes("word") || mimeType.includes("text")) {
    return FileText;
  }
  return File;
}

function isImageAttachment(mimeType: string) {
  return mimeType.startsWith("image/");
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function triggerFileDownload(url: string, fileName: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

const ATTACHMENT_MAX_DIMENSION = 2000;
const ATTACHMENT_WEBP_QUALITY = 0.85;

async function compressImageIfNeeded(file: File): Promise<{ file: File; mimeType: string }> {
  if (!file.type.startsWith("image/")) {
    return { file, mimeType: file.type };
  }
  
  if (file.type === "image/svg+xml" || file.type === "image/x-icon" || file.type === "image/vnd.microsoft.icon") {
    return { file, mimeType: file.type };
  }
  
  return new Promise((resolve) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      let width = img.width;
      let height = img.height;
      
      if (width <= ATTACHMENT_MAX_DIMENSION && height <= ATTACHMENT_MAX_DIMENSION) {
        if (file.type === "image/webp" || file.type === "image/png" || file.type === "image/gif") {
          resolve({ file, mimeType: file.type });
          return;
        }
      }
      
      if (width > ATTACHMENT_MAX_DIMENSION || height > ATTACHMENT_MAX_DIMENSION) {
        const scale = Math.min(ATTACHMENT_MAX_DIMENSION / width, ATTACHMENT_MAX_DIMENSION / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      
      if (!ctx) {
        resolve({ file, mimeType: file.type });
        return;
      }
      
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, width, height);
      
      let outputType = "image/webp";
      let quality: number | undefined = ATTACHMENT_WEBP_QUALITY;
      
      if (file.type === "image/png" || file.type === "image/gif") {
        outputType = "image/png";
        quality = undefined;
      }
      
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const ext = outputType === "image/webp" ? ".webp" : ".png";
            const baseName = file.name.replace(/\.[^.]+$/, "");
            const compressedFile = new window.File([blob], baseName + ext, { type: outputType });
            console.log(`[attachment] Compressed ${file.name}: ${(file.size / 1024).toFixed(1)}KB → ${(blob.size / 1024).toFixed(1)}KB`);
            resolve({ file: compressedFile, mimeType: outputType });
          } else {
            resolve({ file, mimeType: file.type });
          }
        },
        outputType,
        quality
      );
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ file, mimeType: file.type });
    };
    
    img.src = url;
  });
}

export function AttachmentUploader({ taskId, projectId, subtaskId = null, onUploadSuccess, onDeleteSuccess }: AttachmentUploaderProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [previewAttachment, setPreviewAttachment] = useState<PreviewAttachment | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);

  const attachmentPath = subtaskId
    ? `/api/projects/${projectId}/subtasks/${subtaskId}/attachments`
    : `/api/projects/${projectId}/tasks/${taskId}/attachments`;

  const { data: config } = useQuery<AttachmentConfig>({
    queryKey: ["/api/attachments/config"],
  });

  const { data: attachments = [], isLoading } = useQuery<TaskAttachmentWithUser[]>({
    queryKey: ["/api/projects", projectId, subtaskId ? "subtasks" : "tasks", subtaskId || taskId, "attachments"],
    enabled: !!taskId && !!projectId,
    queryFn: async () => {
      const response = await fetch(attachmentPath, { credentials: "include" });
      if (!response.ok) {
        throw new Error("Failed to load attachments");
      }
      return response.json();
    },
  });

  const uploadFile = useCallback(async (file: File) => {
    const uploadId = crypto.randomUUID();
    
    setUploadingFiles(prev => [...prev, { 
      id: uploadId, 
      name: file.name, 
      status: "uploading" 
    }]);

    try {
      const { file: processedFile } = await compressImageIfNeeded(file);
      
      const formData = new FormData();
      formData.append("file", processedFile);

      const uploadResponse = await fetch(
        `${attachmentPath}/upload`,
        {
          method: "POST",
          body: formData,
          credentials: "include",
        }
      );

      if (!uploadResponse.ok) {
        let errorMsg = "Failed to upload file";
        try {
          const errBody = await uploadResponse.json();
          if (errBody.message) errorMsg = errBody.message;
        } catch {}
        throw new Error(errorMsg);
      }

      const { attachment } = await uploadResponse.json();

      setUploadingFiles(prev => prev.filter(f => f.id !== uploadId));
      
      queryClient.invalidateQueries({ 
        queryKey: ["/api/projects", projectId, subtaskId ? "subtasks" : "tasks", subtaskId || taskId, "attachments"]
      });

      onUploadSuccess?.();

      toast({
        title: "File uploaded",
        description: `${file.name} has been uploaded successfully.`,
      });
    } catch (error: any) {
      console.error("Upload error:", error);
      
      setUploadingFiles(prev => 
        prev.map(f => f.id === uploadId ? { 
          ...f, 
          status: "error", 
          error: error.message || "Upload failed" 
        } : f)
      );

      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload file. Please try again.",
        variant: "destructive",
      });
    }
  }, [attachmentPath, projectId, subtaskId, taskId, toast]);

  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files || !config?.configured) return;
    
    Array.from(files).forEach(file => {
      if (file.size > config.maxFileSizeBytes) {
        toast({
          title: "File too large",
          description: `${file.name} exceeds the maximum file size of ${formatFileSize(config.maxFileSizeBytes)}.`,
          variant: "destructive",
        });
        return;
      }

      const mimeType = file.type || "application/octet-stream";
      if (!config.allowedMimeTypes.includes(mimeType)) {
        toast({
          title: "File type not allowed",
          description: `${file.name} has an unsupported file type.`,
          variant: "destructive",
        });
        return;
      }

      uploadFile(file);
    });
  }, [config, uploadFile, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files);
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set isDragOver to false if we're leaving the dropzone itself, not just entering a child
    const relatedTarget = e.relatedTarget as Node | null;
    const currentTarget = e.currentTarget as Node;
    if (!relatedTarget || !currentTarget.contains(relatedTarget)) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const getAttachmentUrl = useCallback(async (
    attachmentId: string,
    mode: "inline" | "download" = "inline",
  ) => {
    const query = mode === "download" ? "?mode=download" : "";
    const response = await apiRequest(
      "GET",
      `${attachmentPath}/${attachmentId}/download${query}`
    );
    const data = await response.json();
    return data.url as string;
  }, [attachmentPath]);

  const downloadMutation = useMutation({
    mutationFn: async ({
      attachmentId,
      fileName,
    }: {
      attachmentId: string;
      fileName: string;
    }) => {
      const response = await apiRequest(
        "GET",
        `${attachmentPath}/${attachmentId}/download?mode=download`
      );
      const data = await response.json();
      return { url: data.url as string, fileName };
    },
    onSuccess: (data) => {
      triggerFileDownload(data.url, data.fileName);
    },
    onError: () => {
      toast({
        title: "Download failed",
        description: "Failed to generate download link. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handlePreviewAttachment = useCallback(async (attachment: TaskAttachmentWithUser) => {
    if (!isImageAttachment(attachment.mimeType)) return;

    setPreviewLoadingId(attachment.id);
    try {
      const url = previewUrls[attachment.id] ?? await getAttachmentUrl(attachment.id, "inline");
      setPreviewUrls((prev) => ({ ...prev, [attachment.id]: url }));
      setPreviewAttachment({
        id: attachment.id,
        url,
        fileName: attachment.originalFileName,
        fileSizeBytes: attachment.fileSizeBytes,
        uploadedByName: attachment.uploadedByUser?.name,
      });
    } catch {
      toast({
        title: "Preview failed",
        description: `Could not preview ${attachment.originalFileName}. Please try again.`,
        variant: "destructive",
      });
    } finally {
      setPreviewLoadingId(null);
    }
  }, [getAttachmentUrl, previewUrls, toast]);

  const deleteMutation = useMutation({
    mutationFn: async (attachmentId: string) => {
      return apiRequest(
        "DELETE",
        `${attachmentPath}/${attachmentId}`
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", projectId, subtaskId ? "subtasks" : "tasks", subtaskId || taskId, "attachments"]
      });
      onDeleteSuccess?.();
      toast({
        title: "Attachment deleted",
        description: "The attachment has been removed.",
      });
    },
    onError: () => {
      toast({
        title: "Delete failed",
        description: "Failed to delete attachment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const completedAttachments = attachments.filter(a => a.uploadStatus === "complete");

  useEffect(() => {
    const imageAttachments = completedAttachments.filter((attachment) => isImageAttachment(attachment.mimeType));
    const missingPreviewAttachments = imageAttachments.filter((attachment) => !previewUrls[attachment.id]);
    if (missingPreviewAttachments.length === 0) return;

    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        missingPreviewAttachments.map(async (attachment) => {
          try {
            const url = await getAttachmentUrl(attachment.id, "inline");
            return [attachment.id, url] as const;
          } catch {
            return null;
          }
        })
      );

      if (cancelled) return;
      setPreviewUrls((prev) => {
        const next = { ...prev };
        for (const entry of entries) {
          if (entry) next[entry[0]] = entry[1];
        }
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [completedAttachments, getAttachmentUrl, previewUrls]);

  const removeUploadingFile = useCallback((id: string) => {
    setUploadingFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  if (!config?.configured) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-3">
        <Paperclip className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium text-[16px] text-[#171717]">Attachments</span>
      </div>
      <div className="space-y-3">
        <div
          role="button"
          tabIndex={0}
          aria-label="Attachments. Drag and drop or press Enter to upload files"
          className={`border-2 border-dashed rounded-lg p-4 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            isDragOver 
              ? "border-primary bg-primary/5" 
              : "border-muted-foreground/20 hover:border-muted-foreground/40"
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDragEnter={handleDragEnter}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          data-testid="dropzone-attachments"
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files)}
            data-testid="input-file-attachments"
          />
          <div className="flex flex-col items-center justify-center gap-2 text-center pointer-events-none">
            <Upload className="h-6 w-6 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">
              <span>Drop files here or </span>
              <span className="text-primary hover:underline">browse</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Max {formatFileSize(config.maxFileSizeBytes)} per file
            </p>
          </div>
        </div>
        {uploadingFiles.length > 0 && (
          <div className="space-y-2">
            {uploadingFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-2 p-2 bg-muted/50 rounded-md"
              >
                {file.status === "error" ? (
                  <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                )}
                <span className="text-sm truncate flex-1">{file.name}</span>
                {file.status === "uploading" && (
                  <span className="text-xs text-muted-foreground">Uploading...</span>
                )}
                {file.status === "error" && (
                  <>
                    <span className="text-xs text-destructive">{file.error}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => removeUploadingFile(file.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : completedAttachments.length > 0 ? (
          <div className="space-y-2">
            {completedAttachments.map((attachment) => {
              const FileIcon = getFileIcon(attachment.mimeType);
              const isImage = isImageAttachment(attachment.mimeType);
              const previewUrl = previewUrls[attachment.id];
              return (
                <div
                  key={attachment.id}
                  className="flex items-center gap-2 p-2 bg-muted/30 rounded-md group"
                  data-testid={`attachment-item-${attachment.id}`}
                >
                  {isImage && previewUrl ? (
                    <img
                      src={previewUrl}
                      alt={attachment.originalFileName}
                      className="h-12 w-12 rounded-md object-cover border shrink-0"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-md border bg-background flex items-center justify-center shrink-0">
                      <FileIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{attachment.originalFileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(attachment.fileSizeBytes)}
                      {attachment.uploadedByUser && ` • ${attachment.uploadedByUser.name}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                    {isImage && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handlePreviewAttachment(attachment)}
                        disabled={previewLoadingId === attachment.id}
                        aria-label={`Preview ${attachment.originalFileName}`}
                        data-testid={`button-preview-${attachment.id}`}
                      >
                        {previewLoadingId === attachment.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => downloadMutation.mutate({
                        attachmentId: attachment.id,
                        fileName: attachment.originalFileName,
                      })}
                      disabled={downloadMutation.isPending}
                      aria-label={`Download ${attachment.originalFileName}`}
                      data-testid={`button-download-${attachment.id}`}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => deleteMutation.mutate(attachment.id)}
                      disabled={deleteMutation.isPending}
                      aria-label={`Delete ${attachment.originalFileName}`}
                      data-testid={`button-delete-${attachment.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-2">
            No attachments yet
          </p>
        )}
      </div>
      <Dialog
        open={!!previewAttachment}
        onOpenChange={(open) => {
          if (!open) setPreviewAttachment(null);
        }}
      >
        <DialogContent
          className="h-[80vh] w-[95vw] max-w-none grid-rows-[auto_1fr] gap-0 overflow-hidden p-0 sm:h-[75vh] sm:w-[75vw]"
          data-testid="attachment-preview-modal"
        >
          {previewAttachment && (
            <>
              <DialogHeader className="border-b px-4 py-3 pr-12">
                <DialogTitle className="truncate text-base">
                  {previewAttachment.fileName}
                </DialogTitle>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(previewAttachment.fileSizeBytes)}
                  {previewAttachment.uploadedByName && ` • ${previewAttachment.uploadedByName}`}
                </p>
              </DialogHeader>
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-black/90 p-4">
                <img
                  src={previewAttachment.url}
                  alt={previewAttachment.fileName}
                  className="max-h-full max-w-full object-contain"
                  data-testid="attachment-preview-image"
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
