import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function formatComparisonSub(current: number, prior: number, suffix = "") {
  const delta = Math.round((current - prior) * 10) / 10;
  if (delta === 0) return "Flat vs previous period";
  const direction = delta > 0 ? "Up" : "Down";
  const value = Math.abs(delta);
  const display = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
  return `${direction} ${display}${suffix} vs previous period`;
}

interface MetricCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  color: string;
}

export function MetricCard({ label, value, sub, icon, color }: MetricCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", color)}>
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{label}</p>
            <p className="text-xl font-bold leading-none mt-0.5">{value}</p>
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
