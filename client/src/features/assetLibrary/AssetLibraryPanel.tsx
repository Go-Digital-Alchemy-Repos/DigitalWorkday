import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
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
  FileSpreadsheet,
  FileVideo,
  FileAudio,
  FileCode,
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
  GripVertical,
  FolderInput,
  LayoutGrid,
  List,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  PointerSensor,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToWindowEdges } from "@dnd-kit/modifiers";
import { useDroppable } from "@dnd-kit/core";

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
  if (mimeType.startsWith("video/")) return FileVideo;
  if (mimeType.startsWith("audio/")) return FileAudio;
  if (mimeType.includes("pdf")) return FileText;
  if (mimeType.includes("zip") || mimeType.includes("archive") || mimeType.includes("compressed")) return FileArchive;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("csv")) return FileSpreadsheet;
  if (mimeType.includes("text") || mimeType.includes("document") || mimeType.includes("word")) return FileText;
  if (mimeType.includes("json") || mimeType.includes("xml") || mimeType.includes("html") || mimeType.includes("javascript") || mimeType.includes("css")) return FileCode;
  return File;
}

function getFileIconColor(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "text-blue-500";
  if (mimeType.startsWith("video/")) return "text-purple-500";
  if (mimeType.startsWith("audio/")) return "text-pink-500";
  if (mimeType.includes("pdf")) return "text-red-500";
  if (mimeType.includes("zip") || mimeType.includes("archive") || mimeType.includes("compressed")) return "text-amber-500";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("csv")) return "text-green-600";
  if (mimeType.includes("document") || mimeType.includes("word")) return "text-blue-600";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "text-orange-500";
  return "text-muted-foreground";
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

function AssetGridThumbnail({ asset, onSelect, onDownload, onRename, onDelete, onOpenInContext, onMove }: DraggableAssetRowProps) {
  const isImage = asset.mimeType.startsWith("image/");
  const Icon = getFileIcon(asset.mimeType);
  const iconColor = getFileIconColor(asset.mimeType);

  const { data: previewData } = useQuery<{ url: string }>({
    queryKey: ["/api/v1/assets", asset.id, "download-url"],
    queryFn: async () => {
      const res = await fetch(`/api/v1/assets/${asset.id}/download`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to get preview URL");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
    enabled: isImage,
  });

  const [imgError, setImgError] = useState(false);

  return (
    <Card
      className="group overflow-hidden cursor-pointer hover-elevate transition-all"
      onClick={() => onSelect(asset)}
      data-testid={`asset-grid-card-${asset.id}`}
    >
      <div className="aspect-square bg-muted/30 flex items-center justify-center relative overflow-hidden">
        {isImage && previewData?.url && !imgError ? (
          <img
            src={previewData.url}
            alt={asset.title}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-2">
            <Icon className={`w-10 h-10 ${iconColor}`} />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              {asset.mimeType.split("/").pop()?.split("+")[0]?.split(".").pop() || "file"}
            </span>
          </div>
        )}
        {asset.visibility === "client_visible" && (
          <Badge variant="outline" className="absolute top-1.5 left-1.5 text-[10px] bg-background/80 backdrop-blur-sm">
            <Eye className="w-2.5 h-2.5 mr-0.5" />
            Shared
          </Badge>
        )}
        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="secondary" size="icon" className="h-7 w-7 shadow-sm" data-testid={`asset-grid-menu-${asset.id}`}>
                <MoreVertical className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDownload(asset); }}>
                <Download className="w-4 h-4 mr-2" />
                Download
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onRename(asset.id, asset.title); }}>
                <Pencil className="w-4 h-4 mr-2" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onMove(asset); }}>
                <FolderInput className="w-4 h-4 mr-2" />
                Move
              </DropdownMenuItem>
              {asset.sourceContextJson && (
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onOpenInContext(asset); }}>
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open in Context
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDelete(asset.id); }} className="text-destructive">
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="p-2">
        <p className="text-xs font-medium truncate" title={asset.title}>{asset.title}</p>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-[10px] text-muted-foreground">{formatFileSize(asset.sizeBytes)}</span>
          <span
            className={`inline-flex items-center px-1.5 py-0 text-[10px] font-medium rounded-full ${SOURCE_COLORS[asset.sourceType] || SOURCE_COLORS.system}`}
          >
            {SOURCE_LABELS[asset.sourceType] || asset.sourceType}
          </span>
        </div>
      </div>
    </Card>
  );
}

type ViewMode = "list" | "grid";

