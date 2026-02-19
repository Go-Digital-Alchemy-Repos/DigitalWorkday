import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Loader2,
  Clock,
  Send,
  MessageSquare,
  Activity,
  Search,
  Trash2,
  Edit2,
  Save,
  History,
} from "lucide-react";
import { RichTextEditor, RichTextViewer } from "@/components/ui/rich-text-editor";
import type { TenantWithDetails, TenantNote, TenantAuditEvent } from "./types";

interface TenantDrawerNotesProps {
  activeTenant: TenantWithDetails;
  open: boolean;
}

export function TenantDrawerNotes({ activeTenant, open }: TenantDrawerNotesProps) {
  const { toast } = useToast();
  const [newNoteBody, setNewNoteBody] = useState("");
  const [newNoteCategory, setNewNoteCategory] = useState("general");
  const [noteSearchQuery, setNoteSearchQuery] = useState("");
  const [noteFilterCategory, setNoteFilterCategory] = useState("all");
  const [editNoteDialogOpen, setEditNoteDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<{ id: string; body: string; category: string } | null>(null);
  const [editNoteBody, setEditNoteBody] = useState("");
  const [editNoteCategory, setEditNoteCategory] = useState("general");
  const [versionHistoryDialogOpen, setVersionHistoryDialogOpen] = useState(false);
  const [versionHistoryNoteId, setVersionHistoryNoteId] = useState<string | null>(null);

  const { data: notesData, isLoading: notesLoading } = useQuery<TenantNote[]>({
    queryKey: ["/api/v1/super/tenants", activeTenant.id, "notes"],
    queryFn: () => fetch(`/api/v1/super/tenants/${activeTenant.id}/notes`, { credentials: "include" }).then(r => r.json()),
    enabled: !!activeTenant.id && open,
  });

  const { data: auditResponse, isLoading: auditLoading } = useQuery<{ events: TenantAuditEvent[] }>({
    queryKey: ["/api/v1/super/tenants", activeTenant.id, "audit"],
    queryFn: () => fetch(`/api/v1/super/tenants/${activeTenant.id}/audit`, { credentials: "include" }).then(r => r.json()),
    enabled: !!activeTenant.id && open,
  });

  const { data: versionHistoryData, isLoading: versionHistoryLoading } = useQuery<{ currentNote: TenantNote; versions: any[] }>({
    queryKey: ["/api/v1/super/tenants", activeTenant.id, "notes", versionHistoryNoteId, "versions"],
    queryFn: () => fetch(`/api/v1/super/tenants/${activeTenant.id}/notes/${versionHistoryNoteId}/versions`, { credentials: "include" }).then(r => r.json()),
    enabled: !!activeTenant.id && !!versionHistoryNoteId && versionHistoryDialogOpen,
  });

  const filteredNotes = useMemo(() => {
    if (!notesData) return [];
    let filtered = [...notesData];
    if (noteFilterCategory !== "all") {
      filtered = filtered.filter(n => n.category === noteFilterCategory);
    }
    if (noteSearchQuery.trim()) {
      const query = noteSearchQuery.toLowerCase();
      filtered = filtered.filter(n =>
        n.body.toLowerCase().includes(query) ||
        n.author?.name?.toLowerCase().includes(query) ||
        n.category?.toLowerCase().includes(query)
      );
    }
    return filtered;
  }, [notesData, noteFilterCategory, noteSearchQuery]);

  const createNoteMutation = useMutation({
    mutationFn: async (data: { body: string; category: string }) => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${activeTenant.id}/notes`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant.id, "notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant.id, "audit"] });
      setNewNoteBody("");
      setNewNoteCategory("general");
      toast({ title: "Note added" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to add note", description: error.message, variant: "destructive" });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      return apiRequest("DELETE", `/api/v1/super/tenants/${activeTenant.id}/notes/${noteId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant.id, "notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant.id, "audit"] });
      toast({ title: "Note deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete note", description: error.message, variant: "destructive" });
    },
  });

  const updateNoteMutation = useMutation({
    mutationFn: async (data: { noteId: string; body: string; category: string }) => {
      const res = await apiRequest("PATCH", `/api/v1/super/tenants/${activeTenant.id}/notes/${data.noteId}`, { body: data.body, category: data.category });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant.id, "notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant.id, "audit"] });
      setEditNoteDialogOpen(false);
      setEditingNote(null);
      toast({ title: "Note updated" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update note", description: error.message, variant: "destructive" });
    },
  });

  return (
    <>
      <div className="mt-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Send className="h-4 w-4" />
                Add Note
              </CardTitle>
              <CardDescription>Create a new internal note for this tenant</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-medium">Category:</Label>
                <Select value={newNoteCategory} onValueChange={setNewNoteCategory}>
                  <SelectTrigger className="w-36" data-testid="select-note-category"><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="onboarding">Onboarding</SelectItem>
                    <SelectItem value="support">Support</SelectItem>
                    <SelectItem value="billing">Billing</SelectItem>
                    <SelectItem value="technical">Technical</SelectItem>
                    <SelectItem value="accounts">Accounts</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <RichTextEditor
                value={newNoteBody}
                onChange={setNewNoteBody}
                placeholder="Add a note... Use the toolbar to format text, add links, etc."
                minHeight="150px"
              />
              <div className="flex justify-end">
                <Button
                  onClick={() => createNoteMutation.mutate({ body: newNoteBody, category: newNoteCategory })}
                  disabled={!newNoteBody.trim() || newNoteBody === "<p></p>" || createNoteMutation.isPending}
                  data-testid="button-add-note"
                >
                  {createNoteMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  Add Note
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Notes History
                {notesData && notesData.length > 0 && (<Badge variant="secondary" className="ml-2">{notesData.length}</Badge>)}
              </CardTitle>
              <CardDescription>Private notes visible only to super admins</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 flex-1">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search notes..." value={noteSearchQuery} onChange={(e) => setNoteSearchQuery(e.target.value)} className="pl-9" data-testid="input-search-notes" />
                </div>
                <Select value={noteFilterCategory} onValueChange={setNoteFilterCategory}>
                  <SelectTrigger className="w-full sm:w-40" data-testid="select-filter-category"><SelectValue placeholder="Filter by category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="onboarding">Onboarding</SelectItem>
                    <SelectItem value="support">Support</SelectItem>
                    <SelectItem value="billing">Billing</SelectItem>
                    <SelectItem value="technical">Technical</SelectItem>
                    <SelectItem value="accounts">Accounts</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-1 overflow-y-auto max-h-[500px] space-y-3 pr-1">
                {notesLoading ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : filteredNotes.length > 0 ? (
                  filteredNotes.map((note) => (
                    <div key={note.id} className="border rounded-md p-4 space-y-3 bg-muted/30 hover-elevate" data-testid={`note-${note.id}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold">{note.author?.name || "Unknown"}</span>
                            <Badge variant="outline" className="text-xs capitalize">{note.category}</Badge>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>
                              {new Date(note.createdAt).toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric" })}
                              {" at "}
                              {new Date(note.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon" variant="ghost"
                            onClick={() => { setEditingNote({ id: note.id, body: note.body, category: note.category || "general" }); setEditNoteBody(note.body); setEditNoteCategory(note.category || "general"); setEditNoteDialogOpen(true); }}
                            className="h-7 w-7 text-muted-foreground hover:text-primary"
                            data-testid={`button-edit-note-${note.id}`}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          {note.hasVersions && (
                            <Button
                              size="icon" variant="ghost"
                              onClick={() => { setVersionHistoryNoteId(note.id); setVersionHistoryDialogOpen(true); }}
                              className="h-7 w-7 text-muted-foreground hover:text-primary"
                              data-testid={`button-history-note-${note.id}`}
                            >
                              <History className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            size="icon" variant="ghost"
                            onClick={() => deleteNoteMutation.mutate(note.id)}
                            disabled={deleteNoteMutation.isPending}
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            data-testid={`button-delete-note-${note.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="border-t pt-3">
                        <RichTextViewer content={note.body} className="text-sm" />
                      </div>
                    </div>
                  ))
                ) : notesData && notesData.length > 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">No notes match your search or filter.</div>
                ) : (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No notes yet. Add a note to get started.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Audit Timeline
            </CardTitle>
            <CardDescription>Recent actions and events for this tenant</CardDescription>
          </CardHeader>
          <CardContent>
            {auditLoading ? (
              <div className="flex items-center justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : auditResponse?.events && auditResponse.events.length > 0 ? (
              <div className="space-y-3">
                {auditResponse.events.map((event) => (
                  <div key={event.id} className="flex items-start gap-3 border-l-2 border-muted pl-3 pb-3">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{event.eventType.replace(/_/g, " ")}</Badge>
                        <span className="text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="text-sm">{event.message}</p>
                      {event.actor && (<div className="text-xs text-muted-foreground">by {event.actor.name || event.actor.email}</div>)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-sm text-muted-foreground">No audit events recorded yet.</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={editNoteDialogOpen} onOpenChange={(open) => { if (!open) { setEditNoteDialogOpen(false); setEditingNote(null); } }}>
        <DialogContent className="max-w-2xl" data-testid="dialog-edit-note">
          <DialogHeader>
            <DialogTitle>Edit Note</DialogTitle>
            <DialogDescription>Make changes to this note. Previous versions will be saved in the history.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={editNoteCategory} onValueChange={setEditNoteCategory}>
                <SelectTrigger data-testid="select-edit-note-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="onboarding">Onboarding</SelectItem>
                  <SelectItem value="support">Support</SelectItem>
                  <SelectItem value="billing">Billing</SelectItem>
                  <SelectItem value="technical">Technical</SelectItem>
                  <SelectItem value="accounts">Accounts</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Content</Label>
              <RichTextEditor value={editNoteBody} onChange={setEditNoteBody} placeholder="Edit note content..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditNoteDialogOpen(false); setEditingNote(null); }} data-testid="button-cancel-edit-note">Cancel</Button>
            <Button
              onClick={() => { if (editingNote) { updateNoteMutation.mutate({ noteId: editingNote.id, body: editNoteBody, category: editNoteCategory }); } }}
              disabled={!editNoteBody.trim() || editNoteBody === "<p></p>" || updateNoteMutation.isPending}
              data-testid="button-save-note"
            >
              {updateNoteMutation.isPending ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>) : (<><Save className="h-4 w-4 mr-2" />Save Changes</>)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={versionHistoryDialogOpen} onOpenChange={(open) => { if (!open) { setVersionHistoryDialogOpen(false); setVersionHistoryNoteId(null); } }}>
        <DialogContent className="max-w-3xl max-h-[80vh]" data-testid="dialog-version-history">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Note Version History
            </DialogTitle>
            <DialogDescription>View all previous versions of this note. Each edit creates a new version.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {versionHistoryLoading ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : versionHistoryData?.versions && versionHistoryData.versions.length > 0 ? (
              <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
                <div className="border rounded-md p-4 bg-primary/5 border-primary/20">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="default">Current</Badge>
                      <Badge variant="outline" className="text-xs capitalize">{versionHistoryData.currentNote?.category}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(versionHistoryData.currentNote?.updatedAt || versionHistoryData.currentNote?.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <RichTextViewer content={versionHistoryData.currentNote?.body} className="text-sm" />
                </div>
                {versionHistoryData.versions.map((version) => (
                  <div key={version.id} className="border rounded-md p-4 bg-muted/30">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">Version {version.versionNumber}</Badge>
                        <Badge variant="outline" className="text-xs capitalize">{version.category}</Badge>
                        <span className="text-xs text-muted-foreground">
                          by {version.editor.firstName && version.editor.lastName ? `${version.editor.firstName} ${version.editor.lastName}` : version.editor.email}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">{new Date(version.createdAt).toLocaleString()}</span>
                    </div>
                    <RichTextViewer content={version.body} className="text-sm" />
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
            <Button variant="outline" onClick={() => { setVersionHistoryDialogOpen(false); setVersionHistoryNoteId(null); }} data-testid="button-close-version-history">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
