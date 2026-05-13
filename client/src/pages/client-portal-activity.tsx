import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  Activity,
  AlertCircle,
  CheckSquare,
  Clock,
  LifeBuoy,
  MessageSquare,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface PortalActivityItem {
  id: string;
  source: "project" | "message" | "support";
  type: string;
  timestamp: string;
  title: string;
  description?: string | null;
  clientName: string;
  projectName?: string | null;
  actor?: {
    name?: string | null;
    email?: string | null;
  } | null;
  metadata?: Record<string, unknown>;
}

function getActivityIcon(item: PortalActivityItem) {
  if (item.source === "support") return LifeBuoy;
  if (item.source === "message") return MessageSquare;
  if (item.type.includes("task") || item.type.includes("subtask")) return CheckSquare;
  return Activity;
}

function formatActivityType(type: string) {
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, char => char.toUpperCase());
}

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Recently";
  return formatDistanceToNow(date, { addSuffix: true });
}

function ActivitySkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map(item => (
        <Skeleton key={item} className="h-24 w-full" />
      ))}
    </div>
  );
}

export default function ClientPortalActivityPage() {
  const { data = [], isLoading, error } = useQuery<PortalActivityItem[]>({
    queryKey: ["/api/client-portal/activity"],
  });

  const groupedActivity = useMemo(() => data, [data]);

  if (isLoading) {
    return (
      <div className="h-full overflow-y-auto p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Account Activity</h1>
          <p className="text-muted-foreground">Recent updates across your client account.</p>
        </div>
        <ActivitySkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Error Loading Activity
            </CardTitle>
            <CardDescription>
              There was a problem loading your account activity. Please try again.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold" data-testid="text-account-activity-title">
          <Activity className="h-6 w-6 text-primary" />
          Account Activity
        </h1>
        <p className="text-muted-foreground">
          Recent client, project, message, and support updates for your account.
        </p>
      </div>

      {groupedActivity.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-48 flex-col items-center justify-center gap-2 text-center">
            <Clock className="h-10 w-10 text-muted-foreground" />
            <h2 className="text-lg font-semibold">No activity yet</h2>
            <p className="text-sm text-muted-foreground">
              Updates from your account will appear here as work moves forward.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {groupedActivity.map(item => {
            const Icon = getActivityIcon(item);
            const actorName = item.actor?.name || item.actor?.email || "Digital Workday team";

            return (
              <Card key={item.id} data-testid={`account-activity-${item.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-md bg-primary/10 p-2 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h2 className="truncate text-sm font-semibold">{item.title}</h2>
                          <p className="text-sm text-muted-foreground">
                            {item.description || formatActivityType(item.type)}
                            {item.projectName ? ` in ${item.projectName}` : ""}
                          </p>
                        </div>
                        <Badge variant="outline">{formatActivityType(item.type)}</Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{actorName}</span>
                        <span>{item.clientName}</span>
                        <span>{formatTimestamp(item.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
