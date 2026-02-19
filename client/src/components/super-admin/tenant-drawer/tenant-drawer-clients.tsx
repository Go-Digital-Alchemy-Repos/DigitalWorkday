import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Plus,
  Loader2,
  Search,
  Trash2,
} from "lucide-react";
import { CsvImportPanel } from "@/components/common/csv-import-panel";
import { FixClientTenantIdsCard } from "./shared-components";
import type { TenantWithDetails, TenantClient } from "./types";

interface TenantDrawerClientsProps {
  activeTenant: TenantWithDetails;
  open: boolean;
}

export function TenantDrawerClients({ activeTenant, open }: TenantDrawerClientsProps) {
  const { toast } = useToast();
  const [newClientName, setNewClientName] = useState("");
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [clientSearch, setClientSearch] = useState("");

  const { data: clientsResponse, isLoading: clientsLoading } = useQuery<{ clients: TenantClient[]; total: number }>({
    queryKey: ["/api/v1/super/tenants", activeTenant.id, "clients", clientSearch],
    queryFn: () => fetch(`/api/v1/super/tenants/${activeTenant.id}/clients?search=${encodeURIComponent(clientSearch)}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!activeTenant.id && open,
  });

  const createClientMutation = useMutation({
    mutationFn: async (companyName: string) => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${activeTenant.id}/clients`, { companyName });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant.id, "clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant.id, "clients-all"] });
      setNewClientName("");
      setShowCreateClient(false);
      toast({ title: "Client created" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create client", description: error.message, variant: "destructive" });
    },
  });

  const deleteClientMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/v1/super/tenants/${activeTenant.id}/clients/${id}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete client");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant.id, "clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant.id, "clients-all"] });
      toast({ title: "Client deleted" });
    },
    onError: (error: any) => {
      const message = error.message || "Failed to delete client";
      const description = message.includes("foreign key") || message.includes("constraint") || message.includes("referenced")
        ? "This client has projects or other data. Delete those first."
        : message;
      toast({ title: "Failed to delete client", description, variant: "destructive" });
    },
  });

  const bulkClientsImportMutation = useMutation({
    mutationFn: async (data: { clients: any[]; options: Record<string, any> }) => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${activeTenant.id}/clients/bulk-import`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant.id, "clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant.id, "clients-all"] });
    },
    onError: (error: any) => {
      toast({ title: "Bulk import failed", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6 mt-6">
      {activeTenant?.id && (
        <FixClientTenantIdsCard tenantId={activeTenant.id} tenantName={activeTenant?.name || "this tenant"} />
      )}
      
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Clients</CardTitle>
              <CardDescription>Manage clients for this tenant</CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() => setShowCreateClient(!showCreateClient)}
              data-testid="button-toggle-create-client"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Client
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {showCreateClient && (
            <div className="p-4 border rounded-lg space-y-3">
              <div className="space-y-2">
                <Label htmlFor="new-client-name">Company Name</Label>
                <Input
                  id="new-client-name"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder="Client company name"
                  data-testid="input-new-client-name"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowCreateClient(false)} data-testid="button-cancel-create-client">Cancel</Button>
                <Button
                  onClick={() => createClientMutation.mutate(newClientName)}
                  disabled={!newClientName.trim() || createClientMutation.isPending}
                  data-testid="button-create-client"
                >
                  {createClientMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create Client
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search clients..."
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                className="pl-9"
                data-testid="input-client-search"
              />
            </div>
          </div>

          {clientsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : clientsResponse?.clients && clientsResponse.clients.length > 0 ? (
            <div className="border rounded-md max-h-64 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background border-b">
                  <tr>
                    <th className="text-left p-2">Company Name</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Created</th>
                    <th className="text-left p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {clientsResponse.clients.map((client) => (
                    <tr key={client.id} className="border-b last:border-0 hover:bg-muted/50" data-testid={`client-row-${client.id}`}>
                      <td className="p-2 font-medium">{client.companyName}</td>
                      <td className="p-2">
                        <Badge variant={client.status === "active" ? "default" : "secondary"}>
                          {client.status}
                        </Badge>
                      </td>
                      <td className="p-2 text-muted-foreground text-xs">
                        {new Date(client.createdAt).toLocaleDateString()}
                      </td>
                      <td className="p-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteClientMutation.mutate(client.id)}
                          disabled={deleteClientMutation.isPending}
                          data-testid={`button-delete-client-${client.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No clients found. Create one above or import clients below.
            </div>
          )}
        </CardContent>
      </Card>

      <CsvImportPanel
        title="Bulk Import Clients"
        description="Import multiple clients from a CSV file"
        columns={[
          { key: "companyName", label: "Company Name", required: true },
          { key: "displayName", label: "Display Name" },
          { key: "industry", label: "Industry" },
          { key: "website", label: "Website" },
          { key: "email", label: "Email" },
          { key: "phone", label: "Phone" },
        ]}
        templateFilename="clients_template.csv"
        onImport={async (rows, options) => {
          const result = await bulkClientsImportMutation.mutateAsync({
            clients: rows,
            options,
          });
          return {
            created: result.created,
            skipped: result.skipped,
            errors: result.errors,
            results: result.results.map((r: any) => ({
              name: r.companyName,
              status: r.status,
              reason: r.reason,
              id: r.clientId,
            })),
          };
        }}
        isImporting={bulkClientsImportMutation.isPending}
        nameField="companyName"
      />
    </div>
  );
}