interface SortableFolderCardProps {
  folder: AssetFolder;
  isDropTarget: boolean;
  onNavigate: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

function SortableFolderCard({ folder, isDropTarget, onNavigate, onRename, onDelete }: SortableFolderCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `folder-${folder.id}`, data: { type: "folder", folder } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`p-3 cursor-pointer hover-elevate flex items-center justify-between gap-2 transition-colors ${
        isDropTarget ? "ring-2 ring-primary bg-primary/10" : ""
      }`}
      onClick={() => onNavigate(folder.id)}
      data-testid={`folder-card-${folder.id}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <button
          className="cursor-grab active:cursor-grabbing touch-none shrink-0 text-muted-foreground hover:text-foreground"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          data-testid={`folder-drag-handle-${folder.id}`}
        >
          <GripVertical className="w-4 h-4" />
        </button>
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
              onRename(folder.id, folder.name);
            }}
            data-testid={`folder-rename-${folder.id}`}
          >
            <Pencil className="w-4 h-4 mr-2" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onDelete(folder.id);
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
  );
}

interface DraggableAssetRowProps {
  asset: Asset;
  onSelect: (asset: Asset) => void;
  onDownload: (asset: Asset) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onOpenInContext: (asset: Asset) => void;
  onMove: (asset: Asset) => void;
}

function DraggableAssetRow({ asset, onSelect, onDownload, onRename, onDelete, onOpenInContext, onMove }: DraggableAssetRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `asset-${asset.id}`, data: { type: "asset", asset } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const Icon = getFileIcon(asset.mimeType);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-2.5 rounded-md hover-elevate cursor-pointer"
      onClick={() => onSelect(asset)}
      data-testid={`asset-row-${asset.id}`}
    >
      <button
        className="cursor-grab active:cursor-grabbing touch-none shrink-0 text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        data-testid={`asset-drag-handle-${asset.id}`}
      >
        <GripVertical className="w-4 h-4" />
      </button>
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
            onClick={(e) => { e.stopPropagation(); onDownload(asset); }}
            data-testid={`asset-download-${asset.id}`}
          >
            <Download className="w-4 h-4 mr-2" />
            Download
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onRename(asset.id, asset.title);
            }}
            data-testid={`asset-rename-${asset.id}`}
          >
            <Pencil className="w-4 h-4 mr-2" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => { e.stopPropagation(); onMove(asset); }}
            data-testid={`asset-move-${asset.id}`}
          >
            <FolderInput className="w-4 h-4 mr-2" />
            Move
          </DropdownMenuItem>
          {asset.sourceContextJson && (
            <DropdownMenuItem
              onClick={(e) => { e.stopPropagation(); onOpenInContext(asset); }}
              data-testid={`asset-open-context-${asset.id}`}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Open in Context
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={(e) => { e.stopPropagation(); onDelete(asset.id); }}
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
}

interface Props {
  clientId: string;
}

interface TenantDefaultDoc {
  id: string;
  tenantId: string;
  folderId: string | null;
  title: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  version: number;
  updatedAt: string;
}

interface TenantDefaultFolder {
  id: string;
  tenantId: string;
  parentFolderId: string | null;
  name: string;
}

interface TenantDefaultsClientView {
  folders: TenantDefaultFolder[];
  documents: TenantDefaultDoc[];
}

export function AssetLibraryPanel({ clientId }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { flags } = useFeatureFlags();
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
  const [moveAsset, setMoveAsset] = useState<Asset | null>(null);
  const [moveTargetFolderId, setMoveTargetFolderId] = useState<string>("__root__");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
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

  const tenantId = user?.tenantId;
  const tenantDefaultsQuery = useQuery<TenantDefaultsClientView>({
    queryKey: ["/api/v1/tenants", tenantId, "default-docs", "client-view"],
    queryFn: async () => {
      const res = await fetch(`/api/v1/tenants/${tenantId}/default-docs/client-view`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load tenant defaults");
      return res.json();
    },
    enabled: !!tenantId && !!flags?.tenantDefaultDocs,
    staleTime: 5 * 60 * 1000,
  });

  const tenantDefaultDocs = tenantDefaultsQuery.data?.documents ?? [];
  const tenantDefaultFolders = tenantDefaultsQuery.data?.folders ?? [];

  const handleDefaultDocDownload = useCallback(
    async (doc: TenantDefaultDoc) => {
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
      queryClient.invalidateQueries({ queryKey: ["/api/v1/assets/folders", { clientId }] });
      setRenameFolderId(null);
      toast({ title: "Folder renamed" });
    },
  });

  const deleteFolderMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/v1/assets/folders/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/assets/folders", { clientId }] });
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

        const formData = new FormData();
        formData.append("file", file);
        formData.append("clientId", clientId);
        if (currentFolderId) {
          formData.append("folderId", currentFolderId);
        }

        const uploadRes = await fetch("/api/v1/assets/upload/proxy", {
          method: "POST",
          credentials: "include",
          body: formData,
        });

        if (!uploadRes.ok) {
          const errData = await uploadRes.json().catch(() => ({}));
          throw new Error(errData.error || `Upload failed (${uploadRes.status})`);
        }

        const uploadData = await uploadRes.json();
        if (uploadData.dedupe) {
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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const reorderFoldersMutation = useMutation({
    mutationFn: async (updates: { id: string; sortOrder: number }[]) => {
      return apiRequest("PUT", "/api/v1/assets/folders/reorder", { updates });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/assets/folders", { clientId }] });
    },
  });

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    if (over && over.id.toString().startsWith("folder-")) {
      setDropTargetId(over.id.toString().replace("folder-", ""));
    } else {
      setDropTargetId(null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setDropTargetId(null);

    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    // Case 1: Moving a file into a folder
    if (activeData?.type === "asset" && overData?.type === "folder") {
      const asset = activeData.asset as Asset;
      const targetFolder = overData.folder as AssetFolder;
      
      if (asset.folderId !== targetFolder.id) {
        updateAssetMutation.mutate({
          id: asset.id,
          updates: { folderId: targetFolder.id },
        });
      }
    }
    
    // Case 2: Reordering folders
    if (activeData?.type === "folder" && overData?.type === "folder" && active.id !== over.id) {
      const oldIndex = currentFolders.findIndex((f) => `folder-${f.id}` === active.id);
      const newIndex = currentFolders.findIndex((f) => `folder-${f.id}` === over.id);
      
      const newFolders = arrayMove(currentFolders, oldIndex, newIndex);
      const updates = newFolders.map((f, index) => ({
        id: f.id,
        sortOrder: index,
      }));
      
      reorderFoldersMutation.mutate(updates);
    }
  };

  const activeFolder = activeId?.startsWith("folder-") 
    ? folders.find(f => `folder-${f.id}` === activeId) 
    : null;
  
  const activeAsset = activeId?.startsWith("asset-") 
    ? assets_data.find(a => `asset-${a.id}` === activeId) 
    : null;

  return (
    <div className="flex flex-col h-full" data-testid="asset-library-panel">
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        modifiers={[restrictToWindowEdges]}
      >
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
          <div className="flex items-center border rounded-md overflow-hidden" data-testid="view-mode-toggle">
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              className="h-9 w-9 rounded-none"
              onClick={() => setViewMode("list")}
              data-testid="button-view-list"
            >
              <List className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="h-9 w-9 rounded-none"
              onClick={() => setViewMode("grid")}
              data-testid="button-view-grid"
            >
              <LayoutGrid className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {foldersQuery.isLoading || assetsQuery.isLoading ? (
          viewMode === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-md" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          )
        ) : (
          <ScrollArea className="flex-1">
            {!currentFolderId && tenantDefaultDocs.length > 0 && (
              <div className="mb-4" data-testid="tenant-defaults-section">
                <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider flex items-center gap-2">
                  Tenant Defaults
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">Read-only</Badge>
                </div>
                <div className="space-y-1">
                  {tenantDefaultDocs.map((doc) => {
                    const Icon = getFileIcon(doc.mimeType);
                    const iconColor = getFileIconColor(doc.mimeType);
                    return (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-2.5 rounded-lg border border-dashed hover:bg-muted/50 transition-colors"
                        data-testid={`tenant-default-doc-${doc.id}`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <Icon className={`w-5 h-5 shrink-0 ${iconColor}`} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium truncate">{doc.title}</p>
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">Default</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {formatFileSize(doc.fileSizeBytes)}
                              {doc.version > 1 && ` · v${doc.version}`}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={() => handleDefaultDocDownload(doc)}
                          data-testid={`tenant-default-download-${doc.id}`}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {currentFolders.length > 0 && (
              <div className="mb-4">
                <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Folders</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  <SortableContext 
                    items={currentFolders.map(f => `folder-${f.id}`)} 
                    strategy={verticalListSortingStrategy}
                  >
                    {currentFolders.map((folder) => (
                      <SortableFolderCard
                        key={folder.id}
                        folder={folder}
                        isDropTarget={dropTargetId === folder.id}
                        onNavigate={setCurrentFolderId}
                        onRename={(id, name) => {
                          setRenameFolderId(id);
                          setRenameFolderName(name);
                        }}
                        onDelete={(id) => deleteFolderMutation.mutate(id)}
                      />
                    ))}
                  </SortableContext>
                </div>
              </div>
            )}

            {assets_data.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Files</div>
                {viewMode === "list" ? (
                  <div className="space-y-1">
                    <SortableContext 
                      items={assets_data.map(a => `asset-${a.id}`)} 
                      strategy={verticalListSortingStrategy}
                    >
                      {assets_data.map((asset) => (
                        <DraggableAssetRow
                          key={asset.id}
                          asset={asset}
                          onSelect={setSelectedAsset}
                          onDownload={handleDownload}
                          onRename={(id, title) => {
                            setEditAssetId(id);
                            setEditAssetTitle(title);
                          }}
                          onDelete={(id) => deleteAssetMutation.mutate(id)}
                          onOpenInContext={handleOpenInContext}
                          onMove={(a) => {
                            setMoveAsset(a);
                            setMoveTargetFolderId(a.folderId || "__root__");
                          }}
                        />
                      ))}
                    </SortableContext>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    {assets_data.map((asset) => (
                      <AssetGridThumbnail
                        key={asset.id}
                        asset={asset}
                        onSelect={setSelectedAsset}
                        onDownload={handleDownload}
                        onRename={(id, title) => {
                          setEditAssetId(id);
                          setEditAssetTitle(title);
                        }}
                        onDelete={(id) => deleteAssetMutation.mutate(id)}
                        onOpenInContext={handleOpenInContext}
                        onMove={(a) => {
                          setMoveAsset(a);
                          setMoveTargetFolderId(a.folderId || "__root__");
                        }}
                      />
                    ))}
                  </div>
                )}
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

        <DragOverlay adjustScale={true}>
          {activeId ? (
            <div className="pointer-events-none opacity-80">
              {activeFolder ? (
                <Card className="p-3 flex items-center gap-2 w-64 shadow-xl border-primary/50">
                  <FolderOpen className="w-5 h-5 text-primary shrink-0" />
                  <span className="text-sm font-medium truncate">{activeFolder.name}</span>
                </Card>
              ) : activeAsset ? (
                <Card className="p-2.5 flex items-center gap-3 w-72 shadow-xl border-primary/50">
                  {(() => { const Icon = getFileIcon(activeAsset.mimeType); return <Icon className="w-5 h-5 text-primary shrink-0" />; })()}
                  <span className="text-sm font-medium truncate">{activeAsset.title}</span>
                </Card>
              ) : null}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

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

      <Dialog open={!!moveAsset} onOpenChange={(open) => { if (!open) setMoveAsset(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move File</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-2">
            Choose a destination folder for <span className="font-medium text-foreground">{moveAsset?.title}</span>
          </p>
          <div className="border rounded-md max-h-[300px] overflow-y-auto">
            <button
              type="button"
              className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-muted/50 transition-colors ${moveTargetFolderId === "__root__" ? "bg-primary/10 text-primary font-medium" : ""}`}
              onClick={() => setMoveTargetFolderId("__root__")}
              data-testid="move-folder-root"
            >
              <Folder className="w-4 h-4 shrink-0" />
              Root (All Files)
            </button>
            {folders.map((folder) => (
              <button
                type="button"
                key={folder.id}
                className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-muted/50 transition-colors ${moveTargetFolderId === folder.id ? "bg-primary/10 text-primary font-medium" : ""}`}
                onClick={() => setMoveTargetFolderId(folder.id)}
                data-testid={`move-folder-${folder.id}`}
              >
                <FolderOpen className="w-4 h-4 shrink-0" />
                {folder.name}
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveAsset(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!moveAsset) return;
                const targetId = moveTargetFolderId === "__root__" ? null : moveTargetFolderId;
                updateAssetMutation.mutate(
                  { id: moveAsset.id, updates: { folderId: targetId } },
                  {
                    onSuccess: () => {
                      toast({ title: "File moved" });
                      setMoveAsset(null);
                    },
                  }
                );
              }}
              disabled={updateAssetMutation.isPending}
              data-testid="button-confirm-move-asset"
            >
              {updateAssetMutation.isPending ? "Moving..." : "Move"}
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
