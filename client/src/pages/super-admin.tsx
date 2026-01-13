import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Building2, Plus, Edit2, Shield, CheckCircle, XCircle } from "lucide-react";
import type { Tenant } from "@shared/schema";

export default function SuperAdminPage() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);

  const { data: tenants = [], isLoading } = useQuery<Tenant[]>({
    queryKey: ["/api/v1/super/tenants"],
  });

  const createTenantMutation = useMutation({
    mutationFn: async (data: { name: string; slug: string }) => {
      return apiRequest("POST", "/api/v1/super/tenants", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants"] });
      setIsCreateDialogOpen(false);
      toast({ title: "Tenant created successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create tenant", description: error.message, variant: "destructive" });
    },
  });

  const updateTenantMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name?: string; status?: string } }) => {
      return apiRequest("PATCH", `/api/v1/super/tenants/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants"] });
      setEditingTenant(null);
      toast({ title: "Tenant updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update tenant", description: error.message, variant: "destructive" });
    },
  });

  const handleCreateTenant = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const slug = formData.get("slug") as string;
    createTenantMutation.mutate({ name, slug });
  };

  const handleUpdateTenant = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingTenant) return;
    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const status = formData.get("status") as string;
    updateTenantMutation.mutate({ id: editingTenant.id, data: { name, status } });
  };

  const generateSlug = (name: string) => {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold">Super Admin</h1>
            <p className="text-sm text-muted-foreground">Manage all tenants in the system</p>
          </div>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-tenant">
              <Plus className="h-4 w-4 mr-2" />
              Create Tenant
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Tenant</DialogTitle>
              <DialogDescription>Add a new organization to the system</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateTenant} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Organization Name</Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="Acme Corporation"
                  data-testid="input-tenant-name"
                  required
                  onChange={(e) => {
                    const slugInput = document.getElementById("slug") as HTMLInputElement;
                    if (slugInput) {
                      slugInput.value = generateSlug(e.target.value);
                    }
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">URL Slug</Label>
                <Input
                  id="slug"
                  name="slug"
                  placeholder="acme-corp"
                  data-testid="input-tenant-slug"
                  required
                  pattern="[a-z0-9-]+"
                />
                <p className="text-xs text-muted-foreground">Lowercase letters, numbers, and hyphens only</p>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createTenantMutation.isPending} data-testid="button-submit-tenant">
                  {createTenantMutation.isPending ? "Creating..." : "Create Tenant"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Tenants
          </CardTitle>
          <CardDescription>All organizations registered in the system</CardDescription>
        </CardHeader>
        <CardContent>
          {tenants.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No tenants found. Create your first tenant to get started.
            </div>
          ) : (
            <div className="space-y-3">
              {tenants.map((tenant) => (
                <div
                  key={tenant.id}
                  className="flex items-center justify-between p-4 rounded-lg border bg-card hover-elevate"
                  data-testid={`tenant-row-${tenant.id}`}
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="font-medium">{tenant.name}</div>
                      <div className="text-sm text-muted-foreground">/{tenant.slug}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={tenant.status === "active" ? "default" : "secondary"}>
                      {tenant.status === "active" ? (
                        <CheckCircle className="h-3 w-3 mr-1" />
                      ) : (
                        <XCircle className="h-3 w-3 mr-1" />
                      )}
                      {tenant.status}
                    </Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setEditingTenant(tenant)}
                      data-testid={`button-edit-tenant-${tenant.id}`}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editingTenant} onOpenChange={(open) => !open && setEditingTenant(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Tenant</DialogTitle>
            <DialogDescription>Update tenant information</DialogDescription>
          </DialogHeader>
          {editingTenant && (
            <form onSubmit={handleUpdateTenant} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Organization Name</Label>
                <Input
                  id="edit-name"
                  name="name"
                  defaultValue={editingTenant.name}
                  data-testid="input-edit-tenant-name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-status">Status</Label>
                <Select name="status" defaultValue={editingTenant.status}>
                  <SelectTrigger data-testid="select-tenant-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="text-sm text-muted-foreground">
                <strong>Slug:</strong> {editingTenant.slug} (cannot be changed)
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingTenant(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateTenantMutation.isPending} data-testid="button-update-tenant">
                  {updateTenantMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
