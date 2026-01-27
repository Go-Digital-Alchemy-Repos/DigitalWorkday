import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Download,
  File,
  FileText,
  FileImage,
  FileSpreadsheet,
  FileArchive,
  Upload,
  FolderOpen,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface DocumentUploader {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

interface ClientDocument {
  id: string;
  clientId: string;
  categoryId: string | null;
  originalFileName: string;
  displayName: string | null;
  description: string | null;
  mimeType: string;
  fileSizeBytes: number;
  storageKey: string;
  uploadStatus: string;
  isClientUploaded: boolean;
  createdAt: string;
  updatedAt: string;
  downloadUrl: string | null;
  uploader: DocumentUploader;
}

interface ClientDocumentsTabProps {
  clientId: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return FileImage;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return FileSpreadsheet;
  if (mimeType.includes("pdf") || mimeType.includes("document") || mimeType.includes("text")) return FileText;
  if (mimeType.includes("zip") || mimeType.includes("archive") || mimeType.includes("compressed")) return FileArchive;
  return File;
}

export function ClientDocumentsTab({ clientId }: ClientDocumentsTabProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<ClientDocument | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<ClientDocument | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);

  const { data: docsData, isLoading: docsLoading } = useQuery<{ ok: boolean; documents: ClientDocument[] }>({
    queryKey: ["/api/clients", clientId, "documents"],
  });

  const updateDocMutation = useMutation({
    mutationFn: async ({ docId, data }: { docId: string; data: { displayName?: string; description?: string } }) => {
      return apiRequest("PATCH", `/api/clients/${clientId}/documents/${docId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "documents"] });
      setEditingDoc(null);
      setDisplayName("");
      setDescription("");
      toast({ title: "Document updated", description: "Your changes have been saved." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update document.", variant: "destructive" });
    },
  });

  const deleteDocMutation = useMutation({
    mutationFn: async (docId: string) => {
      return apiRequest("DELETE", `/api/clients/${clientId}/documents/${docId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "documents"] });
      setDeleteDoc(null);
      toast({ title: "Document deleted", description: "The document has been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete document.", variant: "destructive" });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setDisplayName(file.name);
      setUploadDialogOpen(true);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);

    try {
      const initResponse = await apiRequest("POST", `/api/clients/${clientId}/documents/upload`, {
        fileName: selectedFile.name,
        mimeType: selectedFile.type || "application/octet-stream",
        fileSizeBytes: selectedFile.size,
        displayName: displayName || selectedFile.name,
        description: description || null,
      });

      const initData = await initResponse.json();
      if (!initData.ok) throw new Error(initData.error?.message || "Failed to initiate upload");

      const uploadResponse = await fetch(initData.uploadUrl, {
        method: "PUT",
        body: selectedFile,
        headers: {
          "Content-Type": selectedFile.type || "application/octet-stream",
        },
      });

      if (!uploadResponse.ok) throw new Error("Failed to upload file to storage");

      await apiRequest("POST", `/api/clients/${clientId}/documents/${initData.document.id}/complete`);

      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "documents"] });
      setUploadDialogOpen(false);
      setSelectedFile(null);
      setDisplayName("");
      setDescription("");
      toast({ title: "Document uploaded", description: "Your document has been saved." });
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload document.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDownload = (doc: ClientDocument) => {
    if (doc.downloadUrl) {
      window.open(doc.downloadUrl, "_blank");
    }
  };

  const handleEditClick = (doc: ClientDocument) => {
    setEditingDoc(doc);
    setDisplayName(doc.displayName || doc.originalFileName);
    setDescription(doc.description || "");
  };

  const handleUpdateDoc = () => {
    if (!editingDoc) return;
    updateDocMutation.mutate({
      docId: editingDoc.id,
      data: {
        displayName: displayName || editingDoc.originalFileName,
        description: description || undefined,
      },
    });
  };

  const documents = docsData?.documents || [];

  if (docsLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-4 w-48 mb-2" />
              <Skeleton className="h-3 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Documents</h3>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileSelect}
            data-testid="input-file-upload"
          />
          <Button onClick={() => fileInputRef.current?.click()} data-testid="button-upload-document">
            <Upload className="h-4 w-4 mr-2" />
            Upload Document
          </Button>
        </div>
      </div>

      {documents.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-medium text-lg mb-2">No documents yet</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Upload files to keep important documents organized.
            </p>
            <Button onClick={() => fileInputRef.current?.click()} data-testid="button-upload-first-document">
              <Upload className="h-4 w-4 mr-2" />
              Upload First Document
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => {
            const FileIcon = getFileIcon(doc.mimeType);
            return (
              <Card key={doc.id} className="hover-elevate" data-testid={`document-card-${doc.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center shrink-0">
                        <FileIcon className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {doc.displayName || doc.originalFileName}
                        </p>
                        <div className="flex items-center gap-2 flex-wrap mt-0.5">
                          <span className="text-xs text-muted-foreground">
                            {formatFileSize(doc.fileSizeBytes)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(doc.createdAt), { addSuffix: true })}
                          </span>
                          {doc.uploader.firstName && (
                            <span className="text-xs text-muted-foreground">
                              by {doc.uploader.firstName}
                            </span>
                          )}
                        </div>
                        {doc.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                            {doc.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDownload(doc)}
                        disabled={!doc.downloadUrl}
                        data-testid={`document-download-${doc.id}`}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`document-menu-${doc.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEditClick(doc)} data-testid={`document-edit-${doc.id}`}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit Details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeleteDoc(doc)}
                            className="text-destructive"
                            data-testid={`document-delete-${doc.id}`}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            <DialogDescription>Add details about your document.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedFile && (
              <div className="p-3 bg-muted rounded-md flex items-center gap-3">
                <File className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Display Name</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Document name"
                data-testid="input-document-display-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add a description..."
                rows={3}
                data-testid="input-document-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setUploadDialogOpen(false);
              setSelectedFile(null);
              setDisplayName("");
              setDescription("");
            }}>
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
              data-testid="button-confirm-upload"
            >
              {uploading ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingDoc} onOpenChange={(open) => !open && setEditingDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Document</DialogTitle>
            <DialogDescription>Update document details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Display Name</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Document name"
                data-testid="input-edit-document-display-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add a description..."
                rows={3}
                data-testid="input-edit-document-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingDoc(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdateDoc}
              disabled={updateDocMutation.isPending}
              data-testid="button-update-document"
            >
              {updateDocMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteDoc} onOpenChange={(open) => !open && setDeleteDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Document</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteDoc?.displayName || deleteDoc?.originalFileName}"? 
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDoc(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteDoc && deleteDocMutation.mutate(deleteDoc.id)}
              disabled={deleteDocMutation.isPending}
              data-testid="button-confirm-delete-document"
            >
              {deleteDocMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
