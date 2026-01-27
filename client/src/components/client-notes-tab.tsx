import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  History,
  StickyNote,
  Search,
  Loader2,
  Send,
  Save,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { RichTextEditor, RichTextViewer } from "@/components/ui/rich-text-editor";

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
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<ClientNote | null>(null);
  const [deleteNote, setDeleteNote] = useState<ClientNote | null>(null);
  const [versionHistoryDialogOpen, setVersionHistoryDialogOpen] = useState(false);
  const [versionHistoryNoteId, setVersionHistoryNoteId] = useState<string | null>(null);
  
  const [noteBody, setNoteBody] = useState("");
  const [noteCategory, setNoteCategory] = useState("general");
  const [editNoteBody, setEditNoteBody] = useState("");
  const [editNoteCategory, setEditNoteCategory] = useState("general");
  
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");

  const { data: notesData, isLoading: notesLoading } = useQuery<{ ok: boolean; notes: ClientNote[] }>({
    queryKey: ["/api/clients", clientId, "notes"],
  });

  const { data: versionHistoryData, isLoading: versionHistoryLoading } = useQuery<VersionHistoryResponse>({
    queryKey: ["/api/clients", clientId, "notes", versionHistoryNoteId, "versions"],
    enabled: !!versionHistoryNoteId && versionHistoryDialogOpen,
  });

  const createNoteMutation = useMutation({
    mutationFn: async (data: { body: string; category: string }) => {
      return apiRequest("POST", `/api/clients/${clientId}/notes`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "notes"] });
      setCreateDialogOpen(false);
      setNoteBody("");
      setNoteCategory("general");
      toast({ title: "Note created", description: "Your note has been saved." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create note.", variant: "destructive" });
    },
  });

  const updateNoteMutation = useMutation({
    mutationFn: async ({ noteId, body, category }: { noteId: string; body: string; category: string }) => {
      return apiRequest("PUT", `/api/clients/${clientId}/notes/${noteId}`, { body, category });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "notes"] });
      if (versionHistoryNoteId) {
        queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "notes", versionHistoryNoteId, "versions"] });
      }
      setEditDialogOpen(false);
      setEditingNote(null);
      setEditNoteBody("");
      setEditNoteCategory("general");
      toast({ title: "Note updated", description: "Your changes have been saved." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update note.", variant: "destructive" });
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
    onError: () => {
      toast({ title: "Error", description: "Failed to delete note.", variant: "destructive" });
    },
  });

  const handleCreateNote = () => {
    if (!noteBody.trim() || noteBody === "<p></p>") return;
    createNoteMutation.mutate({ body: noteBody, category: noteCategory });
  };

  const handleUpdateNote = () => {
    if (!editingNote || !editNoteBody.trim() || editNoteBody === "<p></p>") return;
    updateNoteMutation.mutate({
      noteId: editingNote.id,
      body: editNoteBody,
      category: editNoteCategory,
    });
  };

  const handleEditClick = (note: ClientNote) => {
    setEditingNote(note);
    setEditNoteBody(convertBodyToHtml(note.body));
    setEditNoteCategory(note.category);
    setEditDialogOpen(true);
  };

  const handleVersionHistoryClick = (noteId: string) => {
    setVersionHistoryNoteId(noteId);
    setVersionHistoryDialogOpen(true);
  };

  const notes = notesData?.notes || [];
  
  const filteredNotes = notes.filter((note) => {
    const bodyHtml = convertBodyToHtml(note.body);
    const matchesSearch = !searchQuery || 
      bodyHtml.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === "all" || note.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

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
        <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-note">
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
        <Card>
          <CardContent className="p-8 text-center">
            <StickyNote className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-medium text-lg mb-2">No notes yet</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Keep track of important information about this client.
            </p>
            <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-first-note">
              <Plus className="h-4 w-4 mr-2" />
              Add First Note
            </Button>
          </CardContent>
        </Card>
      ) : filteredNotes.length === 0 ? (
        <Card>
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
                        <Badge variant="secondary" className={CATEGORY_COLORS[note.category] || CATEGORY_COLORS.general}>
                          {note.category}
                        </Badge>
                        {note.versionCount > 0 && (
                          <Badge 
                            variant="outline" 
                            className="text-xs cursor-pointer hover-elevate"
                            onClick={() => handleVersionHistoryClick(note.id)}
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
                      <DropdownMenuItem onClick={() => handleEditClick(note)} data-testid={`note-edit-${note.id}`}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      {note.versionCount > 0 && (
                        <DropdownMenuItem onClick={() => handleVersionHistoryClick(note.id)} data-testid={`note-history-${note.id}`}>
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

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Note</DialogTitle>
            <DialogDescription>Add a note about this client.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
              <Label>Note</Label>
              <RichTextEditor
                value={noteBody}
                onChange={setNoteBody}
                placeholder="Enter your note..."
                minHeight="150px"
                data-testid="editor-create-note"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)} data-testid="button-cancel-create-note">
              Cancel
            </Button>
            <Button
              onClick={handleCreateNote}
              disabled={!noteBody.trim() || noteBody === "<p></p>" || createNoteMutation.isPending}
              data-testid="button-save-note"
            >
              {createNoteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Save Note
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setEditDialogOpen(false);
          setEditingNote(null);
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Note</DialogTitle>
            <DialogDescription>Make changes to your note. Previous versions will be saved in the history.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={editNoteCategory} onValueChange={setEditNoteCategory}>
                <SelectTrigger data-testid="select-edit-note-category">
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
              <Label>Note</Label>
              <RichTextEditor
                value={editNoteBody}
                onChange={setEditNoteBody}
                placeholder="Edit your note..."
                minHeight="150px"
                data-testid="editor-edit-note"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setEditDialogOpen(false);
              setEditingNote(null);
            }} data-testid="button-cancel-edit-note">
              Cancel
            </Button>
            <Button
              onClick={handleUpdateNote}
              disabled={!editNoteBody.trim() || editNoteBody === "<p></p>" || updateNoteMutation.isPending}
              data-testid="button-update-note"
            >
              {updateNoteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteNote} onOpenChange={(open) => !open && setDeleteNote(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Note</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this note? This action cannot be undone and will also remove all version history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteNote(null)} data-testid="button-cancel-delete-note">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteNote && deleteNoteMutation.mutate(deleteNote.id)}
              disabled={deleteNoteMutation.isPending}
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
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={versionHistoryDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setVersionHistoryDialogOpen(false);
          setVersionHistoryNoteId(null);
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[80vh]" data-testid="dialog-version-history">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Note Version History
            </DialogTitle>
            <DialogDescription>
              View all previous versions of this note. Each edit creates a new version.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {versionHistoryLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : versionHistoryData?.versions && versionHistoryData.versions.length > 0 ? (
              <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
                <div className="border rounded-md p-4 bg-primary/5 border-primary/20">
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="default">Current</Badge>
                      <Badge variant="outline" className="text-xs capitalize">
                        {versionHistoryData.currentNote?.category}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {versionHistoryData.currentNote?.updatedAt 
                        ? new Date(versionHistoryData.currentNote.updatedAt).toLocaleString()
                        : new Date(versionHistoryData.currentNote?.createdAt || "").toLocaleString()}
                    </span>
                  </div>
                  <RichTextViewer 
                    content={convertBodyToHtml(versionHistoryData.currentNote?.body)} 
                    className="text-sm" 
                  />
                </div>

                {versionHistoryData.versions.map((version) => (
                  <div key={version.id} className="border rounded-md p-4 bg-muted/30">
                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary">Version {version.versionNumber}</Badge>
                        <Badge variant="outline" className="text-xs capitalize">
                          {version.category}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          by {version.editor.firstName && version.editor.lastName
                            ? `${version.editor.firstName} ${version.editor.lastName}`
                            : version.editor.email}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(version.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <RichTextViewer content={convertBodyToHtml(version.body)} className="text-sm" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-sm text-muted-foreground">
                <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                No previous versions. This note has never been edited.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setVersionHistoryDialogOpen(false);
                setVersionHistoryNoteId(null);
              }}
              data-testid="button-close-version-history"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
