import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCrmFlags } from "@/hooks/use-crm-flags";
import { formatDistanceToNow } from "date-fns";
import { Redirect } from "wouter";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MessageSquare,
  ArrowLeft,
  Send,
  Clock,
  User,
  ChevronRight,
  Plus,
  FileText,
  Loader2,
} from "lucide-react";

interface PortalTemplate {
  id: string;
  name: string;
  subject: string;
  bodyText: string;
  category: string;
  defaultMetadata: Record<string, unknown> | null;
}

interface PortalClient {
  id: string;
  companyName: string;
  displayName: string | null;
  accessLevel: string;
}

interface PortalDashboard {
  clients: PortalClient[];
  projects: unknown[];
  tasks: unknown[];
  upcomingDeadlines: unknown[];
  recentActivity: unknown[];
}

function NewRequestDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (conversationId: string) => void;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState<"templates" | "compose">("templates");
  const [selectedTemplate, setSelectedTemplate] = useState<PortalTemplate | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string>("");

  const { data: templates = [], isLoading: templatesLoading } = useQuery<PortalTemplate[]>({
    queryKey: ["/api/crm/portal/message-templates"],
    enabled: open,
  });

  const { data: dashboard, isLoading: dashboardLoading, isError: dashboardError } = useQuery<PortalDashboard>({
    queryKey: ["/api/portal/dashboard"],
    enabled: open,
  });

  const clients = dashboard?.clients || [];

  useEffect(() => {
    if (clients.length === 1 && !selectedClientId) {
      setSelectedClientId(clients[0].id);
    }
  }, [clients, selectedClientId]);

  const createMutation = useMutation({
    mutationFn: async (data: { clientId: string; subject: string; initialMessage: string; templateId?: string }) => {
      const res = await apiRequest("POST", "/api/crm/portal/conversations", data);
      return res.json();
    },
    onSuccess: (data: { id: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/portal/conversations"] });
      toast({ title: "Request submitted" });
      onOpenChange(false);
      resetState();
      onCreated(data.id);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetState = () => {
    setStep("templates");
    setSelectedTemplate(null);
    setSubject("");
    setMessage("");
    setSelectedClientId(clients.length === 1 ? clients[0]?.id || "" : "");
  };

  const handleSelectTemplate = (template: PortalTemplate) => {
    setSelectedTemplate(template);
    setSubject(template.subject);
    setMessage(template.bodyText || "");
    setStep("compose");
  };

  const handleBlankRequest = () => {
    setSelectedTemplate(null);
    setSubject("");
    setMessage("");
    setStep("compose");
  };

  const handleSubmit = () => {
    if (!subject.trim() || !message.trim()) {
      toast({ title: "Please fill in the subject and message", variant: "destructive" });
      return;
    }
    if (!selectedClientId) {
      toast({ title: "Please select a client account", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      clientId: selectedClientId,
      subject: subject.trim(),
      initialMessage: message.trim(),
      templateId: selectedTemplate?.id,
    });
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) resetState();
    onOpenChange(newOpen);
  };

  const isDataLoading = templatesLoading || dashboardLoading;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === "templates" ? "Start a New Request" : "Compose Your Message"}
          </DialogTitle>
          <DialogDescription>
            {step === "templates"
              ? "Choose a template to get started, or start from scratch."
              : selectedTemplate
                ? `Using template: ${selectedTemplate.name}`
                : "Write your message below."}
          </DialogDescription>
        </DialogHeader>

        {dashboardError ? (
          <div className="py-8 text-center">
            <p className="text-sm text-destructive">Failed to load account data. Please try again.</p>
          </div>
        ) : step === "templates" ? (
          <div className="space-y-2 py-2 max-h-[400px] overflow-y-auto">
            {isDataLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <>
                {templates.map((template) => (
                  <Card
                    key={template.id}
                    className="hover-elevate cursor-pointer"
                    onClick={() => handleSelectTemplate(template)}
                    data-testid={`template-option-${template.id}`}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{template.name}</p>
                          <p className="text-sm text-muted-foreground truncate">{template.subject}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </div>
                    </CardContent>
                  </Card>
                ))}

                <Card
                  className="hover-elevate cursor-pointer border-dashed"
                  onClick={handleBlankRequest}
                  data-testid="template-option-blank"
                >
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      <Plus className="h-5 w-5 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">Start from scratch</p>
                        <p className="text-sm text-muted-foreground">Write a custom message</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {clients.length > 1 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Client Account</label>
                <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                  <SelectTrigger data-testid="select-client-account">
                    <SelectValue placeholder="Select a client account" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.displayName || c.companyName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">Subject</label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="What do you need help with?"
                data-testid="input-new-request-subject"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Message</label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe your request..."
                className="min-h-[120px] resize-none"
                data-testid="input-new-request-message"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          {step === "compose" && (
            <Button variant="outline" onClick={() => setStep("templates")} data-testid="button-back-to-templates">
              Back
            </Button>
          )}
          {step === "compose" && (
            <Button onClick={handleSubmit} disabled={createMutation.isPending} data-testid="button-submit-request">
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Submit Request
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ConversationSummary {
  id: string;
  tenantId: string;
  clientId: string;
  projectId: string | null;
  subject: string;
  createdByUserId: string;
  closedAt: string | null;
  createdAt: string;
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

interface Message {
  id: string;
  conversationId: string;
  authorUserId: string;
  bodyText: string;
  bodyRich: string | null;
  createdAt: string;
  authorName: string | null;
  authorRole: string | null;
}

interface ConversationDetail {
  conversation: ConversationSummary;
  messages: Message[];
}

function getInitials(name: string): string {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}

function ConversationList({
  conversations,
  onSelect,
}: {
  conversations: ConversationSummary[];
  onSelect: (id: string) => void;
}) {
  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <MessageSquare className="h-12 w-12 text-muted-foreground/40 mb-4" />
        <h3 className="text-lg font-medium mb-1">No messages yet</h3>
        <p className="text-sm text-muted-foreground">
          Your team will reach out when there are updates to discuss.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {conversations.map((convo) => (
        <Card
          key={convo.id}
          className="hover-elevate cursor-pointer"
          onClick={() => onSelect(convo.id)}
          data-testid={`conversation-card-${convo.id}`}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="font-medium truncate" data-testid={`conversation-subject-${convo.id}`}>
                    {convo.subject}
                  </h3>
                  {convo.closedAt && (
                    <Badge variant="secondary" className="text-xs">Closed</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mb-1">
                  Started by {convo.creatorName}
                </p>
                {convo.lastMessage && (
                  <p className="text-sm text-muted-foreground truncate">
                    {convo.lastMessage.authorName}: {convo.lastMessage.bodyText}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(convo.updatedAt), { addSuffix: true })}
                </span>
                <Badge variant="outline" className="text-xs">
                  {convo.messageCount} {convo.messageCount === 1 ? "msg" : "msgs"}
                </Badge>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ConversationThread({
  conversationId,
  currentUserId,
  onBack,
}: {
  conversationId: string;
  currentUserId: string;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const [replyText, setReplyText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery<ConversationDetail>({
    queryKey: ["/api/crm/conversations", conversationId, "messages"],
    queryFn: async () => {
      const res = await fetch(`/api/crm/conversations/${conversationId}/messages`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load messages");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const sendMutation = useMutation({
    mutationFn: async (bodyText: string) => {
      const res = await apiRequest("POST", `/api/crm/conversations/${conversationId}/messages`, { bodyText });
      return res.json();
    },
    onSuccess: () => {
      setReplyText("");
      queryClient.invalidateQueries({ queryKey: ["/api/crm/conversations", conversationId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/portal/conversations"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSend = () => {
    const trimmed = replyText.trim();
    if (!trimmed) return;
    sendMutation.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.messages]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  const conversation = data?.conversation;
  const messages = data?.messages || [];
  const isClosed = !!conversation?.closedAt;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Button variant="ghost" size="icon" aria-label="Go back" onClick={onBack} data-testid="button-back-to-conversations">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold truncate" data-testid="conversation-subject-detail">
            {conversation?.subject}
          </h2>
          <p className="text-sm text-muted-foreground">
            Started by {(conversation as any)?.creatorName || "team member"}{" "}
            {conversation?.createdAt && formatDistanceToNow(new Date(conversation.createdAt), { addSuffix: true })}
          </p>
        </div>
        {isClosed && <Badge variant="secondary">Closed</Badge>}
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1" data-testid="messages-list">
        {messages.map((msg) => {
          const isOwn = msg.authorUserId === currentUserId;
          const isInternal = msg.authorRole !== "client";
          return (
            <div
              key={msg.id}
              className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
              data-testid={`message-${msg.id}`}
            >
              <div className={`flex gap-2 max-w-[80%] ${isOwn ? "flex-row-reverse" : ""}`}>
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className={`text-xs ${isInternal ? "bg-primary/10" : "bg-muted"}`}>
                    {msg.authorName ? getInitials(msg.authorName) : <User className="h-3 w-3" />}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className={`flex items-center gap-2 mb-1 ${isOwn ? "justify-end" : ""} flex-wrap`}>
                    <span className="text-xs font-medium">{msg.authorName || "Unknown"}</span>
                    {isInternal && <Badge variant="outline" className="text-xs">Team</Badge>}
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  <Card className={isOwn ? "bg-primary/5" : ""}>
                    <CardContent className="p-3">
                      <p className="text-sm whitespace-pre-wrap" data-testid={`message-text-${msg.id}`}>
                        {msg.bodyText}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {!isClosed && (
        <div className="flex gap-2 items-end border-t pt-3">
          <Textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your reply..."
            className="resize-none min-h-[60px]"
            data-testid="input-reply-message"
          />
          <Button
            onClick={handleSend}
            disabled={!replyText.trim() || sendMutation.isPending}
            size="icon"
            aria-label="Send message"
            data-testid="button-send-reply"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      )}
      {isClosed && (
        <div className="text-center text-sm text-muted-foreground py-3 border-t">
          This conversation has been closed.
        </div>
      )}
    </div>
  );
}

export default function ClientPortalMessages() {
  const crmFlags = useCrmFlags();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [newRequestOpen, setNewRequestOpen] = useState(false);

  const { data: conversations = [], isLoading } = useQuery<ConversationSummary[]>({
    queryKey: ["/api/crm/portal/conversations"],
    enabled: crmFlags.clientMessaging,
  });

  const { data: currentUser } = useQuery<{ id: string }>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (!res.ok) throw new Error("Not authenticated");
      return res.json();
    },
  });

  if (!crmFlags.clientMessaging) {
    return <Redirect to="/portal" />;
  }

  if (selectedConversationId && currentUser) {
    return (
      <div className="p-6 h-full flex flex-col">
        <ConversationThread
          conversationId={selectedConversationId}
          currentUserId={currentUser.id}
          onBack={() => setSelectedConversationId(null)}
        />
      </div>
    );
  }

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-messages-title">Messages</h1>
          <p className="text-muted-foreground">Communicate with your project team</p>
        </div>
        <Button onClick={() => setNewRequestOpen(true)} data-testid="button-new-request">
          <Plus className="h-4 w-4 mr-1" />
          New Request
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <ConversationList
          conversations={conversations}
          onSelect={setSelectedConversationId}
        />
      )}

      <NewRequestDialog
        open={newRequestOpen}
        onOpenChange={setNewRequestOpen}
        onCreated={(id) => setSelectedConversationId(id)}
      />
    </div>
  );
}
