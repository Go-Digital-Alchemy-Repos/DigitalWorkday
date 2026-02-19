import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Trash2,
  Check,
  X,
  Loader2,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  Clock,
  Copy,
  Quote,
  ListTodo,
  MessagesSquare,
  ArrowDown,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

export interface ChatMessage {
  id: string;
  body: string;
  authorUserId: string;
  tenantId?: string;
  channelId?: string | null;
  dmThreadId?: string | null;
  parentMessageId?: string | null;
  createdAt: Date | string;
  editedAt?: Date | string | null;
  deletedAt?: Date | string | null;
  author?: {
    id: string;
    name?: string | null;
    email: string;
    avatarUrl?: string | null;
  } | null;
  attachments?: Array<{
    id: string;
    fileName: string;
    url: string;
    mimeType: string;
    sizeBytes: number;
  }>;
  _tempId?: string;
  _status?: "pending" | "sent" | "failed";
}

export interface ThreadSummary {
  replyCount: number;
  lastReplyAt: Date | string | null;
  lastReplyAuthorId: string | null;
}

interface ChatMessageTimelineProps {
  messages: ChatMessage[];
  currentUserId?: string;
  currentUserRole?: string;
  isLoading?: boolean;
  hasMoreMessages?: boolean;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  onEditMessage?: (messageId: string, body: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onRetryMessage?: (message: ChatMessage) => void;
  onRemoveFailedMessage?: (tempId: string) => void;
  onCopyMessage?: (body: string) => void;
  onQuoteReply?: (authorName: string, body: string) => void;
  onCreateTaskFromMessage?: (message: ChatMessage) => void;
  onOpenThread?: (messageId: string) => void;
  threadSummaries?: Map<string, ThreadSummary>;
  firstUnreadMessageId?: string | null;
  onMarkAsRead?: () => void;
  renderMessageBody?: (body: string) => React.ReactNode;
  getFileIcon?: (mimeType: string) => React.ComponentType<{ className?: string }>;
  formatFileSize?: (bytes: number) => string;
  isDm?: boolean;
  className?: string;
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

function formatFullDateTime(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateSeparator(date: Date | string): string {
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) {
    return "Today";
  }
  if (d.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }
  return d.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  });
}

function formatTimeGapSeparator(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }) + " at " + d.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function isSameDay(d1: Date | string, d2: Date | string): boolean {
  return new Date(d1).toDateString() === new Date(d2).toDateString();
}

function shouldGroupMessage(
  current: ChatMessage,
  previous: ChatMessage | undefined,
  maxGapMinutes: number = 5
): boolean {
  if (!previous) return false;
  if (current.authorUserId !== previous.authorUserId) return false;
  if (!isSameDay(current.createdAt, previous.createdAt)) return false;

  const currentTime = new Date(current.createdAt).getTime();
  const previousTime = new Date(previous.createdAt).getTime();
  const gapMs = currentTime - previousTime;
  const gapMinutes = gapMs / (1000 * 60);

  return gapMinutes <= maxGapMinutes;
}

interface MessageGroup {
  id: string;
  authorUserId: string;
  author: ChatMessage["author"];
  messages: ChatMessage[];
  dateSeparator?: string;
  timeGapSeparator?: string;
}

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function groupMessages(messages: ChatMessage[], _firstUnreadMessageId?: string | null): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let currentGroup: MessageGroup | null = null;
  let lastDate: string | null = null;

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const previousMessage = i > 0 ? messages[i - 1] : undefined;
    const messageDate = new Date(message.createdAt).toDateString();
    const needsDateSeparator = messageDate !== lastDate;
    const shouldGroup = !needsDateSeparator && shouldGroupMessage(message, previousMessage);

    if (needsDateSeparator) {
      lastDate = messageDate;
    }

    let timeGapSeparator: string | undefined;
    if (!needsDateSeparator && previousMessage) {
      const gap = new Date(message.createdAt).getTime() - new Date(previousMessage.createdAt).getTime();
      if (gap >= TWO_HOURS_MS) {
        timeGapSeparator = formatTimeGapSeparator(message.createdAt);
      }
    }

    const needsNewGroup = timeGapSeparator != null;

    if (shouldGroup && currentGroup && !needsNewGroup) {
      currentGroup.messages.push(message);
    } else {
      currentGroup = {
        id: message._tempId || message.id,
        authorUserId: message.authorUserId,
        author: message.author,
        messages: [message],
        dateSeparator: needsDateSeparator ? formatDateSeparator(message.createdAt) : undefined,
        timeGapSeparator,
      };
      groups.push(currentGroup);
    }
  }

  return groups;
}

