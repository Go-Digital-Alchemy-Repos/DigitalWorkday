import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Plus,
  Loader2,
  Check,
  X,
  Briefcase,
  Edit2,
  Trash2,
} from "lucide-react";
import type { TenantWithDetails, Workspace } from "./types";

interface TenantDrawerWorkspacesProps {
  activeTenant: TenantWithDetails;
  open: boolean;
}

export function TenantDrawerWorkspaces({ activeTenant, open }: TenantDrawerWorkspacesProps) {
  const { toast } = useToast();
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
  const [editingWorkspaceName, setEditingWorkspaceName] = useState("");

  const { data: workspaces = [], isLoading: workspacesLoading } = useQuery<Workspace[]>({
    queryKey: ["/api/v1/super/tenants", activeTenant.id, "workspaces"],
    queryFn: () => fetch(`/api/v1/super/tenants/${activeTenant.id}/workspaces`, { credentials: "include" }).then(r => r.json()),
    enabled: !!activeTenant.id && open,
  });

  const createWorkspaceMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${activeTenant.id}/workspaces`, { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant.id, "workspaces"] });
      setNewWorkspaceName("");
      toast({ title: "Workspace created" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create workspace", description: error.message, variant: "destructive" });
    },
  });

  const updateWorkspaceMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await apiRequest("PATCH", `/api/v1/super/tenants/${activeTenant.id}/workspaces/${id}`, { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant.id, "workspaces"] });
      setEditingWorkspaceId(null);
      toast({ title: "Workspace updated" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update workspace", description: error.message, variant: "destructive" });
    },
  });

  const deleteWorkspaceMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/v1/super/tenants/${activeTenant.id}/workspaces/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant.id, "workspaces"] });
      toast({ title: "Workspace deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete workspace", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6 mt-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Create Workspace
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Workspace name"
              value={newWorkspaceName}
              onChange={(e) => setNewWorkspaceName(e.target.value)}
              data-testid="input-new-workspace-name"
            />
            <Button
              onClick={() => createWorkspaceMutation.mutate(newWorkspaceName)}
              disabled={!newWorkspaceName.trim() || createWorkspaceMutation.isPending}
              data-testid="button-create-workspace"
            >
              {createWorkspaceMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Briefcase className="h-4 w-4" />
            Workspaces
          </CardTitle>
          <CardDescription>Workspaces belonging to this tenant</CardDescription>
        </CardHeader>
        <CardContent>
          {workspacesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : workspaces.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No workspaces found. Create one above.
            </div>
          ) : (
            <div className="space-y-3">
              {workspaces.map((workspace) => (
                <div
                  key={workspace.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                  data-testid={`workspace-row-${workspace.id}`}
                >
                  {editingWorkspaceId === workspace.id ? (
                    <div className="flex items-center gap-2 flex-1">
                      <Input
                        value={editingWorkspaceName}
                        onChange={(e) => setEditingWorkspaceName(e.target.value)}
                        className="flex-1"
                        data-testid={`input-edit-workspace-${workspace.id}`}
                      />
                      <Button
                        size="sm"
                        onClick={() => updateWorkspaceMutation.mutate({ id: workspace.id, name: editingWorkspaceName })}
                        disabled={updateWorkspaceMutation.isPending}
                        data-testid={`button-save-workspace-${workspace.id}`}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingWorkspaceId(null)}
                        data-testid={`button-cancel-edit-workspace-${workspace.id}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <Briefcase className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium">{workspace.name}</div>
                          <div className="text-xs text-muted-foreground">{workspace.id}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {workspace.isPrimary && (
                          <Badge variant="secondary">Primary</Badge>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setEditingWorkspaceId(workspace.id);
                            setEditingWorkspaceName(workspace.name);
                          }}
                          data-testid={`button-edit-workspace-${workspace.id}`}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        {!workspace.isPrimary && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => deleteWorkspaceMutation.mutate(workspace.id)}
                            disabled={deleteWorkspaceMutation.isPending}
                            data-testid={`button-delete-workspace-${workspace.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
