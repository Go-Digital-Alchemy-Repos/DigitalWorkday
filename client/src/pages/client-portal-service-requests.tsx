import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { ClipboardList, MessageSquare, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface PortalConversation {
  id: string;
  clientId: string;
  subject: string;
  type: string;
  priority: string;
  closedAt: string | null;
  updatedAt: string;
  creatorName: string;
  clientName?: string;
  messageCount: number;
  lastMessage: {
    bodyText: string;
    createdAt: string;
    authorName: string | null;
  } | null;
}

export default function ClientPortalServiceRequests() {
  const { data: conversations = [], isLoading } = useQuery<PortalConversation[]>({
    queryKey: ["/api/crm/portal/conversations"],
  });

  const serviceRequests = useMemo(
    () => conversations.filter((conversation) => conversation.type === "service_request"),
    [conversations]
  );

  return (
    <div className="p-6 overflow-y-auto h-full space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" />
            Service Requests
          </h1>
          <p className="text-muted-foreground">Track requests your team has sent to Digital Workday.</p>
        </div>
        <Button asChild data-testid="button-new-service-request">
          <Link href="/portal/messages">
            <Plus className="h-4 w-4 mr-1" />
            New Request
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-28 w-full" />
          ))}
        </div>
      ) : serviceRequests.length > 0 ? (
        <div className="space-y-3">
          {serviceRequests.map((request) => (
            <Link key={request.id} href={`/portal/messages?conversation=${request.id}`}>
              <Card className="hover-elevate cursor-pointer">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="text-base truncate">{request.subject}</CardTitle>
                      <CardDescription>
                        {request.clientName || "Client account"} - started by {request.creatorName}
                      </CardDescription>
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
            No service requests yet.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
