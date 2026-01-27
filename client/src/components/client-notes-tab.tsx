import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, format } from "date-fns";

interface NoteAuthor {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

interface ClientNote {
  id: string;
  clientId: string;
  body: any;
  category: string;
  categoryId: string | null;
  createdAt: string;
  updatedAt: string;
  authorUserId: string;
  lastEditedByUserId: string | null;
  author: NoteAuthor;
  versionCount: number;
}

interface ClientNotesTabProps {
  clientId: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  general: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  project: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  feedback: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  meeting: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  requirement: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
};

function getPlainTextFromRichText(body: any): string {
  if (typeof body === "string") return body;
  if (!body) return "";
  if (body.content && Array.isArray(body.content)) {
    return body.content.map((node: any) => {
      if (node.type === "paragraph" && node.content) {
        return node.content.map((text: any) => text.text || "").join("");
      }
      if (node.type === "text") return node.text || "";
      return "";
    }).join("\n");
  }
  return JSON.stringify(body);
}

function createRichTextFromPlain(text: string): any {
  return {
    type: "doc",
    content: text.split("\n").filter(Boolean).map(line => ({
      type: "paragraph",
      content: [{ type: "text", text: line }]
    }))
  };
}

export function ClientNotesTab({ clientId }: ClientNotesTabProps) {
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<ClientNote | null>(null);
  const [deleteNote, setDeleteNote] = useState<ClientNote | null>(null);
  const [noteContent, setNoteContent] = useState("");
  const [noteCategory, setNoteCategory] = useState("general");

  const { data: notesData, isLoading: notesLoading } = useQuery<{ ok: boolean; notes: ClientNote[] }>({
    queryKey: ["/api/clients", clientId, "notes"],
  });

  const createNoteMutation = useMutation({
    mutationFn: async (data: { body: any; category: string }) => {
      return apiRequest("POST", `/api/clients/${clientId}/notes`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "notes"] });
      setCreateDialogOpen(false);
      setNoteContent("");
      setNoteCategory("general");
      toast({ title: "Note created", description: "Your note has been saved." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create note.", variant: "destructive" });
    },
  });

  const updateNoteMutation = useMutation({
    mutationFn: async ({ noteId, data }: { noteId: string; data: { body: any; category: string } }) => {
      return apiRequest("PUT", `/api/clients/${clientId}/notes/${noteId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "notes"] });
      setEditingNote(null);
      setNoteContent("");
      setNoteCategory("general");
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
    if (!noteContent.trim()) return;
    createNoteMutation.mutate({
      body: createRichTextFromPlain(noteContent),
      category: noteCategory,
    });
  };

  const handleUpdateNote = () => {
    if (!editingNote || !noteContent.trim()) return;
    updateNoteMutation.mutate({
      noteId: editingNote.id,
      data: {
        body: createRichTextFromPlain(noteContent),
        category: noteCategory,
      },
    });
  };

  const handleEditClick = (note: ClientNote) => {
    setEditingNote(note);
    setNoteContent(getPlainTextFromRichText(note.body));
    setNoteCategory(note.category);
  };

  const notes = notesData?.notes || [];

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
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Notes</h3>
        <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-note">
          <Plus className="h-4 w-4 mr-2" />
          Add Note
        </Button>
      </div>

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
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <Card key={note.id} className="hover-elevate" data-testid={`note-card-${note.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback>
                        {note.author.firstName?.[0] || note.author.email?.[0] || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {note.author.firstName || note.author.email?.split("@")[0] || "Unknown"}
                        </span>
                        <Badge variant="secondary" className={CATEGORY_COLORS[note.category] || CATEGORY_COLORS.general}>
                          {note.category}
                        </Badge>
                        {note.versionCount > 0 && (
                          <Badge variant="outline" className="text-xs">
                            <History className="h-3 w-3 mr-1" />
                            {note.versionCount} edit{note.versionCount > 1 ? "s" : ""}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
                        {note.updatedAt !== note.createdAt && (
                          <span> (edited)</span>
                        )}
                      </p>
                      <p className="mt-2 text-sm whitespace-pre-wrap">
                        {getPlainTextFromRichText(note.body)}
                      </p>
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
        <DialogContent>
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
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="project">Project</SelectItem>
                  <SelectItem value="feedback">Feedback</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
                  <SelectItem value="requirement">Requirement</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Note</Label>
              <Textarea
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Enter your note..."
                rows={5}
                data-testid="input-note-content"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateNote}
              disabled={!noteContent.trim() || createNoteMutation.isPending}
              data-testid="button-save-note"
            >
              {createNoteMutation.isPending ? "Saving..." : "Save Note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingNote} onOpenChange={(open) => !open && setEditingNote(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Note</DialogTitle>
            <DialogDescription>Make changes to your note.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={noteCategory} onValueChange={setNoteCategory}>
                <SelectTrigger data-testid="select-edit-note-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="project">Project</SelectItem>
                  <SelectItem value="feedback">Feedback</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
                  <SelectItem value="requirement">Requirement</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Note</Label>
              <Textarea
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Enter your note..."
                rows={5}
                data-testid="input-edit-note-content"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingNote(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdateNote}
              disabled={!noteContent.trim() || updateNoteMutation.isPending}
              data-testid="button-update-note"
            >
              {updateNoteMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteNote} onOpenChange={(open) => !open && setDeleteNote(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Note</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this note? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteNote(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteNote && deleteNoteMutation.mutate(deleteNote.id)}
              disabled={deleteNoteMutation.isPending}
              data-testid="button-confirm-delete-note"
            >
              {deleteNoteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
