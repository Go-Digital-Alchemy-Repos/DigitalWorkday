import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Send, Clock, Building2, User2, Loader2, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";

interface TicketMessage {
  id: string;
  authorType: string;
  bodyText: string;
  visibility: string;
  createdAt: string;
  author: { id: string; name: string | null; email: string } | null;
}

interface TicketEvent {
  id: string;
  eventType: string;
  oldValue: string | null;
  newValue: string | null;
  metadata: any;
  createdAt: string;
  actor: { id: string; name: string | null; email: string } | null;
}

interface TicketDetail {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  category: string;
  source: string;
  assigneeId: string | null;
  clientId: string | null;
  createdAt: string;
  lastActivityAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  client: { id: string; companyName: string } | null;
  assignee: { id: string; name: string | null; email: string } | null;
  createdByUser: { id: string; name: string | null; email: string } | null;
  createdByPortalUser: { id: string; name: string | null; email: string } | null;
  messages: TicketMessage[];
  events: TicketEvent[];
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
const categoryLabels: Record<string, string> = { support: "Support", work_order: "Work Order", billing: "Billing", bug: "Bug Report", feature_request: "Feature Request" };

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function getInitials(name: string | null | undefined, email?: string): string {
  if (name) return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  return email ? email[0].toUpperCase() : "?";
}

function eventDescription(event: TicketEvent): string {
  const actor = event.actor?.name || event.actor?.email || "System";
  switch (event.eventType) {
    case "status_change":
      return `${actor} changed status from "${statusLabels[event.oldValue || ""] || event.oldValue}" to "${statusLabels[event.newValue || ""] || event.newValue}"`;
    case "priority_change":
      return `${actor} changed priority from "${event.oldValue}" to "${event.newValue}"`;
    case "assignment_change":
      return `${actor} ${event.newValue ? "assigned" : "unassigned"} the ticket`;
    case "created":
      return `${actor} created this ticket`;
    default:
      return `${actor} ${event.eventType.replace(/_/g, " ")}`;
  }
}

export default function SupportTicketDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [replyText, setReplyText] = useState("");
  const [isInternal, setIsInternal] = useState(false);

