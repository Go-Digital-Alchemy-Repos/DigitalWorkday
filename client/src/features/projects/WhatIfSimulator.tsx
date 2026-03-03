import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Zap,
  X,
  Play,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  Users,
  TrendingUp,
  TrendingDown,
  Minus,
  Save,
  Loader2,
  RotateCcw,
  FlameKindling,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
import { cn } from "@/lib/utils";
import type { TaskWithRelations } from "@shared/schema";

interface WhatIfSimulatorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
}

interface TenantUser {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
}

interface TaskChange {
  taskId: string;
  taskTitle: string;
  currentAssigneeId: string | null;
  currentDueDate: string | null;
  currentEstimateMinutes: number;
  reassignTo: string;
  newDueDate: string;
  newEstimateHours: string;
}

interface WhatIfResult {
  projectId: string;
  projectName: string;
  rangeStart: string;
  rangeEnd: string;
  before: StateSnapshot;
  after: StateSnapshot;
  delta: Delta;
  appliedChanges: { reassignments: number; dueDateMoves: number; estimateAdjustments: number };
}

interface StateSnapshot {
  utilizationByUser: UserUtilization[];
  projectRisk: { level: "stable" | "at_risk" | "critical"; drivers: string[] };
  burn: BurnSnapshot | null;
}

interface UserUtilization {
  userId: string;
  userName: string;
  utilizationPct: number;
  hoursPlanned: number;
}

interface BurnSnapshot {
  percentConsumed: number;
  loggedHours: number;
  budgetHours: number;
  projectedFinalHours: number;
  predictedOverrunDate: string | null;
}

interface Delta {
  utilizationShift: UtilizationShift[];
  riskDelta: { from: string; to: string };
  burnDelta: { projectedFinalHoursDelta: number } | null;
}

interface UtilizationShift {
  userId: string;
  userName: string;
  deltaUtilizationPct: number;
  before: number;
  after: number;
}

function getUserDisplayName(user: TenantUser): string {
  if (user.name) return user.name;
  if (user.firstName || user.lastName)
    return [user.firstName, user.lastName].filter(Boolean).join(" ");
  return user.email;
}

function RiskBadge({ level }: { level: string }) {
  if (level === "critical")
    return (
      <Badge className="bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-400">
        <XCircle className="h-3 w-3 mr-1" />
        Critical
      </Badge>
    );
  if (level === "at_risk")
    return (
      <Badge className="bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400">
        <AlertTriangle className="h-3 w-3 mr-1" />
        At Risk
      </Badge>
    );
  return (
    <Badge className="bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400">
      <CheckCircle2 className="h-3 w-3 mr-1" />
      Stable
    </Badge>
  );
}

