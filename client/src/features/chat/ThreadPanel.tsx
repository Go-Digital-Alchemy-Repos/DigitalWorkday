import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { X, Send, Loader2, MessageCircle } from "lucide-react";
import type { ChatMessage } from "./ChatMessageTimeline";

interface ThreadPanelProps {
  parentMessage: ChatMessage;
  conversationType: "channel" | "dm";
  conversationId: string;
  currentUserId: string;
  onClose: () => void;
  renderMessageBody?: (body: string) => React.ReactNode;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatTime(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDateTime(date: Date | string): string {
  const d = new Date(date);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return `Today at ${formatTime(date)}`;
  }
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ThreadPanel({
  parentMessage,
  conversationType,
  conversationId,
  currentUserId,
  onClose,
  renderMessageBody,
}: ThreadPanelProps) {
  const [replyInput, setReplyInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const apiBase = conversationType === "channel"
    ? `/api/v1/chat/channels/${conversationId}`
    : `/api/v1/chat/dm/${conversationId}`;

  const threadQueryKey = ["/api/v1/chat/messages", parentMessage.id, "thread"];
  const summariesQueryKey = [
    conversationType === "channel" ? "/api/v1/chat/channels" : "/api/v1/chat/dm",
    conversationId,
    "thread-summaries",
  ];

  const { data: threadData, isLoading: isLoadingReplies } = useQuery<{ parentMessage: ChatMessage; replies: ChatMessage[] }>({
    queryKey: threadQueryKey,
  });
  const replies = threadData?.replies ?? [];

  const { toast } = useToast();

  const sendReplyMutation = useMutation({
    mutationFn: async (body: string) => {
      return apiRequest("POST", `${apiBase}/messages`, { body, parentMessageId: parentMessage.id });
    },
    onSuccess: () => {
      setReplyInput("");
      queryClient.invalidateQueries({ queryKey: threadQueryKey });
      queryClient.invalidateQueries({ queryKey: summariesQueryKey });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send reply",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleSendReply = useCallback(() => {
    if (replyInput.trim() && !sendReplyMutation.isPending) {
      sendReplyMutation.mutate(replyInput.trim());
    }
  }, [replyInput, sendReplyMutation]);

  useEffect(() => {
    const scrollContainer = scrollRef.current?.querySelector("[data-radix-scroll-area-viewport]");
    if (scrollContainer && replies.length > 0) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  }, [replies.length]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendReply();
    }
  };

  return (
    <div className="flex flex-col h-full border-l bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">Thread</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close thread"
          data-testid="button-close-thread"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-4 space-y-4">
          {/* Parent message */}
          <div className="border-b pb-4">
            <div className="flex gap-3">
              <Avatar className="h-8 w-8 flex-shrink-0">
                {parentMessage.author?.avatarUrl && (
                  <AvatarImage src={parentMessage.author.avatarUrl} />
                )}
                <AvatarFallback>
                  {getInitials(parentMessage.author?.name || parentMessage.author?.email || "?")}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-sm">
                    {parentMessage.author?.name || parentMessage.author?.email || "Unknown"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(parentMessage.createdAt)}
                  </span>
                </div>
                <div className="text-sm mt-1">
                  {renderMessageBody
                    ? renderMessageBody(parentMessage.body)
                    : parentMessage.body}
                </div>
              </div>
            </div>
          </div>

          {/* Replies count */}
          {replies.length > 0 && (
            <div className="flex items-center gap-2 py-2">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground px-2">
                {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>
          )}

          {/* Loading state */}
          {isLoadingReplies && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Replies */}
          {replies.map((reply) => (
            <div key={reply.id} className="flex gap-3" data-testid={`thread-reply-${reply.id}`}>
              <Avatar className="h-8 w-8 flex-shrink-0">
                {reply.author?.avatarUrl && (
                  <AvatarImage src={reply.author.avatarUrl} />
                )}
                <AvatarFallback>
                  {getInitials(reply.author?.name || reply.author?.email || "?")}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-sm">
                    {reply.author?.name || reply.author?.email || "Unknown"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatTime(reply.createdAt)}
                  </span>
                </div>
                <div className="text-sm mt-0.5">
                  {renderMessageBody
                    ? renderMessageBody(reply.body)
                    : reply.body}
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Reply input */}
      <div className="p-3 border-t">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={replyInput}
            onChange={(e) => setReplyInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Reply in thread..."
            className="min-h-[60px] resize-none"
            data-testid="thread-reply-input"
          />
          <Button
            onClick={handleSendReply}
            disabled={!replyInput.trim() || sendReplyMutation.isPending}
            size="icon"
            className="self-end"
            aria-label="Send reply"
            data-testid="button-send-thread-reply"
          >
            {sendReplyMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
