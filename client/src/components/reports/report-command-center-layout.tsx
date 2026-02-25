import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarRange } from "lucide-react";

export interface ReportCommandCenterLayoutProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  rangeDays: number;
  onRangeChange: (days: number) => void;
}

const DATE_RANGES = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 14 days", days: 14 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 60 days", days: 60 },
  { label: "Last 90 days", days: 90 },
];

export function buildDateParams(rangeDays: number, extra?: Record<string, string>): string {
  const end = new Date();
  const start = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    ...(extra ?? {}),
  });
  return params.toString();
}

export function ReportCommandCenterLayout({
  title,
  description,
  icon,
  children,
  rangeDays,
  onRangeChange,
}: ReportCommandCenterLayoutProps) {
  return (
    <div className="space-y-3 sm:space-y-4" data-testid="report-command-center-layout">
      <div className="flex items-start sm:items-center justify-end gap-3 flex-wrap">
        <Select value={String(rangeDays)} onValueChange={(v) => onRangeChange(Number(v))}>
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
          </SelectContent>
        </Select>
      </div>
      {children}
    </div>
  );
}
