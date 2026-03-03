/**
 * @file client/src/components/reassignment/ReassignmentSuggestionsCard.tsx
 * @description Workforce Reassignment Suggestions card.
 *
 * Shows top suggestions to move tasks from overloaded employees to underutilized ones.
 * Advisory only — "Review" navigates to the project, "Apply" prompts for confirmation.
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  ArrowRight,
  Users,
  AlertTriangle,
  CheckCircle2,
  Info,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Suggestion {
  taskId: string;
  taskTitle: string;
  projectId: string;
  projectName: string;
  fromUserId: string;
  fromUserName: string;
  fromUtilizationPct: number;
  toUserId: string;
  toUserName: string;
  toUtilizationPct: number;
  score: number;
  reasons: string[];
  confidence: "low" | "medium" | "high";
  dueDate: string | null;
  priority: string;
}

interface SuggestionResult {
  suggestions: Suggestion[];
  disabled?: boolean;
  meta: {
    overloadedUserCount: number;
    underutilizedUserCount: number;
    capacityMinutes: number;
    rangeDays: number;
  } | null;
}

interface Props {
  projectId?: string;
  limit?: number;
  className?: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  medium: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  low: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "text-emerald-600 dark:text-emerald-400",
  medium: "text-amber-600 dark:text-amber-400",
  low: "text-slate-500 dark:text-slate-400",
};

function UtilBar({ pct, label }: { pct: number; label: string }) {
  const color = pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-1.5 min-w-[80px]">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">{pct}%</span>
    </div>
  );
}

export function ReassignmentSuggestionsCard({ projectId, limit = 5, className }: Props) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [expanded, setExpanded] = useState(true);
  const [confirmSuggestion, setConfirmSuggestion] = useState<Suggestion | null>(null);

  const queryKey = ["/api/ops/reassignment-suggestions", projectId ?? "all"];

  const { data, isLoading, refetch, isFetching } = useQuery<SuggestionResult>({
    queryKey,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const applyMutation = useMutation({
    mutationFn: (s: Suggestion) =>
      apiRequest("POST", "/api/ops/reassignment-suggestions/apply", {
        taskId: s.taskId,
        fromUserId: s.fromUserId,
        toUserId: s.toUserId,
      }),
    onSuccess: (_, s) => {
      toast({
        title: "Reassignment applied",
        description: `"${s.taskTitle}" moved from ${s.fromUserName} to ${s.toUserName}.`,
      });
      setConfirmSuggestion(null);
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/reports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
    },
    onError: () => {
      toast({ title: "Failed to apply reassignment", variant: "destructive" });
    },
  });

  if (data?.disabled) return null;

  const suggestions = data?.suggestions ?? [];
  const visible = suggestions.slice(0, limit);
  const meta = data?.meta;

  if (!isLoading && suggestions.length === 0 && data) {
    return (
      <Card className={cn("border-dashed", className)} data-testid="card-reassignment-empty">
        <CardContent className="flex items-center gap-3 py-4 px-4">
          <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
          <div>
            <p className="text-sm font-medium">Workload looks balanced</p>
            <p className="text-xs text-muted-foreground">No reassignment suggestions at this time.</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-7 w-7 shrink-0"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-reassignment-refresh"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className={cn("", className)} data-testid="card-reassignment-suggestions">
        <CardHeader className="pb-2 px-4 pt-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center h-7 w-7 rounded-md bg-violet-100 dark:bg-violet-900/30 shrink-0">
                <Users className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold leading-tight">
                  Reassignment Suggestions
                </CardTitle>
                {meta && (
                  <p className="text-[11px] text-muted-foreground">
                    {meta.overloadedUserCount} overloaded · {meta.underutilizedUserCount} underutilized
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <Info className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-[240px] text-xs">
                    Advisory suggestions only. No tasks are moved automatically. Review first, apply only when ready.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => refetch()}
                disabled={isFetching}
                data-testid="button-reassignment-refresh"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setExpanded(e => !e)}
                data-testid="button-reassignment-toggle"
              >
                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </CardHeader>

        {expanded && (
          <CardContent className="px-4 pb-4 space-y-3">
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                ))}
              </div>
            ) : visible.length === 0 ? (
              <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                Workload appears balanced.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {visible.map((s, idx) => (
                  <div
                    key={`${s.taskId}-${s.toUserId}`}
                    className="py-3 first:pt-0 last:pb-0"
                    data-testid={`suggestion-row-${idx}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-tight truncate" title={s.taskTitle}>
                          {s.taskTitle}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">{s.projectName}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Badge
                          variant="outline"
                          className={cn("text-[10px] px-1.5 py-0 h-4 capitalize", PRIORITY_COLORS[s.priority])}
                          data-testid={`badge-priority-${idx}`}
                        >
                          {s.priority}
                        </Badge>
                        <span
                          className={cn("text-[10px] font-medium capitalize", CONFIDENCE_COLORS[s.confidence])}
                          data-testid={`badge-confidence-${idx}`}
                        >
                          {s.confidence}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mb-2 text-xs">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />
                          <span className="truncate font-medium">{s.fromUserName}</span>
                        </div>
                        <UtilBar pct={s.fromUtilizationPct} label="from" />
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                          <span className="truncate font-medium">{s.toUserName}</span>
                        </div>
                        <UtilBar pct={s.toUtilizationPct} label="to" />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1 mb-2">
                      {s.reasons.map(r => (
                        <span
                          key={r}
                          className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground"
                        >
                          {r}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <Link href={`/projects/${s.projectId}`}>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          data-testid={`button-review-${idx}`}
                        >
                          Review
                          <ArrowRight className="ml-1 h-3 w-3" />
                        </Button>
                      </Link>
                      <Button
                        variant="default"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setConfirmSuggestion(s)}
                        data-testid={`button-apply-${idx}`}
                      >
                        Apply Reassignment
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      <Dialog open={!!confirmSuggestion} onOpenChange={open => !open && setConfirmSuggestion(null)}>
        <DialogContent data-testid="dialog-apply-reassignment">
          <DialogHeader>
            <DialogTitle>Apply Reassignment</DialogTitle>
            <DialogDescription>
              This will move the task from{" "}
              <strong>{confirmSuggestion?.fromUserName}</strong> to{" "}
              <strong>{confirmSuggestion?.toUserName}</strong>. No other changes will be made.
            </DialogDescription>
          </DialogHeader>
          {confirmSuggestion && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1.5 text-sm">
              <p className="font-medium truncate">{confirmSuggestion.taskTitle}</p>
              <p className="text-xs text-muted-foreground">{confirmSuggestion.projectName}</p>
              <div className="flex flex-wrap gap-1 pt-1">
                {confirmSuggestion.reasons.map(r => (
                  <span
                    key={r}
                    className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {r}
                  </span>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmSuggestion(null)}
              data-testid="button-confirm-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={() => confirmSuggestion && applyMutation.mutate(confirmSuggestion)}
              disabled={applyMutation.isPending}
              data-testid="button-confirm-apply"
            >
              {applyMutation.isPending ? "Applying…" : "Confirm Reassignment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
