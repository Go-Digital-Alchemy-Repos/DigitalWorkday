import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Building2, Calendar, MoreHorizontal, Edit, Trash2 } from "lucide-react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Workspace } from "@shared/schema";

export function WorkspacesTab() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null);
  const [editForm, setEditForm] = useState({ name: "" });
  const [deleteTarget, setDeleteTarget] = useState<Workspace | null>(null);
  const { toast } = useToast();

  const { data: currentWorkspace } = useQuery<Workspace>({
    queryKey: ["/api/workspaces/current"],
  });

  const { data: workspaces } = useQuery<Workspace[]>({
    queryKey: ["/api/workspaces"],
  });

  const createWorkspaceMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      return apiRequest("POST", "/api/workspaces", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces"] });
      setCreateOpen(false);
      toast({ title: "Workspace created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create workspace", variant: "destructive" });
    },
  });

  const updateWorkspaceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name: string } }) => {
      return apiRequest("PATCH", `/api/workspaces/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces"] });
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces/current"] });
      setEditOpen(false);
      setEditingWorkspace(null);
      toast({ title: "Workspace updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update workspace", variant: "destructive" });
    },
  });

  const deleteWorkspaceMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/workspaces/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces"] });
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces/current"] });
      setDeleteTarget(null);
      toast({ title: "Workspace deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete workspace", description: error.message, variant: "destructive" });
    },
  });

  const displayWorkspaces = workspaces || (currentWorkspace ? [currentWorkspace] : []);

  const openEditWorkspace = (workspace: Workspace) => {
    setEditingWorkspace(workspace);
    setEditForm({ name: workspace.name });
    setEditOpen(true);
  };

  const handleUpdateWorkspace = () => {
    if (!editingWorkspace) return;
    updateWorkspaceMutation.mutate({
      id: editingWorkspace.id,
      data: editForm,
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
          <div>
            <CardTitle className="text-lg">Workspaces</CardTitle>
            <CardDescription>Manage organization workspaces</CardDescription>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-create-workspace">
                <Plus className="h-4 w-4 mr-2" />
                Create Workspace
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Workspace</DialogTitle>
                <DialogDescription>
                  Create a new workspace for your organization
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  createWorkspaceMutation.mutate({
                    name: formData.get("name") as string,
                  });
                }}
              >
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="workspace-name">Workspace Name</Label>
                    <Input
                      id="workspace-name"
                      name="name"
                      placeholder="My Workspace"
                      required
                      data-testid="input-workspace-name"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createWorkspaceMutation.isPending} data-testid="button-save-workspace">
                    {createWorkspaceMutation.isPending ? "Creating..." : "Create Workspace"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {displayWorkspaces.map((workspace) => (
              <Card
                key={workspace.id}
                className={`cursor-pointer hover-elevate ${workspace.id === currentWorkspace?.id ? "border-primary" : ""}`}
                data-testid={`card-workspace-${workspace.id}`}
                onClick={() => openEditWorkspace(workspace)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{workspace.name}</CardTitle>
                        {workspace.id === currentWorkspace?.id && (
                          <Badge variant="secondary" className="mt-1 text-xs">
                            Current
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditWorkspace(workspace)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setDeleteTarget(workspace)}
                            data-testid={`button-delete-workspace-${workspace.id}`}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>
                        {workspace.createdAt
                          ? new Date(workspace.createdAt).toLocaleDateString()
                          : "N/A"}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {displayWorkspaces.length === 0 && (
            <div className="text-center text-muted-foreground py-12">
              No workspaces found. Create your first workspace to get started.
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workspace</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"? This will permanently remove all projects, tasks, clients, teams, and other data within this workspace. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-workspace">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteWorkspaceMutation.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteWorkspaceMutation.isPending}
              data-testid="button-confirm-delete-workspace"
            >
              {deleteWorkspaceMutation.isPending ? "Deleting..." : "Delete Workspace"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent className="sm:max-w-[400px]">
          <SheetHeader>
            <SheetTitle>Edit Workspace</SheetTitle>
            <SheetDescription>
              Update workspace settings
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 py-6">
            <div className="space-y-2">
              <Label htmlFor="edit-workspace-name">Workspace Name</Label>
              <Input
                id="edit-workspace-name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                data-testid="input-edit-workspace-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Workspace ID</Label>
              <Input
                value={editingWorkspace?.id || ""}
                disabled
                className="opacity-60"
              />
              <p className="text-xs text-muted-foreground">
                The workspace ID cannot be changed as it is used for system references.
              </p>
            </div>
          </div>
          <SheetFooter>
            <Button 
              onClick={handleUpdateWorkspace} 
              disabled={updateWorkspaceMutation.isPending || !editForm.name}
              data-testid="button-update-workspace"
            >
              {updateWorkspaceMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