  const { data: ticket, isLoading } = useQuery<TicketDetail>({
    queryKey: ["/api/v1/support/tickets", params.id],
    queryFn: async () => {
      const res = await fetch(`/api/v1/support/tickets/${params.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch ticket");
      return res.json();
    },
  });

  const replyMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/v1/support/tickets/${params.id}/messages`, {
        bodyText: replyText,
        visibility: isInternal ? "internal" : "public",
      });
    },
    onSuccess: () => {
      setReplyText("");
      queryClient.invalidateQueries({ queryKey: ["/api/v1/support/tickets", params.id] });
      toast({ title: isInternal ? "Internal note added" : "Reply sent" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      return apiRequest("PATCH", `/api/v1/support/tickets/${params.id}`, { status: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/support/tickets", params.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/support/tickets"] });
      toast({ title: "Status updated" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const priorityMutation = useMutation({
    mutationFn: async (newPriority: string) => {
      return apiRequest("PATCH", `/api/v1/support/tickets/${params.id}`, { priority: newPriority });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/support/tickets", params.id] });
      toast({ title: "Priority updated" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", `/api/v1/support/tickets/${params.id}`, { assignedToUserId: user?.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/support/tickets", params.id] });
      toast({ title: "Ticket assigned to you" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;
    replyMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted-foreground">Ticket not found</p>
      </div>
    );
  }

  const isClosed = ticket.status === "closed";
  const createdBy = ticket.createdByPortalUser || ticket.createdByUser;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/support")} data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold truncate" data-testid="text-ticket-title">{ticket.title}</h1>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <Badge variant="secondary" className={`text-xs ${statusVariants[ticket.status] || ""}`} data-testid="badge-ticket-status">
                {statusLabels[ticket.status] || ticket.status}
              </Badge>
              <span className="text-xs text-muted-foreground">{categoryLabels[ticket.category]}</span>
              <span className="text-xs text-muted-foreground">{priorityLabels[ticket.priority]} priority</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {ticket.description && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    {createdBy && (
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs">{getInitials(createdBy.name, createdBy.email)}</AvatarFallback>
                      </Avatar>
                    )}
                    <span className="text-sm font-medium">{createdBy?.name || createdBy?.email || "Unknown"}</span>
                    <span className="text-xs text-muted-foreground">{formatDate(ticket.createdAt)}</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap" data-testid="text-ticket-description">{ticket.description}</p>
                </CardContent>
              </Card>
            )}

            <div className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground">Messages</h2>
              {ticket.messages.length === 0 && ticket.events.length === 0 ? (
                <p className="text-sm text-muted-foreground">No messages yet</p>
              ) : (
                <>
                  {ticket.messages.map((msg) => {
                    const isPortalUser = msg.authorType === "portal_user";
                    const isInternalNote = msg.visibility === "internal";
                    return (
                      <Card key={msg.id} className={isInternalNote ? "border-dashed border-yellow-300 dark:border-yellow-700" : ""} data-testid={`card-message-${msg.id}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <Avatar className="h-8 w-8 shrink-0">
                              <AvatarFallback className={`text-xs ${isPortalUser ? "bg-accent" : "bg-primary/10"}`}>
                                {getInitials(msg.author?.name, msg.author?.email)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium">{msg.author?.name || msg.author?.email || "Unknown"}</span>
                                {isPortalUser && <Badge variant="secondary" className="text-xs">Client</Badge>}
                                {isInternalNote && (
                                  <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                                    <EyeOff className="h-3 w-3 mr-1" />
                                    Internal
                                  </Badge>
                                )}
                                <span className="text-xs text-muted-foreground">{formatDate(msg.createdAt)}</span>
                              </div>
                              <p className="text-sm mt-1 whitespace-pre-wrap">{msg.bodyText}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </>
              )}
            </div>

            {!isClosed && (
              <>
                <Separator />
                <form onSubmit={handleReply} className="space-y-3" data-testid="form-reply">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="internal"
                        checked={isInternal}
                        onCheckedChange={setIsInternal}
                        data-testid="switch-internal"
                      />
                      <Label htmlFor="internal" className="text-sm cursor-pointer flex items-center gap-1">
                        {isInternal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        {isInternal ? "Internal note" : "Public reply"}
                      </Label>
                    </div>
                  </div>
                  <Textarea
                    placeholder={isInternal ? "Add an internal note (not visible to client)..." : "Type your reply..."}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    className="min-h-[80px]"
                    data-testid="input-reply"
                  />
                  <div className="flex justify-end">
                    <Button type="submit" disabled={!replyText.trim() || replyMutation.isPending} data-testid="button-send-reply">
                      {replyMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                      {isInternal ? "Add Note" : "Send Reply"}
                    </Button>
                  </div>
                </form>
              </>
            )}
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <Select value={ticket.status} onValueChange={(v) => statusMutation.mutate(v)} disabled={statusMutation.isPending}>
                    <SelectTrigger data-testid="select-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="waiting_on_client">Waiting on Client</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Priority</Label>
                  <Select value={ticket.priority} onValueChange={(v) => priorityMutation.mutate(v)} disabled={priorityMutation.isPending}>
                    <SelectTrigger data-testid="select-priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Assignee</Label>
                  {ticket.assignee ? (
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs">{getInitials(ticket.assignee.name, ticket.assignee.email)}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{ticket.assignee.name || ticket.assignee.email}</span>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => assignMutation.mutate()} disabled={assignMutation.isPending} data-testid="button-assign-me">
                      <User2 className="h-3.5 w-3.5 mr-1" />
                      Assign to me
                    </Button>
                  )}
                </div>

                {ticket.client && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Client</Label>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{ticket.client.companyName}</span>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Category</Label>
                  <span className="text-sm block">{categoryLabels[ticket.category]}</span>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Source</Label>
                  <span className="text-sm block capitalize">{ticket.source.replace(/_/g, " ")}</span>
                </div>

                <Separator />

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Created</Label>
                  <span className="text-xs block">{formatDate(ticket.createdAt)}</span>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Last Activity</Label>
                  <span className="text-xs block">{formatDate(ticket.lastActivityAt)}</span>
                </div>
                {ticket.resolvedAt && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Resolved</Label>
                    <span className="text-xs block">{formatDate(ticket.resolvedAt)}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {ticket.events.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {ticket.events.slice(0, 10).map((event) => (
                      <div key={event.id} className="text-xs text-muted-foreground" data-testid={`event-${event.id}`}>
                        <span>{eventDescription(event)}</span>
                        <span className="ml-1">{formatDate(event.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
