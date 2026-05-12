import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardList, MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ServiceRequest {
  id: string;
  clientId: string;
  subject: string;
  priority: string;
  closedAt: string | null;
  updatedAt: string;
  creatorName: string;
  clientName: string;
  messageCount: number;
  lastMessage: {
    bodyText: string;
    createdAt: string;
    authorName: string | null;
  } | null;
}

export default function ServiceRequestsPage() {
  const { data: requests = [], isLoading } = useQuery<ServiceRequest[]>({
    queryKey: ["/api/crm/service-requests"],
  });

  return (
    <div className="p-6 overflow-y-auto h-full space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-primary" />
          Service Requests
        </h1>
        <p className="text-muted-foreground">Client requests that need admin or project manager review.</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(item => <Skeleton key={item} className="h-28 w-full" />)}
        </div>
      ) : requests.length > 0 ? (
        <div className="space-y-3">
          {requests.map(request => (
            <Link key={request.id} href={`/clients/${request.clientId}?tab=messages&conversation=${request.id}`}>
              <Card className="hover-elevate cursor-pointer">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{request.subject}</CardTitle>
                      <CardDescription>{request.clientName} - started by {request.creatorName}</CardDescription>
                    </div>
                    <Badge variant={request.closedAt ? "secondary" : "default"}>
                      {request.closedAt ? "Closed" : "Open"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2 min-w-0">
                    <MessageSquare className="h-4 w-4 shrink-0" />
                    <span className="truncate">
                      {request.lastMessage?.bodyText || "No messages yet"}
                    </span>
                  </div>
                  <span className="shrink-0">
                    {formatDistanceToNow(new Date(request.updatedAt), { addSuffix: true })}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No service requests are waiting right now.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
