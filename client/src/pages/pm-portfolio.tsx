import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FolderKanban,
  MessageSquare,
  TrendingDown,
  TrendingUp,
  Activity,
  ArrowRight,
  Flame,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  RefreshCw,
  DollarSign,
  Check,
  X,
  ExternalLink,
  FileText,
  Download,
  Plus,
  ChevronRight,
  ChevronDown as ChevronDownIcon,
  Ban,
  Loader2,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { ReassignmentSuggestionsCard } from "@/components/reassignment/ReassignmentSuggestionsCard";
import { AiFocusSummaryCard } from "@/features/pm-portfolio/AiFocusSummaryCard";

interface PmPortfolioProject {
  projectId: string;
  name: string;
  status: string;
  color: string | null;
  clientName: string | null;
  healthScore: number;
  milestoneCompletionPct: number | null;
  burnPercent: number | null;
  isBurnRisk: boolean;
  overdueTasksCount: number;
  tasksInReviewCount: number;
  hasMilestoneOverdue: boolean;
  riskTrend: "stable" | "at_risk" | "critical";
  needsAck: boolean;
}

interface PmPortfolioSummary {
  totalProjects: number;
  atRiskCount: number;
  burnRiskCount: number;
  avgHealthScore: number;
  totalOverdueTasks: number;
  totalTasksInReview: number;
}

interface PmPortfolioResult {
  projects: PmPortfolioProject[];
  summary: PmPortfolioSummary;
}

type SortKey = "name" | "healthScore" | "burnPercent" | "overdueTasksCount" | "riskTrend" | "milestoneCompletionPct";
type SortDir = "asc" | "desc";

function HealthBar({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-emerald-500"
      : score >= 60
      ? "bg-amber-500"
      : "bg-red-500";
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden min-w-[48px]">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-sm font-medium tabular-nums w-8 shrink-0">{score}</span>
    </div>
  );
}

function RiskBadge({ trend }: { trend: "stable" | "at_risk" | "critical" }) {
  if (trend === "critical") {
    return (
      <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800 gap-1">
        <AlertTriangle className="h-3 w-3" />
        Critical
      </Badge>
    );
  }
  if (trend === "at_risk") {
    return (
      <Badge className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800 gap-1">
        <TrendingDown className="h-3 w-3" />
        At Risk
      </Badge>
    );
  }
  return (
    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800 gap-1">
      <CheckCircle2 className="h-3 w-3" />
      Stable
    </Badge>
  );
}

function SortIcon({ sortKey, current, dir }: { sortKey: SortKey; current: SortKey; dir: SortDir }) {
  if (sortKey !== current) return <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />;
  return dir === "asc"
    ? <ChevronUp className="h-3.5 w-3.5 text-primary" />
    : <ChevronDown className="h-3.5 w-3.5 text-primary" />;
}

