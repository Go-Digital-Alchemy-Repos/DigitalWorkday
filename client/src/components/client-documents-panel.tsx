import { useState, useCallback, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatErrorForToast } from "@/lib/parseApiError";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Folder,
  FolderOpen,
  FolderPlus,
  File,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  Upload,
  Download,
  Trash2,
  MoreHorizontal,
  ChevronRight,
  Home,
  Search,
  ArrowUpDown,
  Pencil,
  FolderInput,
  Check,
  X,
  GripVertical,
  Archive,
} from "lucide-react";

interface FolderItem {
  id: string;
  name: string;
  parentFolderId: string | null;
  clientId: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
  fileCount: number;
}

interface FileItem {
  id: string;
  clientId: string;
  folderId: string | null;
  originalFileName: string;
  displayName: string | null;
  mimeType: string;
  fileSizeBytes: number;
  storageKey: string;
  createdAt: string;
  updatedAt: string;
  uploadedByUserId: string;
  uploaderFirstName: string | null;
  uploaderLastName: string | null;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "Unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return FileImage;
  if (mimeType.startsWith("video/")) return FileVideo;
  if (mimeType.startsWith("audio/")) return FileAudio;
  if (mimeType.includes("pdf") || mimeType.includes("document") || mimeType.includes("text"))
    return FileText;
  return File;
}

function getFileIconColor(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "text-blue-500";
  if (mimeType.startsWith("video/")) return "text-purple-500";
  if (mimeType.startsWith("audio/")) return "text-green-500";
  if (mimeType.includes("pdf")) return "text-red-500";
  return "text-muted-foreground";
}

const BASE = "/api/v1/clients";

