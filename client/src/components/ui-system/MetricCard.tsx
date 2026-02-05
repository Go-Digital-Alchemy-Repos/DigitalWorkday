import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";

export type MetricCardVariant = "default" | "compact" | "featured";
export type TrendDirection = "up" | "down" | "neutral";

interface TrendData {
  value: number;
  label?: string;
  direction?: TrendDirection;
}

interface MetricCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: LucideIcon;
  iconColor?: string;
  trend?: TrendData;
  variant?: MetricCardVariant;
  loading?: boolean;
  className?: string;
  "data-testid"?: string;
}

export function MetricCard({
  title,
  value,
  description,
  icon: Icon,
  iconColor,
  trend,
  variant = "default",
  loading = false,
  className,
  "data-testid": testId,
}: MetricCardProps) {
  const trendDirection = trend?.direction ?? (trend?.value !== undefined 
    ? trend.value > 0 ? "up" : trend.value < 0 ? "down" : "neutral"
    : undefined);

  const TrendIcon = trendDirection === "up" 
    ? TrendingUp 
    : trendDirection === "down" 
      ? TrendingDown 
      : Minus;

  const trendColorClass = trendDirection === "up"
    ? "text-green-600 dark:text-green-400"
    : trendDirection === "down"
      ? "text-red-600 dark:text-red-400"
      : "text-muted-foreground";

  if (loading) {
    return (
      <Card className={cn("rounded-xl", className)} data-testid={testId}>
        <CardContent className={cn(
          "pt-6",
          variant === "compact" && "pt-4 pb-4"
        )}>
          <div className="flex items-center justify-between mb-2">
            <div className="h-4 w-24 bg-muted animate-pulse rounded" />
            <div className="h-8 w-8 bg-muted animate-pulse rounded-lg" />
          </div>
          <div className="h-8 w-16 bg-muted animate-pulse rounded mt-2" />
          <div className="h-3 w-32 bg-muted animate-pulse rounded mt-2" />
        </CardContent>
      </Card>
    );
  }

  if (variant === "compact") {
    return (
      <Card 
        className={cn("rounded-xl", className)} 
        data-testid={testId}
      >
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-3">
            {Icon && (
              <div className={cn(
                "flex items-center justify-center h-10 w-10 rounded-lg bg-muted",
                iconColor
              )}>
                <Icon className="h-5 w-5" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-muted-foreground truncate">{title}</p>
              <p className="text-xl font-bold">{value}</p>
            </div>
            {trend && (
              <div className={cn("flex items-center gap-1", trendColorClass)}>
                <TrendIcon className="h-4 w-4" />
                <span className="text-sm font-medium">
                  {trend.value > 0 ? "+" : ""}{trend.value}%
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (variant === "featured") {
    return (
      <Card 
        className={cn("rounded-xl bg-primary text-primary-foreground", className)} 
        data-testid={testId}
      >
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium opacity-90">{title}</p>
              <p className="text-4xl font-bold mt-2">{value}</p>
              {description && (
                <p className="text-sm opacity-80 mt-1">{description}</p>
              )}
              {trend && (
                <div className="flex items-center gap-1.5 mt-3">
                  <TrendIcon className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    {trend.value > 0 ? "+" : ""}{trend.value}%
                  </span>
                  {trend.label && (
                    <span className="text-sm opacity-80">{trend.label}</span>
                  )}
                </div>
              )}
            </div>
            {Icon && (
              <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-primary-foreground/10">
                <Icon className="h-6 w-6" />
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Default variant
  return (
    <Card 
      className={cn("rounded-xl", className)} 
      data-testid={testId}
    >
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold tracking-tight">{value}</p>
          </div>
          {Icon && (
            <div className={cn(
              "flex items-center justify-center h-10 w-10 rounded-lg bg-muted",
              iconColor
            )}>
              <Icon className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
        </div>
        
        {(description || trend) && (
          <div className="mt-3 flex items-center gap-2">
            {trend && (
              <div className={cn("flex items-center gap-1", trendColorClass)}>
                <TrendIcon className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">
                  {trend.value > 0 ? "+" : ""}{trend.value}%
                </span>
              </div>
            )}
            {description && (
              <span className="text-xs text-muted-foreground">{description}</span>
            )}
            {trend?.label && !description && (
              <span className="text-xs text-muted-foreground">{trend.label}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface MetricGridProps {
  children: React.ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
}

export function MetricGrid({ 
  children, 
  columns = 4, 
  className 
}: MetricGridProps) {
  const gridCols = {
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
  };

  return (
    <div className={cn("grid gap-4", gridCols[columns], className)}>
      {children}
    </div>
  );
}

interface StatItemProps {
  label: string;
  value: string | number;
  subtext?: string;
  className?: string;
}

export function StatItem({ label, value, subtext, className }: StatItemProps) {
  return (
    <div className={cn("space-y-1", className)}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {subtext && (
        <p className="text-xs text-muted-foreground">{subtext}</p>
      )}
    </div>
  );
}
