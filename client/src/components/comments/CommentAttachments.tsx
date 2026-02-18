import { useState, useCallback } from "react";
import { Download, FileText, File, Image, FileSpreadsheet, Presentation, Archive, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface CommentAttachmentMeta {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string | Date;
}

interface CommentAttachmentsProps {
  attachments: CommentAttachmentMeta[];
  projectId: string;
  taskId: string;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return Image;
  if (mimeType.includes("pdf")) return FileText;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("csv")) return FileSpreadsheet;
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return Presentation;
  if (mimeType.includes("zip") || mimeType.includes("compressed")) return Archive;
  if (mimeType.includes("document") || mimeType.includes("msword") || mimeType.includes("text")) return FileText;
  return File;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop()!.toUpperCase() : "";
}

export function CommentAttachments({ attachments, projectId, taskId }: CommentAttachmentsProps) {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState("");
  const { toast } = useToast();

  const images = attachments.filter((a) => a.mimeType.startsWith("image/"));
  const files = attachments.filter((a) => !a.mimeType.startsWith("image/"));

  const handleDownload = useCallback(async (attachmentId: string, filename: string) => {
    setDownloading(attachmentId);
    try {
      const res = await apiRequest(
        "GET",
        `/api/projects/${projectId}/tasks/${taskId}/attachments/${attachmentId}/download`
      );
      const { url } = await res.json();
      window.open(url, "_blank");
    } catch {
      toast({ title: "Download failed", description: `Could not download "${filename}". Please try again.`, variant: "destructive" });
    } finally {
      setDownloading(null);
    }
  }, [projectId, taskId, toast]);

  const handleImagePreview = useCallback(async (attachmentId: string, filename: string) => {
    try {
      const res = await apiRequest(
        "GET",
        `/api/projects/${projectId}/tasks/${taskId}/attachments/${attachmentId}/download`
      );
      const { url } = await res.json();
      setPreviewUrl(url);
      setPreviewName(filename);
    } catch {
      toast({ title: "Preview failed", description: `Could not load preview for "${filename}".`, variant: "destructive" });
    }
  }, [projectId, taskId, toast]);

  if (attachments.length === 0) return null;

  return (
    <div className="mt-2 space-y-2" data-testid="comment-attachments">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img) => (
            <button
              key={img.id}
              type="button"
              className="relative w-16 h-16 rounded-md border border-border overflow-hidden hover-elevate cursor-pointer"
              style={{ minWidth: 64, minHeight: 64 }}
              onClick={() => handleImagePreview(img.id, img.filename)}
              data-testid={`comment-attachment-image-${img.id}`}
            >
              <div className="w-full h-full flex items-center justify-center bg-muted/30">
                <Image className="h-6 w-6 text-muted-foreground" />
              </div>
              <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[9px] px-1 truncate">
                {img.filename}
              </span>
            </button>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <div className="space-y-1">
          {files.map((file) => {
            const FileIcon = getFileIcon(file.mimeType);
            const ext = getExtension(file.filename);
            return (
              <div
                key={file.id}
                className="flex items-center gap-2 p-1.5 rounded-md border border-border bg-muted/20"
                style={{ minHeight: 44 }}
                data-testid={`comment-attachment-file-${file.id}`}
              >
                <div className="flex items-center justify-center h-8 w-8 rounded bg-muted shrink-0">
                  <FileIcon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{file.filename}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {ext && <span>{ext} </span>}
                    {formatFileSize(file.size)}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleDownload(file.id, file.filename)}
                  disabled={downloading === file.id}
                  data-testid={`button-download-attachment-${file.id}`}
                >
                  {downloading === file.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!previewUrl} onOpenChange={(open) => { if (!open) { setPreviewUrl(null); setPreviewName(""); } }}>
        <DialogContent className="max-w-3xl p-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium truncate">{previewName}</span>
            <Button size="icon" variant="ghost" onClick={() => { setPreviewUrl(null); setPreviewName(""); }}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          {previewUrl && (
            <img
              src={previewUrl}
              alt={previewName}
              className="w-full max-h-[70vh] object-contain rounded-md"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
