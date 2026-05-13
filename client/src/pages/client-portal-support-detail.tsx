import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, FileText, Send, Clock, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { RichTextRenderer } from "@/components/richtext";
import { useBackNavigation } from "@/hooks/use-back-navigation";

interface TicketMessage {
  id: string;
  authorType: string;
  bodyText: string;
  visibility: string;
  createdAt: string;
  author: { id: string; name: string; email: string } | null;
}

interface TicketDetail {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  category: string;
  source: string;
  createdAt: string;
  lastActivityAt: string;
  metadataJson: Record<string, unknown> | null;
  client: { id: string; companyName: string } | null;
  messages: TicketMessage[];
}

interface TicketAttachment {
  fileName: string;
  fileUrl: string;
  key: string;
  mimeType?: string | null;
  size?: number | null;
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

const priorityLabels: Record<string, string> = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" };
const categoryLabels: Record<string, string> = { support: "Support", work_order: "Work Order", billing: "Billing", bug: "Bug Report", feature_request: "Feature Request" };

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function getInitials(name: string | undefined | null, email?: string): string {
  if (name) return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  return email ? email[0].toUpperCase() : "?";
}

function getTicketAttachments(metadataJson: Record<string, unknown> | null | undefined): TicketAttachment[] {
  const attachments = metadataJson?.attachments;
  return Array.isArray(attachments) ? attachments.filter((item): item is TicketAttachment => {
    return Boolean(item && typeof item === "object" && "fileName" in item && "fileUrl" in item);
  }) : [];
}

function formatFileSize(bytes?: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ClientPortalSupportDetail() {
  const params = useParams<{ id: string }>();
  const goBack = useBackNavigation("/portal/support");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [replyText, setReplyText] = useState("");

  const { data: ticket, isLoading } = useQuery<TicketDetail>({
    queryKey: ["/api/v1/portal/support/tickets", params.id],
    queryFn: async () => {
      const res = await fetch(`/api/v1/portal/support/tickets/${params.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch ticket");
      return res.json();
    },
  });

  const replyMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/v1/portal/support/tickets/${params.id}/messages`, {
        bodyText: replyText,
      });
    },
    onSuccess: () => {
      setReplyText("");
      queryClient.invalidateQueries({ queryKey: ["/api/v1/portal/support/tickets", params.id] });
      toast({ title: "Reply sent" });
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
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
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
  const attachments = getTicketAttachments(ticket.metadataJson);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={goBack} data-testid="button-back">
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
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Created {formatDate(ticket.createdAt)}
              </span>
            </div>
          </div>
        </div>

        {ticket.description && (
          <Card>
            <CardContent className="p-4">
              <RichTextRenderer value={ticket.description} className="text-sm" data-testid="text-ticket-description" />
            </CardContent>
          </Card>
        )}

        {attachments.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">Attachments</h2>
              <div className="space-y-2">
                {attachments.map((attachment) => (
                  <a
                    key={attachment.key}
                    href={attachment.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm hover:bg-muted/50"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{attachment.fileName}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatFileSize(attachment.size)}</span>
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">Messages</h2>
          {ticket.messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No messages yet</p>
          ) : (
            ticket.messages.map((msg) => {
              const isStaff = msg.authorType === "tenant_user";
              return (
                <Card key={msg.id} data-testid={`card-message-${msg.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarFallback className={`text-xs ${isStaff ? "bg-primary/10" : "bg-accent"}`}>
                          {getInitials(msg.author?.name, msg.author?.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{msg.author?.name || msg.author?.email || "Unknown"}</span>
                          {isStaff && <Badge variant="secondary" className="text-xs">Staff</Badge>}
                          <span className="text-xs text-muted-foreground">{formatDate(msg.createdAt)}</span>
                        </div>
                        <RichTextRenderer value={msg.bodyText} className="mt-1 text-sm" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {!isClosed && (
          <>
            <Separator />
            <form onSubmit={handleReply} className="space-y-3" data-testid="form-reply">
              <Textarea
                placeholder="Type your reply..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                className="min-h-[80px]"
                data-testid="input-reply"
              />
              <div className="flex justify-end">
                <Button type="submit" disabled={!replyText.trim() || replyMutation.isPending} data-testid="button-send-reply">
                  {replyMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                  Send Reply
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
