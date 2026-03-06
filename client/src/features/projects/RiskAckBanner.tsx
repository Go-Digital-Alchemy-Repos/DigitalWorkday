/**
 * RiskAckBanner — Risk Acknowledgment Governance UI
 *
 * Shown on the project detail page when a project is at-risk or critical
 * and no acknowledgment has been submitted in the last 7 days.
 *
 * Shows specific overdue tasks and milestones driving the risk,
 * with links to each item. Users can acknowledge directly or
 * navigate to items for more details.
 */
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  AlertTriangle,
  XCircle,
  CheckCircle2,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Loader2,
  Calendar,
  ExternalLink,
  CircleDot,
  Flag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
import { formatDistanceToNow } from "date-fns";

interface OverdueTaskInfo {
  id: string;
  title: string;
  dueDate: string;
  status: string;
  priority: string | null;
}

interface OverdueMilestoneInfo {
  id: string;
  title: string;
  dueDate: string;
}

interface RiskState {
  riskLevel: "stable" | "at_risk" | "critical";
  riskScore: number;
  overdueCount: number;
  burnPercent: number | null;
  hasMilestoneOverdue: boolean;
  drivers: string[];
  overdueTasks: OverdueTaskInfo[];
  overdueMilestones: OverdueMilestoneInfo[];
}

interface AckRecord {
  id: string;
  riskLevel: string;
  riskScore: number | null;
  acknowledgedByUserId: string | null;
  acknowledgedByName: string | null;
  acknowledgedAt: string;
  mitigationNote: string | null;
  nextCheckInDate: string | null;
}

interface RiskAckStatus {
  projectId: string;
  riskState: RiskState;
  needsAck: boolean;
  latestAck: AckRecord | null;
  ackWindowDays: number;
}

interface RiskAckBannerProps {
  projectId: string;
  projectName?: string;
  className?: string;
  onOpenTask?: (taskId: string) => void;
  onViewMilestones?: () => void;
}

function RiskLevelIcon({ level }: { level: string }) {
  if (level === "critical") return <XCircle className="h-4 w-4 text-red-500" />;
  if (level === "at_risk") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
}

function RiskLevelLabel({ level }: { level: string }) {
  if (level === "critical")
    return (
      <span className="font-semibold text-red-700 dark:text-red-400">Critical Risk</span>
    );
  if (level === "at_risk")
    return (
      <span className="font-semibold text-amber-700 dark:text-amber-400">At Risk</span>
    );
  return <span className="font-semibold text-emerald-700 dark:text-emerald-400">Stable</span>;
}

function formatDueDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return dateStr;
  }
}

function PriorityDot({ priority }: { priority: string | null }) {
  if (!priority) return null;
  const colors: Record<string, string> = {
    urgent: "text-red-500",
    high: "text-orange-500",
    medium: "text-yellow-500",
    low: "text-blue-400",
  };
  return <CircleDot className={cn("h-3 w-3 shrink-0", colors[priority] || "text-muted-foreground")} />;
}

