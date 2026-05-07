import { useState, useRef, useEffect, useCallback } from "react";
import { useStickyComposerFocus } from "@/hooks/useStickyComposerFocus";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getStorageUrl } from "@/lib/storageUrl";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { ChatMessageInput } from "@/components/chat-message-input";
import { useToast } from "@/hooks/use-toast";
import { useConversationTyping } from "@/hooks/use-typing";
import { X, Send, Loader2, MessageCircle, File, FileText, Pencil, Trash2, Check } from "lucide-react";
import type { ChatMessage } from "./ChatMessageTimeline";

interface PendingAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  uploading?: boolean;
  progress?: number;
  localPreviewUrl?: string;
}

interface ThreadPanelProps {
  parentMessage: ChatMessage;
  conversationType: "channel" | "dm";
  conversationId: string;
  currentUserId: string;
  onClose: () => void;
  renderMessageBody?: (body: string) => React.ReactNode;
}

const QUICK_REACTIONS = ["\u{1F44D}", "\u2764\uFE0F", "\u{1F602}", "\u{1F389}"];

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

function getFileIcon(mimeType: string) {
  if (mimeType === "application/pdf") return FileText;
  return File;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [hasScrolledToInitialPosition, setHasScrolledToInitialPosition] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const firstUnreadRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previousReplyCountRef = useRef(0);
  const pendingAttachmentsRef = useRef<PendingAttachment[]>([]);
  const { compositionHandlers, handleSendSuccess, isSendKey } = useStickyComposerFocus(textareaRef);

  const apiBase = conversationType === "channel"
    ? `/api/v1/chat/channels/${conversationId}`
    : `/api/v1/chat/dm/${conversationId}`;

  const threadQueryKey = ["/api/v1/chat/messages", parentMessage.id, "thread"];
  const summariesQueryKey = [
    conversationType === "channel" ? "/api/v1/chat/channels" : "/api/v1/chat/dm",
    conversationId,
    "thread-summaries",
  ];
  const threadTypingConversationId = `thread:${conversationType}:${conversationId}:${parentMessage.id}`;
  const { typingUsers, startTyping, stopTyping } = useConversationTyping(threadTypingConversationId);

  const { data: threadData, isLoading: isLoadingReplies } = useQuery<{
    parentMessage: ChatMessage;
    replies: ChatMessage[];
    readState?: {
      unreadReplyCount: number;
      firstUnreadReplyId: string | null;
      lastReadAt: Date | string | null;
    };
  }>({
    queryKey: threadQueryKey,
  });
  const replies = threadData?.replies ?? [];
  const firstUnreadReplyId = threadData?.readState?.firstUnreadReplyId ?? null;

  const { toast } = useToast();

  const updateThreadMessageInCache = useCallback((messageId: string, updater: (message: ChatMessage) => ChatMessage) => {
    queryClient.setQueryData(
      threadQueryKey,
      (old: { parentMessage: ChatMessage; replies: ChatMessage[]; readState?: { unreadReplyCount: number; firstUnreadReplyId: string | null; lastReadAt: Date | string | null } } | undefined) => {
        if (!old) return old;
        return {
          ...old,
          parentMessage: old.parentMessage.id === messageId ? updater(old.parentMessage) : old.parentMessage,
          replies: old.replies.map((reply) => reply.id === messageId ? updater(reply) : reply),
        };
      }
    );
  }, [threadQueryKey]);

  const sendReplyMutation = useMutation({
    mutationFn: async ({ body, attachmentIds }: { body: string; attachmentIds: string[] }) => {
      return apiRequest("POST", `${apiBase}/messages`, { body, attachmentIds, parentMessageId: parentMessage.id });
    },
    onSuccess: () => {
      setReplyInput("");
      setPendingAttachments([]);
      handleSendSuccess();
      queryClient.invalidateQueries({ queryKey: threadQueryKey });
      queryClient.invalidateQueries({ queryKey: summariesQueryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/threads/inbox"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send reply",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
    onSettled: () => {
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    },
  });

  const markThreadReadMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/v1/chat/messages/${parentMessage.id}/thread/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/threads/inbox"] });
      queryClient.invalidateQueries({ queryKey: summariesQueryKey });
    },
  });

  const editReplyMutation = useMutation({
    mutationFn: async ({ messageId, body }: { messageId: string; body: string }) => {
      const res = await apiRequest("PATCH", `/api/v1/chat/messages/${messageId}`, { body });
      return res.json();
    },
    onSuccess: (updated: ChatMessage) => {
      updateThreadMessageInCache(updated.id, (message) => ({
        ...message,
        body: updated.body,
        editedAt: updated.editedAt,
      }));
      setEditingReplyId(null);
      setEditingBody("");
      queryClient.invalidateQueries({ queryKey: summariesQueryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/threads/inbox"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to edit reply", description: error.message, variant: "destructive" });
    },
  });

  const deleteReplyMutation = useMutation({
    mutationFn: async (messageId: string) => {
      return apiRequest("DELETE", `/api/v1/chat/messages/${messageId}`);
    },
    onSuccess: (_result, messageId) => {
      updateThreadMessageInCache(messageId, (message) => ({
        ...message,
        body: "Message deleted",
        deletedAt: new Date(),
      }));
      queryClient.invalidateQueries({ queryKey: summariesQueryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/threads/inbox"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete reply", description: error.message, variant: "destructive" });
    },
  });

  const addReactionMutation = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      const res = await apiRequest("POST", `/api/v1/chat/messages/${messageId}/reactions`, { emoji });
      return res.json();
    },
    onMutate: ({ messageId, emoji }) => {
      updateThreadMessageInCache(messageId, (message) => {
        const existing = message.reactions || [];
        if (existing.some((reaction) => reaction.userId === currentUserId && reaction.emoji === emoji)) return message;
        return {
          ...message,
          reactions: [...existing, {
            id: `optimistic-${Date.now()}`,
            emoji,
            userId: currentUserId,
            user: { id: currentUserId, name: "You", avatarUrl: null },
          }],
        };
      });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add reaction", description: error.message, variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: threadQueryKey });
    },
  });

  const removeReactionMutation = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      return apiRequest("DELETE", `/api/v1/chat/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`);
    },
    onMutate: ({ messageId, emoji }) => {
      updateThreadMessageInCache(messageId, (message) => ({
        ...message,
        reactions: (message.reactions || []).filter((reaction) => !(reaction.userId === currentUserId && reaction.emoji === emoji)),
      }));
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove reaction", description: error.message, variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: threadQueryKey });
    },
  });

  const handleSendReply = useCallback(() => {
    const readyAttachments = pendingAttachments.filter((attachment) => !attachment.uploading);
    if ((replyInput.trim() || readyAttachments.length > 0) && !sendReplyMutation.isPending && !pendingAttachments.some((attachment) => attachment.uploading)) {
      sendReplyMutation.mutate({
        body: replyInput.trim() || (readyAttachments.length > 0 ? " " : ""),
        attachmentIds: readyAttachments.map((attachment) => attachment.id),
      });
      stopTyping();
    }
  }, [pendingAttachments, replyInput, sendReplyMutation, stopTyping]);

  const handleReplyInputChange = (value: string) => {
    setReplyInput(value);
    if (value.trim()) {
      startTyping();
    } else {
      stopTyping();
    }
  };

  const removePendingAttachment = (id: string) => {
    setPendingAttachments((prev) => {
      const toRemove = prev.find((attachment) => attachment.id === id);
      if (toRemove?.localPreviewUrl) {
        URL.revokeObjectURL(toRemove.localPreviewUrl);
      }
      return prev.filter((attachment) => attachment.id !== id);
    });
  };

  const uploadFiles = async (files: FileList | File[]) => {
    setIsUploading(true);

    for (const file of Array.from(files)) {
      const tempId = `thread-uploading-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const isImage = file.type.startsWith("image/");
      const localPreviewUrl = isImage ? URL.createObjectURL(file) : undefined;

      setPendingAttachments((prev) => [...prev, {
        id: tempId,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        url: "",
        uploading: true,
        progress: 0,
        localPreviewUrl,
      }]);

      try {
        const result = await new Promise<PendingAttachment>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/v1/chat/uploads");
          xhr.withCredentials = true;

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const progress = Math.round((event.loaded / event.total) * 100);
              setPendingAttachments((prev) =>
                prev.map((attachment) => attachment.id === tempId ? { ...attachment, progress } : attachment)
              );
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                resolve(JSON.parse(xhr.responseText));
              } catch {
                reject(new Error("Invalid response"));
              }
            } else {
              try {
                const error = JSON.parse(xhr.responseText);
                reject(new Error(error.message || "Upload failed"));
              } catch {
                reject(new Error("Upload failed"));
              }
            }
          };

          xhr.onerror = () => reject(new Error("Network error"));

          const formData = new FormData();
          formData.append("file", file);
          xhr.send(formData);
        });

        if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
        setPendingAttachments((prev) =>
          prev.map((attachment) => attachment.id === tempId ? { ...result, uploading: false, progress: 100 } : attachment)
        );
      } catch (error: any) {
        if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
        setPendingAttachments((prev) => prev.filter((attachment) => attachment.id !== tempId));
        toast({
          title: "Upload failed",
          description: error.message || `Could not upload ${file.name}`,
          variant: "destructive",
        });
      }
    }

    setIsUploading(false);
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    await uploadFiles(files);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    setHasScrolledToInitialPosition(false);
  }, [parentMessage.id]);

  useEffect(() => {
    if (isLoadingReplies || hasScrolledToInitialPosition) return;
    const scrollContainer = scrollRef.current?.querySelector("[data-radix-scroll-area-viewport]");
    if (!scrollContainer || replies.length === 0) return;

    if (firstUnreadReplyId && firstUnreadRef.current) {
      firstUnreadRef.current.scrollIntoView({ block: "center" });
    } else {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
    setHasScrolledToInitialPosition(true);
  }, [firstUnreadReplyId, hasScrolledToInitialPosition, isLoadingReplies, replies.length]);

  useEffect(() => {
    const previousCount = previousReplyCountRef.current;
    previousReplyCountRef.current = replies.length;
    if (!hasScrolledToInitialPosition || replies.length <= previousCount) return;
    if (firstUnreadReplyId) {
      firstUnreadRef.current?.scrollIntoView({ block: "center" });
      return;
    }
    const scrollContainer = scrollRef.current?.querySelector("[data-radix-scroll-area-viewport]");
    if (scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  }, [firstUnreadReplyId, hasScrolledToInitialPosition, replies.length]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    return () => stopTyping();
  }, [stopTyping]);

  useEffect(() => {
    pendingAttachmentsRef.current = pendingAttachments;
  }, [pendingAttachments]);

  useEffect(() => {
    return () => {
      pendingAttachmentsRef.current.forEach((attachment) => {
        if (attachment.localPreviewUrl) URL.revokeObjectURL(attachment.localPreviewUrl);
      });
    };
  }, []);

  useEffect(() => {
    if (isLoadingReplies || markThreadReadMutation.isPending || replies.length === 0) return;
    const timeout = window.setTimeout(() => {
      markThreadReadMutation.mutate();
    }, firstUnreadReplyId ? 800 : 0);
    return () => window.clearTimeout(timeout);
    // Mark when a thread is opened and whenever the visible reply list catches up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentMessage.id, firstUnreadReplyId, isLoadingReplies, replies.length]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isSendKey(e)) {
      e.preventDefault();
      handleSendReply();
    }
  };

  const renderAttachments = (attachments?: ChatMessage["attachments"]) => {
    if (!attachments || attachments.length === 0) return null;
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        {attachments.map((attachment) => {
          const isImage = attachment.mimeType.startsWith("image/");
          const FileIcon = getFileIcon(attachment.mimeType);
          return (
            <a
              key={attachment.id}
              href={attachment.url}
              target="_blank"
              rel="noopener noreferrer"
              download={attachment.fileName}
              className="group"
              data-testid={`thread-attachment-${attachment.id}`}
            >
              {isImage ? (
                <img
                  src={attachment.url}
                  alt={attachment.fileName}
                  className="max-h-36 max-w-48 rounded-md object-cover hover-elevate"
                  loading="lazy"
                />
              ) : (
                <div className="flex min-w-[180px] max-w-[260px] items-center gap-2 rounded-md border border-border/50 bg-muted/50 p-2 hover-elevate">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-muted">
                    <FileIcon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{attachment.fileName}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatFileSize(attachment.sizeBytes)}
                    </p>
                  </div>
                </div>
              )}
            </a>
          );
        })}
      </div>
    );
  };

  const renderReactions = (message: ChatMessage) => {
    if (!message.reactions || message.reactions.length === 0) return null;
    const grouped = new Map<string, { count: number; reactedByCurrentUser: boolean }>();
    for (const reaction of message.reactions) {
      const current = grouped.get(reaction.emoji) || { count: 0, reactedByCurrentUser: false };
      current.count += 1;
      current.reactedByCurrentUser = current.reactedByCurrentUser || reaction.userId === currentUserId;
      grouped.set(reaction.emoji, current);
    }

    return (
      <div className="mt-2 flex flex-wrap gap-1">
        {Array.from(grouped.entries()).map(([emoji, reaction]) => (
          <button
            key={emoji}
            type="button"
            className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
              reaction.reactedByCurrentUser ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted/50 hover:bg-muted"
            }`}
            onClick={() => {
              if (reaction.reactedByCurrentUser) {
                removeReactionMutation.mutate({ messageId: message.id, emoji });
              } else {
                addReactionMutation.mutate({ messageId: message.id, emoji });
              }
            }}
            data-testid={`thread-reaction-${message.id}-${emoji}`}
          >
            {emoji} {reaction.count}
          </button>
        ))}
      </div>
    );
  };

  const renderReplyActions = (message: ChatMessage) => {
    if (message.deletedAt) return null;
    const isOwnReply = message.authorUserId === currentUserId;
    return (
      <div className="mt-1 flex flex-wrap items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover/reply:opacity-100 transition-opacity">
        {QUICK_REACTIONS.map((emoji) => (
          <Button
            key={emoji}
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-xs"
            onClick={() => addReactionMutation.mutate({ messageId: message.id, emoji })}
            data-testid={`thread-quick-react-${message.id}-${emoji}`}
          >
            {emoji}
          </Button>
        ))}
        {isOwnReply && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => {
                setEditingReplyId(message.id);
                setEditingBody(message.body);
              }}
              data-testid={`thread-edit-${message.id}`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-destructive"
              onClick={() => deleteReplyMutation.mutate(message.id)}
              data-testid={`thread-delete-${message.id}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
    );
  };

  const getTypingLabel = () => {
    if (typingUsers.length === 0) return null;
    if (typingUsers.length === 1) return "Someone is replying...";
    if (typingUsers.length === 2) return "Two people are replying...";
    return "Several people are replying...";
  };

  return (
    <div className="flex flex-col h-full bg-background">
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
                  <AvatarImage src={getStorageUrl(parentMessage.author.avatarUrl)} />
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
                {renderAttachments(parentMessage.attachments)}
                {renderReactions(parentMessage)}
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
            <div key={reply.id}>
              {reply.id === firstUnreadReplyId && (
                <div ref={firstUnreadRef} className="flex items-center gap-2 py-2" data-testid="thread-first-unread-marker">
                  <div className="flex-1 h-px bg-primary/40" />
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    New replies
                  </span>
                  <div className="flex-1 h-px bg-primary/40" />
                </div>
              )}
              <div className="group/reply flex gap-3" data-testid={`thread-reply-${reply.id}`}>
                <Avatar className="h-8 w-8 flex-shrink-0">
                  {reply.author?.avatarUrl && (
                    <AvatarImage src={getStorageUrl(reply.author.avatarUrl)} />
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
                    {reply.editedAt && !reply.deletedAt && (
                      <span className="text-xs text-muted-foreground">(edited)</span>
                    )}
                  </div>
                  {editingReplyId === reply.id ? (
                    <div className="mt-2 space-y-2">
                      <Textarea
                        value={editingBody}
                        onChange={(event) => setEditingBody(event.target.value)}
                        className="min-h-[72px] resize-none"
                        data-testid={`thread-edit-input-${reply.id}`}
                      />
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => editReplyMutation.mutate({ messageId: reply.id, body: editingBody.trim() })}
                          disabled={!editingBody.trim() || editReplyMutation.isPending}
                          data-testid={`thread-save-edit-${reply.id}`}
                        >
                          <Check className="mr-1 h-3.5 w-3.5" />
                          Save
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingReplyId(null);
                            setEditingBody("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className={`text-sm mt-0.5 ${reply.deletedAt ? "italic text-muted-foreground" : ""}`}>
                        {renderMessageBody
                          ? renderMessageBody(reply.body)
                          : reply.body}
                      </div>
                      {renderAttachments(reply.attachments)}
                      {renderReactions(reply)}
                      {renderReplyActions(reply)}
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Reply input */}
      <div className="p-3 border-t">
        <div className="mb-2 h-4 text-xs text-muted-foreground" data-testid="thread-typing-indicator">
          {typingUsers.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="flex gap-0.5">
                <span className="h-1 w-1 rounded-full bg-muted-foreground/70 animate-bounce" style={{ animationDelay: "0ms", animationDuration: "1s" }} />
                <span className="h-1 w-1 rounded-full bg-muted-foreground/70 animate-bounce" style={{ animationDelay: "150ms", animationDuration: "1s" }} />
                <span className="h-1 w-1 rounded-full bg-muted-foreground/70 animate-bounce" style={{ animationDelay: "300ms", animationDuration: "1s" }} />
              </span>
              {getTypingLabel()}
            </span>
          )}
        </div>
        {pendingAttachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {pendingAttachments.map((attachment) => {
              const FileIcon = getFileIcon(attachment.mimeType);
              const isImage = attachment.mimeType.startsWith("image/");
              const previewSrc = attachment.localPreviewUrl || (isImage && attachment.url ? attachment.url : null);
              return (
                <div
                  key={attachment.id}
                  className="relative flex min-w-[120px] max-w-[200px] items-center gap-2 rounded-md bg-muted p-2 text-sm"
                  data-testid={`thread-pending-attachment-${attachment.id}`}
                >
                  {previewSrc ? (
                    <img
                      src={previewSrc}
                      alt={attachment.fileName}
                      className="h-10 w-10 flex-shrink-0 rounded object-cover"
                    />
                  ) : (
                    <FileIcon className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-xs">{attachment.fileName}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatFileSize(attachment.sizeBytes)}
                    </span>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 flex-shrink-0"
                    onClick={() => removePendingAttachment(attachment.id)}
                    aria-label="Remove attachment"
                    data-testid={`thread-remove-attachment-${attachment.id}`}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                  {attachment.uploading && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 overflow-hidden rounded-b-md bg-muted-foreground/20">
                      <div
                        className="h-full bg-primary transition-all duration-200"
                        style={{ width: `${attachment.progress || 0}%` }}
                        data-testid={`thread-upload-progress-${attachment.id}`}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.docx,.xlsx,.csv,.png,.jpg,.jpeg,.webp"
            multiple
            onChange={handleFileSelect}
            data-testid="thread-input-file-upload"
          />
          <div className="flex-1 min-w-0">
            <ChatMessageInput
              ref={textareaRef}
              value={replyInput}
              onChange={handleReplyInputChange}
              onKeyDown={handleKeyDown}
              {...compositionHandlers}
              placeholder="Reply in thread..."
              className="min-h-[54px]"
              data-testid="thread-reply-input"
              onAttachClick={() => fileInputRef.current?.click()}
              isUploading={isUploading}
              attachDisabled={isUploading || sendReplyMutation.isPending}
            />
          </div>
          <Button
            onClick={handleSendReply}
            disabled={(!replyInput.trim() && pendingAttachments.filter((attachment) => !attachment.uploading).length === 0) || sendReplyMutation.isPending || pendingAttachments.some((attachment) => attachment.uploading)}
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
