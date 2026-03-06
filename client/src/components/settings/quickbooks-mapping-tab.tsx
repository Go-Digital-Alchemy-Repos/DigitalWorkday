import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Link2,
  Unlink,
  Lock,
  Unlock,
  RefreshCw,
  Plus,
  Search,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ExternalLink,
  MoreHorizontal,
  Zap,
  Users,
  LinkIcon,
  HelpCircle,
} from "lucide-react";
import { SiQuickbooks } from "react-icons/si";
import { useFeatureFlags } from "@/hooks/use-feature-flags";

interface ConnectionStatus {
  connected: boolean;
  realmId?: string;
  companyName?: string;
  connectedAt?: string;
  tokenExpired?: boolean;
}

interface MappingItem {
  id: string;
  clientId: string;
  clientName: string;
  quickbooksCustomerId: string | null;
  quickbooksDisplayName: string | null;
  mappingStatus: string;
  mappingMethod: string | null;
  mappingConfidence: string | null;
  isLocked: boolean;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
}

interface QBOCustomer {
  id: string;
  displayName: string;
  companyName?: string;
  primaryEmail?: string;
  active: boolean;
}

interface MappingSuggestion {
  quickbooksCustomerId: string;
  displayName: string;
  confidence: number;
  reasons: string[];
  matchedFields: { name: boolean; email: boolean; phone: boolean };
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "mapped":
      return <Badge variant="default" className="bg-green-600 text-white" data-testid="badge-status-mapped"><CheckCircle2 className="h-3 w-3 mr-1" />Mapped</Badge>;
    case "suggested":
      return <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" data-testid="badge-status-suggested"><Zap className="h-3 w-3 mr-1" />Suggested</Badge>;
    case "sync_error":
      return <Badge variant="destructive" data-testid="badge-status-error"><XCircle className="h-3 w-3 mr-1" />Sync Error</Badge>;
    case "archived":
      return <Badge variant="outline" data-testid="badge-status-archived">Archived</Badge>;
    default:
      return <Badge variant="outline" className="text-muted-foreground" data-testid="badge-status-unmapped"><HelpCircle className="h-3 w-3 mr-1" />Unmapped</Badge>;
  }
}

function MethodLabel({ method }: { method: string | null }) {
  if (!method) return <span className="text-xs text-muted-foreground">—</span>;
  const labels: Record<string, string> = {
    manual: "Manual",
    exact_name: "Name Match",
    email_match: "Email Match",
    created_from_dw: "Created from DW",
    imported_from_qbo: "Imported from QBO",
    reviewed_suggestion: "Reviewed",
  };
  return <span className="text-xs text-muted-foreground">{labels[method] || method}</span>;
}

