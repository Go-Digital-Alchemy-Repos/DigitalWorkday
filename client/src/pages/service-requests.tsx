import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, Building2, Clock, ClipboardList, MessageSquareText, Search, User2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

interface ServiceRequest {
  id: string;
  subject: string;
  priority: string;
  clientName: string;
  creatorName: string;
  assigneeName: string | null;
  closedAt: string | null;
  updatedAt: string;
  messageCount: number;
  href: string;
  lastMessage: {
    bodyText: string;
    createdAt: string;
    authorName: string | null;
  } | null;
}

const priorityClasses: Record<string, string> = {
  urgent: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  normal: "bg-muted text-muted-foreground",
  low: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
};

function formatUpdated(value: string) {
  return formatDistanceToNow(new Date(value), { addSuffix: true });
}

export default function ServiceRequestsPage() {
  const [status, setStatus] = useState("open");
  const [priority, setPriority] = useState("all");
  const [assigned, setAssigned] = useState("all");
  const [search, setSearch] = useState("");

  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  if (priority !== "all") params.set("priority", priority);
  if (assigned !== "all") params.set("assigned", assigned);
  if (search.trim()) params.set("search", search.trim());

  const { data, isLoading } = useQuery<{ serviceRequests: ServiceRequest[]; pagination: { total: number } }>({
    queryKey: ["/api/crm/service-requests", params.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/crm/service-requests?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load service requests");
      return res.json();
    },
  });

  const serviceRequests = data?.serviceRequests || [];

  return (
    <div className="h-full overflow-y-auto">
      <div className="w-full px-4 py-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2" data-testid="text-service-requests-title">
              <ClipboardList className="h-5 w-5 text-muted-foreground" />
              Service Requests
            </h1>
            <p className="text-sm text-muted-foreground">Review and process client service requests from Messages.</p>
          </div>
          {data && (
            <span className="text-sm text-muted-foreground" data-testid="text-total-service-requests">
              {data.pagination.total} request{data.pagination.total !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search requests..."
              className="pl-9"
              data-testid="input-search-service-requests"
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-36" data-testid="select-service-status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger className="w-36" data-testid="select-service-priority">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priority</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          <Select value={assigned} onValueChange={setAssigned}>
            <SelectTrigger className="w-40" data-testid="select-service-assigned">
              <SelectValue placeholder="Assigned" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All assignees</SelectItem>
              <SelectItem value="me">Assigned to me</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((item) => (
              <Skeleton key={item} className="h-24 w-full rounded-md" />
            ))}
          </div>
        ) : serviceRequests.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <ClipboardList className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No service requests found</p>
              <p className="text-xs text-muted-foreground mt-1">Client service requests submitted from Messages will appear here.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {serviceRequests.map((request) => (
              <Card key={request.id} className="hover-elevate" data-testid={`card-service-request-${request.id}`}>
                <Link href={request.href} className="block">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate" data-testid={`text-service-request-subject-${request.id}`}>
                            {request.subject}
                          </span>
                          <Badge variant={request.closedAt ? "secondary" : "outline"} className="text-xs">
                            {request.closedAt ? "Closed" : "Open"}
                          </Badge>
                          {request.priority !== "normal" && (
                            <Badge variant="secondary" className={`text-xs ${priorityClasses[request.priority] || ""}`}>
                              <AlertTriangle className="h-3 w-3 mr-0.5" />
                              {request.priority}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {request.clientName}
                          </span>
                          <span className="flex items-center gap-1">
                            <User2 className="h-3 w-3" />
                            {request.assigneeName ? request.assigneeName : "Unassigned"}
                          </span>
                          <span className="flex items-center gap-1">
                            <MessageSquareText className="h-3 w-3" />
                            {request.messageCount} message{request.messageCount !== 1 ? "s" : ""}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatUpdated(request.updatedAt)}
                          </span>
                        </div>
                        {request.lastMessage?.bodyText && (
                          <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                            {request.lastMessage.bodyText}
                          </p>
                        )}
                      </div>
                      <Button variant="ghost" size="sm" asChild>
                        <span>Open</span>
                      </Button>
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