function renderLinkedText(text: string): React.ReactNode {
  const urlRegex = /(https?:\/\/[^\s<]+)/g;
  const parts = text.split(urlRegex);
  if (parts.length <= 1) return text;
  return parts.map((part, i) => {
    if (urlRegex.test(part)) {
      urlRegex.lastIndex = 0;
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2 break-all"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

const FIRST_ITEM_INDEX = 100000;

export function ChatMessageTimeline({
  messages,
  currentUserId,
  currentUserRole,
  isLoading,
  hasMoreMessages,
  onLoadMore,
  isLoadingMore,
  onEditMessage,
  onDeleteMessage,
  onRetryMessage,
  onRemoveFailedMessage,
  onCopyMessage,
  onQuoteReply,
  onCreateTaskFromMessage,
  onOpenThread,
  threadSummaries,
  firstUnreadMessageId,
  onMarkAsRead,
  renderMessageBody,
  getFileIcon,
  formatFileSize,
  isDm = false,
  className,
}: ChatMessageTimelineProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [longPressMessageId, setLongPressMessageId] = useState<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMessageCountRef = useRef(messages.length);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };
  }, []);
  const hasMarkedAsReadRef = useRef(false);
  const isMobile = useIsMobile();

  const messageGroups = useMemo(
    () => groupMessages(messages, firstUnreadMessageId),
    [messages, firstUnreadMessageId]
  );

  const firstItemIndex = useMemo(
    () => FIRST_ITEM_INDEX - messageGroups.length,
    [messageGroups.length]
  );

  useEffect(() => {
    hasMarkedAsReadRef.current = false;
  }, [firstUnreadMessageId]);

  useEffect(() => {
    if (messages.length > lastMessageCountRef.current) {
      const newMessagesCount = messages.length - lastMessageCountRef.current;
      const lastNewMessages = messages.slice(-newMessagesCount);
      const isOwnMessage = lastNewMessages.some((m) => m.authorUserId === currentUserId);

      if (!isAtBottom && !isOwnMessage) {
        setHasNewMessages(true);
      }
    }
    lastMessageCountRef.current = messages.length;
  }, [messages.length, isAtBottom, currentUserId]);

  const handleAtBottomStateChange = useCallback((atBottom: boolean) => {
    setIsAtBottom(atBottom);
    if (atBottom) {
      setHasNewMessages(false);
    }
  }, []);

  const handleRangeChanged = useCallback(
    (_range: { startIndex: number; endIndex: number }) => {
      if (!hasMarkedAsReadRef.current && onMarkAsRead) {
        hasMarkedAsReadRef.current = true;
        onMarkAsRead();
      }
    },
    [onMarkAsRead]
  );

  const scrollToBottom = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({
      index: messageGroups.length - 1,
      behavior: "smooth",
      align: "end",
    });
    setHasNewMessages(false);
  }, [messageGroups.length]);

  const handleStartReached = useCallback(() => {
    if (hasMoreMessages && !isLoadingMore && onLoadMore) {
      onLoadMore();
    }
  }, [hasMoreMessages, isLoadingMore, onLoadMore]);

  const handleEditSave = useCallback(
    (messageId: string) => {
      if (editingBody.trim() && onEditMessage) {
        onEditMessage(messageId, editingBody.trim());
        setEditingMessageId(null);
        setEditingBody("");
      }
    },
    [editingBody, onEditMessage]
  );

  const handleEditCancel = useCallback(() => {
    setEditingMessageId(null);
    setEditingBody("");
  }, []);

  const handleLongPressStart = useCallback((messageId: string) => {
    if (!isMobile) return;
    longPressTimerRef.current = setTimeout(() => {
      setLongPressMessageId(messageId);
    }, 500);
  }, [isMobile]);

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const isTenantAdmin = currentUserRole === "admin";

  const renderGroup = useCallback(
    (index: number, group: MessageGroup) => {
      const isOwnGroup = group.authorUserId === currentUserId;

      return (
        <div className="px-3 sm:px-4" data-testid={`message-group-${group.id}`}>
          {group.timeGapSeparator && (
            <div
              className="flex items-center gap-4 py-3"
              data-testid="time-gap-separator"
            >
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs font-medium text-muted-foreground px-2 whitespace-nowrap">
                {group.timeGapSeparator}
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>
          )}

          {group.dateSeparator && (
            <div className="flex items-center gap-4 py-4" data-testid="date-separator">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs font-medium text-muted-foreground px-2">
                {group.dateSeparator}
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>
          )}

          <div className={`flex gap-2.5 py-1.5 group/message-group ${isOwnGroup ? "flex-row-reverse" : ""}`}>
            <div className="w-8 flex-shrink-0">
              {!isOwnGroup && (
                <Avatar className="h-8 w-8">
                  {group.author?.avatarUrl && (
                    <AvatarImage src={group.author.avatarUrl} />
                  )}
                  <AvatarFallback className="text-[11px]">
                    {getInitials(group.author?.name || group.author?.email || "?")}
                  </AvatarFallback>
                </Avatar>
              )}
            </div>

            <div className={`flex-1 min-w-0 space-y-0.5 ${isOwnGroup ? "items-end" : ""}`} style={{ maxWidth: "min(85%, 560px)" }}>
              {!isOwnGroup && (
                <div className="flex items-baseline gap-2 mb-0.5">
                  <span className="font-semibold text-sm">
                    {group.author?.name || group.author?.email || "Unknown"}
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-xs text-muted-foreground cursor-default">
                        {formatTime(group.messages[0].createdAt)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      {formatFullDateTime(group.messages[0].createdAt)}
                    </TooltipContent>
                  </Tooltip>
                </div>
              )}

              {isOwnGroup && group.messages.length === 1 && (
                <div className="flex justify-end mb-0.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-xs text-muted-foreground cursor-default">
                        {formatTime(group.messages[0].createdAt)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      {formatFullDateTime(group.messages[0].createdAt)}
                    </TooltipContent>
                  </Tooltip>
                </div>
              )}

              {group.messages.map((message, idx) => {
                const isDeleted = !!message.deletedAt;
                const isOwnMessage = message.authorUserId === currentUserId;
                const isEditing = editingMessageId === message.id;
                const canEdit = isOwnMessage && !isDeleted && !message._status;
                const canDelete = (isOwnMessage || isTenantAdmin) && !isDeleted && !message._status;
                const isPending = message._status === "pending";
                const isFailed = message._status === "failed";
                const showInGroupTimestamp = idx > 0 && isOwnGroup;
                const isLongPressed = longPressMessageId === message.id;

                const isFirstInGroup = idx === 0;
                const isLastInGroup = idx === group.messages.length - 1;

                const bubbleRounding = isOwnMessage
                  ? `${isFirstInGroup ? "rounded-t-2xl" : "rounded-t-md"} ${isLastInGroup ? "rounded-bl-2xl rounded-br-md" : "rounded-b-md"} rounded-l-2xl`
                  : `${isFirstInGroup ? "rounded-t-2xl" : "rounded-t-md"} ${isLastInGroup ? "rounded-br-2xl rounded-bl-md" : "rounded-b-md"} rounded-r-2xl`;

                return (
                  <div key={message._tempId || message.id}>
                    {showInGroupTimestamp && (
                      <div className="flex justify-end mb-0.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-[10px] text-muted-foreground cursor-default">
                              {formatTime(message.createdAt)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {formatFullDateTime(message.createdAt)}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    )}
                    <div
                      className={`group relative ${isOwnMessage ? "flex justify-end" : ""}`}
                      data-testid={`message-${message._tempId || message.id}`}
                      onTouchStart={() => handleLongPressStart(message.id)}
                      onTouchEnd={handleLongPressEnd}
                      onTouchCancel={handleLongPressEnd}
                    >
                      <div
                        className={`relative inline-block px-3 py-1.5 ${bubbleRounding} ${
                          isPending ? "opacity-60" : ""
                        } ${
                          isFailed ? "bg-destructive/10 border border-destructive/30" : ""
                        } ${
                          isDeleted
                            ? "bg-muted/40"
                            : isOwnMessage
                              ? "bg-primary/10 dark:bg-primary/15"
                              : "bg-muted/60"
                        }`}
                        style={{ maxWidth: "100%", wordBreak: "break-word" }}
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            {isEditing ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  value={editingBody}
                                  onChange={(e) => setEditingBody(e.target.value)}
                                  className="flex-1 text-sm"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                      e.preventDefault();
                                      handleEditSave(message.id);
                                    }
                                    if (e.key === "Escape") {
                                      handleEditCancel();
                                    }
                                  }}
                                  data-testid={`message-edit-input-${message.id}`}
                                />
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => handleEditSave(message.id)}
                                  disabled={!editingBody.trim()}
                                  aria-label="Save edit"
                                  data-testid={`message-edit-save-${message.id}`}
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={handleEditCancel}
                                  aria-label="Cancel edit"
                                  data-testid={`message-edit-cancel-${message.id}`}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center gap-2">
                                  <p
                                    className={`text-sm whitespace-pre-wrap break-words ${
                                      isDeleted ? "text-muted-foreground italic" : ""
                                    }`}
                                  >
                                    {isDeleted
                                      ? message.body
                                      : renderMessageBody
                                      ? renderMessageBody(message.body)
                                      : renderLinkedText(message.body)}
                                  </p>
                                  {isPending && (
                                    <span className="text-xs text-muted-foreground flex items-center gap-1 flex-shrink-0">
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    </span>
                                  )}
                                  {isFailed && (
                                    <span className="text-xs text-destructive flex items-center gap-1 flex-shrink-0">
                                      <AlertCircle className="h-3 w-3" />
                                      Failed
                                    </span>
                                  )}
                                  {message.editedAt && !isDeleted && (
                                    <span className="text-xs text-muted-foreground flex-shrink-0">(edited)</span>
                                  )}
                                </div>

                                {isFailed && message._tempId && (
                                  <div className="flex items-center gap-2 mt-1">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => onRetryMessage?.(message)}
                                      data-testid={`message-retry-${message._tempId}`}
                                    >
                                      <RefreshCw className="h-3 w-3 mr-1" />
                                      Retry
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => onRemoveFailedMessage?.(message._tempId!)}
                                      data-testid={`message-remove-${message._tempId}`}
                                    >
                                      <X className="h-3 w-3 mr-1" />
                                      Remove
                                    </Button>
                                  </div>
                                )}
                              </>
                            )}

                            {message.attachments &&
                              message.attachments.length > 0 &&
                              !isDeleted && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {message.attachments.map((attachment) => {
                                    const FileIcon = getFileIcon?.(attachment.mimeType);
                                    const isImage = attachment.mimeType.startsWith("image/");
                                    return (
                                      <a
                                        key={attachment.id}
                                        href={attachment.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 p-2 rounded-md bg-background/60 hover-elevate"
                                        data-testid={`attachment-${attachment.id}`}
                                      >
                                        {isImage ? (
                                          <img
                                            src={attachment.url}
                                            alt={attachment.fileName}
                                            className="h-16 w-16 object-cover rounded"
                                          />
                                        ) : (
                                          <>
                                            {FileIcon && (
                                              <FileIcon className="h-4 w-4 text-muted-foreground" />
                                            )}
                                            <span className="text-xs truncate max-w-[150px]">
                                              {attachment.fileName}
                                            </span>
                                            {formatFileSize && (
                                              <span className="text-xs text-muted-foreground">
                                                ({formatFileSize(attachment.sizeBytes)})
                                              </span>
                                            )}
                                          </>
                                        )}
                                      </a>
                                    );
                                  })}
                                </div>
                              )}

                            {!message.parentMessageId && threadSummaries?.get(message.id) && (
                              <button
                                type="button"
                                onClick={() => onOpenThread?.(message.id)}
                                className="mt-1 flex items-center gap-1.5 text-xs text-primary hover:underline cursor-pointer"
                                data-testid={`thread-replies-${message.id}`}
                              >
                                <MessagesSquare className="h-3.5 w-3.5" />
                                <span>
                                  {threadSummaries.get(message.id)!.replyCount}{" "}
                                  {threadSummaries.get(message.id)!.replyCount === 1 ? "reply" : "replies"}
                                </span>
                              </button>
                            )}
                          </div>

                          {!isDeleted && !isEditing && !isMobile && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                                  aria-label="Message actions"
                                  data-testid={`message-menu-${message.id}`}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => {
                                    if (onCopyMessage) {
                                      onCopyMessage(message.body);
                                    } else {
                                      navigator.clipboard.writeText(message.body);
                                    }
                                  }}
                                  data-testid={`message-copy-${message.id}`}
                                >
                                  <Copy className="h-4 w-4 mr-2" />
                                  Copy text
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    const authorName = message.author?.name || message.author?.email || "Unknown";
                                    onQuoteReply?.(authorName, message.body);
                                  }}
                                  data-testid={`message-quote-${message.id}`}
                                >
                                  <Quote className="h-4 w-4 mr-2" />
                                  Quote reply
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => onCreateTaskFromMessage?.(message)}
                                  data-testid={`message-create-task-${message.id}`}
                                >
                                  <ListTodo className="h-4 w-4 mr-2" />
                                  Create task
                                </DropdownMenuItem>
                                {onOpenThread && !message.parentMessageId && (
                                  <DropdownMenuItem
                                    onClick={() => onOpenThread(message.id)}
                                    data-testid={`message-thread-${message.id}`}
                                  >
                                    <MessagesSquare className="h-4 w-4 mr-2" />
                                    Reply in thread
                                  </DropdownMenuItem>
                                )}
                                {canEdit && (
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setEditingMessageId(message.id);
                                      setEditingBody(message.body);
                                    }}
                                    data-testid={`message-edit-${message.id}`}
                                  >
                                    <Pencil className="h-4 w-4 mr-2" />
                                    Edit
                                  </DropdownMenuItem>
                                )}
                                {canDelete && (
                                  <DropdownMenuItem
                                    onClick={() => onDeleteMessage?.(message.id)}
                                    className="text-destructive focus:text-destructive"
                                    data-testid={`message-delete-${message.id}`}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </div>

                      {isLongPressed && isMobile && !isDeleted && !isEditing && (
                        <div
                          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
                          onClick={() => setLongPressMessageId(null)}
                          data-testid={`message-action-sheet-${message.id}`}
                        >
                          <div
                            className="w-full max-w-sm bg-background rounded-t-xl p-2 pb-6 space-y-1 animate-in slide-in-from-bottom-4 duration-200"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full mx-auto mb-3" />
                            <button
                              className="flex items-center gap-3 w-full px-4 min-h-11 rounded-md hover-elevate text-left"
                              onClick={() => {
                                if (onCopyMessage) onCopyMessage(message.body);
                                else navigator.clipboard.writeText(message.body);
                                setLongPressMessageId(null);
                              }}
                              data-testid={`action-sheet-copy-${message.id}`}
                            >
                              <Copy className="h-5 w-5 text-muted-foreground" />
                              <span className="text-sm font-medium">Copy text</span>
                            </button>
                            <button
                              className="flex items-center gap-3 w-full px-4 min-h-11 rounded-md hover-elevate text-left"
                              onClick={() => {
                                const authorName = message.author?.name || message.author?.email || "Unknown";
                                onQuoteReply?.(authorName, message.body);
                                setLongPressMessageId(null);
                              }}
                              data-testid={`action-sheet-quote-${message.id}`}
                            >
                              <Quote className="h-5 w-5 text-muted-foreground" />
                              <span className="text-sm font-medium">Quote reply</span>
                            </button>
                            {canEdit && (
                              <button
                                className="flex items-center gap-3 w-full px-4 min-h-11 rounded-md hover-elevate text-left"
                                onClick={() => {
                                  setEditingMessageId(message.id);
                                  setEditingBody(message.body);
                                  setLongPressMessageId(null);
                                }}
                                data-testid={`action-sheet-edit-${message.id}`}
                              >
                                <Pencil className="h-5 w-5 text-muted-foreground" />
                                <span className="text-sm font-medium">Edit</span>
                              </button>
                            )}
                            {canDelete && (
                              <button
                                className="flex items-center gap-3 w-full px-4 min-h-11 rounded-md hover-elevate text-left"
                                onClick={() => {
                                  onDeleteMessage?.(message.id);
                                  setLongPressMessageId(null);
                                }}
                                data-testid={`action-sheet-delete-${message.id}`}
                              >
                                <Trash2 className="h-5 w-5 text-destructive" />
                                <span className="text-sm font-medium text-destructive">Delete</span>
                              </button>
                            )}
                            <button
                              className="flex items-center justify-center w-full px-4 min-h-11 mt-2 rounded-md bg-muted text-sm font-medium"
                              onClick={() => setLongPressMessageId(null)}
                              data-testid={`action-sheet-cancel-${message.id}`}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    },
    [
      currentUserId,
      editingMessageId,
      editingBody,
      isTenantAdmin,
      isDm,
      isMobile,
      longPressMessageId,
      handleEditSave,
      handleEditCancel,
      handleLongPressStart,
      handleLongPressEnd,
      onRetryMessage,
      onRemoveFailedMessage,
      onCopyMessage,
      onQuoteReply,
      onCreateTaskFromMessage,
      onOpenThread,
      onDeleteMessage,
      onEditMessage,
      threadSummaries,
      renderMessageBody,
      getFileIcon,
      formatFileSize,
    ]
  );

  if (isLoading && messages.length === 0) {
    return (
      <div className={`relative flex flex-col h-full ${className || ""}`}>
        <div className="flex-1 p-4 space-y-6" data-testid="messages-loading">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="h-8 w-8 rounded-full bg-muted flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-3.5 bg-muted rounded w-24" />
                  <div className="h-3 bg-muted rounded w-12" />
                </div>
                <div className="h-4 bg-muted rounded w-3/4" />
                {i % 2 === 0 && <div className="h-4 bg-muted rounded w-1/2" />}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (messages.length === 0 && !isLoading) {
    return (
      <div className={`relative flex flex-col h-full ${className || ""}`}>
        <div
          className="flex-1 flex flex-col items-center justify-center text-muted-foreground"
          data-testid="empty-messages"
        >
          <div className="flex items-center justify-center h-16 w-16 rounded-full bg-primary/10 mb-4">
            <MessageCircle className="h-8 w-8 text-primary" />
          </div>
          <p className="text-base font-medium text-foreground mb-1">Say hello!</p>
          <p className="text-sm text-center max-w-[200px]">
            Start the conversation by sending your first message.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative flex flex-col h-full ${className || ""}`}>
      <Virtuoso
        ref={virtuosoRef}
        data={messageGroups as MessageGroup[]}
        firstItemIndex={firstItemIndex}
        initialTopMostItemIndex={messageGroups.length - 1}
        itemContent={(index, group) => renderGroup(index, group)}
        followOutput="smooth"
        alignToBottom
        atBottomStateChange={handleAtBottomStateChange}
        atBottomThreshold={60}
        startReached={handleStartReached}
        rangeChanged={handleRangeChanged}
        increaseViewportBy={{ top: 400, bottom: 200 }}
        overscan={300}
        style={{ flex: 1 }}
        className="scrollbar-thin"
        components={{
          Header: hasMoreMessages
            ? () => (
                <div className="flex justify-center py-4 px-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onLoadMore}
                    disabled={isLoadingMore}
                    data-testid="button-load-more"
                  >
                    {isLoadingMore ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Clock className="h-4 w-4 mr-2" />
                    )}
                    Load older messages
                  </Button>
                </div>
              )
            : undefined,
        }}
      />

      {!isAtBottom && (
        <div className="absolute bottom-3 right-3 z-10">
          <Button
            variant="secondary"
            size="icon"
            onClick={scrollToBottom}
            className="shadow-lg rounded-full h-10 w-10"
            aria-label="Scroll to bottom"
            data-testid="button-scroll-to-bottom"
          >
            <ChevronDown className="h-5 w-5" />
          </Button>
        </div>
      )}

      {hasNewMessages && !isAtBottom && (
        <div className="absolute bottom-16 right-3 z-10">
          <Button
            variant="default"
            size="sm"
            onClick={scrollToBottom}
            className="shadow-lg gap-1.5 rounded-full"
            data-testid="button-new-messages"
          >
            <ArrowDown className="h-3.5 w-3.5" />
            New messages
          </Button>
        </div>
      )}

    </div>
  );
}
