import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  Folder,
  FolderPlus,
  FileUp,
  MoreVertical,
  Pencil,
  Trash2,
  Download,
  RefreshCw,
  ChevronRight,
  FileText,
  FileSpreadsheet,
  FileImage,
  File,
  Info,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import type { TenantDefaultFolder, TenantDefaultDocument } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

interface Props {
  tenantId: string;
  mode: "superAdmin" | "tenantAdmin";
}

interface TreeResponse {
  folders: TenantDefaultFolder[];
  documents: TenantDefaultDocument[];
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return <FileImage className="h-5 w-5 text-blue-500" />;
  if (mimeType.includes("spreadsheet") || mimeType.includes("csv") || mimeType.includes("excel"))
    return <FileSpreadsheet className="h-5 w-5 text-green-600" />;
  if (mimeType.includes("pdf")) return <FileText className="h-5 w-5 text-red-500" />;
  return <File className="h-5 w-5 text-muted-foreground" />;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DefaultTenantDocumentsManager({ tenantId, mode }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<{ id: string | null; name: string }[]>([
    { id: null, name: "Root" },
  ]);

  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renameFolderOpen, setRenameFolderOpen] = useState(false);
  const [renameFolderTarget, setRenameFolderTarget] = useState<TenantDefaultFolder | null>(null);
  const [renameFolderName, setRenameFolderName] = useState("");

