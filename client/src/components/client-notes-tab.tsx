import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  History,
  StickyNote,
  Search,
  Loader2,
  Send,
  Save,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatErrorForToast } from "@/lib/parseApiError";
import { formatDistanceToNow, format } from "date-fns";
import { RichTextEditor, RichTextViewer } from "@/components/ui/rich-text-editor";
import { FullScreenDrawer } from "@/components/ui/full-screen-drawer";

interface NoteAuthor {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

interface ClientNote {
  id: string;
  clientId: string;
  body: string;
  category: string;
  categoryId: string | null;
  createdAt: string;
  updatedAt: string;
  authorUserId: string;
  lastEditedByUserId: string | null;
  author: NoteAuthor;
  versionCount: number;
}

interface NoteVersion {
  id: string;
  noteId: string;
  editorUserId: string;
  body: string;
  category: string;
  versionNumber: number;
  createdAt: string;
  editor: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  };
}

interface VersionHistoryResponse {
  currentNote: ClientNote;
  versions: NoteVersion[];
  totalVersions: number;
}

interface ClientNotesTabProps {
  clientId: string;
}

const CATEGORY_OPTIONS = [
  { value: "general", label: "General" },
  { value: "project", label: "Project" },
  { value: "feedback", label: "Feedback" },
  { value: "meeting", label: "Meeting" },
  { value: "requirement", label: "Requirement" },
];

const CATEGORY_COLORS: Record<string, string> = {
  general: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  project: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  feedback: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  meeting: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  requirement: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
};

function getAuthorDisplayName(author: NoteAuthor): string {
  if (author.firstName && author.lastName) {
    return `${author.firstName} ${author.lastName}`;
  }
  if (author.firstName) return author.firstName;
  if (author.email) return author.email.split("@")[0];
  return "Unknown";
}

function getAuthorInitials(author: NoteAuthor): string {
  if (author.firstName) return author.firstName[0].toUpperCase();
  if (author.email) return author.email[0].toUpperCase();
  return "?";
}

function convertBodyToHtml(body: any): string {
  if (typeof body === "string") {
    if (body.startsWith("<") || body.trim() === "") {
      return body;
    }
    if (body.startsWith("{") || body.startsWith("[")) {
      try {
        const parsed = JSON.parse(body);
        return convertBodyToHtml(parsed);
      } catch {
        return `<p>${body}</p>`;
      }
    }
    return `<p>${body}</p>`;
  }
  if (!body) return "";
  if (body.type === "doc" && Array.isArray(body.content)) {
    return body.content.map((node: any) => {
      if (node.type === "paragraph") {
        if (!node.content || node.content.length === 0) {
          return "<p></p>";
        }
        const text = node.content.map((item: any) => {
          if (item.type === "text") {
            let result = item.text || "";
            if (item.marks) {
              item.marks.forEach((mark: any) => {
                if (mark.type === "bold") result = `<strong>${result}</strong>`;
                if (mark.type === "italic") result = `<em>${result}</em>`;
                if (mark.type === "link" && mark.attrs?.href) {
                  result = `<a href="${mark.attrs.href}">${result}</a>`;
                }
              });
            }
            return result;
          }
          return "";
        }).join("");
        return `<p>${text}</p>`;
      }
      if (node.type === "bulletList" && Array.isArray(node.content)) {
        const items = node.content.map((li: any) => {
          const text = li.content?.map((p: any) => 
            p.content?.map((t: any) => t.text || "").join("") || ""
          ).join("") || "";
          return `<li>${text}</li>`;
        }).join("");
        return `<ul>${items}</ul>`;
      }
      if (node.type === "orderedList" && Array.isArray(node.content)) {
        const items = node.content.map((li: any) => {
          const text = li.content?.map((p: any) => 
            p.content?.map((t: any) => t.text || "").join("") || ""
          ).join("") || "";
          return `<li>${text}</li>`;
        }).join("");
        return `<ol>${items}</ol>`;
      }
      return "";
    }).join("");
  }
  return JSON.stringify(body);
}

