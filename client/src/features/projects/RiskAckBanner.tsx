/**
 * RiskAckBanner — Risk Acknowledgment Governance UI
 *
 * Shown on the project detail page when a project is at-risk or critical
 * and no acknowledgment has been submitted in the last 7 days.
 *
 * Allows PM or Tenant Admin to:
 * - View the risk level and driver summary
 * - Submit a mitigation note
 * - Set a next check-in date
 * - View the latest acknowledgment summary
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

interface RiskState {
  riskLevel: "stable" | "at_risk" | "critical";
  riskScore: number;
  overdueCount: number;
  burnPercent: number | null;
  hasMilestoneOverdue: boolean;
  drivers: string[];
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
  className?: string;
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

export function RiskAckBanner({ projectId, className }: RiskAckBannerProps) {
  const { enableRiskAckWorkflow } = useFeatureFlags();
  const { toast } = useToast();
  const [ackDialogOpen, setAckDialogOpen] = useState(false);
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

  return (
    <>
      {/* Banner */}
      {(needsAck || riskState.riskLevel !== "stable") && (
        <div
          className={cn(
            "rounded-lg border px-4 py-3 flex items-start gap-3",
            needsAck && isCritical
              ? "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800"
              : needsAck && isAtRisk
              ? "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800"
              : "bg-muted/50 border-border",
            className
          )}
          data-testid="risk-ack-banner"
        >
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
            {riskState.drivers.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {riskState.drivers.join(" · ")}
              </p>
            )}
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
          {needsAck && (
            <Button
              size="sm"
              variant={isCritical ? "destructive" : "outline"}
              className={cn(
                "shrink-0",
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
      )}

      {/* Acknowledgment Dialog */}
      <Dialog open={ackDialogOpen} onOpenChange={setAckDialogOpen}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-risk-ack">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-amber-500" />
              Acknowledge Project Risk
            </DialogTitle>
            <DialogDescription>
              This project is currently <strong>{riskState.riskLevel === "critical" ? "Critical" : "At Risk"}</strong>{" "}
              with a health score of {riskState.riskScore}/100.
              {riskState.drivers.length > 0 && (
                <> Risk drivers: {riskState.drivers.join(", ")}.</>
              )}
            </DialogDescription>
          </DialogHeader>

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
