import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, TrendingUp, TrendingDown, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProfitabilityData {
  clientId: string;
  revenue: number;
  laborCost: number;
  grossMargin: number;
  marginPercent: number;
  billableHours: number;
  nonBillableHours: number;
  totalHours: number;
  startDate: string | null;
  endDate: string | null;
}

const DATE_RANGES = [
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "12m", label: "Last 12 months" },
  { value: "all", label: "All time" },
];

function getDateRange(value: string): { startDate?: string; endDate?: string } {
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  if (value === "30d") {
    const start = new Date(now);
    start.setDate(start.getDate() - 30);
    return { startDate: start.toISOString().slice(0, 10), endDate: end };
  }
  if (value === "90d") {
    const start = new Date(now);
    start.setDate(start.getDate() - 90);
    return { startDate: start.toISOString().slice(0, 10), endDate: end };
  }
  if (value === "12m") {
    const start = new Date(now);
    start.setFullYear(start.getFullYear() - 1);
    return { startDate: start.toISOString().slice(0, 10), endDate: end };
  }
  return {};
}

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function MarginBadge({ percent }: { percent: number }) {
  if (percent >= 40) {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700 gap-1">
        <TrendingUp className="h-3 w-3" />
        {percent.toFixed(1)}%
      </Badge>
    );
  }
  if (percent >= 20) {
    return (
      <Badge className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700 gap-1">
        <TrendingUp className="h-3 w-3" />
        {percent.toFixed(1)}%
      </Badge>
    );
  }
  return (
    <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700 gap-1">
      <TrendingDown className="h-3 w-3" />
      {percent.toFixed(1)}%
    </Badge>
  );
}

export function ClientProfitabilityCard({ clientId }: { clientId: string }) {
  const [range, setRange] = useState("30d");
  const { startDate, endDate } = getDateRange(range);

  const params = new URLSearchParams();
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);

  const { data, isLoading, isError } = useQuery<ProfitabilityData>({
    queryKey: ["/api/analytics/client-profitability", clientId, range],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/client-profitability/${clientId}?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load profitability data");
      return res.json();
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const billableRatio =
    data && data.totalHours > 0
      ? ((data.billableHours / data.totalHours) * 100).toFixed(1)
      : "—";

  const hasData = data && (data.totalHours > 0 || data.revenue > 0);

  return (
    <Card data-testid="card-client-profitability">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-emerald-500" />
              Client Profitability
            </CardTitle>
            <CardDescription>Revenue vs. labor cost analysis</CardDescription>
          </div>
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-36 h-7 text-xs" data-testid="select-profitability-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_RANGES.map((r) => (
                <SelectItem key={r.value} value={r.value} className="text-xs">
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-28" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <p className="text-sm text-muted-foreground text-center py-4">Unable to load profitability data</p>
        ) : !hasData ? (
          <div className="text-center py-6 text-muted-foreground">
            <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-20" />
            <p className="text-sm">No time entries in this period</p>
            <p className="text-xs mt-0.5">Log time with cost and billing rates to see profitability metrics</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div data-testid="metric-revenue">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Revenue</p>
              <p className="text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                ${fmt(data!.revenue)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {data!.billableHours.toFixed(1)}h billable
              </p>
            </div>

            <div data-testid="metric-labor-cost">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Labor Cost</p>
              <p className={cn("text-2xl font-semibold tabular-nums", data!.laborCost > data!.revenue ? "text-red-600 dark:text-red-400" : "text-foreground")}>
                ${fmt(data!.laborCost)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {data!.totalHours.toFixed(1)}h total
              </p>
            </div>

            <div data-testid="metric-margin">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Gross Margin</p>
              <p className={cn("text-2xl font-semibold tabular-nums", data!.grossMargin < 0 ? "text-red-600 dark:text-red-400" : "text-foreground")}>
                ${fmt(data!.grossMargin)}
              </p>
              <div className="mt-1">
                {data!.revenue > 0 ? (
                  <MarginBadge percent={data!.marginPercent} />
                ) : (
                  <span className="text-xs text-muted-foreground">No revenue</span>
                )}
              </div>
            </div>

            <div data-testid="metric-billable-ratio">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Billable Ratio</p>
              <p className="text-2xl font-semibold tabular-nums">
                {data!.totalHours > 0 ? `${billableRatio}%` : "—"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {data!.nonBillableHours.toFixed(1)}h non-billable
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
