import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, X, ExternalLink, FileText } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PdfPreviewModalProps {
  open: boolean;
  onClose: () => void;
  src: string;
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

export function PdfPreviewModal({
  open,
  onClose,
  src,
  fileName,
  sizeBytes,
  uploaderName,
  timestamp,
}: PdfPreviewModalProps) {
  const [loadError, setLoadError] = useState(false);

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

  const handleOpenExternal = () => {
    window.open(src, "_blank", "noopener,noreferrer");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-[85vw] max-h-[90vh] p-0 gap-0 overflow-hidden"
        data-testid="pdf-preview-modal"
      >
        <div className="flex items-center justify-between px-4 py-2 border-b">
          <div className="flex items-center gap-3 min-w-0">
            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="text-sm font-medium truncate max-w-[250px]">
              {fileName}
            </span>
            {sizeBytes != null && (
              <span className="text-xs text-muted-foreground">
                {formatFileSize(sizeBytes)}
              </span>
            )}
            {uploaderName && (
              <span className="text-xs text-muted-foreground">
                by {uploaderName}
              </span>
            )}
            {timestamp && (
              <span className="text-xs text-muted-foreground">
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
                  onClick={handleOpenExternal}
                  data-testid="button-pdf-open-external"
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open in new tab</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleDownload}
                  data-testid="button-pdf-download"
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
                  onClick={onClose}
                  data-testid="button-pdf-close"
                >
                  <X className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Close</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div className="flex-1 overflow-hidden" style={{ height: "75vh" }}>
          {loadError ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
              <FileText className="h-16 w-16 text-muted-foreground/40" />
              <div>
                <p className="text-sm font-medium mb-1">
                  Unable to preview this PDF
                </p>
                <p className="text-xs text-muted-foreground mb-4">
                  Your browser may not support inline PDF viewing, or the file may be restricted.
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleOpenExternal}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open in new tab
                </Button>
                <Button onClick={handleDownload}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>
            </div>
          ) : (
            <iframe
              src={src}
              title={`PDF Preview: ${fileName}`}
              className="w-full h-full border-0"
              onError={() => setLoadError(true)}
              data-testid="pdf-preview-iframe"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