export function ClientNotesTab({ clientId }: ClientNotesTabProps) {
  const { toast } = useToast();
  
  const [drawerMode, setDrawerMode] = useState<"closed" | "create" | "edit" | "history">("closed");
  const [editingNote, setEditingNote] = useState<ClientNote | null>(null);
  const [historyNote, setHistoryNote] = useState<ClientNote | null>(null);
  const [deleteNote, setDeleteNote] = useState<ClientNote | null>(null);
  
  const [noteBody, setNoteBody] = useState("");
  const [noteCategory, setNoteCategory] = useState("general");
  
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(new Set());
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const { data: notesData, isLoading: notesLoading } = useQuery<{ ok: boolean; notes: ClientNote[] }>({
    queryKey: ["/api/clients", clientId, "notes"],
  });

  const { data: versionHistoryData, isLoading: versionHistoryLoading } = useQuery<VersionHistoryResponse>({
    queryKey: ["/api/clients", clientId, "notes", historyNote?.id, "versions"],
    enabled: !!historyNote && drawerMode === "history",
  });

  const createNoteMutation = useMutation({
    mutationFn: async (data: { body: string; category: string }) => {
      return apiRequest("POST", `/api/clients/${clientId}/notes`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "notes"] });
      closeDrawer();
      toast({ title: "Note created", description: "Your note has been saved." });
    },
    onError: (error) => {
      const { title, description } = formatErrorForToast(error);
      toast({ title, description, variant: "destructive" });
    },
  });

  const updateNoteMutation = useMutation({
    mutationFn: async ({ noteId, body, category }: { noteId: string; body: string; category: string }) => {
      return apiRequest("PUT", `/api/clients/${clientId}/notes/${noteId}`, { body, category });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "notes"] });
      if (historyNote) {
        queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "notes", historyNote.id, "versions"] });
      }
      closeDrawer();
      toast({ title: "Note updated", description: "Your changes have been saved." });
    },
    onError: (error) => {
      const { title, description } = formatErrorForToast(error);
      toast({ title, description, variant: "destructive" });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      return apiRequest("DELETE", `/api/clients/${clientId}/notes/${noteId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "notes"] });
      setDeleteNote(null);
      toast({ title: "Note deleted", description: "The note has been removed." });
    },
    onError: (error) => {
      const { title, description } = formatErrorForToast(error);
      toast({ title, description, variant: "destructive" });
    },
  });

  const closeDrawer = () => {
    setDrawerMode("closed");
    setEditingNote(null);
    setHistoryNote(null);
    setNoteBody("");
    setNoteCategory("general");
    setExpandedVersions(new Set());
    setShowDiscardConfirm(false);
  };

  const handleCancel = () => {
    if (hasUnsavedChanges) {
      setShowDiscardConfirm(true);
    } else {
      closeDrawer();
    }
  };

  const handleConfirmDiscard = () => {
    setShowDiscardConfirm(false);
    closeDrawer();
  };

  const openCreateDrawer = () => {
    setNoteBody("");
    setNoteCategory("general");
    setDrawerMode("create");
  };

  const openEditDrawer = (note: ClientNote) => {
    setEditingNote(note);
    setNoteBody(convertBodyToHtml(note.body));
    setNoteCategory(note.category);
    setDrawerMode("edit");
  };

  const openHistoryDrawer = (note: ClientNote) => {
    setHistoryNote(note);
    setDrawerMode("history");
  };

  const handleSaveNote = () => {
    if (!noteBody.trim() || noteBody === "<p></p>") return;
    
    if (drawerMode === "create") {
      createNoteMutation.mutate({ body: noteBody, category: noteCategory });
    } else if (drawerMode === "edit" && editingNote) {
      updateNoteMutation.mutate({
        noteId: editingNote.id,
        body: noteBody,
        category: noteCategory,
      });
    }
  };

  const toggleVersionExpanded = (versionId: string) => {
    setExpandedVersions(prev => {
      const next = new Set(prev);
      if (next.has(versionId)) {
        next.delete(versionId);
      } else {
        next.add(versionId);
      }
      return next;
    });
  };

  const notes = notesData?.notes || [];
  
  const filteredNotes = useMemo(() => {
    return notes.filter((note) => {
      const bodyHtml = convertBodyToHtml(note.body);
      const matchesSearch = !searchQuery || 
        bodyHtml.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = filterCategory === "all" || note.category === filterCategory;
      return matchesSearch && matchesCategory;
    });
  }, [notes, searchQuery, filterCategory]);

  const hasUnsavedChanges = useMemo(() => {
    if (drawerMode === "create") {
      return noteBody.trim() !== "" && noteBody !== "<p></p>";
    }
    if (drawerMode === "edit" && editingNote) {
      const originalBody = convertBodyToHtml(editingNote.body);
      return noteBody !== originalBody || noteCategory !== editingNote.category;
    }
    return false;
  }, [drawerMode, noteBody, noteCategory, editingNote]);

  const isLoading = createNoteMutation.isPending || updateNoteMutation.isPending;
  const canSave = noteBody.trim() !== "" && noteBody !== "<p></p>";

  if (notesLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-4 w-32 mb-2" />
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-lg font-medium">Notes</h3>
        <Button onClick={openCreateDrawer} data-testid="button-create-note">
          <Plus className="h-4 w-4 mr-2" />
          Add Note
        </Button>
      </div>

      {notes.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-notes"
            />
          </div>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-full sm:w-40" data-testid="select-filter-category">
              <SelectValue placeholder="Filter by category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORY_OPTIONS.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {notes.length === 0 ? (
        <Card data-testid="empty-state-no-notes">
          <CardContent className="p-8 text-center">
            <StickyNote className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-medium text-lg mb-2">No notes yet</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Keep track of important information about this client.
            </p>
            <Button onClick={openCreateDrawer} data-testid="button-create-first-note">
              <Plus className="h-4 w-4 mr-2" />
              Add First Note
            </Button>
          </CardContent>
        </Card>
      ) : filteredNotes.length === 0 ? (
        <Card data-testid="empty-state-no-matching-notes">
          <CardContent className="p-8 text-center">
            <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-medium text-lg mb-2">No matching notes</h3>
            <p className="text-muted-foreground text-sm">
              Try adjusting your search or filter criteria.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredNotes.map((note) => (
            <Card key={note.id} className="hover-elevate" data-testid={`note-card-${note.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback>{getAuthorInitials(note.author)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {getAuthorDisplayName(note.author)}
                        </span>
                        <Badge variant="secondary" className={CATEGORY_COLORS[note.category] || CATEGORY_COLORS.general} data-testid={`badge-note-category-${note.id}`}>
                          {note.category}
                        </Badge>
                        {note.versionCount > 0 && (
                          <Badge 
                            variant="outline" 
                            className="text-xs cursor-pointer"
                            onClick={() => openHistoryDrawer(note)}
                            data-testid={`note-version-badge-${note.id}`}
                          >
                            <History className="h-3 w-3 mr-1" />
                            {note.versionCount} edit{note.versionCount > 1 ? "s" : ""}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
                        {note.updatedAt !== note.createdAt && <span> (edited)</span>}
                      </p>
                      <div className="mt-2 text-sm">
                        <RichTextViewer content={convertBodyToHtml(note.body)} />
                      </div>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="shrink-0" data-testid={`note-menu-${note.id}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditDrawer(note)} data-testid={`note-edit-${note.id}`}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      {note.versionCount > 0 && (
                        <DropdownMenuItem onClick={() => openHistoryDrawer(note)} data-testid={`note-history-${note.id}`}>
                          <History className="h-4 w-4 mr-2" />
                          View History
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => setDeleteNote(note)}
                        className="text-destructive"
                        data-testid={`note-delete-${note.id}`}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <FullScreenDrawer
        open={drawerMode === "create" || drawerMode === "edit"}
        onOpenChange={(open) => {
          if (!open) {
            if (hasUnsavedChanges) {
              setShowDiscardConfirm(true);
            } else {
              closeDrawer();
            }
          }
        }}
        title={drawerMode === "create" ? "Create Note" : "Edit Note"}
        description={drawerMode === "create" 
          ? "Add a note about this client. Notes are visible to all team members."
          : "Make changes to your note. Previous versions will be saved in the history."
        }
        width="2xl"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={handleCancel}
              disabled={isLoading}
              data-testid="button-cancel-note"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveNote}
              disabled={!canSave || isLoading}
              data-testid="button-save-note"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  {drawerMode === "create" ? <Send className="h-4 w-4 mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  {drawerMode === "create" ? "Save Note" : "Save Changes"}
                </>
              )}
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={noteCategory} onValueChange={setNoteCategory}>
              <SelectTrigger data-testid="select-note-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Note Content</Label>
            <RichTextEditor
              value={noteBody}
              onChange={setNoteBody}
              placeholder="Enter your note..."
              minHeight="300px"
              data-testid="editor-note-content"
            />
          </div>
        </div>
      </FullScreenDrawer>

      <FullScreenDrawer
        open={drawerMode === "history"}
        onOpenChange={(open) => !open && closeDrawer()}
        title="Note Version History"
        description={historyNote ? `Viewing edit history for this note` : undefined}
        width="2xl"
      >
        {versionHistoryLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : versionHistoryData ? (
          <div className="space-y-6">
            <div className="border rounded-lg p-4 bg-muted/30" data-testid="panel-current-version">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">Current Version</span>
                <Badge variant="secondary" className={CATEGORY_COLORS[versionHistoryData.currentNote.category] || CATEGORY_COLORS.general} data-testid="badge-current-version-category">
                  {versionHistoryData.currentNote.category}
                </Badge>
              </div>
              <div className="text-sm">
                <RichTextViewer content={convertBodyToHtml(versionHistoryData.currentNote.body)} />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Last updated {formatDistanceToNow(new Date(versionHistoryData.currentNote.updatedAt), { addSuffix: true })}
              </p>
            </div>

            {versionHistoryData.versions.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-medium text-sm text-muted-foreground">Previous Versions ({versionHistoryData.totalVersions})</h4>
                {versionHistoryData.versions.map((version) => (
                  <Card key={version.id} data-testid={`version-card-${version.id}`}>
                    <CardContent className="p-4">
                      <button 
                        type="button"
                        className="flex items-center justify-between w-full cursor-pointer text-left"
                        onClick={() => toggleVersionExpanded(version.id)}
                        data-testid={`button-toggle-version-${version.id}`}
                      >
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-xs">
                              {version.editor.firstName?.[0] || version.editor.email[0].toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <span className="text-sm font-medium">
                              Version {version.versionNumber}
                            </span>
                            <span className="text-xs text-muted-foreground ml-2">
                              by {version.editor.firstName && version.editor.lastName 
                                ? `${version.editor.firstName} ${version.editor.lastName}` 
                                : version.editor.email}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(version.createdAt), "MMM d, yyyy h:mm a")}
                          </span>
                          {expandedVersions.has(version.id) ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </button>
                      {expandedVersions.has(version.id) && (
                        <div className="mt-3 pt-3 border-t">
                          <Badge variant="outline" className="mb-2" data-testid={`badge-version-category-${version.id}`}>{version.category}</Badge>
                          <div className="text-sm">
                            <RichTextViewer content={convertBodyToHtml(version.body)} />
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground" data-testid="empty-state-no-version-history">
            No version history available
          </div>
        )}
      </FullScreenDrawer>

      <AlertDialog open={!!deleteNote} onOpenChange={(open) => !open && setDeleteNote(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Note</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this note? This action cannot be undone and will also remove all version history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteNote(null)} data-testid="button-cancel-delete-note">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteNote && deleteNoteMutation.mutate(deleteNote.id)}
              disabled={deleteNoteMutation.isPending}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete-note"
            >
              {deleteNoteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to discard them?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDiscardConfirm(false)} data-testid="button-keep-editing">
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDiscard} data-testid="button-confirm-discard">
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
