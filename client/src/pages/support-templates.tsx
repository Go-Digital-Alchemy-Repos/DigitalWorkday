import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, MessageSquareText, Zap, Eye, EyeOff, ArrowLeft, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";

interface CannedReply {
  id: string;
  title: string;
  bodyText: string;
  visibility: string;
  workspaceId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface MacroActions {
  setStatus?: string;
  setPriority?: string;
  assignToUserId?: string | null;
}

interface Macro {
  id: string;
  title: string;
  bodyText: string;
  visibility: string;
  actionsJson: MacroActions;
  workspaceId: string | null;
  createdAt: string;
  updatedAt: string;
}

const statusLabels: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  waiting_on_client: "Waiting on Client",
  resolved: "Resolved",
  closed: "Closed",
};
const priorityLabels: Record<string, string> = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" };

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function CannedReplyForm({ reply, onClose, onSaved }: { reply?: CannedReply; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [title, setTitle] = useState(reply?.title || "");
  const [bodyText, setBodyText] = useState(reply?.bodyText || "");
  const [visibility, setVisibility] = useState(reply?.visibility || "public");

  const mutation = useMutation({
    mutationFn: async () => {
      if (reply) {
        return apiRequest("PATCH", `/api/v1/support/canned-replies/${reply.id}`, { title, bodyText, visibility });
      }
      return apiRequest("POST", "/api/v1/support/canned-replies", { title, bodyText, visibility });
    },
    onSuccess: () => {
      toast({ title: reply ? "Template updated" : "Template created" });
      onSaved();
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Greeting Response" data-testid="input-reply-title" />
      </div>
      <div className="space-y-1.5">
        <Label>Message Body</Label>
        <Textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)} placeholder="Type the template message..." className="min-h-[120px]" data-testid="input-reply-body" />
      </div>
      <div className="space-y-1.5">
        <Label>Visibility</Label>
        <Select value={visibility} onValueChange={setVisibility}>
          <SelectTrigger data-testid="select-reply-visibility">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="public">Public Reply</SelectItem>
            <SelectItem value="internal">Internal Note</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} data-testid="button-cancel-reply">Cancel</Button>
        <Button onClick={() => mutation.mutate()} disabled={!title.trim() || !bodyText.trim() || mutation.isPending} data-testid="button-save-reply">
          {mutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
          {reply ? "Update" : "Create"}
        </Button>
      </DialogFooter>
    </div>
  );
}

function MacroForm({ macro, onClose, onSaved }: { macro?: Macro; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [title, setTitle] = useState(macro?.title || "");
  const [bodyText, setBodyText] = useState(macro?.bodyText || "");
  const [visibility, setVisibility] = useState(macro?.visibility || "public");
  const [setStatus, setSetStatus] = useState(macro?.actionsJson?.setStatus || "");
  const [setPriority, setSetPriority] = useState(macro?.actionsJson?.setPriority || "");

  const mutation = useMutation({
    mutationFn: async () => {
      const actionsJson: MacroActions = {};
      if (setStatus && setStatus !== "none") actionsJson.setStatus = setStatus;
      if (setPriority && setPriority !== "none") actionsJson.setPriority = setPriority;

      if (macro) {
        return apiRequest("PATCH", `/api/v1/support/macros/${macro.id}`, { title, bodyText, visibility, actionsJson });
      }
      return apiRequest("POST", "/api/v1/support/macros", { title, bodyText, visibility, actionsJson });
    },
    onSuccess: () => {
      toast({ title: macro ? "Macro updated" : "Macro created" });
      onSaved();
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Close & Thank" data-testid="input-macro-title" />
      </div>
      <div className="space-y-1.5">
        <Label>Message Body</Label>
        <Textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)} placeholder="Type the template message..." className="min-h-[100px]" data-testid="input-macro-body" />
      </div>
      <div className="space-y-1.5">
        <Label>Visibility</Label>
        <Select value={visibility} onValueChange={setVisibility}>
          <SelectTrigger data-testid="select-macro-visibility">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="public">Public Reply</SelectItem>
            <SelectItem value="internal">Internal Note</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Separator />
      <p className="text-sm font-medium text-muted-foreground">Actions (optional)</p>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Set Status</Label>
          <Select value={setStatus} onValueChange={setSetStatus}>
            <SelectTrigger data-testid="select-macro-status">
              <SelectValue placeholder="No change" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No change</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="waiting_on_client">Waiting on Client</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Set Priority</Label>
          <Select value={setPriority} onValueChange={setSetPriority}>
            <SelectTrigger data-testid="select-macro-priority">
              <SelectValue placeholder="No change" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No change</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} data-testid="button-cancel-macro">Cancel</Button>
        <Button onClick={() => mutation.mutate()} disabled={!title.trim() || !bodyText.trim() || mutation.isPending} data-testid="button-save-macro">
          {mutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
          {macro ? "Update" : "Create"}
        </Button>
      </DialogFooter>
    </div>
  );
}

export default function SupportTemplates() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("replies");
  const [showReplyDialog, setShowReplyDialog] = useState(false);
  const [editingReply, setEditingReply] = useState<CannedReply | undefined>();
  const [showMacroDialog, setShowMacroDialog] = useState(false);
  const [editingMacro, setEditingMacro] = useState<Macro | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<{ type: "reply" | "macro"; id: string; title: string } | null>(null);

  const { data: replies = [], isLoading: repliesLoading } = useQuery<CannedReply[]>({
    queryKey: ["/api/v1/support/canned-replies"],
  });

  const { data: macros = [], isLoading: macrosLoading } = useQuery<Macro[]>({
    queryKey: ["/api/v1/support/macros"],
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!deleteTarget) return;
      const path = deleteTarget.type === "reply" ? "canned-replies" : "macros";
      return apiRequest("DELETE", `/api/v1/support/${path}/${deleteTarget.id}`);
    },
    onSuccess: () => {
      toast({ title: "Deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/support/canned-replies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/support/macros"] });
      setDeleteTarget(null);
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleReplySaved = () => {
    setShowReplyDialog(false);
    setEditingReply(undefined);
    queryClient.invalidateQueries({ queryKey: ["/api/v1/support/canned-replies"] });
  };

  const handleMacroSaved = () => {
    setShowMacroDialog(false);
    setEditingMacro(undefined);
    queryClient.invalidateQueries({ queryKey: ["/api/v1/support/macros"] });
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/support")} data-testid="button-back-to-support">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold" data-testid="text-templates-title">Canned Replies & Macros</h1>
            <p className="text-sm text-muted-foreground">Manage reusable response templates and automation macros</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList data-testid="tabs-templates">
            <TabsTrigger value="replies" data-testid="tab-replies">
              <MessageSquareText className="h-4 w-4 mr-1.5" />
              Canned Replies
            </TabsTrigger>
            <TabsTrigger value="macros" data-testid="tab-macros">
              <Zap className="h-4 w-4 mr-1.5" />
              Macros
            </TabsTrigger>
          </TabsList>

          <TabsContent value="replies" className="space-y-4 mt-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm text-muted-foreground">{replies.length} canned {replies.length === 1 ? "reply" : "replies"}</p>
              <Button onClick={() => { setEditingReply(undefined); setShowReplyDialog(true); }} data-testid="button-new-reply">
                <Plus className="h-4 w-4 mr-1" />
                New Reply
              </Button>
            </div>

            {repliesLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
              </div>
            ) : replies.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <MessageSquareText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No canned replies yet. Create one to speed up your responses.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {replies.map((reply) => (
                  <Card key={reply.id} data-testid={`card-reply-${reply.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{reply.title}</span>
                            <Badge variant="secondary" className="text-xs">
                              {reply.visibility === "internal" ? <><EyeOff className="h-3 w-3 mr-1" />Internal</> : <><Eye className="h-3 w-3 mr-1" />Public</>}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{reply.bodyText}</p>
                          <span className="text-xs text-muted-foreground mt-1 block">Updated {formatDate(reply.updatedAt)}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="ghost" size="icon" onClick={() => { setEditingReply(reply); setShowReplyDialog(true); }} data-testid={`button-edit-reply-${reply.id}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteTarget({ type: "reply", id: reply.id, title: reply.title })} data-testid={`button-delete-reply-${reply.id}`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="macros" className="space-y-4 mt-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm text-muted-foreground">{macros.length} {macros.length === 1 ? "macro" : "macros"}</p>
              <Button onClick={() => { setEditingMacro(undefined); setShowMacroDialog(true); }} data-testid="button-new-macro">
                <Plus className="h-4 w-4 mr-1" />
                New Macro
              </Button>
            </div>

            {macrosLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
              </div>
            ) : macros.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <Zap className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No macros yet. Create one to automate common ticket workflows.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {macros.map((macro) => {
                  const actions = macro.actionsJson || {};
                  const actionParts: string[] = [];
                  if (actions.setStatus) actionParts.push(`Status: ${statusLabels[actions.setStatus] || actions.setStatus}`);
                  if (actions.setPriority) actionParts.push(`Priority: ${priorityLabels[actions.setPriority] || actions.setPriority}`);

                  return (
                    <Card key={macro.id} data-testid={`card-macro-${macro.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{macro.title}</span>
                              <Badge variant="secondary" className="text-xs">
                                {macro.visibility === "internal" ? <><EyeOff className="h-3 w-3 mr-1" />Internal</> : <><Eye className="h-3 w-3 mr-1" />Public</>}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{macro.bodyText}</p>
                            {actionParts.length > 0 && (
                              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                <Zap className="h-3 w-3 text-muted-foreground" />
                                {actionParts.map((part, i) => (
                                  <Badge key={i} variant="outline" className="text-xs">{part}</Badge>
                                ))}
                              </div>
                            )}
                            <span className="text-xs text-muted-foreground mt-1 block">Updated {formatDate(macro.updatedAt)}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button variant="ghost" size="icon" onClick={() => { setEditingMacro(macro); setShowMacroDialog(true); }} data-testid={`button-edit-macro-${macro.id}`}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setDeleteTarget({ type: "macro", id: macro.id, title: macro.title })} data-testid={`button-delete-macro-${macro.id}`}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={showReplyDialog} onOpenChange={(open) => { if (!open) { setShowReplyDialog(false); setEditingReply(undefined); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingReply ? "Edit Canned Reply" : "New Canned Reply"}</DialogTitle>
            <DialogDescription>Create a reusable message template for ticket responses.</DialogDescription>
          </DialogHeader>
          <CannedReplyForm reply={editingReply} onClose={() => { setShowReplyDialog(false); setEditingReply(undefined); }} onSaved={handleReplySaved} />
        </DialogContent>
      </Dialog>

      <Dialog open={showMacroDialog} onOpenChange={(open) => { if (!open) { setShowMacroDialog(false); setEditingMacro(undefined); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingMacro ? "Edit Macro" : "New Macro"}</DialogTitle>
            <DialogDescription>Create a template with automated actions for common ticket workflows.</DialogDescription>
          </DialogHeader>
          <MacroForm macro={editingMacro} onClose={() => { setShowMacroDialog(false); setEditingMacro(undefined); }} onSaved={handleMacroSaved} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.type === "reply" ? "Canned Reply" : "Macro"}</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteTarget?.title}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} data-testid="button-cancel-delete">Cancel</Button>
            <Button variant="destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending} data-testid="button-confirm-delete">
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