  const [renameDocOpen, setRenameDocOpen] = useState(false);
  const [renameDocTarget, setRenameDocTarget] = useState<TenantDefaultDocument | null>(null);
  const [renameDocTitle, setRenameDocTitle] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<{ type: "folder" | "document"; id: string; name: string } | null>(null);
  const [replaceDocId, setReplaceDocId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const queryKey = ["/api/v1/tenants", tenantId, "default-docs", "tree"];

  const { data: tree, isLoading } = useQuery<TreeResponse>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/v1/tenants/${tenantId}/default-docs/tree`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load documents");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const currentFolders = (tree?.folders ?? []).filter(
    (f) => (f.parentFolderId ?? null) === currentFolderId
  );
  const currentDocuments = (tree?.documents ?? []).filter(
    (d) => (d.folderId ?? null) === currentFolderId
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => {
      return apiRequest("POST", `/api/v1/tenants/${tenantId}/default-docs/folders`, {
        name,
        parentFolderId: currentFolderId,
      });
    },
    onSuccess: () => {
      toast({ title: "Folder created" });
      setCreateFolderOpen(false);
      setNewFolderName("");
      invalidate();
    },
    onError: () => toast({ title: "Failed to create folder", variant: "destructive" }),
  });

  const renameFolderMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      return apiRequest("PATCH", `/api/v1/tenants/${tenantId}/default-docs/folders/${id}`, { name });
    },
    onSuccess: () => {
      toast({ title: "Folder renamed" });
      setRenameFolderOpen(false);
      setRenameFolderTarget(null);
      invalidate();
    },
    onError: () => toast({ title: "Failed to rename folder", variant: "destructive" }),
  });

  const deleteFolderMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/v1/tenants/${tenantId}/default-docs/folders/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Folder deleted" });
      invalidate();
    },
    onError: () => toast({ title: "Failed to delete folder", variant: "destructive" }),
  });

  const renameDocMutation = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      return apiRequest("PATCH", `/api/v1/tenants/${tenantId}/default-docs/documents/${id}`, { title });
    },
    onSuccess: () => {
      toast({ title: "Document renamed" });
      setRenameDocOpen(false);
      setRenameDocTarget(null);
      invalidate();
    },
    onError: () => toast({ title: "Failed to rename document", variant: "destructive" }),
  });

  const deleteDocMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/v1/tenants/${tenantId}/default-docs/documents/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Document deleted" });
      invalidate();
    },
    onError: () => toast({ title: "Failed to delete document", variant: "destructive" }),
  });

  const navigateToFolder = useCallback(
    (folder: TenantDefaultFolder) => {
      setCurrentFolderId(folder.id);
      setFolderPath((prev) => [...prev, { id: folder.id, name: folder.name }]);
    },
    []
  );

  const navigateToBreadcrumb = useCallback(
    (index: number) => {
      setFolderPath((prev) => prev.slice(0, index + 1));
      setCurrentFolderId(folderPath[index]?.id ?? null);
    },
    [folderPath]
  );

  const handleUploadFiles = useCallback(
    async (files: FileList) => {
      setUploading(true);
      try {
        for (const file of Array.from(files)) {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("title", file.name);
          if (currentFolderId) formData.append("folderId", currentFolderId);

          const res = await fetch(
            `/api/v1/tenants/${tenantId}/default-docs/documents/upload/proxy`,
            { method: "POST", body: formData, credentials: "include" }
          );
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            const msg = typeof err.error === "string" ? err.error : err.error?.message || err.message || "Upload failed";
            throw new Error(msg);
          }
        }
        toast({ title: `${files.length} file(s) uploaded` });
        invalidate();
      } catch (err: any) {
        toast({ title: err.message || "Upload failed", variant: "destructive" });
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [tenantId, currentFolderId, toast]
  );

  const handleReplaceFile = useCallback(
    async (files: FileList) => {
      if (!replaceDocId || !files.length) return;
      setUploading(true);
      try {
        const file = files[0];
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch(
          `/api/v1/tenants/${tenantId}/default-docs/documents/${replaceDocId}/replace`,
          { method: "POST", body: formData, credentials: "include" }
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          const msg = typeof err.error === "string" ? err.error : err.error?.message || err.message || "Replace failed";
          throw new Error(msg);
        }
        toast({ title: "File replaced successfully" });
        invalidate();
      } catch (err: any) {
        toast({ title: err.message || "Replace failed", variant: "destructive" });
      } finally {
        setUploading(false);
        setReplaceDocId(null);
        if (replaceFileInputRef.current) replaceFileInputRef.current.value = "";
      }
    },
    [tenantId, replaceDocId, toast]
  );

  const handleDownload = useCallback(
    async (doc: TenantDefaultDocument) => {
      try {
        const res = await fetch(
          `/api/v1/tenants/${tenantId}/default-docs/documents/${doc.id}/download`,
          { credentials: "include" }
        );
        if (!res.ok) throw new Error("Download failed");
        const { url } = await res.json();
        window.open(url, "_blank");
      } catch {
        toast({ title: "Download failed", variant: "destructive" });
      }
    },
    [tenantId, toast]
  );

  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    if (deleteTarget.type === "folder") {
      deleteFolderMutation.mutate(deleteTarget.id);
    } else {
      deleteDocMutation.mutate(deleteTarget.id);
    }
    setDeleteTarget(null);
  }, [deleteTarget]);

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="default-docs-loading">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="default-docs-manager">
      <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 border" data-testid="default-docs-info-banner">
        <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-sm text-muted-foreground">
          Documents uploaded here are visible to <strong>ALL clients</strong> in their Asset Library as read-only defaults.
          Updates reflect instantly across all clients.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-sm" data-testid="default-docs-breadcrumb">
          {folderPath.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
              <button
                className={`hover:underline ${i === folderPath.length - 1 ? "font-medium" : "text-muted-foreground"}`}
                onClick={() => navigateToBreadcrumb(i)}
                data-testid={`breadcrumb-${i}`}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCreateFolderOpen(true)}
            data-testid="btn-create-folder"
          >
            <FolderPlus className="h-4 w-4 mr-1.5" />
            New Folder
          </Button>
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            data-testid="btn-upload-document"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <FileUp className="h-4 w-4 mr-1.5" />
            )}
            Upload Files
          </Button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && handleUploadFiles(e.target.files)}
        data-testid="input-file-upload"
      />
      <input
        ref={replaceFileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => e.target.files && handleReplaceFile(e.target.files)}
        data-testid="input-file-replace"
      />

      {currentFolderId && (
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => navigateToBreadcrumb(folderPath.length - 2)}
          data-testid="btn-go-back"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back
        </Button>
      )}

      {currentFolders.length === 0 && currentDocuments.length === 0 ? (
        <Card className="border-dashed" data-testid="default-docs-empty">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground font-medium">No documents yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Upload files or create folders to organize tenant default documents.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1">
          {currentFolders.map((folder) => (
            <div
              key={folder.id}
              className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer group transition-colors"
              onClick={() => navigateToFolder(folder)}
              data-testid={`folder-row-${folder.id}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Folder className="h-5 w-5 text-amber-500 shrink-0" />
                <span className="font-medium truncate">{folder.name}</span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100"
                    data-testid={`folder-menu-${folder.id}`}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenuItem
                    onClick={() => {
                      setRenameFolderTarget(folder);
                      setRenameFolderName(folder.name);
                      setRenameFolderOpen(true);
                    }}
                    data-testid={`folder-rename-${folder.id}`}
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => setDeleteTarget({ type: "folder", id: folder.id, name: folder.name })}
                    data-testid={`folder-delete-${folder.id}`}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}

          {currentDocuments.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 group transition-colors"
              data-testid={`doc-row-${doc.id}`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {getFileIcon(doc.mimeType)}
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{doc.title}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span>{formatFileSize(doc.fileSizeBytes)}</span>
                    {doc.version > 1 && (
                      <Badge variant="outline" className="text-xs px-1.5 py-0">
                        v{doc.version}
                      </Badge>
                    )}
                    {doc.effectiveYear && <span>Year: {doc.effectiveYear}</span>}
                    {doc.updatedAt && (
                      <span>
                        Updated {formatDistanceToNow(new Date(doc.updatedAt), { addSuffix: true })}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleDownload(doc)}
                  data-testid={`doc-download-${doc.id}`}
                >
                  <Download className="h-4 w-4" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100"
                      data-testid={`doc-menu-${doc.id}`}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => {
                        setRenameDocTarget(doc);
                        setRenameDocTitle(doc.title);
                        setRenameDocOpen(true);
                      }}
                      data-testid={`doc-rename-${doc.id}`}
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setReplaceDocId(doc.id);
                        setTimeout(() => replaceFileInputRef.current?.click(), 50);
                      }}
                      data-testid={`doc-replace-${doc.id}`}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Replace File
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleDownload(doc)}
                      data-testid={`doc-download-menu-${doc.id}`}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => setDeleteTarget({ type: "document", id: doc.id, name: doc.title })}
                      data-testid={`doc-delete-${doc.id}`}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={createFolderOpen} onOpenChange={setCreateFolderOpen}>
        <DialogContent data-testid="dialog-create-folder">
          <DialogHeader>
            <DialogTitle>Create Folder</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Folder name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && newFolderName.trim() && createFolderMutation.mutate(newFolderName.trim())}
            autoFocus
            data-testid="input-folder-name"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateFolderOpen(false)} data-testid="btn-cancel-create-folder">
              Cancel
            </Button>
            <Button
              onClick={() => newFolderName.trim() && createFolderMutation.mutate(newFolderName.trim())}
              disabled={!newFolderName.trim() || createFolderMutation.isPending}
              data-testid="btn-confirm-create-folder"
            >
              {createFolderMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameFolderOpen} onOpenChange={setRenameFolderOpen}>
        <DialogContent data-testid="dialog-rename-folder">
          <DialogHeader>
            <DialogTitle>Rename Folder</DialogTitle>
          </DialogHeader>
          <Input
            value={renameFolderName}
            onChange={(e) => setRenameFolderName(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" &&
              renameFolderName.trim() &&
              renameFolderTarget &&
              renameFolderMutation.mutate({ id: renameFolderTarget.id, name: renameFolderName.trim() })
            }
            autoFocus
            data-testid="input-rename-folder"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameFolderOpen(false)} data-testid="btn-cancel-rename-folder">
              Cancel
            </Button>
            <Button
              onClick={() =>
                renameFolderTarget &&
                renameFolderName.trim() &&
                renameFolderMutation.mutate({ id: renameFolderTarget.id, name: renameFolderName.trim() })
              }
              disabled={!renameFolderName.trim() || renameFolderMutation.isPending}
              data-testid="btn-confirm-rename-folder"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameDocOpen} onOpenChange={setRenameDocOpen}>
        <DialogContent data-testid="dialog-rename-doc">
          <DialogHeader>
            <DialogTitle>Rename Document</DialogTitle>
          </DialogHeader>
          <Input
            value={renameDocTitle}
            onChange={(e) => setRenameDocTitle(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" &&
              renameDocTitle.trim() &&
              renameDocTarget &&
              renameDocMutation.mutate({ id: renameDocTarget.id, title: renameDocTitle.trim() })
            }
            autoFocus
            data-testid="input-rename-doc"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDocOpen(false)} data-testid="btn-cancel-rename-doc">
              Cancel
            </Button>
            <Button
              onClick={() =>
                renameDocTarget &&
                renameDocTitle.trim() &&
                renameDocMutation.mutate({ id: renameDocTarget.id, title: renameDocTitle.trim() })
              }
              disabled={!renameDocTitle.trim() || renameDocMutation.isPending}
              data-testid="btn-confirm-rename-doc"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent data-testid="dialog-confirm-delete">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.type === "folder" ? "Folder" : "Document"}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"? This will remove it from all clients' view.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="btn-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="btn-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
