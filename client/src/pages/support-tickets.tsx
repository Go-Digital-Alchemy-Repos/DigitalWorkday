import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LifeBuoy, Search, Clock, User2, Building2, MessageSquareText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface SupportTicket {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  category: string;
  source: string;
  assigneeId: string | null;
  clientId: string | null;
  lastActivityAt: string;
  createdAt: string;
  client?: { id: string; companyName: string } | null;
  assignee?: { id: string; name: string | null; email: string } | null;
  createdByUser?: { id: string; name: string | null; email: string } | null;
  createdByPortalUser?: { id: string; name: string | null; email: string } | null;
}

const statusLabels: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  waiting_on_client: "Waiting on Client",
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

const priorityLabels: Record<string, string> = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" };
const priorityVariants: Record<string, string> = {
  low: "",
  normal: "",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  urgent: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const categoryLabels: Record<string, string> = { support: "Support", work_order: "Work Order", billing: "Billing", bug: "Bug Report", feature_request: "Feature Request" };

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

function getInitials(name: string | null | undefined, email?: string): string {
  if (name) return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  return email ? email[0].toUpperCase() : "?";
}

export default function SupportTickets() {
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [, navigate] = useLocation();

  const queryParams = new URLSearchParams();
  if (statusFilter === "active") {
    queryParams.set("status", "open,in_progress,waiting_on_client");
  } else if (statusFilter !== "all") {
    queryParams.set("status", statusFilter);
  }
  if (priorityFilter !== "all") queryParams.set("priority", priorityFilter);
  if (categoryFilter !== "all") queryParams.set("category", categoryFilter);
  if (searchQuery.trim()) queryParams.set("search", searchQuery.trim());

  const { data, isLoading } = useQuery<{ tickets: SupportTicket[]; total: number }>({
    queryKey: ["/api/v1/support/tickets", queryParams.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/v1/support/tickets?${queryParams.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch tickets");
      return res.json();
    },
  });

  const tickets = data?.tickets || [];

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold" data-testid="text-support-console-title">Support Console</h1>
            <p className="text-sm text-muted-foreground">Manage client support tickets and work orders</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/support/templates">
              <Button variant="outline" size="sm" data-testid="button-manage-templates">
                <MessageSquareText className="h-4 w-4 mr-1" />
                Templates
              </Button>
            </Link>
          </div>
          {data && (
            <span className="text-sm text-muted-foreground" data-testid="text-total-tickets">
              {data.total} ticket{data.total !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tickets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-tickets"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40" data-testid="select-status-filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="waiting_on_client">Waiting on Client</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-32" data-testid="select-priority-filter">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priority</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-36" data-testid="select-category-filter">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="support">Support</SelectItem>
              <SelectItem value="work_order">Work Order</SelectItem>
              <SelectItem value="billing">Billing</SelectItem>
              <SelectItem value="bug">Bug Report</SelectItem>
              <SelectItem value="feature_request">Feature Request</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-md" />
            ))}
          </div>
        ) : tickets.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <LifeBuoy className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No tickets found</p>
              <p className="text-xs text-muted-foreground mt-1">Tickets submitted by clients will appear here</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {tickets.map((ticket) => (
              <Card key={ticket.id} className="hover-elevate cursor-pointer" data-testid={`card-ticket-${ticket.id}`}>
                <Link href={`/support/${ticket.id}`} className="block">
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate" data-testid={`text-ticket-title-${ticket.id}`}>{ticket.title}</span>
                        <Badge variant="secondary" className={`text-xs shrink-0 ${statusVariants[ticket.status] || ""}`} data-testid={`badge-status-${ticket.id}`}>
                          {statusLabels[ticket.status] || ticket.status}
                        </Badge>
                        {(ticket.priority === "high" || ticket.priority === "urgent") && (
                          <Badge variant="secondary" className={`text-xs shrink-0 ${priorityVariants[ticket.priority]}`}>
                            {priorityLabels[ticket.priority]}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        {ticket.client && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {ticket.client.companyName}
                          </span>
                        )}
                        <span>{categoryLabels[ticket.category] || ticket.category}</span>
                        {ticket.assignee && (
                          <span className="flex items-center gap-1">
                            <User2 className="h-3 w-3" />
                            {ticket.assignee.name || ticket.assignee.email}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTimeAgo(ticket.lastActivityAt)}
                        </span>
                      </div>
                    </div>
                    {ticket.assignee && (
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarFallback className="text-xs">{getInitials(ticket.assignee.name, ticket.assignee.email)}</AvatarFallback>
                      </Avatar>
                    )}
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
