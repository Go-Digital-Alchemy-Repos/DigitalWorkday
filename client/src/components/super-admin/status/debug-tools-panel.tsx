import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Database, CheckCircle, AlertCircle, RefreshCw, Search, Trash2, Archive, ArrowRight, Shield, FileWarning, Copy, ChevronLeft, ChevronRight, Wrench } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type {
  DebugConfig,
  QuarantineSummary,
  QuarantineListResponse,
  TenantIdScan,
  BackfillResult,
  IntegrityChecksResponse,
  OrphanDetectionResult,
  OrphanFixResult,
  TenantPickerItem,
} from "./types";

export function DebugToolsPanel() {
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
  const [orphanFixConfirmText, setOrphanFixConfirmText] = useState("");
  const [orphanFixResult, setOrphanFixResult] = useState<OrphanFixResult | null>(null);

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

  const { data: orphanDetection, isLoading: orphanLoading, refetch: refetchOrphans } = useQuery<OrphanDetectionResult>({
    queryKey: ["/api/v1/super/health/orphans"],
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
      const res = await apiRequest("POST", "/api/v1/super/debug/quarantine/delete", data, {
        "X-Confirm-Delete": "DELETE_QUARANTINED_ROW",
      });
      return res.json();
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
    mutationFn: async (mode: "dry_run" | "apply"): Promise<BackfillResult> => {
      const headers: Record<string, string> = {};
      if (mode === "apply") {
        headers["X-Confirm-Backfill"] = "APPLY_TENANTID_BACKFILL";
      }
      const res = await apiRequest("POST", `/api/v1/super/debug/tenantid/backfill?mode=${mode}`, {}, headers);
      return res.json();
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

  const orphanFixMutation = useMutation({
    mutationFn: async (params: { dryRun: boolean; confirmText?: string }) => {
      const res = await apiRequest("POST", "/api/v1/super/health/orphans/fix", params);
      return res.json();
    },
    onSuccess: (data: OrphanFixResult) => {
      setOrphanFixResult(data);
      if (data.dryRun) {
        toast({ title: "Dry run complete", description: `Would fix ${data.totalWouldFix} orphan rows` });
      } else {
        toast({ title: "Orphans fixed", description: `Fixed ${data.totalFixed} rows to quarantine tenant` });
        refetchOrphans();
        refetchSummary();
      }
      setOrphanFixConfirmText("");
    },
    onError: (error: any) => {
      toast({ title: "Orphan fix failed", description: error.message, variant: "destructive" });
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
                <div className="space-y-1 text-sm">
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
                                    <span>{row.id.slice(0, 8)}...</span>
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
                            {Object.entries(backfillResult.updated || {}).map(([table, count]) => (
                              <div key={table} className="flex justify-between">
                                <span className="capitalize">{table}:</span>
                                <span>{count}</span>
                              </div>
                            ))}
                            {(!backfillResult.updated || Object.keys(backfillResult.updated).length === 0) && (
                              <div className="text-muted-foreground">No updates</div>
                            )}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-yellow-600">Quarantined</div>
                          <div className="text-sm space-y-1">
                            {Object.entries(backfillResult.quarantined || {}).map(([table, count]) => (
                              <div key={table} className="flex justify-between">
                                <span className="capitalize">{table}:</span>
                                <span>{count}</span>
                              </div>
                            ))}
                            {(!backfillResult.quarantined || Object.keys(backfillResult.quarantined).length === 0) && (
                              <div className="text-muted-foreground">None quarantined</div>
                            )}
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
                            <div className="mt-2 text-xs text-muted-foreground">
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

        <AccordionItem value="orphan-fix" className="border rounded-lg">
          <AccordionTrigger className="px-4 hover:no-underline">
            <div className="flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              <span className="font-semibold">Orphan Fix Wizard</span>
              {orphanDetection && orphanDetection.totalOrphans > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {orphanDetection.totalOrphans} orphans
                </Badge>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Detect and quarantine rows missing tenantId
                </p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => refetchOrphans()} 
                  disabled={orphanLoading}
                  data-testid="button-refresh-orphans"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${orphanLoading ? "animate-spin" : ""}`} />
                  Scan
                </Button>
              </div>

              {orphanLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : orphanDetection ? (
                <>
                  <div className="grid gap-2 md:grid-cols-3">
                    <div className="p-3 border rounded-lg">
                      <div className="text-sm text-muted-foreground">Total Orphans</div>
                      <div className={`text-xl font-bold ${orphanDetection.totalOrphans > 0 ? "text-destructive" : "text-green-600"}`}>
                        {orphanDetection.totalOrphans}
                      </div>
                    </div>
                    <div className="p-3 border rounded-lg">
                      <div className="text-sm text-muted-foreground">Tables With Orphans</div>
                      <div className={`text-xl font-bold ${orphanDetection.tablesWithOrphans > 0 ? "text-yellow-600" : "text-green-600"}`}>
                        {orphanDetection.tablesWithOrphans}
                      </div>
                    </div>
                    <div className="p-3 border rounded-lg">
                      <div className="text-sm text-muted-foreground">Quarantine Tenant</div>
                      <div className="text-sm font-medium">
                        {orphanDetection.quarantineTenant.exists ? (
                          <span className="text-green-600">Exists</span>
                        ) : (
                          <span className="text-muted-foreground">Will be created</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {orphanDetection.totalOrphans > 0 && (
                    <>
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium">Orphans by Table</h4>
                        <div className="grid gap-2 md:grid-cols-4">
                          {orphanDetection.tables
                            .filter(t => t.count > 0)
                            .map(tableResult => (
                              <div key={tableResult.table} className="p-2 border rounded-lg">
                                <div className="flex justify-between items-center">
                                  <span className="text-sm capitalize">{tableResult.table}</span>
                                  <Badge variant="secondary">{tableResult.count}</Badge>
                                </div>
                                {tableResult.sampleIds.length > 0 && (
                                  <div className="mt-1 text-xs text-muted-foreground truncate">
                                    {tableResult.sampleIds.slice(0, 2).map(s => s.display).join(", ")}
                                    {tableResult.sampleIds.length > 2 && "..."}
                                  </div>
                                )}
                              </div>
                            ))}
                        </div>
                      </div>

                      <Separator />

                      <div className="space-y-3">
                        <div className="flex items-center gap-4">
                          <Button
                            variant="outline"
                            onClick={() => orphanFixMutation.mutate({ dryRun: true })}
                            disabled={orphanFixMutation.isPending}
                            data-testid="button-orphan-dryrun"
                          >
                            {orphanFixMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Preview Fix (Dry Run)
                          </Button>
                        </div>

                        {orphanFixResult && orphanFixResult.dryRun && (
                          <div className="p-4 border rounded-lg bg-muted/50 space-y-3">
                            <div className="flex items-center justify-between">
                              <h4 className="font-medium">Dry Run Preview</h4>
                              <Badge variant="outline">Would fix {orphanFixResult.totalWouldFix} rows</Badge>
                            </div>
                            <div className="grid gap-2 md:grid-cols-3">
                              {orphanFixResult.results
                                .filter(r => r.action === "would_fix")
                                .map(r => (
                                  <div key={r.table} className="text-sm flex justify-between">
                                    <span className="capitalize">{r.table}:</span>
                                    <span>{r.countBefore}</span>
                                  </div>
                                ))}
                            </div>

                            <Separator />

                            <div className="space-y-2">
                              <Label htmlFor="orphan-confirm">Type FIX_ORPHANS to execute</Label>
                              <div className="flex gap-2">
                                <Input
                                  id="orphan-confirm"
                                  value={orphanFixConfirmText}
                                  onChange={(e) => setOrphanFixConfirmText(e.target.value)}
                                  placeholder="FIX_ORPHANS"
                                  className="max-w-xs"
                                  data-testid="input-orphan-confirm"
                                />
                                <Button
                                  onClick={() => orphanFixMutation.mutate({ dryRun: false, confirmText: orphanFixConfirmText })}
                                  disabled={orphanFixConfirmText !== "FIX_ORPHANS" || orphanFixMutation.isPending}
                                  data-testid="button-orphan-execute"
                                >
                                  {orphanFixMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                  Execute Fix
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}

                        {orphanFixResult && !orphanFixResult.dryRun && (
                          <div className="p-4 border rounded-lg border-green-500/50 bg-green-50 dark:bg-green-950/20 space-y-2">
                            <div className="flex items-center gap-2">
                              <CheckCircle className="h-5 w-5 text-green-600" />
                              <h4 className="font-medium text-green-800 dark:text-green-300">Fix Applied</h4>
                            </div>
                            <p className="text-sm text-green-700 dark:text-green-400">
                              Moved {orphanFixResult.totalFixed} rows to quarantine tenant
                              {orphanFixResult.quarantineCreated && " (created new quarantine tenant)"}
                            </p>
                            <div className="text-xs text-muted-foreground">
                              Quarantine Tenant ID: {orphanFixResult.quarantineTenantId}
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {orphanDetection.totalOrphans === 0 && (
                    <div className="text-center py-8 text-green-600">
                      <CheckCircle className="h-8 w-8 mx-auto mb-2" />
                      No orphan rows found
                    </div>
                  )}
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
              <div className="text-xs text-muted-foreground">{deleteDialog?.row?.id}</div>
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