export function RiskAckBanner({ projectId, projectName, className, onOpenTask, onViewMilestones }: RiskAckBannerProps) {
  const { enableRiskAckWorkflow } = useFeatureFlags();
  const { toast } = useToast();
  const [ackDialogOpen, setAckDialogOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showLatestAck, setShowLatestAck] = useState(false);
  const [mitigationNote, setMitigationNote] = useState("");
  const [nextCheckInDate, setNextCheckInDate] = useState("");

  const { data: status, isLoading } = useQuery<RiskAckStatus>({
    queryKey: ["/api/projects", projectId, "risk-ack", "status"],
    queryFn: async () => {
      const resp = await fetch(`/api/projects/${projectId}/risk-ack/status`, {
        credentials: "include",
      });
      if (!resp.ok) throw new Error("Failed to fetch risk ack status");
      return resp.json();
    },
    enabled: enableRiskAckWorkflow && !!projectId,
    refetchOnWindowFocus: false,
    staleTime: 2 * 60 * 1000,
  });

  const ackMutation = useMutation({
    mutationFn: async () => {
      const resp = await apiRequest("POST", `/api/projects/${projectId}/risk-ack`, {
        mitigationNote: mitigationNote.trim() || undefined,
        nextCheckInDate: nextCheckInDate || undefined,
      });
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", projectId, "risk-ack", "status"],
      });
      setAckDialogOpen(false);
      setMitigationNote("");
      setNextCheckInDate("");
      toast({
        title: "Risk acknowledged",
        description: "Your acknowledgment has been recorded.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Failed to acknowledge",
        description: err?.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  if (!enableRiskAckWorkflow || isLoading || !status) return null;
  if (status.riskState.riskLevel === "stable" && !status.latestAck) return null;

  const { riskState, needsAck, latestAck } = status;
  const isCritical = riskState.riskLevel === "critical";
  const isAtRisk = riskState.riskLevel === "at_risk";

  if (riskState.riskLevel === "stable" && !latestAck) return null;

  const hasOverdueTasks = riskState.overdueTasks && riskState.overdueTasks.length > 0;
  const hasOverdueMilestones = riskState.overdueMilestones && riskState.overdueMilestones.length > 0;
  const hasDetailItems = hasOverdueTasks || hasOverdueMilestones;

  const handleTaskClick = (taskId: string) => {
    if (onOpenTask) {
      onOpenTask(taskId);
    }
  };

  return (
    <>
      {(needsAck || riskState.riskLevel !== "stable") && (
        <div
          className={cn(
            "rounded-lg border px-4 py-3 space-y-2",
            needsAck && isCritical
              ? "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800"
              : needsAck && isAtRisk
              ? "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800"
              : "bg-muted/50 border-border",
            className
          )}
          data-testid="risk-ack-banner"
        >
          <div className="flex items-start gap-3">
            <div className="shrink-0 mt-0.5">
              <RiskLevelIcon level={riskState.riskLevel} />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <RiskLevelLabel level={riskState.riskLevel} />
                {needsAck && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] px-1.5 py-0 h-4",
                      isCritical
                        ? "border-red-400 text-red-700 dark:text-red-400"
                        : "border-amber-400 text-amber-700 dark:text-amber-400"
                    )}
                    data-testid="badge-ack-needed"
                  >
                    Acknowledgment Required
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {projectName && <span className="font-medium text-foreground">{projectName}</span>}
                {projectName && riskState.drivers.length > 0 && " — "}
                {riskState.drivers.join(" · ")}
                {riskState.riskScore !== undefined && (
                  <span className="ml-1 text-muted-foreground/70">(Health: {riskState.riskScore}/100)</span>
                )}
              </p>
              {latestAck && !needsAck && (
                <button
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                  onClick={() => setShowLatestAck((v) => !v)}
                  data-testid="button-toggle-latest-ack"
                >
                  <ShieldCheck className="h-3 w-3" />
                  Acknowledged {formatDistanceToNow(new Date(latestAck.acknowledgedAt), { addSuffix: true })}
                  {showLatestAck ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </button>
              )}
              {showLatestAck && latestAck && (
                <div
                  className="mt-2 p-2.5 rounded bg-background border border-border space-y-1 text-xs"
                  data-testid="panel-latest-ack"
                >
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span>
                      By <span className="font-medium text-foreground">{latestAck.acknowledgedByName ?? "Unknown"}</span>
                    </span>
                    <span>·</span>
                    <span>{new Date(latestAck.acknowledgedAt).toLocaleDateString()}</span>
                    {latestAck.nextCheckInDate && (
                      <>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Next check-in: {latestAck.nextCheckInDate}
                        </span>
                      </>
                    )}
                  </div>
                  {latestAck.mitigationNote && (
                    <p className="text-foreground leading-relaxed">{latestAck.mitigationNote}</p>
                  )}
                </div>
              )}
            </div>
            <div className="shrink-0 flex items-center gap-2">
              {needsAck && hasDetailItems && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs h-7 px-2"
                  onClick={() => setShowDetails((v) => !v)}
                  data-testid="button-toggle-risk-details"
                >
                  {showDetails ? "Hide" : "Details"}
                  {showDetails ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
                </Button>
              )}
              {needsAck && (
                <Button
                  size="sm"
                  variant={isCritical ? "destructive" : "outline"}
                  className={cn(
                    !isCritical && "border-amber-400 text-amber-700 hover:bg-amber-50 dark:border-amber-600 dark:text-amber-400 dark:hover:bg-amber-950/30"
                  )}
                  onClick={() => setAckDialogOpen(true)}
                  data-testid="button-open-ack-dialog"
                >
                  <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                  Acknowledge
                </Button>
              )}
            </div>
          </div>

          {showDetails && needsAck && hasDetailItems && (
            <div className="ml-7 space-y-2 pb-1" data-testid="risk-details-panel">
              {hasOverdueTasks && (
                <div className="space-y-1">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Overdue Tasks
                  </p>
                  <div className="space-y-0.5">
                    {riskState.overdueTasks.map((task) => (
                      <button
                        key={task.id}
                        className="w-full flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-background/80 transition-colors text-left group"
                        onClick={() => handleTaskClick(task.id)}
                        data-testid={`risk-task-link-${task.id}`}
                      >
                        <PriorityDot priority={task.priority} />
                        <span className="flex-1 min-w-0 truncate font-medium text-foreground group-hover:underline">
                          {task.title}
                        </span>
                        <span className="text-[10px] text-red-500 dark:text-red-400 shrink-0">
                          due {formatDueDate(task.dueDate)}
                        </span>
                        <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {hasOverdueMilestones && (
                <div className="space-y-1">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Overdue Milestones
                  </p>
                  <div className="space-y-0.5">
                    {riskState.overdueMilestones.map((ms) => (
                      <button
                        key={ms.id}
                        className="w-full flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-background/80 transition-colors text-left group"
                        onClick={() => onViewMilestones?.()}
                        data-testid={`risk-milestone-${ms.id}`}
                      >
                        <Flag className="h-3 w-3 text-red-500 shrink-0" />
                        <span className="flex-1 min-w-0 truncate font-medium text-foreground group-hover:underline">
                          {ms.title}
                        </span>
                        <span className="text-[10px] text-red-500 dark:text-red-400 shrink-0">
                          due {formatDueDate(ms.dueDate)}
                        </span>
                        <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {riskState.burnPercent !== null && riskState.burnPercent >= 80 && (
                <div className="flex items-center gap-2 text-xs px-2 py-1">
                  <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                  <span className="text-muted-foreground">
                    Budget is <span className="font-medium text-foreground">{riskState.burnPercent}%</span> consumed
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <Dialog open={ackDialogOpen} onOpenChange={setAckDialogOpen}>
        <DialogContent className="sm:max-w-lg" data-testid="dialog-risk-ack">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-amber-500" />
              Acknowledge Project Risk
            </DialogTitle>
            <DialogDescription>
              {projectName && <><strong>{projectName}</strong> is currently </>}
              {!projectName && <>This project is currently </>}
              <strong>{riskState.riskLevel === "critical" ? "Critical" : "At Risk"}</strong>{" "}
              with a health score of {riskState.riskScore}/100.
              {riskState.drivers.length > 0 && (
                <> Risk drivers: {riskState.drivers.join(", ")}.</>
              )}
            </DialogDescription>
          </DialogHeader>

          {hasDetailItems && (
            <div className="space-y-3 border rounded-md p-3 bg-muted/30">
              {hasOverdueTasks && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Overdue Tasks</p>
                  {riskState.overdueTasks.map((task) => (
                    <div key={task.id} className="flex items-center gap-2 text-xs py-0.5">
                      <PriorityDot priority={task.priority} />
                      <span className="flex-1 min-w-0 truncate">{task.title}</span>
                      <span className="text-[10px] text-red-500 shrink-0">
                        due {formatDueDate(task.dueDate)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {hasOverdueMilestones && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Overdue Milestones</p>
                  {riskState.overdueMilestones.map((ms) => (
                    <div key={ms.id} className="flex items-center gap-2 text-xs py-0.5">
                      <Flag className="h-3 w-3 text-red-500 shrink-0" />
                      <span className="flex-1 min-w-0 truncate">{ms.title}</span>
                      <span className="text-[10px] text-red-500 shrink-0">
                        due {formatDueDate(ms.dueDate)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="mitigation-note" className="text-sm font-medium">
                Mitigation Plan <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Textarea
                id="mitigation-note"
                placeholder="Describe your mitigation strategy, current actions, or blockers..."
                value={mitigationNote}
                onChange={(e) => setMitigationNote(e.target.value)}
                rows={4}
                maxLength={2000}
                data-testid="textarea-mitigation-note"
              />
              <p className="text-[10px] text-muted-foreground text-right">
                {mitigationNote.length}/2000
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="next-checkin" className="text-sm font-medium">
                Next Check-in Date <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="next-checkin"
                type="date"
                value={nextCheckInDate}
                onChange={(e) => setNextCheckInDate(e.target.value)}
                min={new Date(Date.now() + 86400000).toISOString().split("T")[0]}
                data-testid="input-next-checkin"
              />
              <p className="text-xs text-muted-foreground">
                Set a date to review this risk again. Until then, the acknowledgment banner will be suppressed.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAckDialogOpen(false)}
              data-testid="button-cancel-ack"
            >
              Cancel
            </Button>
            <Button
              onClick={() => ackMutation.mutate()}
              disabled={ackMutation.isPending}
              data-testid="button-submit-ack"
            >
              {ackMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting...</>
              ) : (
                <><ShieldCheck className="h-4 w-4 mr-2" />Acknowledge Risk</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