function SummaryCardSkeleton() {
  return (
    <Card>
      <CardContent className="pt-6">
        <Skeleton className="h-4 w-24 mb-2" />
        <Skeleton className="h-8 w-16" />
      </CardContent>
    </Card>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2 mt-4">
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

interface PendingApprovalEntry {
  id: string;
  userId: string;
  employeeName: string | null;
  taskId: string | null;
  taskTitle: string | null;
  projectId: string | null;
  projectName: string | null;
  durationSeconds: number;
  startTime: string;
  billingStatus: string;
}

function formatHours(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function BillingApprovalQueueCard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: queue = [], isLoading } = useQuery<PendingApprovalEntry[]>({
    queryKey: ["/api/billing/pending-approval"],
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const approveMutation = useMutation({
    mutationFn: (ids: string[]) => apiRequest("POST", "/api/billing/approve", { timeEntryIds: ids }),
    onSuccess: (_data, ids) => {
      toast({ title: `${ids.length} time ${ids.length === 1 ? "entry" : "entries"} approved` });
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["/api/billing/pending-approval"] });
    },
    onError: () => toast({ title: "Failed to approve entries", variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: (ids: string[]) => apiRequest("POST", "/api/billing/reject", { timeEntryIds: ids }),
    onSuccess: (_data, ids) => {
      toast({ title: `${ids.length} time ${ids.length === 1 ? "entry" : "entries"} rejected` });
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["/api/billing/pending-approval"] });
    },
    onError: () => toast({ title: "Failed to reject entries", variant: "destructive" }),
  });

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = queue.length > 0 && selected.size === queue.length;
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(queue.map((e) => e.id)));
  };

  const isPending = approveMutation.isPending || rejectMutation.isPending;

  if (!isLoading && queue.length === 0) return null;

  return (
    <Card data-testid="card-billing-approval-queue">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-amber-500" />
            Time Awaiting Approval
            {queue.length > 0 && (
              <Badge className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700 ml-1" data-testid="badge-pending-count">
                {queue.length}
              </Badge>
            )}
          </CardTitle>
          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5 text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                onClick={() => approveMutation.mutate(Array.from(selected))}
                disabled={isPending}
                data-testid="button-approve-selected"
              >
                <Check className="h-3.5 w-3.5" />
                Approve {selected.size}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5 text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-900/20"
                onClick={() => rejectMutation.mutate(Array.from(selected))}
                disabled={isPending}
                data-testid="button-reject-selected"
              >
                <X className="h-3.5 w-3.5" />
                Reject {selected.size}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="px-4 pb-4 space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full rounded" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-billing-queue">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-2.5 w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="rounded border-border"
                      data-testid="checkbox-select-all"
                    />
                  </th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Employee</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs hidden sm:table-cell">Task</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs hidden md:table-cell">Project</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Hours</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs hidden lg:table-cell">Date</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground text-xs">Actions</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((entry) => (
                  <tr
                    key={entry.id}
                    className={cn(
                      "border-b border-border last:border-0 transition-colors",
                      selected.has(entry.id) ? "bg-amber-50/60 dark:bg-amber-900/10" : "hover:bg-muted/30"
                    )}
                    data-testid={`row-billing-${entry.id}`}
                  >
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={selected.has(entry.id)}
                        onChange={() => toggleSelect(entry.id)}
                        className="rounded border-border"
                        data-testid={`checkbox-entry-${entry.id}`}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-medium" data-testid={`text-employee-${entry.id}`}>{entry.employeeName || "Unknown"}</span>
                    </td>
                    <td className="px-4 py-2.5 hidden sm:table-cell">
                      <span className="text-muted-foreground truncate max-w-[140px] block" data-testid={`text-task-${entry.id}`}>
                        {entry.taskTitle || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 hidden md:table-cell">
                      <span className="text-muted-foreground truncate max-w-[120px] block" data-testid={`text-project-${entry.id}`}>
                        {entry.projectName || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium" data-testid={`text-hours-${entry.id}`}>
                      {formatHours(entry.durationSeconds)}
                    </td>
                    <td className="px-4 py-2.5 hidden lg:table-cell text-muted-foreground text-xs">
                      {new Date(entry.startTime).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                          onClick={() => approveMutation.mutate([entry.id])}
                          disabled={isPending}
                          title="Approve"
                          data-testid={`button-approve-${entry.id}`}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                          onClick={() => rejectMutation.mutate([entry.id])}
                          disabled={isPending}
                          title="Reject"
                          data-testid={`button-reject-${entry.id}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                        {entry.taskId && (
                          <Link href={`/projects/${entry.projectId}?task=${entry.taskId}`}>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                              title="Open Task"
                              data-testid={`button-open-task-${entry.id}`}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface LowMarginClient {
  clientId: string;
  clientName: string;
  revenue: number;
  laborCost: number;
  grossMargin: number;
  marginPercent: number;
  billableHours: number;
  totalHours: number;
}

function LowMarginClientsCard() {
  const { toast } = useToast();
  const [threshold, setThreshold] = useState("20");

  const { data: clients = [], isLoading } = useQuery<LowMarginClient[]>({
    queryKey: ["/api/analytics/client-profitability", threshold],
    queryFn: async () => {
      const params = new URLSearchParams({ marginThreshold: threshold });
      const res = await fetch(`/api/analytics/client-profitability?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load profitability data");
      return res.json();
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  return (
    <Card data-testid="card-low-margin-clients">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-amber-500" />
            Low Margin Clients
            {clients.length > 0 && (
              <Badge className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700 ml-1" data-testid="badge-low-margin-count">
                {clients.length}
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Threshold:</span>
            <Select value={threshold} onValueChange={setThreshold}>
              <SelectTrigger className="w-20 h-7 text-xs" data-testid="select-margin-threshold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10%</SelectItem>
                <SelectItem value="20">20%</SelectItem>
                <SelectItem value="30">30%</SelectItem>
                <SelectItem value="40">40%</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="px-4 pb-4 space-y-2">
            {[1, 2].map((i) => <Skeleton key={i} className="h-12 w-full rounded" />)}
          </div>
        ) : clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <DollarSign className="h-8 w-8 mb-2 opacity-20" />
            <p className="text-sm">No low-margin clients</p>
            <p className="text-xs mt-0.5">All clients above {threshold}% margin threshold</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {clients.map((client) => (
              <div key={client.clientId} className="flex items-center gap-3 px-4 py-3" data-testid={`low-margin-client-${client.clientId}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" data-testid={`text-lm-client-name-${client.clientId}`}>
                    {client.clientName || "Unknown Client"}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    ${fmt(client.revenue)} rev · ${fmt(client.laborCost)} cost · {client.totalHours.toFixed(1)}h
                  </p>
                </div>
                <div className="shrink-0">
                  {client.marginPercent < 0 ? (
                    <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700 gap-1 text-xs" data-testid={`badge-margin-${client.clientId}`}>
                      <X className="h-3 w-3" />
                      {client.marginPercent.toFixed(1)}%
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700 text-xs" data-testid={`badge-margin-${client.clientId}`}>
                      {client.marginPercent.toFixed(1)}%
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface InvoiceDraftItem {
  id: string;
  timeEntryId: string | null;
  taskId: string | null;
  description: string;
  hours: string;
  rate: string;
  amount: string;
}

interface InvoiceDraft {
  id: string;
  clientId: string | null;
  projectId: string | null;
  status: string;
  totalHours: string;
  totalAmount: string;
  notes: string | null;
  createdAt: string;
  clientName?: string | null;
  projectName?: string | null;
  creatorName?: string | null;
  items: InvoiceDraftItem[];
}

interface ClientOption { id: string; name: string; }
interface ProjectOption { id: string; name: string; clientId: string | null; }

function InvoiceDraftStatusBadge({ status }: { status: string }) {
  if (status === "exported") {
    return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700 text-[10px] px-1.5 py-0 h-4">Exported</Badge>;
  }
  if (status === "cancelled") {
    return <Badge className="bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800/50 dark:text-gray-400 dark:border-gray-700 text-[10px] px-1.5 py-0 h-4">Cancelled</Badge>;
  }
  return <Badge className="bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700 text-[10px] px-1.5 py-0 h-4">Draft</Badge>;
}

function InvoiceDraftsCard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [form, setForm] = useState({
    clientId: "",
    projectId: "" as string,
    startDate: "",
    endDate: new Date().toISOString().slice(0, 10),
    defaultRate: "0",
    notes: "",
  });

  const { data: drafts = [], isLoading } = useQuery<InvoiceDraft[]>({
    queryKey: ["/api/billing/invoice-drafts"],
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const { data: clients = [] } = useQuery<ClientOption[]>({
    queryKey: ["/api/clients"],
    staleTime: 60_000,
    select: (data: any[]) => data.map((c) => ({ id: c.id, name: c.name })),
  });

  const { data: allProjects = [] } = useQuery<ProjectOption[]>({
    queryKey: ["/api/projects"],
    staleTime: 60_000,
    select: (data: any[]) => data.map((p) => ({ id: p.id, name: p.name, clientId: p.clientId })),
  });

  const projectsForClient = allProjects.filter((p) => !form.clientId || p.clientId === form.clientId);

  const exportMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/billing/invoice-drafts/${id}/export`, {}),
    onSuccess: () => {
      toast({ title: "Invoice draft exported — time entries marked as Invoiced" });
      qc.invalidateQueries({ queryKey: ["/api/billing/invoice-drafts"] });
      qc.invalidateQueries({ queryKey: ["/api/billing/pending-approval"] });
    },
    onError: (err: any) => toast({ title: err?.message || "Failed to export draft", variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/billing/invoice-drafts/${id}/cancel`, {}),
    onSuccess: () => {
      toast({ title: "Invoice draft cancelled" });
      qc.invalidateQueries({ queryKey: ["/api/billing/invoice-drafts"] });
    },
    onError: (err: any) => toast({ title: err?.message || "Failed to cancel draft", variant: "destructive" }),
  });

  const handleGenerate = async () => {
    if (!form.clientId || !form.startDate || !form.endDate) {
      toast({ title: "Client and date range are required", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      await apiRequest("POST", "/api/billing/generate-invoice-draft", {
        clientId: form.clientId,
        projectId: form.projectId || null,
        startDate: form.startDate,
        endDate: form.endDate,
        defaultRate: parseFloat(form.defaultRate) || 0,
        notes: form.notes || undefined,
      });
      toast({ title: "Invoice draft generated" });
      qc.invalidateQueries({ queryKey: ["/api/billing/invoice-drafts"] });
      setDialogOpen(false);
      setForm({ clientId: "", projectId: "", startDate: "", endDate: new Date().toISOString().slice(0, 10), defaultRate: "0", notes: "" });
    } catch (err: any) {
      toast({ title: err?.message || "No approved entries found for this criteria", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card data-testid="card-invoice-drafts">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-500" />
            Invoice Drafts
            {drafts.length > 0 && (
              <Badge className="bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700 ml-1" data-testid="badge-draft-count">
                {drafts.length}
              </Badge>
            )}
          </CardTitle>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" data-testid="button-generate-draft">
                <Plus className="h-3.5 w-3.5" />
                Generate Draft
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[460px]">
              <DialogHeader>
                <DialogTitle>Generate Invoice Draft</DialogTitle>
                <DialogDescription>
                  Pulls all approved time entries for the selected client and date range.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label>Client <span className="text-destructive">*</span></Label>
                  <Select value={form.clientId} onValueChange={(v) => setForm((f) => ({ ...f, clientId: v, projectId: "" }))}>
                    <SelectTrigger data-testid="select-invoice-client">
                      <SelectValue placeholder="Select client…" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id} data-testid={`option-client-${c.id}`}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Project <span className="text-xs text-muted-foreground">(optional)</span></Label>
                  <Select value={form.projectId || "all"} onValueChange={(v) => setForm((f) => ({ ...f, projectId: v === "all" ? "" : v }))}>
                    <SelectTrigger data-testid="select-invoice-project" disabled={!form.clientId}>
                      <SelectValue placeholder="All projects" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All projects</SelectItem>
                      {projectsForClient.map((p) => (
                        <SelectItem key={p.id} value={p.id} data-testid={`option-project-${p.id}`}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Start Date <span className="text-destructive">*</span></Label>
                    <Input
                      type="date"
                      value={form.startDate}
                      onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                      data-testid="input-invoice-start-date"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>End Date <span className="text-destructive">*</span></Label>
                    <Input
                      type="date"
                      value={form.endDate}
                      onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                      data-testid="input-invoice-end-date"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Hourly Rate (optional)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.defaultRate}
                    onChange={(e) => setForm((f) => ({ ...f, defaultRate: e.target.value }))}
                    placeholder="0.00"
                    data-testid="input-invoice-rate"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Notes (optional)</Label>
                  <Textarea
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="Internal notes for this invoice draft…"
                    rows={2}
                    data-testid="input-invoice-notes"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={generating} data-testid="button-cancel-generate">
                  Cancel
                </Button>
                <Button onClick={handleGenerate} disabled={generating || !form.clientId || !form.startDate || !form.endDate} data-testid="button-confirm-generate">
                  {generating ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <FileText className="h-4 w-4 mr-1.5" />}
                  {generating ? "Generating…" : "Generate"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="px-4 pb-4 space-y-2">
            {[1, 2].map((i) => <Skeleton key={i} className="h-12 w-full rounded" />)}
          </div>
        ) : drafts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <FileText className="h-8 w-8 mb-2 opacity-20" />
            <p className="text-sm">No invoice drafts yet</p>
            <p className="text-xs mt-0.5">Generate a draft from approved time entries</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {drafts.map((draft) => {
              const isExpanded = expandedId === draft.id;
              const isDraft = draft.status === "draft";
              const isPending = exportMutation.isPending || cancelMutation.isPending;
              return (
                <div key={draft.id} data-testid={`invoice-draft-${draft.id}`}>
                  <div
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : draft.id)}
                  >
                    <button className="text-muted-foreground shrink-0">
                      {isExpanded
                        ? <ChevronDownIcon className="h-3.5 w-3.5" />
                        : <ChevronRight className="h-3.5 w-3.5" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate" data-testid={`text-draft-client-${draft.id}`}>
                          {draft.clientName || "Unknown Client"}
                        </span>
                        {draft.projectName && (
                          <span className="text-xs text-muted-foreground">· {draft.projectName}</span>
                        )}
                        <InvoiceDraftStatusBadge status={draft.status} />
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-muted-foreground tabular-nums" data-testid={`text-draft-hours-${draft.id}`}>
                          {parseFloat(draft.totalHours).toFixed(1)}h
                        </span>
                        {parseFloat(draft.totalAmount) > 0 && (
                          <span className="text-xs text-muted-foreground tabular-nums">
                            ${parseFloat(draft.totalAmount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {new Date(draft.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    {isDraft && (
                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs gap-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                          onClick={() => exportMutation.mutate(draft.id)}
                          disabled={isPending}
                          data-testid={`button-export-draft-${draft.id}`}
                        >
                          <Download className="h-3.5 w-3.5" />
                          Export
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs gap-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                          onClick={() => cancelMutation.mutate(draft.id)}
                          disabled={isPending}
                          data-testid={`button-cancel-draft-${draft.id}`}
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                  {isExpanded && (
                    <div className="px-4 pb-3 bg-muted/10">
                      {draft.notes && (
                        <p className="text-xs text-muted-foreground mb-2 italic">{draft.notes}</p>
                      )}
                      {draft.items.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No items</p>
                      ) : (
                        <div className="space-y-1">
                          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wide pb-1 border-b border-border/50">
                            <span>Description</span>
                            <span className="text-right">Hours</span>
                            <span className="text-right hidden sm:block">Rate</span>
                            <span className="text-right">Amount</span>
                          </div>
                          {draft.items.map((item) => (
                            <div key={item.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 text-xs py-0.5" data-testid={`invoice-item-${item.id}`}>
                              <span className="truncate text-muted-foreground">{item.description}</span>
                              <span className="tabular-nums text-right">{parseFloat(item.hours).toFixed(1)}h</span>
                              <span className="tabular-nums text-right hidden sm:block text-muted-foreground">
                                {parseFloat(item.rate) > 0 ? `$${parseFloat(item.rate).toFixed(2)}` : "—"}
                              </span>
                              <span className="tabular-nums text-right font-medium">
                                {parseFloat(item.amount) > 0 ? `$${parseFloat(item.amount).toFixed(2)}` : "—"}
                              </span>
                            </div>
                          ))}
                          <Separator className="my-1" />
                          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 text-xs font-semibold">
                            <span>Total</span>
                            <span className="tabular-nums text-right">{parseFloat(draft.totalHours).toFixed(1)}h</span>
                            <span className="hidden sm:block" />
                            <span className="tabular-nums text-right">
                              {parseFloat(draft.totalAmount) > 0
                                ? `$${parseFloat(draft.totalAmount).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                                : "—"}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function PmPortfolioDashboard() {
  const { enablePmPortfolioDashboard, enableReassignmentSuggestions, enableAiPmFocusSummary, enableBillingApprovalWorkflow, enableInvoiceDraftBuilder, enableClientProfitability } = useFeatureFlags();
  const { user } = useAuth();
  const canAccessPmPortfolio =
    user?.role === "super_user" ||
    user?.role === "tenant_owner" ||
    (user?.role === "admin" && (user as any)?.isProjectManager === true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("healthScore");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [riskFilter, setRiskFilter] = useState<"all" | "at_risk" | "critical" | "burn">("all");

  const { data, isLoading, isError, refetch, isFetching } = useQuery<PmPortfolioResult>({
    queryKey: ["/api/reports/pm/portfolio"],
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  if (!enablePmPortfolioDashboard || !canAccessPmPortfolio) {
    return <Redirect to="/" />;
  }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const projects = data?.projects ?? [];
  const summary = data?.summary;

  const filtered = projects
    .filter((p) => {
      const q = search.toLowerCase();
      if (q && !p.name.toLowerCase().includes(q) && !(p.clientName || "").toLowerCase().includes(q)) {
        return false;
      }
      if (riskFilter === "at_risk") return p.riskTrend === "at_risk";
      if (riskFilter === "critical") return p.riskTrend === "critical";
      if (riskFilter === "burn") return p.isBurnRisk;
      return true;
    })
    .sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;
      switch (sortKey) {
        case "name":
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case "healthScore":
          aVal = a.healthScore;
          bVal = b.healthScore;
          break;
        case "burnPercent":
          aVal = a.burnPercent ?? -1;
          bVal = b.burnPercent ?? -1;
          break;
        case "overdueTasksCount":
          aVal = a.overdueTasksCount;
          bVal = b.overdueTasksCount;
          break;
        case "milestoneCompletionPct":
          aVal = a.milestoneCompletionPct ?? -1;
          bVal = b.milestoneCompletionPct ?? -1;
          break;
        case "riskTrend": {
          const order = { critical: 0, at_risk: 1, stable: 2 };
          aVal = order[a.riskTrend];
          bVal = order[b.riskTrend];
          break;
        }
      }
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="border-b border-border bg-background sticky top-0 z-10 px-3 sm:px-4 lg:px-6 py-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <FolderKanban className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold" data-testid="heading-pm-portfolio">PM Dashboard</h1>
              <p className="text-xs text-muted-foreground">Projects where you are the owner</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-1.5"
            data-testid="button-refresh-portfolio"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex-1 p-3 sm:p-4 lg:p-6 space-y-6">
        {isError && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="pt-6 text-sm text-destructive">
              Failed to load portfolio data. You may not own any projects, or an error occurred.
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => <SummaryCardSkeleton key={i} />)
          ) : (
            <>
              <Card data-testid="card-total-projects">
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <FolderKanban className="h-3.5 w-3.5" />
                    Projects
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4 px-4">
                  <p className="text-2xl font-bold" data-testid="stat-total-projects">{summary?.totalProjects ?? 0}</p>
                </CardContent>
              </Card>

              <Card data-testid="card-health-score">
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5" />
                    Avg Health
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4 px-4">
                  <p
                    className={cn(
                      "text-2xl font-bold",
                      (summary?.avgHealthScore ?? 100) >= 80
                        ? "text-emerald-600 dark:text-emerald-400"
                        : (summary?.avgHealthScore ?? 100) >= 60
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-red-600 dark:text-red-400"
                    )}
                    data-testid="stat-avg-health"
                  >
                    {summary?.avgHealthScore ?? 100}
                  </p>
                </CardContent>
              </Card>

              <Card data-testid="card-at-risk">
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    At Risk
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4 px-4">
                  <p
                    className={cn("text-2xl font-bold", (summary?.atRiskCount ?? 0) > 0 && "text-amber-600 dark:text-amber-400")}
                    data-testid="stat-at-risk"
                  >
                    {summary?.atRiskCount ?? 0}
                  </p>
                </CardContent>
              </Card>

              <Card data-testid="card-burn-risk">
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Flame className="h-3.5 w-3.5" />
                    Burn Risk
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4 px-4">
                  <p
                    className={cn("text-2xl font-bold", (summary?.burnRiskCount ?? 0) > 0 && "text-orange-600 dark:text-orange-400")}
                    data-testid="stat-burn-risk"
                  >
                    {summary?.burnRiskCount ?? 0}
                  </p>
                </CardContent>
              </Card>

              <Card data-testid="card-overdue-tasks">
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Overdue Tasks
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4 px-4">
                  <p
                    className={cn("text-2xl font-bold", (summary?.totalOverdueTasks ?? 0) > 0 && "text-red-600 dark:text-red-400")}
                    data-testid="stat-overdue-tasks"
                  >
                    {summary?.totalOverdueTasks ?? 0}
                  </p>
                </CardContent>
              </Card>

              <Card data-testid="card-in-review">
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5" />
                    In Review
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4 px-4">
                  <p
                    className={cn("text-2xl font-bold", (summary?.totalTasksInReview ?? 0) > 0 && "text-violet-600 dark:text-violet-400")}
                    data-testid="stat-in-review"
                  >
                    {summary?.totalTasksInReview ?? 0}
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-sm font-semibold">Project Portfolio</CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <Input
                  placeholder="Search projects..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 w-48"
                  data-testid="input-portfolio-search"
                />
                <div className="flex items-center gap-1">
                  {(["all", "at_risk", "critical", "burn"] as const).map((f) => (
                    <Button
                      key={f}
                      variant={riskFilter === f ? "default" : "outline"}
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setRiskFilter(f)}
                      data-testid={`filter-${f}`}
                    >
                      {f === "all" ? "All" : f === "at_risk" ? "At Risk" : f === "critical" ? "Critical" : "Burn Risk"}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="px-6 pb-6">
                <TableSkeleton />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <FolderKanban className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm font-medium">No projects found</p>
                <p className="text-xs mt-1">
                  {projects.length === 0
                    ? "You are not the owner of any active projects"
                    : "No projects match your current filters"}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-portfolio">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                        <button
                          className="flex items-center gap-1 hover:text-foreground transition-colors"
                          onClick={() => handleSort("name")}
                          data-testid="sort-name"
                        >
                          Project
                          <SortIcon sortKey="name" current={sortKey} dir={sortDir} />
                        </button>
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">
                        Client
                      </th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">
                        <button
                          className="flex items-center gap-1 hover:text-foreground transition-colors"
                          onClick={() => handleSort("healthScore")}
                          data-testid="sort-health"
                        >
                          Health
                          <SortIcon sortKey="healthScore" current={sortKey} dir={sortDir} />
                        </button>
                      </th>
                      <th className="px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">
                        <button
                          className="flex items-center gap-1 hover:text-foreground transition-colors"
                          onClick={() => handleSort("milestoneCompletionPct")}
                          data-testid="sort-milestones"
                        >
                          Milestones
                          <SortIcon sortKey="milestoneCompletionPct" current={sortKey} dir={sortDir} />
                        </button>
                      </th>
                      <th className="px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">
                        <button
                          className="flex items-center gap-1 hover:text-foreground transition-colors"
                          onClick={() => handleSort("burnPercent")}
                          data-testid="sort-burn"
                        >
                          Burn %
                          <SortIcon sortKey="burnPercent" current={sortKey} dir={sortDir} />
                        </button>
                      </th>
                      <th className="px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">
                        <button
                          className="flex items-center gap-1 hover:text-foreground transition-colors"
                          onClick={() => handleSort("overdueTasksCount")}
                          data-testid="sort-overdue"
                        >
                          Overdue
                          <SortIcon sortKey="overdueTasksCount" current={sortKey} dir={sortDir} />
                        </button>
                      </th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">
                        <button
                          className="flex items-center gap-1 hover:text-foreground transition-colors"
                          onClick={() => handleSort("riskTrend")}
                          data-testid="sort-risk"
                        >
                          Risk
                          <SortIcon sortKey="riskTrend" current={sortKey} dir={sortDir} />
                        </button>
                      </th>
                      <th className="px-4 py-3 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((project) => (
                      <tr
                        key={project.projectId}
                        className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                        data-testid={`row-project-${project.projectId}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className="h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: project.color || "#3B82F6" }}
                            />
                            <span className="font-medium truncate max-w-[160px]" data-testid={`text-project-name-${project.projectId}`}>
                              {project.name}
                            </span>
                            {project.tasksInReviewCount > 0 && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 shrink-0">
                                {project.tasksInReviewCount} review
                              </Badge>
                            )}
                            {project.needsAck && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 shrink-0" data-testid={`badge-ack-needed-${project.projectId}`}>
                                Ack Needed
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell text-xs">
                          {project.clientName || <span className="opacity-50">—</span>}
                        </td>
                        <td className="px-4 py-3 min-w-[120px]">
                          <HealthBar score={project.healthScore} />
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          {project.milestoneCompletionPct !== null ? (
                            <div className="flex items-center gap-2 min-w-[80px]">
                              <Progress value={project.milestoneCompletionPct} className="h-1.5 flex-1" />
                              <span className="text-xs tabular-nums text-muted-foreground w-10 text-right">
                                {project.milestoneCompletionPct}%
                              </span>
                              {project.hasMilestoneOverdue && (
                                <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground opacity-50">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          {project.burnPercent !== null ? (
                            <div className="flex items-center gap-1.5">
                              <span
                                className={cn(
                                  "text-sm font-medium tabular-nums",
                                  project.isBurnRisk
                                    ? "text-red-600 dark:text-red-400"
                                    : project.burnPercent >= 60
                                    ? "text-amber-600 dark:text-amber-400"
                                    : "text-foreground"
                                )}
                                data-testid={`text-burn-${project.projectId}`}
                              >
                                {project.burnPercent}%
                              </span>
                              {project.isBurnRisk && (
                                <Flame className="h-3.5 w-3.5 text-red-500 shrink-0" />
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground opacity-50">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          {project.overdueTasksCount > 0 ? (
                            <span
                              className="text-sm font-medium text-red-600 dark:text-red-400 tabular-nums"
                              data-testid={`text-overdue-${project.projectId}`}
                            >
                              {project.overdueTasksCount}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground opacity-50">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <RiskBadge trend={project.riskTrend} />
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/projects/${project.projectId}`}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              data-testid={`link-project-${project.projectId}`}
                            >
                              <ArrowRight className="h-4 w-4" />
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {enableAiPmFocusSummary && (
          <AiFocusSummaryCard />
        )}

        {enableBillingApprovalWorkflow && (
          <BillingApprovalQueueCard />
        )}

        {enableInvoiceDraftBuilder && (
          <InvoiceDraftsCard />
        )}

        {enableClientProfitability && (
          <LowMarginClientsCard />
        )}

        {enableReassignmentSuggestions && (
          <ReassignmentSuggestionsCard limit={5} />
        )}

        {!isLoading && summary && summary.atRiskCount > 0 && (
          <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                Needs Attention
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {projects
                .filter((p) => p.riskTrend !== "stable")
                .slice(0, 3)
                .map((p) => (
                  <Link key={p.projectId} href={`/projects/${p.projectId}`}>
                    <div
                      className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-md hover:bg-amber-100/70 dark:hover:bg-amber-900/20 transition-colors cursor-pointer"
                      data-testid={`attention-project-${p.projectId}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: p.color || "#3B82F6" }} />
                        <span className="text-sm font-medium truncate">{p.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {p.overdueTasksCount > 0 && (
                          <span className="text-xs text-muted-foreground">{p.overdueTasksCount} overdue</span>
                        )}
                        {p.isBurnRisk && <Flame className="h-3.5 w-3.5 text-red-500" />}
                        {p.hasMilestoneOverdue && <Clock className="h-3.5 w-3.5 text-amber-500" />}
                        {p.tasksInReviewCount > 0 && <MessageSquare className="h-3.5 w-3.5 text-violet-500" />}
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    </div>
                  </Link>
                ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
