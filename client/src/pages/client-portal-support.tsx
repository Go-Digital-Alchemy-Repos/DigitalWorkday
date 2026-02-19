import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, LifeBuoy, Clock, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface SupportTicket {
  id: string;
  title: string;
  status: string;
  priority: string;
  category: string;
  lastActivityAt: string;
  createdAt: string;
  clientId: string | null;
}

const statusLabels: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  waiting_on_client: "Waiting on You",
  resolved: "Resolved",
  closed: "Closed",
};

const statusVariants: Record<string, string> = {
  open: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  in_progress: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  waiting_on_client: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  resolved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  closed: "bg-muted text-muted-foreground",
};

const priorityLabels: Record<string, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

const categoryLabels: Record<string, string> = {
  support: "Support",
  work_order: "Work Order",
  billing: "Billing",
  bug: "Bug Report",
  feature_request: "Feature Request",
};

function formatTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default function ClientPortalSupport() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [, navigate] = useLocation();

  const { data, isLoading } = useQuery<{ tickets: SupportTicket[]; total: number }>({
    queryKey: ["/api/v1/portal/support/tickets", { status: statusFilter !== "all" ? statusFilter : undefined }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/v1/portal/support/tickets?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch tickets");
      return res.json();
    },
  });

  const tickets = data?.tickets || [];

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold" data-testid="text-support-title">Support</h1>
            <p className="text-sm text-muted-foreground">View and create support tickets</p>
          </div>
          <Button onClick={() => navigate("/portal/support/new")} data-testid="button-create-ticket">
            <Plus className="h-4 w-4 mr-1" />
            New Ticket
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48" data-testid="select-status-filter">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tickets</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="waiting_on_client">Waiting on You</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          {data && (
            <span className="text-sm text-muted-foreground" data-testid="text-ticket-count">
              {data.total} ticket{data.total !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-md" />
            ))}
          </div>
        ) : tickets.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <LifeBuoy className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No support tickets found</p>
              <Button variant="outline" className="mt-4" onClick={() => navigate("/portal/support/new")} data-testid="button-create-first-ticket">
                Create Your First Ticket
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {tickets.map((ticket) => (
              <Card key={ticket.id} className="hover-elevate cursor-pointer" data-testid={`card-ticket-${ticket.id}`}>
                <Link href={`/portal/support/${ticket.id}`} className="block">
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate" data-testid={`text-ticket-title-${ticket.id}`}>{ticket.title}</span>
                        <Badge variant="secondary" className={`text-xs shrink-0 ${statusVariants[ticket.status] || ""}`} data-testid={`badge-ticket-status-${ticket.id}`}>
                          {statusLabels[ticket.status] || ticket.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        <span>{categoryLabels[ticket.category] || ticket.category}</span>
                        <span>{priorityLabels[ticket.priority] || ticket.priority} priority</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTimeAgo(ticket.lastActivityAt)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Link>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
