/**
 * S3Dropzone Component
 * 
 * A shared dropzone component for uploading files to S3.
 * Supports drag-and-drop, click-to-upload, progress indication,
 * previews for images, and inheritance display for tenant branding.
 * 
 * Usage:
 * <S3Dropzone
 *   category="tenant-branding-logo"
 *   label="Logo"
 *   description="Upload your company logo"
 *   valueUrl={currentLogoUrl}
 *   inheritedUrl={globalLogoUrl}
 *   onUploaded={(fileUrl) => setLogoUrl(fileUrl)}
 *   onRemoved={() => setLogoUrl(null)}
 * />
 */

import { useState, useCallback, useRef } from "react";
import { useS3Upload, type UploadCategory, type AssetType } from "@/hooks/useS3Upload";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, X, FileText, AlertCircle, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { ImageCropper } from "./ImageCropper";

interface UploadContext {
  projectId?: string;
  taskId?: string;
  assetType?: AssetType;
}

interface S3DropzoneProps {
  category: UploadCategory;
  label: string;
  description?: string;
  context?: UploadContext;
  valueUrl?: string | null;
  inheritedUrl?: string | null;
  onUploaded: (fileUrl: string, key: string) => void;
  onRemoved?: () => void;
  accept?: string;
  maxSizeMB?: number;
  disabled?: boolean;
  className?: string;
  enableCropping?: boolean;
  cropAspectRatio?: number;
  cropShape?: "rect" | "round";
}

function isImageUrl(url: string): boolean {
  const imageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico"];
  const lowercaseUrl = url.toLowerCase();
  return imageExtensions.some(ext => lowercaseUrl.includes(ext));
}

