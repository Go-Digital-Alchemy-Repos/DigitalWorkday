import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Folder,
  FolderOpen,
  FolderPlus,
  Upload,
  Search,
  FileText,
  FileImage,
  FileArchive,
  File,
  MoreVertical,
  Pencil,
  Trash2,
  Download,
  ChevronRight,
  Eye,
  ExternalLink,
  X,
  ArrowLeft,
} from "lucide-react";

interface AssetFolder {
  id: string;
  tenantId: string;
  clientId: string;
  parentFolderId: string | null;
  name: string;
  createdAt: string;
}

interface Asset {
  id: string;
  tenantId: string;
  clientId: string;
  folderId: string | null;
  title: string;
  description: string | null;
  mimeType: string;
  sizeBytes: number;
  r2Key: string;
  sourceType: string;
  sourceId: string | null;
  sourceContextJson: any;
  visibility: string;
  uploadedByType: string;
  uploadedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

const SOURCE_LABELS: Record<string, string> = {
  manual: "Upload",
  task: "Task",
  subtask: "Subtask",
  comment: "Comment",
  message: "Message",
  support_ticket: "Support",
  work_order: "Work Order",
  chat: "Chat",
  project: "Project",
  system: "System",
};

const SOURCE_COLORS: Record<string, string> = {
  manual: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  task: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  subtask: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  comment: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  message: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  support_ticket: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  chat: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  project: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  system: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
};

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return FileImage;
  if (mimeType.includes("pdf")) return FileText;
  if (mimeType.includes("zip") || mimeType.includes("archive") || mimeType.includes("compressed")) return FileArchive;
  if (mimeType.includes("text") || mimeType.includes("document") || mimeType.includes("word") || mimeType.includes("spreadsheet") || mimeType.includes("excel")) return FileText;
  return File;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function AssetImagePreview({ assetId, title }: { assetId: string; title: string }) {
  const { data, isLoading, isError } = useQuery<{ url: string }>({
    queryKey: ["/api/v1/assets", assetId, "download-url"],
    queryFn: async () => {
      const res = await fetch(`/api/v1/assets/${assetId}/download`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to get preview URL");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  if (isLoading) return <Skeleton className="h-48 w-full rounded-md" />;
  if (isError || !data?.url) {
    return (
      <div className="rounded-md border border-border bg-muted/50 h-48 flex items-center justify-center">
        <span className="text-sm text-muted-foreground">Preview unavailable</span>
      </div>
    );
  }

  return (
    <div className="rounded-md overflow-hidden border border-border bg-muted/50">
      <img
        src={data.url}
        alt={title}
        className="max-h-64 w-full object-contain"
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
      />
    </div>
  );
}

interface Props {
  clientId: string;
}

export function AssetLibraryPanel({ clientId }: Props) {
  const { toast } = useToast();
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [visibilityFilter, setVisibilityFilter] = useState<string>("all");
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renameFolderId, setRenameFolderId] = useState<string | null>(null);
  const [renameFolderName, setRenameFolderName] = useState("");
  const [editAssetId, setEditAssetId] = useState<string | null>(null);
  const [editAssetTitle, setEditAssetTitle] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const foldersQuery = useQuery<AssetFolder[]>({
    queryKey: ["/api/v1/assets/folders", { clientId }],
    queryFn: async () => {
      const res = await fetch(`/api/v1/assets/folders?clientId=${clientId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load folders");
      return res.json();
    },
    enabled: !!clientId,
  });

  const assetsQuery = useQuery<{ items: Asset[]; nextCursor: string | null; hasMore: boolean }>({
    queryKey: ["/api/v1/assets", {
      clientId,
      folderId: currentFolderId,
      q: searchQuery || undefined,
      sourceType: sourceFilter !== "all" ? sourceFilter : undefined,
      visibility: visibilityFilter !== "all" ? visibilityFilter : undefined,
    }],
    queryFn: async () => {
      const params = new URLSearchParams({ clientId });
      if (currentFolderId) params.set("folderId", currentFolderId);
      else if (!searchQuery && sourceFilter === "all") params.set("folderId", "root");
      if (searchQuery) params.set("q", searchQuery);
      if (sourceFilter !== "all") params.set("sourceType", sourceFilter);
      if (visibilityFilter !== "all") params.set("visibility", visibilityFilter);
      const res = await fetch(`/api/v1/assets?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load assets");
      return res.json();
    },
    enabled: !!clientId,
  });

  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => {
      return apiRequest("POST", "/api/v1/assets/folders", {
        clientId,
        parentFolderId: currentFolderId,
        name,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/assets/folders", { clientId }] });
      setCreateFolderOpen(false);
      setNewFolderName("");
      toast({ title: "Folder created" });
    },
    onError: (err: any) => {
      toast({ title: "Error creating folder", description: err.message, variant: "destructive" });
    },
  });

  const renameFolderMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      return apiRequest("PATCH", `/api/v1/assets/folders/${id}`, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/assets/folders"] });
      setRenameFolderId(null);
      toast({ title: "Folder renamed" });
    },
  });

  const deleteFolderMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/v1/assets/folders/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/assets/folders"] });
      toast({ title: "Folder deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Cannot delete folder", description: err.message, variant: "destructive" });
    },
  });

