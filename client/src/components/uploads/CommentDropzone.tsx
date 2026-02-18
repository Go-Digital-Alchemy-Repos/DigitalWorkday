import { useState, useRef, useCallback, type DragEvent, type ReactNode } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface CommentDropzoneProps {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}

export function CommentDropzone({ onFiles, disabled, children, className }: CommentDropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  const handleDragEnter = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;
      dragCounterRef.current++;
      if (e.dataTransfer?.types?.includes("Files")) {
        setIsDragOver(true);
      }
    },
    [disabled]
  );

  const handleDragLeave = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current--;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsDragOver(false);
      }
    },
    []
  );

  const handleDragOver = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    },
    []
  );

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragOver(false);
      if (disabled) return;
      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length > 0) {
        onFiles(files);
      }
    },
    [disabled, onFiles]
  );

  return (
    <div
      className={cn("relative", className)}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      data-testid="comment-dropzone"
    >
      {children}
      {isDragOver && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center rounded-md border-2 border-dashed border-primary bg-primary/5 pointer-events-none"
          data-testid="dropzone-overlay"
        >
          <div className="flex flex-col items-center gap-1 text-primary">
            <Upload className="h-5 w-5" />
            <span className="text-xs font-medium">Drop files to attach</span>
          </div>
        </div>
      )}
    </div>
  );
}
