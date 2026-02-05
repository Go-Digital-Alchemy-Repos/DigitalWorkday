import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Loader2, Download, Archive, Clock, CheckCircle, XCircle, AlertTriangle } from "lucide-react";

interface Tenant {
  id: string;
  name: string;
}

interface ExportProgress {
  phase: string;
  processedMessages: number;
  totalMessages: number;
  processedChannels: number;
  totalChannels: number;
  processedDms: number;
  totalDms: number;
}

interface ExportOutputLocation {
  bucket: string;
  key: string;
  size: number;
}

interface ExportJob {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  scopeType: "tenant" | "all";
  tenantId: string | null;
  cutoffType: "date" | "retention";
  cutoffDate: string | null;
  retainDays: number | null;
  progress: ExportProgress | null;
  outputLocation: ExportOutputLocation | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

function getStatusBadge(status: string) {
  switch (status) {
    case "queued":
      return <Badge variant="secondary" data-testid="badge-status-queued"><Clock className="w-3 h-3 mr-1" /> Queued</Badge>;
    case "processing":
      return <Badge variant="outline" data-testid="badge-status-processing"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Processing</Badge>;
    case "completed":
      return <Badge variant="default" className="bg-green-600" data-testid="badge-status-completed"><CheckCircle className="w-3 h-3 mr-1" /> Completed</Badge>;
    case "failed":
      return <Badge variant="destructive" data-testid="badge-status-failed"><XCircle className="w-3 h-3 mr-1" /> Failed</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function ChatDataExport() {
  const { toast } = useToast();
  const [scopeType, setScopeType] = useState<"all" | "tenant">("all");
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");
  const [cutoffType, setCutoffType] = useState<"date" | "retention">("retention");
  const [cutoffDate, setCutoffDate] = useState<string>("");
  const [retainDays, setRetainDays] = useState<string>("90");

  const tenantsQuery = useQuery<{ tenants: Tenant[] }>({
    queryKey: ["/api/v1/super/tenants"],
  });

  const exportJobsQuery = useQuery<{ jobs: ExportJob[] }>({
    queryKey: ["/api/v1/super/chat/exports"],
    refetchInterval: 5000,
  });

  const createExportMutation = useMutation({
    mutationFn: async () => {
      const body: any = {
        scopeType,
        cutoffType,
      };
      if (scopeType === "tenant" && selectedTenantId) {
        body.tenantId = selectedTenantId;
      }
      if (cutoffType === "date" && cutoffDate) {
        body.cutoffDate = new Date(cutoffDate).toISOString();
      }
      if (cutoffType === "retention" && retainDays) {
        body.retainDays = parseInt(retainDays, 10);
      }
      return apiRequest("POST", "/api/v1/super/chat/exports", body);
    },
    onSuccess: () => {
      toast({ title: "Export started", description: "Your chat data export has been queued." });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/chat/exports"] });
    },
    onError: (error: any) => {
      toast({ title: "Export failed", description: error.message || "Failed to start export", variant: "destructive" });
    },
  });

  const downloadMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const response = await apiRequest("GET", `/api/v1/super/chat/exports/${jobId}/download`);
      const data = await response.json();
      if (data.downloadUrl) {
        window.open(data.downloadUrl, "_blank");
      }
    },
    onError: (error: any) => {
      toast({ title: "Download failed", description: error.message || "Failed to generate download URL", variant: "destructive" });
    },
  });

  const isFormValid = () => {
    if (scopeType === "tenant" && !selectedTenantId) return false;
    if (cutoffType === "date" && !cutoffDate) return false;
    if (cutoffType === "retention" && !retainDays) return false;
    return true;
  };

