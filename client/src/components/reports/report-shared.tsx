import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, formatNumber } from "@/lib/utils";
import { Info, ShieldCheck } from "lucide-react";

export function formatComparisonSub(current: number, prior: number, suffix = "") {
  const delta = Math.round((current - prior) * 10) / 10;
  if (delta === 0) return "Flat vs previous period";
  const direction = delta > 0 ? "Up" : "Down";
  const value = Math.abs(delta);
  const display = formatNumber(value, {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
  });
  return `${direction} ${display}${suffix} vs previous period`;
}

interface MetricCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  color: string;
  definition?: string;
  source?: string;
}

export function formatMetricValue(value: string | number): string {
  if (typeof value === "number") return formatNumber(value);
  const match = value.match(/^(-?\d+(?:\.\d+)?)(.*)$/);
  if (!match) return value;
  const numeric = Number(match[1]);
  if (!Number.isFinite(numeric)) return value;
  const decimalPart = match[1].split(".")[1];
  return `${formatNumber(numeric, {
    minimumFractionDigits: decimalPart?.length ?? 0,
    maximumFractionDigits: decimalPart?.length ?? 0,
  })}${match[2]}`;
}

export function MetricCard({ label, value, sub, icon, color, definition, source }: MetricCardProps) {
  const displayValue = formatMetricValue(value);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", color)}>
            {icon}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <p className="text-xs text-muted-foreground truncate">{label}</p>
              {(definition || source) && (
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground shrink-0"
                        aria-label={`${label} definition`}
                      >
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[260px] space-y-1 leading-relaxed">
                      {definition && <p>{definition}</p>}
                      {source && <p className="text-muted-foreground">Source: {source}</p>}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <p className="text-xl font-bold leading-none mt-0.5">{displayValue}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function relativeDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "1 day ago";
  return `${diff} days ago`;
}

export function reportUserName(u: { firstName?: string | null; lastName?: string | null; email: string }) {
  if (u.firstName || u.lastName) return `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  return u.email;
}

export function reportUserInitials(u: { firstName?: string | null; lastName?: string | null; email: string }) {
  if (u.firstName && u.lastName) return `${u.firstName[0]}${u.lastName[0]}`.toUpperCase();
  if (u.firstName) return u.firstName[0].toUpperCase();
  return u.email[0].toUpperCase();
}

interface ReportDataNoteProps {
  title?: string;
  items: string[];
}

export function ReportDataNote({ title = "How to read this report", items }: ReportDataNoteProps) {
  return (
    <Card className="border-dashed bg-muted/20">
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-medium">{title}</p>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {items.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