export function ClientDocumentsPanel({ clientId }: { clientId: string }) {
  const { toast } = useToast();
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renamingFolderName, setRenamingFolderName] = useState("");
  const [renamingFileId, setRenamingFileId] = useState<string | null>(null);
  const [renamingFileName, setRenamingFileName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ type: "file" | "folder"; id: string; name: string } | null>(null);
  const [movingItem, setMovingItem] = useState<{ type: "file" | "folder"; id: string } | null>(null);
  const [moveDestination, setMoveDestination] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const folderTreeUrl = `${BASE}/${clientId}/documents/folders/tree`;
  const folderTreeQuery = useQuery<{ ok: boolean; folders: FolderItem[]; rootFileCount: number }>({
    queryKey: [folderTreeUrl],
    enabled: !!clientId,
  });

  const filesParams = new URLSearchParams();
  if (searchQuery) filesParams.set("q", searchQuery);
  else if (currentFolderId) filesParams.set("folderId", currentFolderId);
  else filesParams.set("folderId", "null");
  filesParams.set("sort", sortBy);
  const filesUrl = `${BASE}/${clientId}/documents/files?${filesParams}`;

  const filesQuery = useQuery<{ ok: boolean; files: FileItem[] }>({
    queryKey: [filesUrl],
    enabled: !!clientId,
  });

  const folders = folderTreeQuery.data?.folders || [];
  const files = filesQuery.data?.files || [];

  const childFolders = useMemo(() =>
    folders.filter(f => f.parentFolderId === currentFolderId),
    [folders, currentFolderId]
  );

  const breadcrumbs = useMemo(() => {
    const crumbs: { id: string | null; name: string }[] = [{ id: null, name: "Root" }];
    if (!currentFolderId) return crumbs;
    const path: FolderItem[] = [];
    let current = folders.find(f => f.id === currentFolderId);
    while (current) {
      path.unshift(current);
      current = current.parentFolderId ? folders.find(f => f.id === current!.parentFolderId) : undefined;
    }
    for (const f of path) {
      crumbs.push({ id: f.id, name: f.name });
    }
    return crumbs;
  }, [currentFolderId, folders]);

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && key.includes(`/clients/${clientId}/documents/`);
      },
    });
  }, [clientId]);

  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => {
      return apiRequest("POST", `${BASE}/${clientId}/documents/folders`, {
        name,
        parentFolderId: currentFolderId,
      });
    },
    onSuccess: () => {
      invalidateAll();
      setCreatingFolder(false);
      setNewFolderName("");
      toast({ title: "Folder created" });
    },
    onError: (error: Error) => {
      const { title, description } = formatErrorForToast(error);
      toast({ title, description, variant: "destructive" });
    },
  });

  const renameFolderMutation = useMutation({
    mutationFn: async ({ folderId, name }: { folderId: string; name: string }) => {
      return apiRequest("PATCH", `${BASE}/${clientId}/documents/folders/${folderId}`, { name });
    },
    onSuccess: () => {
      invalidateAll();
      setRenamingFolderId(null);
      toast({ title: "Folder renamed" });
    },
    onError: (error: Error) => {
      const { title, description } = formatErrorForToast(error);
      toast({ title, description, variant: "destructive" });
    },
  });

  const deleteFolderMutation = useMutation({
    mutationFn: async (folderId: string) => {
      return apiRequest("DELETE", `${BASE}/${clientId}/documents/folders/${folderId}`);
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Folder deleted" });
    },
    onError: (error: Error) => {
      const { title, description } = formatErrorForToast(error);
      toast({ title, description, variant: "destructive" });
    },
  });

  const renameFileMutation = useMutation({
    mutationFn: async ({ fileId, displayName }: { fileId: string; displayName: string }) => {
      return apiRequest("PATCH", `${BASE}/${clientId}/documents/files/${fileId}/rename`, { displayName });
    },
    onSuccess: () => {
      invalidateAll();
      setRenamingFileId(null);
      toast({ title: "File renamed" });
    },
    onError: (error: Error) => {
      const { title, description } = formatErrorForToast(error);
      toast({ title, description, variant: "destructive" });
    },
  });

  const deleteFileMutation = useMutation({
    mutationFn: async (fileId: string) => {
      return apiRequest("DELETE", `${BASE}/${clientId}/documents/files/${fileId}`);
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "File deleted" });
    },
    onError: (error: Error) => {
      const { title, description } = formatErrorForToast(error);
      toast({ title, description, variant: "destructive" });
    },
  });

  const moveFileMutation = useMutation({
    mutationFn: async ({ fileId, folderId }: { fileId: string; folderId: string | null }) => {
      return apiRequest("PATCH", `${BASE}/${clientId}/documents/files/${fileId}/move`, { folderId });
    },
    onSuccess: () => {
      invalidateAll();
      setMovingItem(null);
      toast({ title: "File moved" });
    },
    onError: (error: Error) => {
      const { title, description } = formatErrorForToast(error);
      toast({ title, description, variant: "destructive" });
    },
  });

  const moveFolderMutation = useMutation({
    mutationFn: async ({ folderId, parentFolderId }: { folderId: string; parentFolderId: string | null }) => {
      return apiRequest("PATCH", `${BASE}/${clientId}/documents/folders/${folderId}/move`, { parentFolderId });
    },
    onSuccess: () => {
      invalidateAll();
      setMovingItem(null);
      toast({ title: "Folder moved" });
    },
    onError: (error: Error) => {
      const { title, description } = formatErrorForToast(error);
      toast({ title, description, variant: "destructive" });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `${BASE}/${clientId}/documents/bulk/delete`, {
        fileIds: Array.from(selectedFiles),
        folderIds: Array.from(selectedFolders),
      });
    },
    onSuccess: () => {
      invalidateAll();
      setSelectedFiles(new Set());
      setSelectedFolders(new Set());
      toast({ title: "Items deleted" });
    },
    onError: (error: Error) => {
      const { title, description } = formatErrorForToast(error);
      toast({ title, description, variant: "destructive" });
    },
  });

  const uploadFiles = useCallback(async (fileList: globalThis.File[]) => {
    if (!fileList.length) return;
    setUploading(true);
    setUploadProgress({ current: 0, total: fileList.length });
    let successCount = 0;

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      setUploadProgress({ current: i + 1, total: fileList.length });

      try {
        const presignRes = await fetch(`${BASE}/${clientId}/documents/files/presign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            folderId: currentFolderId,
            filename: file.name,
            mimeType: file.type || "application/octet-stream",
            sizeBytes: file.size,
          }),
        });

        if (!presignRes.ok) {
          const err = await presignRes.json().catch(() => ({}));
          throw new Error(err?.error?.message || "Failed to get upload URL");
        }

        const { uploadUrl, r2Key, headers } = await presignRes.json();

        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: headers || {},
          body: file,
        });

        if (!uploadRes.ok) throw new Error("Upload failed");

        const completeRes = await fetch(`${BASE}/${clientId}/documents/files/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            folderId: currentFolderId,
            r2Key,
            filename: file.name,
            mimeType: file.type || "application/octet-stream",
            sizeBytes: file.size,
          }),
        });

        if (!completeRes.ok) throw new Error("Failed to complete upload");
        successCount++;
      } catch (error: any) {
        toast({
          title: `Failed to upload ${file.name}`,
          description: error.message,
          variant: "destructive",
        });
      }
    }

    setUploading(false);
    setUploadProgress(null);
    invalidateAll();

    if (successCount > 0) {
      toast({ title: `${successCount} file${successCount > 1 ? "s" : ""} uploaded` });
    }
  }, [clientId, currentFolderId, toast, invalidateAll]);

  const downloadFile = useCallback(async (fileId: string) => {
    try {
      const res = await fetch(`${BASE}/${clientId}/documents/files/${fileId}/download`, { credentials: "include" });
      if (!res.ok) throw new Error("Download failed");
      const { downloadUrl, fileName } = await res.json();
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = fileName;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error: any) {
      toast({ title: "Download failed", description: error.message, variant: "destructive" });
    }
  }, [clientId, toast]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      uploadFiles(droppedFiles);
    }
  }, [uploadFiles]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files ? Array.from(e.target.files) : [];
    if (fileList.length > 0) {
      uploadFiles(fileList);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [uploadFiles]);

  const toggleFileSelection = useCallback((fileId: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }, []);

  const toggleFolderSelection = useCallback((folderId: string) => {
    setSelectedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }, []);

  const totalSelected = selectedFiles.size + selectedFolders.size;

  const confirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    if (deleteTarget.type === "file") deleteFileMutation.mutate(deleteTarget.id);
    else deleteFolderMutation.mutate(deleteTarget.id);
    setDeleteTarget(null);
  }, [deleteTarget, deleteFileMutation, deleteFolderMutation]);

  const confirmMove = useCallback(() => {
    if (!movingItem) return;
    if (movingItem.type === "file") {
      moveFileMutation.mutate({ fileId: movingItem.id, folderId: moveDestination });
    } else {
      moveFolderMutation.mutate({ folderId: movingItem.id, parentFolderId: moveDestination });
    }
  }, [movingItem, moveDestination, moveFileMutation, moveFolderMutation]);

  const isLoading = folderTreeQuery.isLoading || filesQuery.isLoading;

  if (isLoading && !folders.length && !files.length) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="client-documents-panel">
      <div className="flex items-center gap-2 flex-wrap" data-testid="documents-toolbar">
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
              data-testid="input-search-documents"
            />
          </div>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[140px]" data-testid="select-sort-documents">
              <ArrowUpDown className="h-4 w-4 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="oldest">Oldest</SelectItem>
              <SelectItem value="name_asc">Name A-Z</SelectItem>
              <SelectItem value="name_desc">Name Z-A</SelectItem>
              <SelectItem value="size_desc">Largest</SelectItem>
              <SelectItem value="size_asc">Smallest</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setCreatingFolder(true); setNewFolderName(""); }}
            data-testid="button-new-folder"
          >
            <FolderPlus className="h-4 w-4 mr-1" />
            New Folder
          </Button>
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            data-testid="button-upload-files"
          >
            <Upload className="h-4 w-4 mr-1" />
            {uploading ? `Uploading ${uploadProgress?.current}/${uploadProgress?.total}...` : "Upload"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileInputChange}
            data-testid="input-file-upload"
          />
        </div>
      </div>

      {totalSelected > 0 && (
        <div className="flex items-center gap-2 p-2 rounded-md bg-muted" data-testid="bulk-actions-bar">
          <Badge variant="secondary">{totalSelected} selected</Badge>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => bulkDeleteMutation.mutate()}
            disabled={bulkDeleteMutation.isPending}
            data-testid="button-bulk-delete"
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedFiles(new Set());
              setSelectedFolders(new Set());
            }}
            data-testid="button-clear-selection"
          >
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        </div>
      )}

      {!searchQuery && (
        <div className="flex items-center gap-1 text-sm" data-testid="breadcrumbs">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.id ?? "root"} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
              <button
                onClick={() => { setCurrentFolderId(crumb.id); setSelectedFiles(new Set()); setSelectedFolders(new Set()); }}
                className={`px-1.5 py-0.5 rounded-md text-sm ${
                  crumb.id === currentFolderId
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover-elevate"
                }`}
                data-testid={`breadcrumb-${crumb.id ?? "root"}`}
              >
                {i === 0 ? <Home className="h-3.5 w-3.5 inline-block" /> : crumb.name}
              </button>
            </span>
          ))}
        </div>
      )}

      <div
        ref={dropZoneRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`min-h-[200px] rounded-md border-2 border-dashed transition-colors ${
          isDragOver ? "border-primary bg-primary/5" : "border-transparent"
        }`}
        data-testid="drop-zone"
      >
        {creatingFolder && (
          <div className="flex items-center gap-2 p-2 mb-2 rounded-md bg-muted" data-testid="create-folder-form">
            <FolderPlus className="h-5 w-5 text-muted-foreground" />
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              className="flex-1 h-8"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && newFolderName.trim()) createFolderMutation.mutate(newFolderName.trim());
                if (e.key === "Escape") setCreatingFolder(false);
              }}
              data-testid="input-new-folder-name"
            />
            <Button
              size="icon"
              variant="ghost"
              onClick={() => { if (newFolderName.trim()) createFolderMutation.mutate(newFolderName.trim()); }}
              disabled={!newFolderName.trim() || createFolderMutation.isPending}
              data-testid="button-confirm-folder"
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setCreatingFolder(false)}
              data-testid="button-cancel-folder"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {!searchQuery && childFolders.length > 0 && (
          <div className="space-y-1 mb-3" data-testid="folder-list">
            {childFolders.map((folder) => (
              <div
                key={folder.id}
                className="flex items-center gap-2 px-3 py-2 rounded-md hover-elevate cursor-pointer group"
                data-testid={`folder-item-${folder.id}`}
              >
                <input
                  type="checkbox"
                  checked={selectedFolders.has(folder.id)}
                  onChange={() => toggleFolderSelection(folder.id)}
                  className="h-4 w-4 rounded border-muted-foreground"
                  onClick={(e) => e.stopPropagation()}
                  data-testid={`checkbox-folder-${folder.id}`}
                />
                <div
                  className="flex items-center gap-2 flex-1 min-w-0"
                  onClick={() => {
                    if (renamingFolderId !== folder.id) {
                      setCurrentFolderId(folder.id);
                      setSelectedFiles(new Set());
                      setSelectedFolders(new Set());
                    }
                  }}
                >
                  <Folder className="h-5 w-5 text-amber-500 shrink-0" />
                  {renamingFolderId === folder.id ? (
                    <Input
                      value={renamingFolderName}
                      onChange={(e) => setRenamingFolderName(e.target.value)}
                      className="h-7 flex-1"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && renamingFolderName.trim()) {
                          renameFolderMutation.mutate({ folderId: folder.id, name: renamingFolderName.trim() });
                        }
                        if (e.key === "Escape") setRenamingFolderId(null);
                      }}
                      data-testid="input-rename-folder"
                    />
                  ) : (
                    <span className="text-sm font-medium truncate">{folder.name}</span>
                  )}
                  <Badge variant="secondary" className="shrink-0 text-xs">{folder.fileCount}</Badge>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button size="icon" variant="ghost" className="invisible group-hover:visible" data-testid={`menu-folder-${folder.id}`}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => { setRenamingFolderId(folder.id); setRenamingFolderName(folder.name); }}
                      data-testid="action-rename-folder"
                    >
                      <Pencil className="h-4 w-4 mr-2" /> Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => { setMovingItem({ type: "folder", id: folder.id }); setMoveDestination(null); }}
                      data-testid="action-move-folder"
                    >
                      <FolderInput className="h-4 w-4 mr-2" /> Move
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => setDeleteTarget({ type: "folder", id: folder.id, name: folder.name })}
                      data-testid="action-delete-folder"
                    >
                      <Trash2 className="h-4 w-4 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        )}

        {files.length > 0 ? (
          <div className="space-y-1" data-testid="file-list">
            {files.map((file) => {
              const Icon = getFileIcon(file.mimeType);
              const iconColor = getFileIconColor(file.mimeType);
              const displayName = file.displayName || file.originalFileName;
              const uploaderName = [file.uploaderFirstName, file.uploaderLastName].filter(Boolean).join(" ") || "Unknown";

              return (
                <div
                  key={file.id}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md hover-elevate group ${
                    selectedFiles.has(file.id) ? "bg-accent/50" : ""
                  }`}
                  data-testid={`file-item-${file.id}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedFiles.has(file.id)}
                    onChange={() => toggleFileSelection(file.id)}
                    className="h-4 w-4 rounded border-muted-foreground"
                    data-testid={`checkbox-file-${file.id}`}
                  />
                  <div className="flex items-center justify-center h-9 w-9 rounded-md bg-muted shrink-0">
                    <Icon className={`h-5 w-5 ${iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    {renamingFileId === file.id ? (
                      <Input
                        value={renamingFileName}
                        onChange={(e) => setRenamingFileName(e.target.value)}
                        className="h-7"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && renamingFileName.trim()) {
                            renameFileMutation.mutate({ fileId: file.id, displayName: renamingFileName.trim() });
                          }
                          if (e.key === "Escape") setRenamingFileId(null);
                        }}
                        data-testid="input-rename-file"
                      />
                    ) : (
                      <>
                        <p className="text-sm font-medium truncate" data-testid={`text-filename-${file.id}`}>{displayName}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                          <span>{formatFileSize(file.fileSizeBytes)}</span>
                          <span>by {uploaderName}</span>
                          <span>{formatDistanceToNow(new Date(file.createdAt), { addSuffix: true })}</span>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => downloadFile(file.id)}
                      className="invisible group-hover:visible"
                      data-testid={`button-download-${file.id}`}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="invisible group-hover:visible" data-testid={`menu-file-${file.id}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => downloadFile(file.id)}
                          data-testid="action-download-file"
                        >
                          <Download className="h-4 w-4 mr-2" /> Download
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => { setRenamingFileId(file.id); setRenamingFileName(displayName); }}
                          data-testid="action-rename-file"
                        >
                          <Pencil className="h-4 w-4 mr-2" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => { setMovingItem({ type: "file", id: file.id }); setMoveDestination(null); }}
                          data-testid="action-move-file"
                        >
                          <FolderInput className="h-4 w-4 mr-2" /> Move
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeleteTarget({ type: "file", id: file.id, name: displayName })}
                          data-testid="action-delete-file"
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })}
          </div>
        ) : childFolders.length === 0 && !creatingFolder ? (
          <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="empty-state">
            <div className="flex items-center justify-center h-14 w-14 rounded-full bg-muted mb-3">
              <Archive className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-medium mb-1">
              {searchQuery ? "No files found" : "This folder is empty"}
            </h3>
            <p className="text-xs text-muted-foreground mb-4 max-w-xs">
              {searchQuery
                ? "Try a different search term."
                : "Drop files here or click Upload to add documents."}
            </p>
            {!searchQuery && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                data-testid="button-upload-empty"
              >
                <Upload className="h-4 w-4 mr-1" />
                Upload Files
              </Button>
            )}
          </div>
        ) : null}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.type === "folder" ? "Folder" : "File"}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} data-testid="button-confirm-delete">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!movingItem} onOpenChange={(open) => { if (!open) setMovingItem(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move {movingItem?.type === "folder" ? "Folder" : "File"}</AlertDialogTitle>
            <AlertDialogDescription>
              Select a destination folder.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2 max-h-[300px] overflow-y-auto">
            <button
              onClick={() => setMoveDestination(null)}
              className={`flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm ${
                moveDestination === null ? "bg-accent font-medium" : "hover-elevate"
              }`}
              data-testid="move-destination-root"
            >
              <Home className="h-4 w-4" /> Root
            </button>
            {folders
              .filter(f => f.id !== movingItem?.id)
              .map(f => (
                <button
                  key={f.id}
                  onClick={() => setMoveDestination(f.id)}
                  className={`flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm ${
                    moveDestination === f.id ? "bg-accent font-medium" : "hover-elevate"
                  }`}
                  style={{ paddingLeft: `${(getFolderDepth(f, folders) + 1) * 16}px` }}
                  data-testid={`move-destination-${f.id}`}
                >
                  <Folder className="h-4 w-4 text-amber-500" /> {f.name}
                </button>
              ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-move">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmMove} data-testid="button-confirm-move">
              Move Here
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function getFolderDepth(folder: FolderItem, allFolders: FolderItem[]): number {
  let depth = 0;
  let currentParent = folder.parentFolderId;
  const visited = new Set<string>();
  while (currentParent) {
    if (visited.has(currentParent)) break;
    visited.add(currentParent);
    depth++;
    const parent = allFolders.find(f => f.id === currentParent);
    currentParent = parent?.parentFolderId ?? null;
  }
  return depth;
}
