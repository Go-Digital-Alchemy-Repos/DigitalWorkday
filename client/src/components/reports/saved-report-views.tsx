import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Save, Trash2, UsersRound } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchReport as fetch } from "./report-fetch";

interface SavedView { id: string; name: string; query: string; isShared: boolean; userId: string }

export function SavedReportViews({ workspace }: { workspace: "home" | "delivery" | "people" | "clients" }) {
  const [showSave, setShowSave] = useState(false);
  const [name, setName] = useState("");
  const [isShared, setIsShared] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = ["/api/reports/v3/saved-views", workspace];
  const { data: views = [] } = useQuery<SavedView[]>({
    queryKey,
    queryFn: async () => {
      const response = await fetch(`/api/reports/v3/saved-views?workspace=${workspace}`);
      if (!response.ok) throw new Error("Failed to load saved views");
      return response.json();
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      const query = typeof window === "undefined" ? "" : window.location.search.replace(/^\?/, "");
      const response = await fetch("/api/reports/v3/saved-views", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspace, name, query, isShared }) });
      if (!response.ok) throw new Error("Failed to save view");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey }); setShowSave(false); setName(""); toast({ title: "Report view saved" }); },
    onError: () => toast({ title: "Report view could not be saved", variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const response = await fetch(`/api/reports/v3/saved-views/${id}`, { method: "DELETE" }); if (!response.ok) throw new Error("Failed to delete view"); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  const apply = (view: SavedView) => {
    if (typeof window === "undefined") return;
    window.location.assign(`${window.location.pathname}${view.query ? `?${view.query}` : ""}`);
  };

  return <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button type="button" variant="outline" size="sm"><Bookmark className="mr-2 h-4 w-4" />Saved views</Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Saved report views</DropdownMenuLabel>
        {views.length ? views.map((view) => <DropdownMenuItem key={view.id} className="justify-between" onSelect={() => apply(view)}><span className="flex min-w-0 items-center gap-2">{view.isShared ? <UsersRound className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}<span className="truncate">{view.name}</span></span>{view.userId === user?.id ? <button type="button" className="rounded p-1 hover:bg-muted" aria-label={`Delete ${view.name}`} onClick={(event) => { event.stopPropagation(); remove.mutate(view.id); }}><Trash2 className="h-3.5 w-3.5" /></button> : null}</DropdownMenuItem>) : <DropdownMenuItem disabled>No saved views yet</DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setShowSave(true)}><Save className="h-4 w-4" />Save current view</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <Dialog open={showSave} onOpenChange={setShowSave}><DialogContent><DialogHeader><DialogTitle>Save report view</DialogTitle><DialogDescription>Save the current workspace, range, and active URL filters.</DialogDescription></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label htmlFor="saved-view-name">Name</Label><Input id="saved-view-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} autoFocus /></div><label className="flex items-center gap-2 text-sm"><Checkbox checked={isShared} onCheckedChange={(checked) => setIsShared(checked === true)} />Share with reporting users</label></div><DialogFooter><Button variant="outline" onClick={() => setShowSave(false)}>Cancel</Button><Button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}>Save view</Button></DialogFooter></DialogContent></Dialog>
  </>;
}
