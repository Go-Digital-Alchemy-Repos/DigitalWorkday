import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { Loader2, Activity, Database, Wifi, HardDrive, Mail, CheckCircle, XCircle, AlertCircle, RefreshCw, Building2, Wrench, ExternalLink, Search, Trash2, Archive, ArrowRight, Shield, FileWarning, Copy, ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface HealthCheck {
  database: { status: "healthy" | "unhealthy" | "unknown"; latencyMs?: number };
  websocket: { status: "healthy" | "unhealthy" | "unknown"; connections?: number };
  s3: { status: "healthy" | "unhealthy" | "not_configured" };
  mailgun: { status: "healthy" | "unhealthy" | "not_configured" };
  app: { version?: string; uptime?: number; environment?: string };
}

interface TenancyHealth {
  currentMode: string;
  totalMissing: number;
  totalQuarantined: number;
  activeTenantCount: number;
  missingByTable: Record<string, number>;
  quarantinedByTable: Record<string, number>;
  hasQuarantineTenant: boolean;
  warningStats: {
    last24Hours: number;
    last7Days: number;
    total: number;
  };
}

interface QuarantineSummary {
  hasQuarantineTenant: boolean;
  quarantineTenantId?: string;
  counts: Record<string, number>;
  message?: string;
}

interface QuarantineListResponse {
  rows: any[];
  total: number;
  page: number;
  limit: number;
  table: string;
}

interface TenantIdScan {
  missing: Record<string, number>;
  totalMissing: number;
  quarantineTenantId: string | null;
  backfillAllowed: boolean;
  notes: string[];
}

interface BackfillResult {
  mode: string;
  updated: Record<string, number>;
  quarantined: Record<string, number>;
  ambiguousSamples: Record<string, string[]>;
  quarantineTenantId?: string;
}

interface IntegrityIssue {
  code: string;
  severity: "info" | "warn" | "blocker";
  count: number;
  sampleIds: string[];
  description: string;
}

interface IntegrityChecksResponse {
  issues: IntegrityIssue[];
  totalIssues: number;
  blockerCount: number;
  warnCount: number;
  infoCount: number;
  timestamp: string;
}

interface DebugConfig {
  flags: {
    SUPER_DEBUG_DELETE_ALLOWED: boolean;
    SUPER_DEBUG_ACTIONS_ALLOWED: boolean;
    BACKFILL_TENANT_IDS_ALLOWED: boolean;
    TENANCY_ENFORCEMENT: string;
  };
  confirmPhrases: Record<string, string>;
}

interface TenantPickerItem {
  id: string;
  name: string;
  status: string;
}

function StatusIcon({ status }: { status: "healthy" | "unhealthy" | "unknown" | "not_configured" }) {
  switch (status) {
    case "healthy":
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    case "unhealthy":
      return <XCircle className="h-5 w-5 text-red-500" />;
    case "not_configured":
      return <AlertCircle className="h-5 w-5 text-yellow-500" />;
    default:
      return <AlertCircle className="h-5 w-5 text-muted-foreground" />;
  }
}

function StatusBadge({ status }: { status: "healthy" | "unhealthy" | "unknown" | "not_configured" }) {
  const variants: Record<string, "default" | "destructive" | "outline" | "secondary"> = {
    healthy: "default",
    unhealthy: "destructive",
    not_configured: "outline",
    unknown: "secondary",
  };
  return <Badge variant={variants[status] || "secondary"}>{status.replace("_", " ")}</Badge>;
}

function DebugToolsPanel() {
  const { toast } = useToast();
  const [selectedTable, setSelectedTable] = useState<string>("projects");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [assignDialog, setAssignDialog] = useState<{ row: any; table: string } | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ row: any; table: string } | null>(null);
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [backfillResult, setBackfillResult] = useState<BackfillResult | null>(null);

  const { data: debugConfig, isLoading: configLoading } = useQuery<DebugConfig>({
    queryKey: ["/api/v1/super/debug/config"],
  });

  const { data: quarantineSummary, isLoading: summaryLoading, refetch: refetchSummary } = useQuery<QuarantineSummary>({
    queryKey: ["/api/v1/super/debug/quarantine/summary"],
  });

  const { data: quarantineList, isLoading: listLoading, refetch: refetchList } = useQuery<QuarantineListResponse>({
    queryKey: ["/api/v1/super/debug/quarantine/list", selectedTable, currentPage, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams({
        table: selectedTable,
        page: currentPage.toString(),
        limit: "20",
      });
      if (searchQuery) params.set("q", searchQuery);
      const res = await fetch(`/api/v1/super/debug/quarantine/list?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch quarantine list");
      return res.json();
    },
  });

  const { data: tenantIdScan, isLoading: scanLoading, refetch: refetchScan } = useQuery<TenantIdScan>({
    queryKey: ["/api/v1/super/debug/tenantid/scan"],
  });

  const { data: integrityChecks, isLoading: integrityLoading, refetch: refetchIntegrity } = useQuery<IntegrityChecksResponse>({
    queryKey: ["/api/v1/super/debug/integrity/checks"],
  });

  const { data: tenantsList } = useQuery<TenantPickerItem[]>({
    queryKey: ["/api/v1/super/tenants/picker"],
  });

  const assignMutation = useMutation({
    mutationFn: async (data: { table: string; id: string; assignTo: any }) => {
      return apiRequest("POST", "/api/v1/super/debug/quarantine/assign", data);
    },
    onSuccess: () => {
      toast({ title: "Row assigned successfully" });
      refetchSummary();
      refetchList();
      setAssignDialog(null);
      setSelectedTenantId("");
      setSelectedWorkspaceId("");
    },
    onError: (error: any) => {
      toast({ title: "Failed to assign", description: error.message, variant: "destructive" });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (data: { table: string; id: string }) => {
      return apiRequest("POST", "/api/v1/super/debug/quarantine/archive", data);
    },
    onSuccess: (data: any) => {
      toast({ title: data.message || "Action completed" });
      refetchSummary();
      refetchList();
    },
    onError: (error: any) => {
      toast({ title: "Failed to archive", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (data: { table: string; id: string; confirmPhrase: string }) => {
      return apiRequest("POST", "/api/v1/super/debug/quarantine/delete", data, {
        "X-Confirm-Delete": "DELETE_QUARANTINED_ROW",
      });
    },
    onSuccess: () => {
      toast({ title: "Row deleted permanently" });
      refetchSummary();
      refetchList();
      setDeleteDialog(null);
      setConfirmPhrase("");
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
    },
  });

  const backfillMutation = useMutation({
    mutationFn: async (mode: "dry_run" | "apply") => {
      const headers: Record<string, string> = {};
      if (mode === "apply") {
        headers["X-Confirm-Backfill"] = "APPLY_TENANTID_BACKFILL";
      }
      return apiRequest("POST", `/api/v1/super/debug/tenantid/backfill?mode=${mode}`, {}, headers);
    },
    onSuccess: (data: BackfillResult) => {
      setBackfillResult(data);
      toast({ title: `Backfill ${data.mode === "apply" ? "applied" : "simulated"} successfully` });
      refetchScan();
      refetchSummary();
    },
    onError: (error: any) => {
      toast({ title: "Backfill failed", description: error.message, variant: "destructive" });
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const totalPages = quarantineList ? Math.ceil(quarantineList.total / 20) : 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Debug Configuration
              </CardTitle>
              <CardDescription>Environment flags and confirmation phrases</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {configLoading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : debugConfig ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Environment Flags</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Delete Allowed:</span>
                    <Badge variant={debugConfig.flags.SUPER_DEBUG_DELETE_ALLOWED ? "default" : "secondary"}>
                      {debugConfig.flags.SUPER_DEBUG_DELETE_ALLOWED ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Debug Actions:</span>
                    <Badge variant={debugConfig.flags.SUPER_DEBUG_ACTIONS_ALLOWED ? "default" : "secondary"}>
                      {debugConfig.flags.SUPER_DEBUG_ACTIONS_ALLOWED ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Backfill Allowed:</span>
                    <Badge variant={debugConfig.flags.BACKFILL_TENANT_IDS_ALLOWED ? "default" : "secondary"}>
                      {debugConfig.flags.BACKFILL_TENANT_IDS_ALLOWED ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tenancy Mode:</span>
                    <Badge variant="outline">{debugConfig.flags.TENANCY_ENFORCEMENT}</Badge>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Required Confirmation Phrases</h4>
                <div className="space-y-1 text-sm font-mono">
                  {Object.entries(debugConfig.confirmPhrases).map(([key, value]) => (
                    <div key={key} className="flex justify-between items-center gap-2">
                      <span className="text-muted-foreground capitalize">{key}:</span>
                      <code className="bg-muted px-2 py-1 rounded text-xs">{value}</code>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Accordion type="multiple" defaultValue={["quarantine"]} className="space-y-4">
        <AccordionItem value="quarantine" className="border rounded-lg">
          <AccordionTrigger className="px-4 hover:no-underline">
            <div className="flex items-center gap-2">
              <Archive className="h-5 w-5" />
              <span className="font-semibold">Quarantine Manager</span>
              {quarantineSummary && (
                <Badge variant="secondary" className="ml-2">
                  {Object.values(quarantineSummary.counts).reduce((a, b) => a + b, 0)} rows
                </Badge>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            {summaryLoading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : quarantineSummary ? (
              <div className="space-y-4">
                {!quarantineSummary.hasQuarantineTenant ? (
                  <div className="p-4 border rounded-lg bg-muted/50 text-center">
                    <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">{quarantineSummary.message}</p>
                  </div>
                ) : (
                  <>
                    <div className="grid gap-2 md:grid-cols-4">
                      {Object.entries(quarantineSummary.counts).map(([table, count]) => (
                        <div 
                          key={table} 
                          className={`p-3 border rounded-lg cursor-pointer transition-colors ${selectedTable === table ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                          onClick={() => { setSelectedTable(table); setCurrentPage(1); }}
                          data-testid={`quarantine-table-${table}`}
                        >
                          <div className="text-sm text-muted-foreground capitalize">{table}</div>
                          <div className="text-2xl font-bold">{count}</div>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder={`Search ${selectedTable}...`}
                          value={searchQuery}
                          onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                          className="pl-10"
                          data-testid="input-quarantine-search"
                        />
                      </div>
                      <Button variant="outline" onClick={() => refetchList()} data-testid="button-refresh-quarantine">
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>

                    {listLoading ? (
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    ) : quarantineList && quarantineList.rows.length > 0 ? (
                      <div className="space-y-2">
                        <ScrollArea className="h-[300px] border rounded-lg">
                          <div className="p-2 space-y-2">
                            {quarantineList.rows.map((row) => (
                              <div key={row.id} className="p-3 border rounded-lg flex items-center justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium truncate">
                                    {row.name || row.title || row.email || row.id}
                                  </div>
                                  <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                                    <span className="font-mono">{row.id.slice(0, 8)}...</span>
                                    {row.createdAt && (
                                      <span>Created: {new Date(row.createdAt).toLocaleDateString()}</span>
                                    )}
                                    {row.status && <Badge variant="outline" className="text-xs">{row.status}</Badge>}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setAssignDialog({ row, table: selectedTable })}
                                    data-testid={`button-assign-${row.id}`}
                                  >
                                    <ArrowRight className="h-3 w-3 mr-1" />
                                    Assign
                                  </Button>
                                  {selectedTable === "users" && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => archiveMutation.mutate({ table: selectedTable, id: row.id })}
                                      disabled={archiveMutation.isPending}
                                      data-testid={`button-archive-${row.id}`}
                                    >
                                      <Archive className="h-3 w-3" />
                                    </Button>
                                  )}
                                  {debugConfig?.flags.SUPER_DEBUG_DELETE_ALLOWED && (
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => setDeleteDialog({ row, table: selectedTable })}
                                      data-testid={`button-delete-${row.id}`}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                        
                        {totalPages > 1 && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">
                              Page {currentPage} of {totalPages} ({quarantineList.total} total)
                            </span>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                              >
                                <ChevronLeft className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                              >
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        No quarantined {selectedTable} found
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : null}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="backfill" className="border rounded-lg">
          <AccordionTrigger className="px-4 hover:no-underline">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              <span className="font-semibold">TenantId Backfill Tools</span>
              {tenantIdScan && tenantIdScan.totalMissing > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {tenantIdScan.totalMissing} missing
                </Badge>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Missing TenantId Scan</h4>
                <Button variant="outline" size="sm" onClick={() => refetchScan()} disabled={scanLoading}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${scanLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>

              {scanLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : tenantIdScan ? (
                <>
                  <div className="grid gap-2 md:grid-cols-5">
                    {Object.entries(tenantIdScan.missing).map(([table, count]) => (
                      <div key={table} className="p-3 border rounded-lg">
                        <div className="text-sm text-muted-foreground capitalize">{table}</div>
                        <div className={`text-xl font-bold ${Number(count) > 0 ? "text-destructive" : "text-green-600"}`}>
                          {count}
                        </div>
                      </div>
                    ))}
                  </div>

                  {tenantIdScan.notes.length > 0 && (
                    <div className="p-3 border rounded-lg bg-muted/50 space-y-1">
                      {tenantIdScan.notes.map((note, i) => (
                        <p key={i} className="text-sm text-muted-foreground">{note}</p>
                      ))}
                    </div>
                  )}

                  <Separator />

                  <div className="flex items-center gap-4">
                    <Button
                      variant="outline"
                      onClick={() => backfillMutation.mutate("dry_run")}
                      disabled={backfillMutation.isPending}
                      data-testid="button-backfill-dryrun"
                    >
                      {backfillMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Dry Run
                    </Button>
                    <Button
                      variant="default"
                      onClick={() => backfillMutation.mutate("apply")}
                      disabled={backfillMutation.isPending || !tenantIdScan.backfillAllowed}
                      data-testid="button-backfill-apply"
                    >
                      {backfillMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Apply Backfill
                    </Button>
                    {!tenantIdScan.backfillAllowed && (
                      <span className="text-sm text-muted-foreground">
                        Set BACKFILL_TENANT_IDS_ALLOWED=true to enable
                      </span>
                    )}
                  </div>

                  {backfillResult && (
                    <div className="p-4 border rounded-lg space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">
                          Backfill Result ({backfillResult.mode === "apply" ? "Applied" : "Dry Run"})
                        </h4>
                        <Button size="sm" variant="ghost" onClick={() => copyToClipboard(JSON.stringify(backfillResult, null, 2))}>
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        <div>
                          <div className="text-sm font-medium text-green-600">Updated</div>
                          <div className="text-sm space-y-1">
                            {Object.entries(backfillResult.updated).map(([table, count]) => (
                              <div key={table} className="flex justify-between">
                                <span className="capitalize">{table}:</span>
                                <span>{count}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-yellow-600">Quarantined</div>
                          <div className="text-sm space-y-1">
                            {Object.entries(backfillResult.quarantined).map(([table, count]) => (
                              <div key={table} className="flex justify-between">
                                <span className="capitalize">{table}:</span>
                                <span>{count}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="integrity" className="border rounded-lg">
          <AccordionTrigger className="px-4 hover:no-underline">
            <div className="flex items-center gap-2">
              <FileWarning className="h-5 w-5" />
              <span className="font-semibold">Data Integrity Checks</span>
              {integrityChecks && integrityChecks.totalIssues > 0 && (
                <Badge variant={integrityChecks.blockerCount > 0 ? "destructive" : "secondary"} className="ml-2">
                  {integrityChecks.totalIssues} issues
                </Badge>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Read-only checks for cross-tenant mismatches and data issues
                </p>
                <Button variant="outline" size="sm" onClick={() => refetchIntegrity()} disabled={integrityLoading}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${integrityLoading ? "animate-spin" : ""}`} />
                  Run Checks
                </Button>
              </div>

              {integrityLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : integrityChecks ? (
                <>
                  <div className="grid gap-2 md:grid-cols-3">
                    <div className="p-3 border rounded-lg">
                      <div className="text-sm text-muted-foreground">Blockers</div>
                      <div className={`text-xl font-bold ${integrityChecks.blockerCount > 0 ? "text-destructive" : "text-green-600"}`}>
                        {integrityChecks.blockerCount}
                      </div>
                    </div>
                    <div className="p-3 border rounded-lg">
                      <div className="text-sm text-muted-foreground">Warnings</div>
                      <div className={`text-xl font-bold ${integrityChecks.warnCount > 0 ? "text-yellow-600" : "text-green-600"}`}>
                        {integrityChecks.warnCount}
                      </div>
                    </div>
                    <div className="p-3 border rounded-lg">
                      <div className="text-sm text-muted-foreground">Info</div>
                      <div className="text-xl font-bold">{integrityChecks.infoCount}</div>
                    </div>
                  </div>

                  {integrityChecks.issues.length > 0 ? (
                    <div className="space-y-2">
                      {integrityChecks.issues.map((issue, i) => (
                        <div key={i} className="p-3 border rounded-lg">
                          <div className="flex items-center justify-between mb-1">
                            <code className="text-sm font-medium">{issue.code}</code>
                            <Badge variant={issue.severity === "blocker" ? "destructive" : issue.severity === "warn" ? "secondary" : "outline"}>
                              {issue.severity} ({issue.count})
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{issue.description}</p>
                          {issue.sampleIds.length > 0 && (
                            <div className="mt-2 text-xs font-mono text-muted-foreground">
                              Sample IDs: {issue.sampleIds.slice(0, 3).join(", ")}
                              {issue.sampleIds.length > 3 && "..."}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-green-600">
                      <CheckCircle className="h-8 w-8 mx-auto mb-2" />
                      No integrity issues found
                    </div>
                  )}

                  <div className="text-xs text-muted-foreground text-right">
                    Last checked: {new Date(integrityChecks.timestamp).toLocaleString()}
                  </div>
                </>
              ) : null}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Dialog open={!!assignDialog} onOpenChange={() => { setAssignDialog(null); setSelectedTenantId(""); setSelectedWorkspaceId(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign to Tenant</DialogTitle>
            <DialogDescription>
              Move this {assignDialog?.table?.slice(0, -1)} out of quarantine to a valid tenant
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Target Tenant</Label>
              <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
                <SelectTrigger data-testid="select-target-tenant">
                  <SelectValue placeholder="Select tenant" />
                </SelectTrigger>
                <SelectContent>
                  {tenantsList?.filter(t => t.status === "active").map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>{tenant.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialog(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (assignDialog && selectedTenantId) {
                  assignMutation.mutate({
                    table: assignDialog.table,
                    id: assignDialog.row.id,
                    assignTo: { tenantId: selectedTenantId },
                  });
                }
              }}
              disabled={!selectedTenantId || assignMutation.isPending}
              data-testid="button-confirm-assign"
            >
              {assignMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteDialog} onOpenChange={() => { setDeleteDialog(null); setConfirmPhrase(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Permanently Delete</DialogTitle>
            <DialogDescription>
              This action cannot be undone. Type the confirmation phrase to delete this {deleteDialog?.table?.slice(0, -1)}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 border rounded-lg bg-muted/50">
              <div className="font-medium">{deleteDialog?.row?.name || deleteDialog?.row?.title || deleteDialog?.row?.email}</div>
              <div className="text-xs font-mono text-muted-foreground">{deleteDialog?.row?.id}</div>
            </div>
            <div className="space-y-2">
              <Label>Type DELETE_QUARANTINED_ROW to confirm</Label>
              <Input
                value={confirmPhrase}
                onChange={(e) => setConfirmPhrase(e.target.value)}
                placeholder="DELETE_QUARANTINED_ROW"
                data-testid="input-delete-confirm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteDialog && confirmPhrase === "DELETE_QUARANTINED_ROW") {
                  deleteMutation.mutate({
                    table: deleteDialog.table,
                    id: deleteDialog.row.id,
                    confirmPhrase,
                  });
                }
              }}
              disabled={confirmPhrase !== "DELETE_QUARANTINED_ROW" || deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function SuperAdminStatusPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("health");
  const [confirmDialog, setConfirmDialog] = useState<{ action: string; title: string; description: string } | null>(null);
  const [confirmPhrase, setConfirmPhrase] = useState("");

  if (user?.role !== "super_user") {
    return <Redirect to="/" />;
  }

  const { data: healthData, isLoading: healthLoading, refetch: refetchHealth } = useQuery<HealthCheck>({
    queryKey: ["/api/v1/super/status/health"],
    refetchInterval: 30000,
  });

  const { data: tenancyHealth, isLoading: tenancyLoading, refetch: refetchTenancy } = useQuery<TenancyHealth>({
    queryKey: ["/api/v1/super/tenancy/health"],
    enabled: activeTab === "tenant-health",
  });

  const runCheckMutation = useMutation({
    mutationFn: async (checkType: string) => {
      return apiRequest("POST", `/api/v1/super/status/checks/${checkType}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/status/health"] });
      toast({ title: "Check completed successfully" });
      setConfirmDialog(null);
      setConfirmPhrase("");
    },
    onError: (error: any) => {
      toast({ title: "Check failed", description: error.message, variant: "destructive" });
    },
  });

  const handleDebugAction = (action: string) => {
    if (confirmPhrase !== "CONFIRM") {
      toast({ title: "Please type CONFIRM to proceed", variant: "destructive" });
      return;
    }
    runCheckMutation.mutate(action);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-6 border-b shrink-0">
        <h1 className="text-2xl font-bold">System Status</h1>
        <p className="text-muted-foreground mt-1">Health checks, logs, and debugging tools</p>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6" data-testid="status-tabs">
            <TabsTrigger value="health" data-testid="tab-health">
              <Activity className="h-4 w-4 mr-2" />
              System Health
            </TabsTrigger>
            <TabsTrigger value="tenant-health" data-testid="tab-tenant-health">
              <Building2 className="h-4 w-4 mr-2" />
              Tenant Health
            </TabsTrigger>
            <TabsTrigger value="logs" data-testid="tab-logs">
              <ExternalLink className="h-4 w-4 mr-2" />
              Logs
            </TabsTrigger>
            <TabsTrigger value="debug" data-testid="tab-debug">
              <Wrench className="h-4 w-4 mr-2" />
              Debug Tools
            </TabsTrigger>
          </TabsList>

          <TabsContent value="health">
            <div className="space-y-6">
              <div className="flex justify-end">
                <Button 
                  variant="outline" 
                  onClick={() => refetchHealth()}
                  disabled={healthLoading}
                  data-testid="button-refresh-health"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${healthLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
              
              {healthLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : healthData ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                      <div className="flex items-center gap-2">
                        <Database className="h-5 w-5 text-muted-foreground" />
                        <CardTitle className="text-sm font-medium">Database</CardTitle>
                      </div>
                      <StatusIcon status={healthData.database.status} />
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <StatusBadge status={healthData.database.status} />
                        {healthData.database.latencyMs && (
                          <span className="text-sm text-muted-foreground">
                            {healthData.database.latencyMs}ms
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                      <div className="flex items-center gap-2">
                        <Wifi className="h-5 w-5 text-muted-foreground" />
                        <CardTitle className="text-sm font-medium">WebSocket</CardTitle>
                      </div>
                      <StatusIcon status={healthData.websocket.status} />
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <StatusBadge status={healthData.websocket.status} />
                        {healthData.websocket.connections !== undefined && (
                          <span className="text-sm text-muted-foreground">
                            {healthData.websocket.connections} connections
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                      <div className="flex items-center gap-2">
                        <HardDrive className="h-5 w-5 text-muted-foreground" />
                        <CardTitle className="text-sm font-medium">S3 Storage</CardTitle>
                      </div>
                      <StatusIcon status={healthData.s3.status} />
                    </CardHeader>
                    <CardContent>
                      <StatusBadge status={healthData.s3.status} />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                      <div className="flex items-center gap-2">
                        <Mail className="h-5 w-5 text-muted-foreground" />
                        <CardTitle className="text-sm font-medium">Mailgun</CardTitle>
                      </div>
                      <StatusIcon status={healthData.mailgun.status} />
                    </CardHeader>
                    <CardContent>
                      <StatusBadge status={healthData.mailgun.status} />
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  Unable to fetch health status
                </div>
              )}

              {healthData?.app && (
                <Card>
                  <CardHeader>
                    <CardTitle>Application Info</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <div className="text-sm text-muted-foreground">Version</div>
                        <div className="font-medium">{healthData.app.version || "Unknown"}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Environment</div>
                        <div className="font-medium">{healthData.app.environment || "development"}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Uptime</div>
                        <div className="font-medium">
                          {healthData.app.uptime 
                            ? `${Math.floor(healthData.app.uptime / 3600)}h ${Math.floor((healthData.app.uptime % 3600) / 60)}m`
                            : "Unknown"
                          }
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="tenant-health">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Tenant Health Overview</CardTitle>
                  <CardDescription>Multi-tenancy system status and warnings</CardDescription>
                </div>
                <Button 
                  variant="outline" 
                  onClick={() => refetchTenancy()}
                  disabled={tenancyLoading}
                  data-testid="button-refresh-tenancy"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${tenancyLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </CardHeader>
              <CardContent>
                {tenancyLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : tenancyHealth ? (
                  <div className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="p-4 border rounded-lg">
                        <div className="text-sm text-muted-foreground">Tenancy Mode</div>
                        <div className="text-xl font-bold">{tenancyHealth.currentMode}</div>
                      </div>
                      <div className="p-4 border rounded-lg">
                        <div className="text-sm text-muted-foreground">Active Tenants</div>
                        <div className="text-xl font-bold">{tenancyHealth.activeTenantCount}</div>
                      </div>
                      <div className="p-4 border rounded-lg">
                        <div className="text-sm text-muted-foreground">Missing Tenant IDs</div>
                        <div className="text-xl font-bold">{tenancyHealth.totalMissing}</div>
                      </div>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="text-sm font-medium mb-3">Warning Statistics</div>
                      <div className="grid gap-4 md:grid-cols-3">
                        <div>
                          <div className="text-sm text-muted-foreground">Last 24 Hours</div>
                          <div className="font-medium">{tenancyHealth.warningStats.last24Hours}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Last 7 Days</div>
                          <div className="font-medium">{tenancyHealth.warningStats.last7Days}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Total</div>
                          <div className="font-medium">{tenancyHealth.warningStats.total}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    Unable to fetch tenant health status
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="logs">
            <Card>
              <CardHeader>
                <CardTitle>Application Logs</CardTitle>
                <CardDescription>View application logs for debugging and monitoring</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12">
                  <ExternalLink className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">External Logging</h3>
                  <p className="text-muted-foreground mb-4">
                    Application logs are available through your hosting provider's dashboard.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    For Railway deployments, access logs via the Railway dashboard under your project's "Logs" tab.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="debug">
            <DebugToolsPanel />
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={!!confirmDialog} onOpenChange={() => { setConfirmDialog(null); setConfirmPhrase(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmDialog?.title}</DialogTitle>
            <DialogDescription>{confirmDialog?.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="confirm-phrase">Type CONFIRM to proceed</Label>
              <Input
                id="confirm-phrase"
                value={confirmPhrase}
                onChange={(e) => setConfirmPhrase(e.target.value)}
                placeholder="CONFIRM"
                data-testid="input-confirm-phrase"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConfirmDialog(null); setConfirmPhrase(""); }}>
              Cancel
            </Button>
            <Button 
              onClick={() => handleDebugAction(confirmDialog?.action || "")}
              disabled={confirmPhrase !== "CONFIRM" || runCheckMutation.isPending}
              data-testid="button-confirm-action"
            >
              {runCheckMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Execute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
