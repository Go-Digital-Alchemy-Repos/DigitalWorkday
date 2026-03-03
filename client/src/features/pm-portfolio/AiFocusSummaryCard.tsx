import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Brain,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  TrendingDown,
  Users,
  Flame,
  CheckCircle2,
  ArrowRight,
  BarChart3,
  Clock,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";

interface FocusPriority {
  title: string;
  why: string;
  suggestedNextStep: string;
}

interface SupportingMetric {
  metric: string;
  value: string;
}

interface PmFocusSummary {
  id: string;
  headline: string;
  topPriorities: FocusPriority[];
  risksToAddress: FocusPriority[];
  capacityConcerns: FocusPriority[];
  budgetConcerns: FocusPriority[];
  confidence: "Low" | "Medium" | "High";
  supportingMetrics: SupportingMetric[];
  summaryMarkdown: string;
  rangeStart: string;
  rangeEnd: string;
  model: string;
  createdAt: string;
  expiresAt: string;
  cached: boolean;
}

function ConfidenceBadge({ confidence }: { confidence: "Low" | "Medium" | "High" }) {
  if (confidence === "High") {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800 text-[10px] px-1.5 py-0 h-5">
        High confidence
      </Badge>
    );
  }
  if (confidence === "Medium") {
    return (
      <Badge className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800 text-[10px] px-1.5 py-0 h-5">
        Medium confidence
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 text-muted-foreground">
      Low confidence
    </Badge>
  );
}

function PriorityItem({
  item,
  icon,
  accent,
}: {
  item: FocusPriority;
  icon: React.ReactNode;
  accent: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5 space-y-1 cursor-pointer hover:bg-muted/40 transition-colors",
        accent
      )}
      onClick={() => setExpanded((v) => !v)}
    >
      <div className="flex items-start gap-2 justify-between">
        <div className="flex items-start gap-2 min-w-0">
          <span className="mt-0.5 shrink-0 opacity-70">{icon}</span>
          <span className="text-sm font-medium leading-snug">{item.title}</span>
        </div>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" />
        )}
      </div>
      {expanded && (
        <div className="pl-5 space-y-1.5 pt-0.5">
          <p className="text-xs text-muted-foreground leading-relaxed">{item.why}</p>
          <div className="flex items-start gap-1.5 text-xs text-primary/80">
            <ArrowRight className="h-3 w-3 shrink-0 mt-0.5" />
            <span className="font-medium leading-relaxed">{item.suggestedNextStep}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  icon,
  items,
  accent,
  emptyText,
}: {
  title: string;
  icon: React.ReactNode;
  items: FocusPriority[];
  accent: string;
  emptyText: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {icon}
        {title}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">{emptyText}</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((item, i) => (
            <PriorityItem key={i} item={item} icon={icon} accent={accent} />
          ))}
        </div>
      )}
    </div>
  );
}