  const updateAssetMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, any> }) => {
      return apiRequest("PATCH", `/api/v1/assets/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/assets"] });
      setEditAssetId(null);
      toast({ title: "Asset updated" });
    },
  });

  const deleteAssetMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/v1/assets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/assets"] });
      setSelectedAsset(null);
      toast({ title: "Asset deleted" });
    },
  });

  const [uploading, setUploading] = useState(false);

  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        const presignRes = await apiRequest("POST", "/api/v1/assets/upload/presign", {
          clientId,
          folderId: currentFolderId,
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        });
        const presignData = await presignRes.json();

        await fetch(presignData.upload.url, {
          method: presignData.upload.method,
          headers: presignData.upload.headers,
          body: file,
        });

        const completeRes = await apiRequest("POST", "/api/v1/assets/upload/complete", {
          clientId,
          folderId: currentFolderId,
          r2Key: presignData.r2Key,
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        });

        const completeData = await completeRes.json();
        if (completeData.dedupe) {
          toast({ title: "File already exists", description: "Linked to this client." });
        }
      }

      queryClient.invalidateQueries({ queryKey: ["/api/v1/assets"] });
      toast({ title: `${files.length} file(s) uploaded` });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [clientId, currentFolderId, toast]);

  const handleDownload = useCallback(async (asset: Asset) => {
    try {
      const res = await fetch(`/api/v1/assets/${asset.id}/download`, { credentials: "include" });
      if (!res.ok) throw new Error("Download failed");
      const data = await res.json();
      window.open(data.url, "_blank");
    } catch (err: any) {
      toast({ title: "Download failed", description: err.message, variant: "destructive" });
    }
  }, [toast]);

  const folders = foldersQuery.data ?? [];
  const currentFolders = folders.filter(f => f.parentFolderId === currentFolderId);
  const currentFolder = currentFolderId ? folders.find(f => f.id === currentFolderId) : null;
  const assets_data = assetsQuery.data?.items ?? [];

  const breadcrumbs: AssetFolder[] = [];
  if (currentFolder) {
    let f: AssetFolder | undefined = currentFolder;
    while (f) {
      breadcrumbs.unshift(f);
      f = f.parentFolderId ? folders.find(x => x.id === f!.parentFolderId) : undefined;
    }
  }

  const handleOpenInContext = useCallback((asset: Asset) => {
    if (!asset.sourceContextJson) return;
    const ctx = asset.sourceContextJson as Record<string, string>;
    if (ctx.taskId) {
      window.dispatchEvent(new CustomEvent("open-task-drawer", { detail: { taskId: ctx.taskId } }));
    }
  }, []);

  return (
    <div className="flex flex-col h-full" data-testid="asset-library-panel">
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {currentFolderId && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentFolderId(currentFolder?.parentFolderId ?? null)}
              data-testid="button-folder-back"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
          )}
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <button
              onClick={() => setCurrentFolderId(null)}
              className="hover:underline cursor-pointer"
              data-testid="breadcrumb-root"
            >
              All Files
            </button>
            {breadcrumbs.map((bc) => (
              <span key={bc.id} className="flex items-center gap-1">
                <ChevronRight className="w-3 h-3" />
                <button
                  onClick={() => setCurrentFolderId(bc.id)}
                  className="hover:underline cursor-pointer"
                  data-testid={`breadcrumb-folder-${bc.id}`}
                >
                  {bc.name}
                </button>
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCreateFolderOpen(true)}
            data-testid="button-create-folder"
          >
            <FolderPlus className="w-4 h-4 mr-1" />
            New Folder
          </Button>
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            data-testid="button-upload-file"
          >
            <Upload className="w-4 h-4 mr-1" />
            {uploading ? "Uploading..." : "Upload"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFileUpload(e.target.files)}
            data-testid="input-file-upload"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search assets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-assets"
          />
        </div>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[140px]" data-testid="select-source-filter">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="manual">Uploads</SelectItem>
            <SelectItem value="task">Task</SelectItem>
            <SelectItem value="comment">Comment</SelectItem>
            <SelectItem value="message">Message</SelectItem>
            <SelectItem value="support_ticket">Support</SelectItem>
            <SelectItem value="chat">Chat</SelectItem>
          </SelectContent>
        </Select>
        <Select value={visibilityFilter} onValueChange={setVisibilityFilter}>
          <SelectTrigger className="w-[140px]" data-testid="select-visibility-filter">
            <SelectValue placeholder="Visibility" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="internal">Internal</SelectItem>
            <SelectItem value="client_visible">Client Visible</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {foldersQuery.isLoading || assetsQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <ScrollArea className="flex-1">
          {currentFolders.length > 0 && (
            <div className="mb-4">
              <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Folders</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {currentFolders.map((folder) => (
                  <Card
                    key={folder.id}
                    className="p-3 cursor-pointer hover-elevate flex items-center justify-between gap-2"
                    onClick={() => setCurrentFolderId(folder.id)}
                    data-testid={`folder-card-${folder.id}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FolderOpen className="w-5 h-5 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium truncate">{folder.name}</span>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="shrink-0" data-testid={`folder-menu-${folder.id}`}>
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenameFolderId(folder.id);
                            setRenameFolderName(folder.name);
                          }}
                          data-testid={`folder-rename-${folder.id}`}
                        >
                          <Pencil className="w-4 h-4 mr-2" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteFolderMutation.mutate(folder.id);
                          }}
                          className="text-destructive"
                          data-testid={`folder-delete-${folder.id}`}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {assets_data.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Files</div>
              <div className="space-y-1">
                {assets_data.map((asset) => {
                  const Icon = getFileIcon(asset.mimeType);
                  return (
                    <div
                      key={asset.id}
                      className="flex items-center gap-3 p-2.5 rounded-md hover-elevate cursor-pointer"
                      onClick={() => setSelectedAsset(asset)}
                      data-testid={`asset-row-${asset.id}`}
                    >
                      <Icon className="w-5 h-5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{asset.title}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                          <span>{formatFileSize(asset.sizeBytes)}</span>
                          <span>{formatDate(asset.createdAt)}</span>
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full shrink-0 ${SOURCE_COLORS[asset.sourceType] || SOURCE_COLORS.system}`}
                        data-testid={`source-chip-${asset.id}`}
                      >
                        {SOURCE_LABELS[asset.sourceType] || asset.sourceType}
                      </span>
                      {asset.visibility === "client_visible" && (
                        <Badge variant="outline" className="shrink-0 text-xs">
                          <Eye className="w-3 h-3 mr-1" />
                          Shared
                        </Badge>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="shrink-0" data-testid={`asset-menu-${asset.id}`}>
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => { e.stopPropagation(); handleDownload(asset); }}
                            data-testid={`asset-download-${asset.id}`}
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Download
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditAssetId(asset.id);
                              setEditAssetTitle(asset.title);
                            }}
                            data-testid={`asset-rename-${asset.id}`}
                          >
                            <Pencil className="w-4 h-4 mr-2" />
                            Rename
                          </DropdownMenuItem>
                          {asset.sourceContextJson && (
                            <DropdownMenuItem
                              onClick={(e) => { e.stopPropagation(); handleOpenInContext(asset); }}
                              data-testid={`asset-open-context-${asset.id}`}
                            >
                              <ExternalLink className="w-4 h-4 mr-2" />
                              Open in Context
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={(e) => { e.stopPropagation(); deleteAssetMutation.mutate(asset.id); }}
                            className="text-destructive"
                            data-testid={`asset-delete-${asset.id}`}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {currentFolders.length === 0 && assets_data.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Folder className="w-12 h-12 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground mb-1">
                {searchQuery || sourceFilter !== "all" || visibilityFilter !== "all"
                  ? "No assets match your filters"
                  : "This folder is empty"}
              </p>
              <p className="text-xs text-muted-foreground">
                Upload files or create folders to get started
              </p>
            </div>
          )}
        </ScrollArea>
      )}

      <Dialog open={createFolderOpen} onOpenChange={setCreateFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Folder</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Folder name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && newFolderName && createFolderMutation.mutate(newFolderName)}
            data-testid="input-folder-name"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateFolderOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createFolderMutation.mutate(newFolderName)}
              disabled={!newFolderName || createFolderMutation.isPending}
              data-testid="button-confirm-create-folder"
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renameFolderId} onOpenChange={() => setRenameFolderId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Folder</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Folder name"
            value={renameFolderName}
            onChange={(e) => setRenameFolderName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && renameFolderId && renameFolderName && renameFolderMutation.mutate({ id: renameFolderId, name: renameFolderName })}
            data-testid="input-rename-folder"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameFolderId(null)}>Cancel</Button>
            <Button
              onClick={() => renameFolderId && renameFolderMutation.mutate({ id: renameFolderId, name: renameFolderName })}
              disabled={!renameFolderName || renameFolderMutation.isPending}
              data-testid="button-confirm-rename-folder"
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editAssetId} onOpenChange={() => setEditAssetId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename File</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="File name"
            value={editAssetTitle}
            onChange={(e) => setEditAssetTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && editAssetId && editAssetTitle && updateAssetMutation.mutate({ id: editAssetId, updates: { title: editAssetTitle } })}
            data-testid="input-rename-asset"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditAssetId(null)}>Cancel</Button>
            <Button
              onClick={() => editAssetId && updateAssetMutation.mutate({ id: editAssetId, updates: { title: editAssetTitle } })}
              disabled={!editAssetTitle || updateAssetMutation.isPending}
              data-testid="button-confirm-rename-asset"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedAsset && (
        <Dialog open={!!selectedAsset} onOpenChange={() => setSelectedAsset(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 pr-8">
                {(() => { const Icon = getFileIcon(selectedAsset.mimeType); return <Icon className="w-5 h-5 shrink-0" />; })()}
                <span className="truncate">{selectedAsset.title}</span>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {selectedAsset.mimeType.startsWith("image/") && (
                <AssetImagePreview assetId={selectedAsset.id} title={selectedAsset.title} />
              )}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-muted-foreground">Size</div>
                <div>{formatFileSize(selectedAsset.sizeBytes)}</div>
                <div className="text-muted-foreground">Type</div>
                <div>{selectedAsset.mimeType}</div>
                <div className="text-muted-foreground">Source</div>
                <div>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${SOURCE_COLORS[selectedAsset.sourceType] || SOURCE_COLORS.system}`}
                  >
                    {SOURCE_LABELS[selectedAsset.sourceType] || selectedAsset.sourceType}
                  </span>
                </div>
                <div className="text-muted-foreground">Visibility</div>
                <div className="capitalize">{selectedAsset.visibility.replace("_", " ")}</div>
                <div className="text-muted-foreground">Created</div>
                <div>{formatDate(selectedAsset.createdAt)}</div>
              </div>
            </div>
            <DialogFooter className="gap-2">
              {selectedAsset.sourceContextJson && (
                <Button variant="outline" onClick={() => handleOpenInContext(selectedAsset)} data-testid="button-open-in-context">
                  <ExternalLink className="w-4 h-4 mr-1" />
                  Open in Context
                </Button>
              )}
              <Button onClick={() => handleDownload(selectedAsset)} data-testid="button-download-asset">
                <Download className="w-4 h-4 mr-1" />
                Download
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
