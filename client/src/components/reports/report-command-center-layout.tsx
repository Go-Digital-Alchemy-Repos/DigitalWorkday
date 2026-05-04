import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarRange } from "lucide-react";

export type CustomReportRange = {
  mode: "custom";
  startDate: string;
  endDate: string;
};

export type ReportRangeValue = number | CustomReportRange;

export interface ReportCommandCenterLayoutProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  rangeDays: ReportRangeValue;
  onRangeChange: (range: ReportRangeValue) => void;
  extraControls?: React.ReactNode;
}

const DATE_RANGES = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 14 days", days: 14 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 60 days", days: 60 },
  { label: "Last 90 days", days: 90 },
];

export function toDateInputValue(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function dateAtStartOfDay(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

export function dateAtEndOfDay(value: string): Date {
  return new Date(`${value}T23:59:59.999`);
}

export function defaultCustomRange(): CustomReportRange {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    mode: "custom",
    startDate: toDateInputValue(start),
    endDate: toDateInputValue(now),
  };
}

export function buildDateParams(rangeDays: ReportRangeValue, extra?: Record<string, string>): string {
  const isCustom = typeof rangeDays !== "number";
  const end = isCustom ? dateAtEndOfDay(rangeDays.endDate) : new Date();
  const start = isCustom ? dateAtStartOfDay(rangeDays.startDate) : new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    ...(extra ?? {}),
  });
  return params.toString();
}

export function buildReportRangeSearchParams(rangeDays: ReportRangeValue, extra?: Record<string, string>): URLSearchParams {
  const params = new URLSearchParams(buildDateParams(rangeDays, extra));
  params.set("range", typeof rangeDays === "number" ? `${rangeDays}d` : "custom");
  return params;
}

export function reportRangeValueFromQuery(searchParams: URLSearchParams): ReportRangeValue {
  const range = searchParams.get("range") ?? "30d";
  if (range === "7d") return 7;
  if (range === "14d") return 14;
  if (range === "60d") return 60;
  if (range === "90d") return 90;
  if (range === "30d") return 30;

  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  if (startDate && endDate) {
    return {
      mode: "custom",
      startDate: toDateInputValue(new Date(startDate)),
      endDate: toDateInputValue(new Date(endDate)),
    };
  }

  return 30;
}

export function reportRangeSearchParamsFromQuery(searchParams: URLSearchParams): URLSearchParams {
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  if (startDate && endDate) {
    const params = new URLSearchParams({ startDate, endDate });
    params.set("range", searchParams.get("range") ?? "custom");
    return params;
  }
  return buildReportRangeSearchParams(reportRangeValueFromQuery(searchParams));
}

export function getReportRangeLabel(range: ReportRangeValue): string {
  if (typeof range === "number") return `${range}d`;
  return `${range.startDate}_${range.endDate}`;
}

export function getReportRangeDisplay(range: ReportRangeValue): string {
  if (typeof range === "number") return DATE_RANGES.find(r => r.days === range)?.label ?? `Last ${range} days`;
  return `${range.startDate} to ${range.endDate}`;
}

export function ReportCommandCenterLayout({
  title,
  description,
  icon,
  children,
  rangeDays,
  onRangeChange,
  extraControls,
}: ReportCommandCenterLayoutProps) {
  const isCustom = typeof rangeDays !== "number";
  const initialCustom = useMemo(() => isCustom ? rangeDays : defaultCustomRange(), [isCustom, rangeDays]);
  const [customStart, setCustomStart] = useState(initialCustom.startDate);
  const [customEnd, setCustomEnd] = useState(initialCustom.endDate);
  const customInvalid = !customStart || !customEnd || customStart > customEnd;

  function handlePresetChange(value: string) {
    if (value === "custom") {
      const custom = typeof rangeDays === "number" ? defaultCustomRange() : rangeDays;
      setCustomStart(custom.startDate);
      setCustomEnd(custom.endDate);
      onRangeChange(custom);
      return;
    }
    onRangeChange(Number(value));
  }

  function applyCustomRange() {
    if (customInvalid) return;
    onRangeChange({ mode: "custom", startDate: customStart, endDate: customEnd });
  }

  return (
    <div className="space-y-3 sm:space-y-4" data-testid="report-command-center-layout">
      <div className="flex items-start sm:items-center justify-end gap-3 flex-wrap">
        {extraControls}
        <Select value={typeof rangeDays === "number" ? String(rangeDays) : "custom"} onValueChange={handlePresetChange}>
          <SelectTrigger className="w-full sm:w-44 shrink-0" data-testid="select-date-range">
            <CalendarRange className="h-3.5 w-3.5 mr-1.5 shrink-0" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATE_RANGES.map((r) => (
              <SelectItem key={r.days} value={String(r.days)} data-testid={`range-option-${r.days}`}>
                {r.label}
              </SelectItem>
            ))}
            <SelectItem value="custom" data-testid="range-option-custom">
              Custom range
            </SelectItem>
          </SelectContent>
        </Select>
        {isCustom && (
          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto" data-testid="custom-date-range-controls">
            <Input
              type="date"
              value={customStart}
              onChange={(event) => setCustomStart(event.target.value)}
              className="w-full sm:w-36 h-9"
              data-testid="input-custom-start-date"
              aria-label="Custom start date"
            />
            <span className="text-xs text-muted-foreground hidden sm:inline">to</span>
            <Input
              type="date"
              value={customEnd}
              onChange={(event) => setCustomEnd(event.target.value)}
              className="w-full sm:w-36 h-9"
              data-testid="input-custom-end-date"
              aria-label="Custom end date"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={customInvalid}
              onClick={applyCustomRange}
              data-testid="button-apply-custom-range"
            >
              Apply
            </Button>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