function MetricsDialog({ metrics }: { metrics: SupportingMetric[] }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
          data-testid="button-ai-metrics"
        >
          <BarChart3 className="h-3 w-3" />
          Supporting metrics
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">Supporting Metrics</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          {metrics.map((m, i) => (
            <div key={i} className="flex items-center justify-between gap-3 py-1 border-b border-border/50 last:border-0">
              <span className="text-sm text-muted-foreground">{m.metric}</span>
              <span className="text-sm font-semibold tabular-nums">{m.value}</span>
            </div>
          ))}
          {metrics.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No metrics available</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LoadingSkeleton() {
  return (
    <Card className="border-violet-200 dark:border-violet-800 bg-gradient-to-br from-violet-50/60 to-background dark:from-violet-950/20">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-violet-500" />
          <CardTitle className="text-sm font-semibold text-violet-700 dark:text-violet-400">AI Weekly Focus</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <div className="space-y-2 pt-1">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      </CardContent>
    </Card>
  );
}

interface AiFocusSummaryCardProps {
  rangeStart?: string;
  rangeEnd?: string;
}

export function AiFocusSummaryCard({ rangeStart, rangeEnd }: AiFocusSummaryCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const today = new Date();
  const defaultEnd = today.toISOString().split("T")[0];
  const sevenDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const effectiveStart = rangeStart || sevenDaysAgo;
  const effectiveEnd = rangeEnd || defaultEnd;

  const queryKey = ["/api/v1/ai/pm/focus-summary", effectiveStart, effectiveEnd];

  const { data: summary, isLoading, isError, error } = useQuery<PmFocusSummary>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/ai/pm/focus-summary?rangeStart=${effectiveStart}&rangeEnd=${effectiveEnd}`,
        { credentials: "include" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      return res.json();
    },
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/v1/ai/pm/focus-summary/refresh?rangeStart=${effectiveStart}&rangeEnd=${effectiveEnd}`
      );
      return res;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
      toast({ title: "Focus summary refreshed", description: "Your AI summary has been updated." });
    },
    onError: (err: any) => {
      toast({
        title: "Refresh failed",
        description: err.message || "Could not refresh AI summary. Try again later.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) return <LoadingSkeleton />;

  if (isError) {
    const errMsg = (error as any)?.message || "Unknown error";
    const isNotConfigured = errMsg.toLowerCase().includes("not configured") || errMsg.toLowerCase().includes("ai is not");
    const isRateLimited = errMsg.toLowerCase().includes("rate limit") || errMsg.toLowerCase().includes("limit reached");

    return (
      <Card className="border-dashed border-violet-200 dark:border-violet-800 bg-violet-50/30 dark:bg-violet-950/10">
        <CardContent className="px-4 py-5">
          <div className="flex items-start gap-3">
            <Brain className="h-5 w-5 text-violet-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-violet-700 dark:text-violet-400">AI Weekly Focus</p>
              {isNotConfigured ? (
                <p className="text-xs text-muted-foreground">
                  AI is not configured for your workspace. Contact your administrator to set up an AI provider.
                </p>
              ) : isRateLimited ? (
                <p className="text-xs text-muted-foreground">
                  Daily generation limit reached. Your summary will refresh tomorrow, or an admin can increase the limit.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">{errMsg}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!summary) return null;

  const formattedRange =
    summary.rangeStart && summary.rangeEnd
      ? `${format(parseISO(summary.rangeStart), "MMM d")} – ${format(parseISO(summary.rangeEnd), "MMM d, yyyy")}`
      : null;

  const formattedGenerated = summary.createdAt
    ? format(new Date(summary.createdAt), "MMM d 'at' h:mm a")
    : null;

  return (
    <Card
      className="border-violet-200 dark:border-violet-800 bg-gradient-to-br from-violet-50/60 to-background dark:from-violet-950/20"
      data-testid="card-ai-focus-summary"
    >
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Brain className="h-4 w-4 text-violet-500 shrink-0" />
            <CardTitle className="text-sm font-semibold text-violet-700 dark:text-violet-400">
              AI Weekly Focus
            </CardTitle>
            <Sparkles className="h-3 w-3 text-violet-400 opacity-60" />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <ConfidenceBadge confidence={summary.confidence} />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
              title="Refresh AI summary"
              data-testid="button-refresh-ai-focus"
            >
              {refreshMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
        {(formattedRange || summary.cached) && (
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
            {formattedRange && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formattedRange}
              </span>
            )}
            {summary.cached && formattedGenerated && (
              <span className="text-[10px] opacity-70">· Generated {formattedGenerated}</span>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="px-4 pb-4 space-y-4">
        <p
          className="text-sm font-medium leading-relaxed text-foreground"
          data-testid="text-ai-focus-headline"
        >
          {summary.headline}
        </p>

        <div className="space-y-4">
          <Section
            title="Top Priorities"
            icon={<CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />}
            items={summary.topPriorities}
            accent="border-blue-100 dark:border-blue-900/40 hover:border-blue-200 dark:hover:border-blue-800"
            emptyText="No critical priorities this week."
          />

          {(summary.risksToAddress.length > 0 || summary.topPriorities.length > 0) && (
            <Section
              title="Risks to Address"
              icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
              items={summary.risksToAddress}
              accent="border-amber-100 dark:border-amber-900/40 hover:border-amber-200 dark:hover:border-amber-800"
              emptyText="No risks flagged."
            />
          )}

          {summary.capacityConcerns.length > 0 && (
            <Section
              title="Capacity"
              icon={<Users className="h-3.5 w-3.5 text-violet-500" />}
              items={summary.capacityConcerns}
              accent="border-violet-100 dark:border-violet-900/40 hover:border-violet-200 dark:hover:border-violet-800"
              emptyText="No capacity concerns."
            />
          )}

          {summary.budgetConcerns.length > 0 && (
            <Section
              title="Budget"
              icon={<Flame className="h-3.5 w-3.5 text-red-500" />}
              items={summary.budgetConcerns}
              accent="border-red-100 dark:border-red-900/40 hover:border-red-200 dark:hover:border-red-800"
              emptyText="No budget concerns."
            />
          )}
        </div>

        {summary.supportingMetrics.length > 0 && (
          <>
            <Separator />
            <div className="flex items-center justify-between">
              <MetricsDialog metrics={summary.supportingMetrics} />
              <span className="text-[10px] text-muted-foreground opacity-60">
                via {summary.model || "AI"}
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
