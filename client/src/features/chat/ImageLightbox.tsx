import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, X, ZoomIn, ZoomOut, RotateCw } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ImageLightboxProps {
  open: boolean;
  onClose: () => void;
  src: string;
  alt: string;
  fileName: string;
  sizeBytes?: number;
  uploaderName?: string;
  timestamp?: string;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ImageLightbox({
  open,
  onClose,
  src,
  alt,
  fileName,
  sizeBytes,
  uploaderName,
  timestamp,
}: ImageLightboxProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (open) {
      setZoom(1);
      setRotation(0);
    }
  }, [open]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") onClose();
      if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(z + 0.25, 4));
      if (e.key === "-") setZoom((z) => Math.max(z - 0.25, 0.25));
      if (e.key === "r") setRotation((r) => (r + 90) % 360);
    },
    [open, onClose]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = src;
    link.download = fileName;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-[90vw] max-h-[90vh] p-0 gap-0 overflow-hidden border-none bg-black/95"
        data-testid="image-lightbox"
      >
        <div className="flex items-center justify-between px-4 py-2 bg-black/80">
          <div className="flex items-center gap-3 min-w-0 text-white/90">
            <span className="text-sm font-medium truncate max-w-[200px]">
              {fileName}
            </span>
            {sizeBytes != null && (
              <span className="text-xs text-white/60">
                {formatFileSize(sizeBytes)}
              </span>
            )}
            {uploaderName && (
              <span className="text-xs text-white/60">
                by {uploaderName}
              </span>
            )}
            {timestamp && (
              <span className="text-xs text-white/60">
                {new Date(timestamp).toLocaleString()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-white/80 hover:text-white"
                  onClick={() => setZoom((z) => Math.min(z + 0.25, 4))}
                  data-testid="button-lightbox-zoom-in"
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Zoom in (+)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-white/80 hover:text-white"
                  onClick={() => setZoom((z) => Math.max(z - 0.25, 0.25))}
                  data-testid="button-lightbox-zoom-out"
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Zoom out (-)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-white/80 hover:text-white"
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  data-testid="button-lightbox-rotate"
                >
                  <RotateCw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Rotate (R)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-white/80 hover:text-white"
                  onClick={handleDownload}
                  data-testid="button-lightbox-download"
                >
                  <Download className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Download</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-white/80 hover:text-white"
                  onClick={onClose}
                  data-testid="button-lightbox-close"
                >
                  <X className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Close (Esc)</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center overflow-auto p-4 min-h-[50vh] max-h-[80vh]">
          <img
            src={src}
            alt={alt}
            className="max-w-full max-h-full object-contain transition-transform duration-200"
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
            }}
            draggable={false}
            data-testid="lightbox-image"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