  const jobs = exportJobsQuery.data?.jobs || [];
  const tenants = tenantsQuery.data?.tenants || [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Archive className="w-5 h-5" />
            Export Chat Data
          </CardTitle>
          <CardDescription>
            Create a backup of chat messages, channels, and attachments before purging data.
            Exports are saved in JSONL format to Cloudflare R2.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="scope-type">Export Scope</Label>
              <Select value={scopeType} onValueChange={(v) => setScopeType(v as "all" | "tenant")}>
                <SelectTrigger id="scope-type" data-testid="select-scope-type">
                  <SelectValue placeholder="Select scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tenants</SelectItem>
                  <SelectItem value="tenant">Specific Tenant</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {scopeType === "tenant" && (
              <div className="space-y-2">
                <Label htmlFor="tenant-id">Tenant</Label>
                <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
                  <SelectTrigger id="tenant-id" data-testid="select-tenant">
                    <SelectValue placeholder="Select tenant" />
                  </SelectTrigger>
                  <SelectContent>
                    {tenants.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cutoff-type">Cutoff Method</Label>
              <Select value={cutoffType} onValueChange={(v) => setCutoffType(v as "date" | "retention")}>
                <SelectTrigger id="cutoff-type" data-testid="select-cutoff-type">
                  <SelectValue placeholder="Select cutoff method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="retention">Retention Days</SelectItem>
                  <SelectItem value="date">Specific Date</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {cutoffType === "retention" && (
              <div className="space-y-2">
                <Label htmlFor="retain-days">Keep Messages Newer Than (days)</Label>
                <Input
                  id="retain-days"
                  type="number"
                  value={retainDays}
                  onChange={(e) => setRetainDays(e.target.value)}
                  min={1}
                  max={365}
                  data-testid="input-retain-days"
                />
              </div>
            )}

            {cutoffType === "date" && (
              <div className="space-y-2">
                <Label htmlFor="cutoff-date">Export Messages Before</Label>
                <Input
                  id="cutoff-date"
                  type="date"
                  value={cutoffDate}
                  onChange={(e) => setCutoffDate(e.target.value)}
                  data-testid="input-cutoff-date"
                />
              </div>
            )}
          </div>

          <Alert>
            <AlertTriangle className="w-4 h-4" />
            <AlertDescription>
              Exports may take several minutes for large datasets. You can track progress below.
            </AlertDescription>
          </Alert>

          <Button
            onClick={() => createExportMutation.mutate()}
            disabled={!isFormValid() || createExportMutation.isPending}
            data-testid="button-start-export"
          >
            {createExportMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Starting Export...</>
            ) : (
              <><Archive className="w-4 h-4 mr-2" /> Start Export</>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Export History</CardTitle>
          <CardDescription>Recent chat data exports and their status</CardDescription>
        </CardHeader>
        <CardContent>
          {exportJobsQuery.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : jobs.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No exports yet</p>
          ) : (
            <div className="space-y-4">
              {jobs.map((job) => (
                <div key={job.id} className="border rounded-lg p-4 space-y-3" data-testid={`export-job-${job.id}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getStatusBadge(job.status)}
                      <span className="text-sm text-muted-foreground">
                        {job.scopeType === "all" ? "All Tenants" : `Tenant: ${job.tenantId?.slice(0, 8)}...`}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">{formatDate(job.createdAt)}</span>
                  </div>

                  {job.progress && job.status === "processing" && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span>Phase: {job.progress.phase}</span>
                        <span>
                          {job.progress.processedMessages} / {job.progress.totalMessages} messages
                        </span>
                      </div>
                      <Progress 
                        value={job.progress.totalMessages > 0 
                          ? (job.progress.processedMessages / job.progress.totalMessages) * 100 
                          : 0
                        } 
                      />
                    </div>
                  )}

                  {job.status === "completed" && job.outputLocation && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Size: {formatBytes(job.outputLocation.size)}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => downloadMutation.mutate(job.id)}
                        disabled={downloadMutation.isPending}
                        data-testid={`button-download-${job.id}`}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download
                      </Button>
                    </div>
                  )}

                  {job.status === "failed" && job.error && (
                    <Alert variant="destructive">
                      <AlertDescription>{job.error}</AlertDescription>
                    </Alert>
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