export function QuickBooksMappingTab() {
  const { toast } = useToast();
  const flags = useFeatureFlags();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedClientName, setSelectedClientName] = useState("");
  const [qbSearch, setQbSearch] = useState("");

  const connectionQuery = useQuery<ConnectionStatus>({
    queryKey: ["/api/integrations/quickbooks/status"],
    enabled: flags.enableQuickbooksSync,
  });

  const mappingsQuery = useQuery<{ mappings: MappingItem[]; total: number }>({
    queryKey: ["/api/integrations/quickbooks/client-mappings", { status: statusFilter !== "all" ? statusFilter : undefined, search: search || undefined }],
    enabled: flags.enableQuickbooksClientMapping && connectionQuery.data?.connected === true,
  });

  const qbCustomersQuery = useQuery<{ customers: QBOCustomer[]; totalCount: number }>({
    queryKey: ["/api/integrations/quickbooks/customers", { search: qbSearch || undefined }],
    enabled: linkDialogOpen && connectionQuery.data?.connected === true,
  });

  const suggestionsQuery = useQuery<{ suggestions: MappingSuggestion[] }>({
    queryKey: ["/api/integrations/quickbooks/client-mappings", selectedClientId!, "suggestions"],
    enabled: !!selectedClientId && linkDialogOpen && flags.enableQuickbooksMappingSuggestions,
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("GET", "/api/integrations/quickbooks/connect");
      const data = await res.json();
      window.open(data.authUrl, "_blank", "width=600,height=700");
    },
    onError: (err: any) => toast({ title: "Connection failed", description: err.message, variant: "destructive" }),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/integrations/quickbooks/disconnect"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/quickbooks"] });
      toast({ title: "Disconnected from QuickBooks" });
    },
  });

  const linkMutation = useMutation({
    mutationFn: (params: { clientId: string; quickbooksCustomerId: string; quickbooksDisplayName: string }) =>
      apiRequest("POST", `/api/integrations/quickbooks/client-mappings/${params.clientId}/link`, {
        quickbooksCustomerId: params.quickbooksCustomerId,
        quickbooksDisplayName: params.quickbooksDisplayName,
        method: "manual",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/quickbooks/client-mappings"] });
      setLinkDialogOpen(false);
      toast({ title: "Client linked to QuickBooks customer" });
    },
    onError: (err: any) => toast({ title: "Link failed", description: err.message, variant: "destructive" }),
  });

  const unlinkMutation = useMutation({
    mutationFn: (clientId: string) =>
      apiRequest("POST", `/api/integrations/quickbooks/client-mappings/${clientId}/unlink`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/quickbooks/client-mappings"] });
      toast({ title: "Client unlinked" });
    },
    onError: (err: any) => toast({ title: "Unlink failed", description: err.message, variant: "destructive" }),
  });

  const lockMutation = useMutation({
    mutationFn: (params: { clientId: string; locked: boolean }) =>
      apiRequest("POST", `/api/integrations/quickbooks/client-mappings/${params.clientId}/lock`, { locked: params.locked }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/quickbooks/client-mappings"] });
    },
  });

  const createCustomerMutation = useMutation({
    mutationFn: (clientId: string) =>
      apiRequest("POST", `/api/integrations/quickbooks/client-mappings/${clientId}/create-customer`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/quickbooks/client-mappings"] });
      toast({ title: "Customer created in QuickBooks and linked" });
    },
    onError: (err: any) => toast({ title: "Create failed", description: err.message, variant: "destructive" }),
  });

  const syncMutation = useMutation({
    mutationFn: (clientId: string) =>
      apiRequest("POST", `/api/integrations/quickbooks/client-mappings/${clientId}/sync-update`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/quickbooks/client-mappings"] });
      toast({ title: "Sync completed" });
    },
    onError: (err: any) => toast({ title: "Sync failed", description: err.message, variant: "destructive" }),
  });

  const connection = connectionQuery.data;
  const mappings = mappingsQuery.data?.mappings || [];
  const total = mappingsQuery.data?.total || 0;

  const mapped = mappings.filter(m => m.mappingStatus === "mapped").length;
  const unmapped = mappings.filter(m => m.mappingStatus === "unmapped").length;
  const suggested = mappings.filter(m => m.mappingStatus === "suggested").length;
  const errors = mappings.filter(m => m.mappingStatus === "sync_error").length;

  function openLinkDialog(clientId: string, clientName: string) {
    setSelectedClientId(clientId);
    setSelectedClientName(clientName);
    setQbSearch("");
    setLinkDialogOpen(true);
  }

  return (
    <div className="space-y-6">
      <Card data-testid="card-qb-connection">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <SiQuickbooks className="h-8 w-8 text-green-600" />
              <div>
                <CardTitle className="text-base">QuickBooks Online</CardTitle>
                <CardDescription>
                  {connection?.connected
                    ? `Connected to ${connection.companyName || connection.realmId || "QuickBooks"}`
                    : "Connect your QuickBooks account to sync clients and billing"}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {connection?.connected ? (
                <>
                  <Badge variant="default" className="bg-green-600" data-testid="badge-qb-connected">
                    <CheckCircle2 className="h-3 w-3 mr-1" />Connected
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => disconnectMutation.mutate()}
                    disabled={disconnectMutation.isPending}
                    data-testid="button-qb-disconnect"
                  >
                    {disconnectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Disconnect"}
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => connectMutation.mutate()}
                  disabled={connectMutation.isPending}
                  data-testid="button-qb-connect"
                >
                  {connectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ExternalLink className="h-4 w-4 mr-2" />}
                  Connect QuickBooks
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        {connection?.tokenExpired && (
          <CardContent className="pt-0">
            <div className="flex items-center gap-2 text-amber-600 text-sm">
              <AlertTriangle className="h-4 w-4" />
              <span>Your QuickBooks token has expired. Please reconnect.</span>
            </div>
          </CardContent>
        )}
      </Card>

      {connection?.connected && flags.enableQuickbooksClientMapping && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card className="p-3" data-testid="card-qb-total">
              <div className="text-2xl font-bold tabular-nums">{total}</div>
              <div className="text-xs text-muted-foreground">Total Clients</div>
            </Card>
            <Card className="p-3" data-testid="card-qb-mapped">
              <div className="text-2xl font-bold tabular-nums text-green-600">{mapped}</div>
              <div className="text-xs text-muted-foreground">Mapped</div>
            </Card>
            <Card className="p-3" data-testid="card-qb-unmapped">
              <div className="text-2xl font-bold tabular-nums">{unmapped}</div>
              <div className="text-xs text-muted-foreground">Unmapped</div>
            </Card>
            <Card className="p-3" data-testid="card-qb-suggested">
              <div className="text-2xl font-bold tabular-nums text-blue-600">{suggested}</div>
              <div className="text-xs text-muted-foreground">Suggested</div>
            </Card>
            <Card className="p-3" data-testid="card-qb-errors">
              <div className="text-2xl font-bold tabular-nums text-red-600">{errors}</div>
              <div className="text-xs text-muted-foreground">Sync Errors</div>
            </Card>
          </div>

          <Card data-testid="card-qb-mappings">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Client Mappings
                </CardTitle>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search clients..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="h-8 w-48 pl-8"
                      data-testid="input-qb-search"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-8 w-32" data-testid="select-qb-status-filter">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="mapped">Mapped</SelectItem>
                      <SelectItem value="unmapped">Unmapped</SelectItem>
                      <SelectItem value="suggested">Suggested</SelectItem>
                      <SelectItem value="sync_error">Sync Error</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {mappingsQuery.isLoading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : mappings.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <LinkIcon className="h-8 w-8 mb-3 opacity-30" />
                  <p className="text-sm font-medium">No client mappings found</p>
                  <p className="text-xs mt-1">Your clients will appear here for mapping</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-qb-mappings">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Client</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">QB Customer</th>
                        <th className="px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                        <th className="px-4 py-2.5 font-medium text-muted-foreground hidden lg:table-cell">Method</th>
                        <th className="px-4 py-2.5 font-medium text-muted-foreground hidden lg:table-cell">Last Synced</th>
                        <th className="px-4 py-2.5 w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {mappings.map((mapping) => (
                        <tr
                          key={mapping.clientId}
                          className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                          data-testid={`row-qb-mapping-${mapping.clientId}`}
                        >
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="font-medium" data-testid={`text-qb-client-${mapping.clientId}`}>{mapping.clientName}</span>
                              {mapping.isLocked && <Lock className="h-3 w-3 text-muted-foreground" />}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell">
                            {mapping.quickbooksDisplayName || <span className="opacity-50">—</span>}
                          </td>
                          <td className="px-4 py-2.5">
                            <StatusBadge status={mapping.mappingStatus} />
                          </td>
                          <td className="px-4 py-2.5 hidden lg:table-cell">
                            <MethodLabel method={mapping.mappingMethod} />
                          </td>
                          <td className="px-4 py-2.5 hidden lg:table-cell text-xs text-muted-foreground">
                            {mapping.lastSyncedAt
                              ? new Date(mapping.lastSyncedAt).toLocaleDateString()
                              : "—"}
                          </td>
                          <td className="px-4 py-2.5">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7" data-testid={`button-qb-actions-${mapping.clientId}`}>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {mapping.mappingStatus !== "mapped" && (
                                  <DropdownMenuItem
                                    onClick={() => openLinkDialog(mapping.clientId, mapping.clientName)}
                                    data-testid={`action-link-${mapping.clientId}`}
                                  >
                                    <Link2 className="h-4 w-4 mr-2" />
                                    Find Match
                                  </DropdownMenuItem>
                                )}
                                {mapping.mappingStatus !== "mapped" && flags.enableQuickbooksCustomerImport && (
                                  <DropdownMenuItem
                                    onClick={() => createCustomerMutation.mutate(mapping.clientId)}
                                    data-testid={`action-create-${mapping.clientId}`}
                                  >
                                    <Plus className="h-4 w-4 mr-2" />
                                    Create in QuickBooks
                                  </DropdownMenuItem>
                                )}
                                {mapping.mappingStatus === "mapped" && (
                                  <>
                                    <DropdownMenuItem
                                      onClick={() => syncMutation.mutate(mapping.clientId)}
                                      data-testid={`action-sync-${mapping.clientId}`}
                                    >
                                      <RefreshCw className="h-4 w-4 mr-2" />
                                      Sync Update
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => unlinkMutation.mutate(mapping.clientId)}
                                      data-testid={`action-unlink-${mapping.clientId}`}
                                    >
                                      <Unlink className="h-4 w-4 mr-2" />
                                      Unlink
                                    </DropdownMenuItem>
                                  </>
                                )}
                                <DropdownMenuItem
                                  onClick={() => lockMutation.mutate({
                                    clientId: mapping.clientId,
                                    locked: !mapping.isLocked,
                                  })}
                                  data-testid={`action-lock-${mapping.clientId}`}
                                >
                                  {mapping.isLocked ? (
                                    <><Unlock className="h-4 w-4 mr-2" />Unlock</>
                                  ) : (
                                    <><Lock className="h-4 w-4 mr-2" />Lock</>
                                  )}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="max-w-lg" data-testid="dialog-qb-link">
          <DialogHeader>
            <DialogTitle>Link to QuickBooks Customer</DialogTitle>
            <DialogDescription>
              Choose a QuickBooks customer to link with <strong>{selectedClientName}</strong>
            </DialogDescription>
          </DialogHeader>

          {flags.enableQuickbooksMappingSuggestions && suggestionsQuery.data?.suggestions && suggestionsQuery.data.suggestions.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-foreground">Suggested Matches</h4>
              {suggestionsQuery.data.suggestions.map((s) => (
                <div
                  key={s.quickbooksCustomerId}
                  className="flex items-center justify-between p-2.5 border rounded-md hover:bg-muted/50 transition-colors"
                  data-testid={`suggestion-${s.quickbooksCustomerId}`}
                >
                  <div>
                    <div className="text-sm font-medium">{s.displayName}</div>
                    <div className="text-xs text-muted-foreground">
                      {Math.round(s.confidence * 100)}% confidence — {s.reasons.join(", ")}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!selectedClientId) return;
                      linkMutation.mutate({
                        clientId: selectedClientId,
                        quickbooksCustomerId: s.quickbooksCustomerId,
                        quickbooksDisplayName: s.displayName,
                      });
                    }}
                    disabled={linkMutation.isPending}
                    data-testid={`button-link-suggestion-${s.quickbooksCustomerId}`}
                  >
                    Link
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <h4 className="text-sm font-medium text-foreground">Browse QuickBooks Customers</h4>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search QuickBooks customers..."
                value={qbSearch}
                onChange={(e) => setQbSearch(e.target.value)}
                className="pl-8"
                data-testid="input-qb-customer-search"
              />
            </div>
            <div className="max-h-60 overflow-y-auto space-y-1">
              {qbCustomersQuery.isLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : qbCustomersQuery.data?.customers?.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {qbSearch ? "No customers found" : "No QuickBooks customers available"}
                </p>
              ) : (
                qbCustomersQuery.data?.customers?.map((customer) => (
                  <div
                    key={customer.id}
                    className="flex items-center justify-between p-2 border rounded-md hover:bg-muted/50 transition-colors"
                    data-testid={`qb-customer-${customer.id}`}
                  >
                    <div>
                      <div className="text-sm font-medium">{customer.displayName}</div>
                      {customer.primaryEmail && (
                        <div className="text-xs text-muted-foreground">{customer.primaryEmail}</div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (!selectedClientId) return;
                        linkMutation.mutate({
                          clientId: selectedClientId,
                          quickbooksCustomerId: customer.id,
                          quickbooksDisplayName: customer.displayName,
                        });
                      }}
                      disabled={linkMutation.isPending}
                      data-testid={`button-link-customer-${customer.id}`}
                    >
                      Link
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)} data-testid="button-cancel-link">
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