function UtilBar({ pct }: { pct: number }) {
  const capped = Math.min(pct, 100);
  const color =
    pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${capped}%` }} />
      </div>
      <span className="text-xs font-mono w-12 text-right shrink-0">{pct}%</span>
    </div>
  );
}

export function WhatIfSimulator({ open, onOpenChange, projectId, projectName }: WhatIfSimulatorProps) {
  const { toast } = useToast();
  const { enableWhatifSnapshots } = useFeatureFlags();

  const today = new Date();
  const twoWeeks = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().split("T")[0];

  const [rangeStart, setRangeStart] = useState(fmt(today));
  const [rangeEnd, setRangeEnd] = useState(fmt(twoWeeks));
  const [taskChanges, setTaskChanges] = useState<Record<string, TaskChange>>({});
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const { data: tasks = [] } = useQuery<TaskWithRelations[]>({
    queryKey: ["/api/projects", projectId, "tasks"],
    enabled: open && !!projectId,
  });

  const { data: tenantUsers = [] } = useQuery<TenantUser[]>({
    queryKey: ["/api/users"],
    enabled: open,
  });

  const activeTasks = useMemo(
    () => tasks.filter((t) => !["done", "completed"].includes(t.status)),
    [tasks]
  );

  const simulateMutation = useMutation({
    mutationFn: async () => {
      const changes = buildChangesPayload();
      const resp = await apiRequest("POST", "/api/ops/whatif/project", {
        projectId,
        rangeStart,
        rangeEnd,
        changes,
      });
      return resp.json() as Promise<WhatIfResult>;
    },
    onSuccess: (data) => {
      setResult(data);
    },
    onError: (err: any) => {
      toast({ title: "Simulation failed", description: err?.message || "Please try again", variant: "destructive" });
    },
  });

  function buildChangesPayload() {
    const reassign: { taskId: string; toUserId: string }[] = [];
    const moveDueDate: { taskId: string; newDueDate: string }[] = [];
    const adjustEstimateHours: { taskId: string; newEstimateHours: number }[] = [];

    for (const change of Object.values(taskChanges)) {
      if (change.reassignTo && change.reassignTo !== change.currentAssigneeId) {
        reassign.push({ taskId: change.taskId, toUserId: change.reassignTo });
      }
      if (change.newDueDate && change.newDueDate !== change.currentDueDate) {
        moveDueDate.push({ taskId: change.taskId, newDueDate: change.newDueDate });
      }
      if (change.newEstimateHours !== "") {
        const hrs = parseFloat(change.newEstimateHours);
        const currentHrs = change.currentEstimateMinutes / 60;
        if (!isNaN(hrs) && Math.abs(hrs - currentHrs) > 0.01) {
          adjustEstimateHours.push({ taskId: change.taskId, newEstimateHours: hrs });
        }
      }
    }

    return { reassign, moveDueDate, adjustEstimateHours };
  }

  function hasChanges() {
    const payload = buildChangesPayload();
    return (
      payload.reassign.length > 0 ||
      payload.moveDueDate.length > 0 ||
      payload.adjustEstimateHours.length > 0
    );
  }

  function getOrInitChange(task: TaskWithRelations): TaskChange {
    if (taskChanges[task.id]) return taskChanges[task.id];
    const firstAssignee = task.assignees?.[0]?.userId ?? task.assignees?.[0] ?? null;
    return {
      taskId: task.id,
      taskTitle: task.title,
      currentAssigneeId: typeof firstAssignee === "string" ? firstAssignee : (firstAssignee as any)?.userId ?? null,
      currentDueDate: task.dueDate ? new Date(task.dueDate).toISOString().split("T")[0] : null,
      currentEstimateMinutes: task.estimateMinutes ?? 0,
      reassignTo: "",
      newDueDate: "",
      newEstimateHours: "",
    };
  }

  function updateChange(task: TaskWithRelations, field: keyof TaskChange, value: string) {
    setTaskChanges((prev) => ({
      ...prev,
      [task.id]: { ...getOrInitChange(task), [field]: value },
    }));
    setResult(null);
  }

  async function handleApplyChanges() {
    const payload = buildChangesPayload();
    setIsApplying(true);
    setApplyDialogOpen(false);

    try {
      const mutations: Promise<void>[] = [];

      for (const r of payload.reassign) {
        mutations.push(
          apiRequest("POST", `/api/tasks/${r.taskId}/assignees`, { userId: r.toUserId }).then(
            () => {}
          )
        );
      }

      for (const d of payload.moveDueDate) {
        mutations.push(
          apiRequest("PATCH", `/api/tasks/${d.taskId}`, { dueDate: d.newDueDate }).then(() => {})
        );
      }

      for (const e of payload.adjustEstimateHours) {
        const estimateMinutes = Math.round(e.newEstimateHours * 60);
        mutations.push(
          apiRequest("PATCH", `/api/tasks/${e.taskId}`, { estimateMinutes }).then(() => {})
        );
      }

      await Promise.allSettled(mutations);

      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "sections"] });

      toast({
        title: "Changes applied",
        description: `Applied ${payload.reassign.length} reassignments, ${payload.moveDueDate.length} date changes, ${payload.adjustEstimateHours.length} estimate updates`,
      });

      setTaskChanges({});
      setResult(null);
    } catch (err: any) {
      toast({ title: "Some changes failed", description: err?.message, variant: "destructive" });
    } finally {
      setIsApplying(false);
    }
  }

  async function handleSaveSnapshot() {
    if (!result) return;
    setIsSaving(true);
    try {
      await apiRequest("POST", "/api/ops/whatif/project/snapshot", {
        projectId,
        rangeStart,
        rangeEnd,
        label: `${projectName} — What-if (${rangeStart} to ${rangeEnd})`,
        result,
      });
      toast({ title: "Snapshot saved", description: "Scenario saved for later review" });
    } catch (err: any) {
      toast({ title: "Save failed", description: err?.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }

  function handleReset() {
    setTaskChanges({});
    setResult(null);
  }

  const changedCount = Object.values(taskChanges).filter((c) => {
    const payload = buildChangesPayload();
    return (
      payload.reassign.some((r) => r.taskId === c.taskId) ||
      payload.moveDueDate.some((d) => d.taskId === c.taskId) ||
      payload.adjustEstimateHours.some((e) => e.taskId === c.taskId)
    );
  }).length;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-[680px] flex flex-col p-0 gap-0"
          data-testid="whatif-simulator-sheet"
        >
          <SheetHeader className="px-5 pt-5 pb-4 border-b border-border shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                  <Zap className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <SheetTitle className="text-base">What-if Simulator</SheetTitle>
                  <p className="text-xs text-muted-foreground">{projectName}</p>
                </div>
              </div>
              {changedCount > 0 && (
                <Button variant="ghost" size="sm" onClick={handleReset} data-testid="button-whatif-reset">
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  Reset
                </Button>
              )}
            </div>
          </SheetHeader>

          <ScrollArea className="flex-1 min-h-0">
            <div className="px-5 py-4 space-y-5">
              {/* Date Range */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Simulation Window
                </Label>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground mb-1 block">From</Label>
                    <Input
                      type="date"
                      value={rangeStart}
                      onChange={(e) => { setRangeStart(e.target.value); setResult(null); }}
                      className="h-8 text-sm"
                      data-testid="input-whatif-range-start"
                    />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground mt-5 shrink-0" />
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground mb-1 block">To</Label>
                    <Input
                      type="date"
                      value={rangeEnd}
                      onChange={(e) => { setRangeEnd(e.target.value); setResult(null); }}
                      className="h-8 text-sm"
                      data-testid="input-whatif-range-end"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Task Change Builder */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Task Changes
                  </Label>
                  {changedCount > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {changedCount} change{changedCount !== 1 ? "s" : ""}
                    </Badge>
                  )}
                </div>

                {activeTasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No active tasks in this project
                  </p>
                ) : (
                  <div className="space-y-2">
                    {activeTasks.map((task) => {
                      const change = taskChanges[task.id] || getOrInitChange(task);
                      const primaryAssignee = task.assignees?.[0];
                      const primaryAssigneeId =
                        typeof primaryAssignee === "string"
                          ? primaryAssignee
                          : (primaryAssignee as any)?.userId ?? "";
                      const currentUserName =
                        tenantUsers.find((u) => u.id === primaryAssigneeId)
                          ? getUserDisplayName(tenantUsers.find((u) => u.id === primaryAssigneeId)!)
                          : "Unassigned";
                      const currentEstHours =
                        task.estimateMinutes ? (task.estimateMinutes / 60).toFixed(1) : "";

                      return (
                        <div
                          key={task.id}
                          className="border border-border rounded-lg p-3 space-y-2.5 bg-card"
                          data-testid={`whatif-task-${task.id}`}
                        >
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate" title={task.title}>
                                {task.title}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {currentUserName} · {task.dueDate ? new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "No due date"} · {currentEstHours ? `${currentEstHours}h` : "No estimate"}
                              </p>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <Label className="text-[10px] text-muted-foreground mb-1 block">
                                Reassign to
                              </Label>
                              <Select
                                value={change.reassignTo || "__none__"}
                                onValueChange={(v) => updateChange(task, "reassignTo", v === "__none__" ? "" : v)}
                              >
                                <SelectTrigger className="h-7 text-xs" data-testid={`select-reassign-${task.id}`}>
                                  <SelectValue placeholder="No change" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">No change</SelectItem>
                                  {tenantUsers
                                    .filter((u) => u.id !== primaryAssigneeId)
                                    .map((u) => (
                                      <SelectItem key={u.id} value={u.id}>
                                        {getUserDisplayName(u)}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-[10px] text-muted-foreground mb-1 block">
                                New due date
                              </Label>
                              <Input
                                type="date"
                                value={change.newDueDate}
                                onChange={(e) => updateChange(task, "newDueDate", e.target.value)}
                                className="h-7 text-xs"
                                data-testid={`input-duedate-${task.id}`}
                              />
                            </div>
                            <div>
                              <Label className="text-[10px] text-muted-foreground mb-1 block">
                                Estimate (hrs)
                              </Label>
                              <Input
                                type="number"
                                min="0"
                                step="0.5"
                                placeholder={currentEstHours || "0"}
                                value={change.newEstimateHours}
                                onChange={(e) => updateChange(task, "newEstimateHours", e.target.value)}
                                className="h-7 text-xs"
                                data-testid={`input-estimate-${task.id}`}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Simulation Results */}
              {result && (
                <>
                  <Separator />
                  <div className="space-y-4" data-testid="whatif-results">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-violet-500" />
                      <span className="text-sm font-semibold">Simulation Results</span>
                      <Badge variant="secondary" className="text-xs">
                        {result.appliedChanges.reassignments} reassign · {result.appliedChanges.dueDateMoves} dates · {result.appliedChanges.estimateAdjustments} estimates
                      </Badge>
                    </div>

                    {/* Risk Delta */}
                    <div className="border border-border rounded-lg p-3 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Project Risk
                      </p>
                      <div className="flex items-center gap-3">
                        <RiskBadge level={result.before.projectRisk.level} />
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <RiskBadge level={result.after.projectRisk.level} />
                      </div>
                      {result.after.projectRisk.drivers.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {result.after.projectRisk.drivers.join(" · ")}
                        </p>
                      )}
                    </div>

                    {/* Utilization Shifts */}
                    {result.delta.utilizationShift.length > 0 && (
                      <div className="border border-border rounded-lg p-3 space-y-3">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Utilization Impact
                        </p>
                        <div className="space-y-2">
                          {result.delta.utilizationShift.slice(0, 8).map((shift) => (
                            <div key={shift.userId} className="space-y-1" data-testid={`util-shift-${shift.userId}`}>
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium truncate">{shift.userName}</span>
                                <span
                                  className={cn(
                                    "text-xs font-mono flex items-center gap-0.5",
                                    shift.deltaUtilizationPct > 0
                                      ? "text-red-500"
                                      : shift.deltaUtilizationPct < 0
                                      ? "text-emerald-500"
                                      : "text-muted-foreground"
                                  )}
                                >
                                  {shift.deltaUtilizationPct > 0 ? (
                                    <TrendingUp className="h-3 w-3" />
                                  ) : shift.deltaUtilizationPct < 0 ? (
                                    <TrendingDown className="h-3 w-3" />
                                  ) : (
                                    <Minus className="h-3 w-3" />
                                  )}
                                  {shift.deltaUtilizationPct > 0 ? "+" : ""}{shift.deltaUtilizationPct}%
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <p className="text-[10px] text-muted-foreground mb-0.5">Before</p>
                                  <UtilBar pct={shift.before} />
                                </div>
                                <div>
                                  <p className="text-[10px] text-muted-foreground mb-0.5">After</p>
                                  <UtilBar pct={shift.after} />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {result.delta.utilizationShift.length === 0 && (
                      <div className="text-xs text-muted-foreground text-center py-2 border border-border rounded-lg">
                        No significant utilization changes detected
                      </div>
                    )}

                    {/* Burn Delta */}
                    {result.before.burn && result.after.burn && (
                      <div className="border border-border rounded-lg p-3 space-y-2">
                        <div className="flex items-center gap-1.5">
                          <FlameKindling className="h-3.5 w-3.5 text-orange-500" />
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Budget Burn
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div className="space-y-1">
                            <p className="text-[10px] text-muted-foreground">Before</p>
                            <p className="font-medium">{result.before.burn.projectedFinalHours}h projected</p>
                            <p className="text-xs text-muted-foreground">{result.before.burn.percentConsumed}% consumed · {result.before.burn.budgetHours}h budget</p>
                            {result.before.burn.predictedOverrunDate && (
                              <p className="text-xs text-red-500">Overrun: {result.before.burn.predictedOverrunDate}</p>
                            )}
                          </div>
                          <div className="space-y-1">
                            <p className="text-[10px] text-muted-foreground">After</p>
                            <p className={cn("font-medium", result.delta.burnDelta && result.delta.burnDelta.projectedFinalHoursDelta < 0 ? "text-emerald-600" : result.delta.burnDelta && result.delta.burnDelta.projectedFinalHoursDelta > 0 ? "text-red-500" : "")}>
                              {result.after.burn.projectedFinalHours}h projected
                            </p>
                            <p className="text-xs text-muted-foreground">{result.after.burn.percentConsumed}% consumed</p>
                            {result.after.burn.predictedOverrunDate && (
                              <p className="text-xs text-red-500">Overrun: {result.after.burn.predictedOverrunDate}</p>
                            )}
                          </div>
                        </div>
                        {result.delta.burnDelta && result.delta.burnDelta.projectedFinalHoursDelta !== 0 && (
                          <p className={cn("text-xs font-medium", result.delta.burnDelta.projectedFinalHoursDelta < 0 ? "text-emerald-600" : "text-red-500")}>
                            {result.delta.burnDelta.projectedFinalHoursDelta > 0 ? "+" : ""}{result.delta.burnDelta.projectedFinalHoursDelta}h projected change
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </ScrollArea>

          {/* Footer Actions */}
          <div className="px-5 py-4 border-t border-border shrink-0 space-y-2">
            <Button
              className="w-full"
              onClick={() => simulateMutation.mutate()}
              disabled={!hasChanges() || simulateMutation.isPending}
              data-testid="button-run-simulation"
            >
              {simulateMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Running Simulation...</>
              ) : (
                <><Play className="h-4 w-4 mr-2" />Run Simulation</>
              )}
            </Button>

            {result && hasChanges() && (
              <div className="flex gap-2">
                <Button
                  variant="default"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => setApplyDialogOpen(true)}
                  disabled={isApplying}
                  data-testid="button-apply-changes"
                >
                  {isApplying ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Applying...</>
                  ) : (
                    <><CheckCircle2 className="h-4 w-4 mr-2" />Apply Changes</>
                  )}
                </Button>
                {enableWhatifSnapshots && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleSaveSnapshot}
                    disabled={isSaving}
                    title="Save snapshot"
                    data-testid="button-save-snapshot"
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  </Button>
                )}
              </div>
            )}

            <p className="text-[10px] text-muted-foreground text-center">
              Simulation is advisory only — no changes are made until you click Apply
            </p>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={applyDialogOpen} onOpenChange={setApplyDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply Changes to Project?</AlertDialogTitle>
            <AlertDialogDescription>
              This will apply{" "}
              {result && (
                <>
                  {result.appliedChanges.reassignments > 0 && `${result.appliedChanges.reassignments} reassignment${result.appliedChanges.reassignments !== 1 ? "s" : ""}`}
                  {result.appliedChanges.reassignments > 0 && (result.appliedChanges.dueDateMoves > 0 || result.appliedChanges.estimateAdjustments > 0) && ", "}
                  {result.appliedChanges.dueDateMoves > 0 && `${result.appliedChanges.dueDateMoves} due date change${result.appliedChanges.dueDateMoves !== 1 ? "s" : ""}`}
                  {result.appliedChanges.dueDateMoves > 0 && result.appliedChanges.estimateAdjustments > 0 && ", "}
                  {result.appliedChanges.estimateAdjustments > 0 && `${result.appliedChanges.estimateAdjustments} estimate update${result.appliedChanges.estimateAdjustments !== 1 ? "s" : ""}`}
                </>
              )}{" "}
              to <strong>{projectName}</strong>. These are real changes — they cannot be undone automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-apply">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleApplyChanges} data-testid="button-confirm-apply">
              Apply Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
