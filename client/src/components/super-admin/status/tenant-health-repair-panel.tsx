import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Wrench, RefreshCw, Search } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { GlobalHealthSummary, RepairPreviewResult, RepairApplyResult } from "./types";

export function TenantHealthRepairPanel() {
  const { toast } = useToast();
  const [repairPreview, setRepairPreview] = useState<RepairPreviewResult | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const { data: globalHealth, isLoading: healthLoading, refetch: refetchHealth } = useQuery<GlobalHealthSummary>({
    queryKey: ["/api/v1/super/system/health/tenancy"],
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/v1/super/system/health/tenancy/repair-preview", {
        limit: 500,
      });
      return response.json();
    },
    onSuccess: (data: RepairPreviewResult) => {
      setRepairPreview(data);
      toast({
        title: "Preview Generated",
        description: `Found ${data.highConfidenceCount} high-confidence and ${data.lowConfidenceCount} low-confidence updates`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Preview Failed",
        description: error.message || "Failed to generate repair preview",
        variant: "destructive",
      });
    },
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/v1/super/system/health/tenancy/repair-apply", {
        limit: 500,
        applyOnlyHighConfidence: true,
      }, {
        "X-Confirm-Repair": "true",
      });
      return response.json();
    },
    onSuccess: (data: RepairApplyResult) => {
      setRepairPreview(null);
      setShowConfirmDialog(false);
      setConfirmText("");
      refetchHealth();
      toast({
        title: "Repairs Applied",
        description: `Updated ${data.totalUpdated} records, skipped ${data.totalSkipped} low-confidence`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Repair Failed",
        description: error.message || "Failed to apply repairs",
        variant: "destructive",
      });
    },
  });

  const handleApplyRepairs = () => {
    if (confirmText !== "REPAIR") return;
    applyMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              Tenant Health & Repair Tools
            </CardTitle>
            <CardDescription>
              Diagnose and safely repair tenant data integrity issues
            </CardDescription>
          </div>
          <Button
            variant="outline"
            onClick={() => refetchHealth()}
            disabled={healthLoading}
            data-testid="button-refresh-health"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${healthLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {healthLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : globalHealth ? (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-4">
                <div className="p-4 border rounded-lg" data-testid="card-total-tenants">
                  <div className="text-sm text-muted-foreground">Total Tenants</div>
                  <div className="text-2xl font-bold" data-testid="text-total-tenants">{globalHealth.totalTenants}</div>
                </div>
                <div className="p-4 border rounded-lg" data-testid="card-ready-tenants">
                  <div className="text-sm text-muted-foreground">Ready</div>
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-ready-tenants">{globalHealth.readyTenants}</div>
                </div>
                <div className="p-4 border rounded-lg" data-testid="card-blocked-tenants">
                  <div className="text-sm text-muted-foreground">Blocked</div>
                  <div className="text-2xl font-bold text-red-600 dark:text-red-400" data-testid="text-blocked-tenants">{globalHealth.blockedTenants}</div>
                </div>
                <div className="p-4 border rounded-lg" data-testid="card-orphan-rows">
                  <div className="text-sm text-muted-foreground">Orphan Rows</div>
                  <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400" data-testid="text-orphan-rows">{globalHealth.totalOrphanRows}</div>
                </div>
              </div>

              {Object.keys(globalHealth.byTable).length > 0 && (
                <div className="border rounded-lg">
                  <div className="px-4 py-3 border-b bg-muted/50">
                    <h4 className="font-medium">Missing TenantId by Table</h4>
                  </div>
                  <div className="p-4">
                    <div className="grid gap-2">
                      {Object.entries(globalHealth.byTable).map(([table, count]) => (
                        <div key={table} className="flex justify-between items-center gap-2 py-2 px-3 rounded-lg bg-muted/30" data-testid={`row-table-${table}`}>
                          <span className="text-sm">{table}</span>
                          <Badge variant={count > 0 ? "destructive" : "secondary"} data-testid={`badge-count-${table}`}>
                            {count}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <Separator />

              <div className="space-y-4">
                <h4 className="font-medium">Repair Tools</h4>
                <p className="text-sm text-muted-foreground">
                  Generate a preview to see what would be repaired, then apply only high-confidence fixes.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={() => previewMutation.mutate()}
                    disabled={previewMutation.isPending}
                    variant="outline"
                    data-testid="button-repair-preview"
                  >
                    {previewMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4 mr-2" />
                    )}
                    Run Repair Preview (Dry Run)
                  </Button>
                  <Button
                    onClick={() => setShowConfirmDialog(true)}
                    disabled={!repairPreview || repairPreview.highConfidenceCount === 0}
                    variant="default"
                    data-testid="button-apply-repairs"
                  >
                    <Wrench className="h-4 w-4 mr-2" />
                    Apply High-Confidence Repairs
                  </Button>
                </div>
              </div>

              {repairPreview && (
                <div className="border rounded-lg">
                  <div className="px-4 py-3 border-b bg-muted/50 flex flex-wrap justify-between items-center gap-2">
                    <h4 className="font-medium">Repair Preview</h4>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="default" data-testid="badge-high-confidence-count">{repairPreview.highConfidenceCount} High</Badge>
                      <Badge variant="secondary" data-testid="badge-low-confidence-count">{repairPreview.lowConfidenceCount} Low</Badge>
                    </div>
                  </div>
                  <div className="p-4 space-y-4">
                    <div className="grid gap-2">
                      {Object.entries(repairPreview.byTable).map(([table, counts]) => (
                        <div key={table} className="flex flex-wrap justify-between items-center gap-2 py-2 px-3 rounded-lg bg-muted/30" data-testid={`preview-row-${table}`}>
                          <span className="text-sm">{table}</span>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="default" className="text-xs">{counts.high} high</Badge>
                            <Badge variant="secondary" className="text-xs">{counts.low} low</Badge>
                          </div>
                        </div>
                      ))}
                    </div>

                    {repairPreview.proposedUpdates.length > 0 && (
                      <ScrollArea className="h-64 border rounded-lg">
                        <div className="p-3 space-y-2">
                          {repairPreview.proposedUpdates.slice(0, 50).map((update, i) => (
                            <div key={i} className="p-2 rounded-lg bg-muted/50 text-sm" data-testid={`preview-update-${i}`}>
                              <div className="flex flex-wrap justify-between items-start gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-muted-foreground">{update.table}</span>
                                    <span className="truncate">{update.id}</span>
                                  </div>
                                  <div className="text-xs text-muted-foreground mt-1">
                                    {update.derivation}
                                  </div>
                                </div>
                                <Badge variant={update.confidence === "high" ? "default" : "secondary"} data-testid={`badge-confidence-${i}`}>
                                  {update.confidence}
                                </Badge>
                              </div>
                              {update.notes && (
                                <div className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                                  {update.notes}
                                </div>
                              )}
                            </div>
                          ))}
                          {repairPreview.proposedUpdates.length > 50 && (
                            <div className="text-center text-sm text-muted-foreground py-2">
                              ... and {repairPreview.proposedUpdates.length - 50} more
                            </div>
                          )}
                        </div>
                      </ScrollArea>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Unable to fetch health status
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showConfirmDialog} onOpenChange={() => { setShowConfirmDialog(false); setConfirmText(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Repair Application</DialogTitle>
            <DialogDescription>
              This will update {repairPreview?.highConfidenceCount || 0} records with high-confidence tenantId derivations.
              Low-confidence records will be skipped and require manual review.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="repair-confirm">Type REPAIR to proceed</Label>
              <Input
                id="repair-confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="REPAIR"
                data-testid="input-repair-confirm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowConfirmDialog(false); setConfirmText(""); }} data-testid="button-cancel-repair">
              Cancel
            </Button>
            <Button
              onClick={handleApplyRepairs}
              disabled={confirmText !== "REPAIR" || applyMutation.isPending}
              data-testid="button-confirm-repairs"
            >
              {applyMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Apply Repairs
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