export function S3Dropzone({
  category,
  label,
  description,
  context,
  valueUrl,
  inheritedUrl,
  onUploaded,
  onRemoved,
  accept,
  disabled = false,
  className,
  enableCropping = false,
  cropAspectRatio = 1,
  cropShape = "round",
}: S3DropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [cropperOpen, setCropperOpen] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [originalFileName, setOriginalFileName] = useState<string>("");
  const [originalMimeType, setOriginalMimeType] = useState<string>("image/png");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { upload, progress, isUploading, error, reset } = useS3Upload({
    category,
    context,
  });

  const displayUrl = valueUrl || inheritedUrl;
  const isInherited = !valueUrl && !!inheritedUrl;

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !isUploading) {
      setIsDragging(true);
    }
  }, [disabled, isUploading]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const isImageFile = (file: File): boolean => {
    return file.type.startsWith("image/") && !file.type.includes("svg");
  };

  const readFileAsDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled || isUploading) return;

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await handleFileSelection(files[0]);
    }
  }, [disabled, isUploading, enableCropping]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await handleFileSelection(files[0]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [enableCropping]);

  const handleFileSelection = async (file: File) => {
    reset();
    setUploadSuccess(false);

    if (enableCropping && isImageFile(file)) {
      try {
        const dataUrl = await readFileAsDataURL(file);
        setImageToCrop(dataUrl);
        setOriginalFileName(file.name);
        setOriginalMimeType(file.type || "image/png");
        setCropperOpen(true);
      } catch (err) {
        console.error("Error reading file:", err);
      }
    } else {
      await handleFileUpload(file);
    }
  };

  const handleCropComplete = async (croppedBlob: Blob, mimeType: string) => {
    const mimeToExt: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
    };
    const extension = mimeToExt[mimeType] || "png";
    const baseName = originalFileName.replace(/\.[^/.]+$/, "");
    const croppedFileName = `${baseName}_cropped.${extension}`;
    const croppedFile = new File([croppedBlob], croppedFileName, {
      type: mimeType,
    });

    setCropperOpen(false);
    setImageToCrop(null);
    setOriginalFileName("");
    setOriginalMimeType("image/png");
    await handleFileUpload(croppedFile);
  };

  const handleCropperClose = () => {
    setCropperOpen(false);
    setImageToCrop(null);
    setOriginalFileName("");
    setOriginalMimeType("image/png");
  };

  const handleFileUpload = async (file: File) => {
    reset();
    setUploadSuccess(false);
    
    try {
      const result = await upload(file);
      onUploaded(result.fileUrl, result.key);
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 2000);
    } catch (err) {
      console.error("Upload failed:", err);
    }
  };

  const handleRemove = useCallback(() => {
    if (onRemoved) {
      onRemoved();
    }
    reset();
  }, [onRemoved, reset]);

  const handleClick = useCallback(() => {
    if (!disabled && !isUploading && fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, [disabled, isUploading]);

  const getAcceptTypes = () => {
    if (accept) return accept;
    
    switch (category) {
      case "global-branding-logo":
      case "tenant-branding-logo":
        return "image/png,image/jpeg,image/webp,image/svg+xml";
      case "global-branding-icon":
      case "tenant-branding-icon":
      case "global-branding-favicon":
      case "tenant-branding-favicon":
        return "image/png,image/svg+xml,image/x-icon,image/vnd.microsoft.icon";
      case "user-avatar":
        return "image/png,image/jpeg,image/webp,image/gif";
      case "task-attachment":
        return ".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.webp,.txt,.zip";
      default:
        return "*";
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{label}</label>
        {isInherited && (
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
            Inherited
          </span>
        )}
      </div>
      
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}

      <div
        role={displayUrl ? "group" : "button"}
        tabIndex={disabled || isUploading ? -1 : 0}
        aria-label={`${label}. ${displayUrl ? "File uploaded. Click to replace" : "Drag and drop or press Enter to upload"}`}
        aria-disabled={disabled || isUploading}
        className={cn(
          "relative border-2 border-dashed rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isDragging && "border-primary bg-primary/5",
          !isDragging && !error && "border-border hover:border-muted-foreground/50",
          error && "border-destructive bg-destructive/5",
          disabled && "opacity-50 cursor-not-allowed",
          !disabled && !isUploading && "cursor-pointer"
        )}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleClick}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !disabled && !isUploading) {
            e.preventDefault();
            handleClick();
          }
        }}
        data-testid={`dropzone-${category}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={getAcceptTypes()}
          onChange={handleFileSelect}
          className="hidden"
          disabled={disabled || isUploading}
          data-testid={`input-file-${category}`}
        />

        {displayUrl && isImageUrl(displayUrl) ? (
          <div className="p-4 flex items-center gap-4">
            <div className="relative shrink-0">
              <img
                src={displayUrl}
                alt={label}
                className={cn(
                  "w-16 h-16 object-contain rounded border",
                  isInherited && "opacity-60"
                )}
              />
              {isInherited && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded">
                  <span className="text-xs text-muted-foreground">Default</span>
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{displayUrl.split("/").pop()}</p>
              <p className="text-xs text-muted-foreground">
                {isInherited ? "Using global default" : "Custom upload"}
              </p>
            </div>
            {valueUrl && onRemoved && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove();
                }}
                disabled={disabled || isUploading}
                data-testid={`button-remove-${category}`}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        ) : displayUrl ? (
          <div className="p-4 flex items-center gap-4">
            <FileText className="h-10 w-10 text-muted-foreground shrink-0" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{displayUrl.split("/").pop()}</p>
            </div>
            {valueUrl && onRemoved && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove();
                }}
                disabled={disabled || isUploading}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        ) : (
          <div className="p-6 flex flex-col items-center justify-center gap-2 text-center">
            {isUploading ? (
              <>
                <div className="w-full max-w-xs">
                  <Progress value={progress} className="h-2" />
                </div>
                <p className="text-sm text-muted-foreground">Uploading... {progress}%</p>
              </>
            ) : uploadSuccess ? (
              <>
                <Check className="h-8 w-8 text-green-500" />
                <p className="text-sm text-green-600">Upload complete!</p>
              </>
            ) : error ? (
              <>
                <AlertCircle className="h-8 w-8 text-destructive" />
                <p className="text-sm text-destructive">{error.message}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    reset();
                  }}
                >
                  Try again
                </Button>
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">
                    Drop file here or click to upload
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {getAcceptTypes().replace(/,/g, ", ")}
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {imageToCrop && (
        <ImageCropper
          imageSrc={imageToCrop}
          open={cropperOpen}
          onClose={handleCropperClose}
          onCropComplete={handleCropComplete}
          aspectRatio={cropAspectRatio}
          cropShape={cropShape}
          originalMimeType={originalMimeType}
        />
      )}
    </div>
  );
}
