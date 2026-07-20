import { useMemo, useState, useCallback } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  Bell,
  Check,
  CheckCheck,
  ChevronRight,
  Clock,
  FileText,
  FolderKanban,
  Headphones,
  Inbox,
  Layers,
  Loader2,
  MessageSquare,
  Search,
  Trash2,
  Users,
  X,
  Hash,
} from "lucide-react";
import { PageShell, SurfacePanel } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useTaskDrawerOptional } from "@/lib/task-drawer-context";

interface GroupMeta {
  count: number;
  lastActorId?: string;
  lastActorName?: string;
  actorIds?: string[];
  lastEntityId?: string;
  lastMessagePreview?: string;
}

interface InboxNotification {
  id: string;
  tenantId: string | null;
  userId: string;
  type: string;
  title: string;
  message: string | null;
  payloadJson: unknown;
  severity: string;
  entityType: string | null;
  entityId: string | null;
  href: string | null;
  dedupeKey: string | null;
  eventCount: number;
  lastEventAt: string | null;
  groupMeta: GroupMeta | null;
  isDismissed: boolean;
  readAt: string | null;
  createdAt: string;
}

interface PaginatedResponse {
  items: InboxNotification[];
  nextCursor: string | null;
  hasMore: boolean;
}

type FilterTab = "all" | "unread" | "mentions" | "tasks" | "messages" | "tickets";

const FILTER_TABS: { value: FilterTab; label: string; typeFilter?: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "mentions", label: "Mentions", typeFilter: "comment_mention" },
  { value: "tasks", label: "Tasks", typeFilter: "task_deadline,task_assigned,task_completed,task_review_requested,task_review_approved,task_status_changed" },
  { value: "messages", label: "Messages", typeFilter: "chat_message,client_message" },
  { value: "tickets", label: "Tickets", typeFilter: "support_ticket,work_order" },
];

const TYPE_LABELS: Record<string, string> = {
  task_deadline: "Task deadline",
  task_assigned: "Task assignment",
  task_completed: "Task completed",
  task_review_requested: "Review request",
  task_review_approved: "Review approved",
  comment_added: "Comment",
  comment_mention: "Mention",
  project_update: "Project update",
  project_member_added: "Project member",
  task_status_changed: "Task status",
  crm_followup_due: "Follow-up",
  approval_response: "Approval",
  chat_message: "Chat",
  client_message: "Client message",
  support_ticket: "Support ticket",
  work_order: "Work order",
};

const TASK_NOTIFICATION_TYPES = new Set([
  "task_deadline",
  "task_assigned",
  "task_completed",
  "task_review_requested",
  "task_review_approved",
  "task_status_changed",
]);

function getNotificationIcon(type: string) {
  switch (type) {
    case "task_deadline":
    case "crm_followup_due":
      return Clock;
    case "task_assigned":
    case "project_member_added":
      return Users;
    case "task_completed":
    case "task_review_requested":
    case "task_review_approved":
    case "approval_response":
      return CheckCheck;
    case "comment_added":
    case "comment_mention":
    case "client_message":
      return MessageSquare;
    case "project_update":
    case "task_status_changed":
      return FolderKanban;
    case "chat_message":
      return Hash;
    case "support_ticket":
      return Headphones;
    case "work_order":
      return FileText;
    default:
      return Bell;
  }
}

function getSeverityColor(severity: string) {
  switch (severity) {
    case "urgent":
      return "text-destructive";
    case "warning":
      return "text-amber-500";
    default:
      return "text-primary";
  }
}

function getPayloadString(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== "object" || !(key in payload)) return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function getTaskIdFromPayload(payload: unknown): string | null {
  return getPayloadString(payload, "taskId");
}

function getTaskIdFromHref(href: string | null): string | null {
  if (!href) return null;
  try {
    const url = new URL(href, window.location.origin);
    return url.searchParams.get("taskId") || url.searchParams.get("task");
  } catch {
    return null;
  }
}

function buildChatHref(type: "channel" | "dm", id: string, messageId?: string | null): string {
  const params = new URLSearchParams({ c: `${type}:${id}` });
  if (messageId) params.set("message", messageId);
  return `/chat?${params.toString()}`;
}

function normalizeNotificationHref(notification: InboxNotification): string | null {
  const messageId =
    getPayloadString(notification.payloadJson, "messageId") ||
    getPayloadString(notification.payloadJson, "parentMessageId");

  if (notification.type === "chat_message" || notification.entityType === "channel" || notification.entityType === "dm") {
    const targetType = getPayloadString(notification.payloadJson, "targetType");
    const channelId =
      getPayloadString(notification.payloadJson, "channelId") ||
      (notification.entityType === "channel" ? notification.entityId : null);
    const dmThreadId =
      getPayloadString(notification.payloadJson, "dmThreadId") ||
      (notification.entityType === "dm" ? notification.entityId : null);
    const senderId = getPayloadString(notification.payloadJson, "senderId");

    if (targetType === "channel" && channelId) return buildChatHref("channel", channelId, messageId);
    if (targetType === "dm" && dmThreadId) return buildChatHref("dm", dmThreadId, messageId);
    if (channelId) return buildChatHref("channel", channelId, messageId);
    if (dmThreadId) return buildChatHref("dm", dmThreadId, messageId);
    if (senderId) {
      const params = new URLSearchParams({ dm: senderId });
      if (messageId) params.set("message", messageId);
      return `/chat?${params.toString()}`;
    }
  }

  if (!notification.href) return null;

  try {
    const url = new URL(notification.href, window.location.origin);
    if (url.pathname === "/chat") {
      const currentConversation = url.searchParams.get("c");
      if (currentConversation) {
        const params = new URLSearchParams(url.searchParams);
        if (messageId && !params.has("message")) params.set("message", messageId);
        return `/chat?${params.toString()}`;
      }

      const channelId = url.searchParams.get("channel") || url.searchParams.get("channelId");
      if (channelId) return buildChatHref("channel", channelId, messageId || url.searchParams.get("message"));

      const dmThreadId = url.searchParams.get("dmThreadId") || url.searchParams.get("dmThread");
      if (dmThreadId) return buildChatHref("dm", dmThreadId, messageId || url.searchParams.get("message"));

      const legacyDmUserId = url.searchParams.get("dm");
      if (legacyDmUserId) {
        const params = new URLSearchParams({ dm: legacyDmUserId });
        const linkedMessageId = messageId || url.searchParams.get("message");
        if (linkedMessageId) params.set("message", linkedMessageId);
        return `/chat?${params.toString()}`;
      }
    }

    const supportMatch = url.pathname.match(/^\/support\/(?:tickets|work-orders)\/([^/]+)$/);
    if (supportMatch?.[1]) return `/support/${encodeURIComponent(supportMatch[1])}`;

    const clientMessageMatch = url.pathname.match(/^\/clients\/([^/]+)\/messages$/);
    if (clientMessageMatch?.[1]) {
      const threadId = url.searchParams.get("thread") || getPayloadString(notification.payloadJson, "threadId");
      if (threadId) {
        const params = new URLSearchParams({ tab: "messages", conversation: threadId });
        return `/clients/${encodeURIComponent(clientMessageMatch[1])}?${params.toString()}`;
      }
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return notification.href;
  }
}

function getNotificationTarget(notification: InboxNotification) {
  if (TASK_NOTIFICATION_TYPES.has(notification.type) || notification.entityType === "task") {
    return "Task";
  }
  if (notification.type === "chat_message") return "Chat";
  if (notification.type === "client_message") return "Client";
  if (notification.type === "support_ticket") return "Support";
  if (notification.type === "work_order") return "Work order";
  if (notification.entityType) return notification.entityType;
  return "Notification";
}

function matchesSearch(notification: InboxNotification, search: string) {
  const query = search.trim().toLowerCase();
  if (!query) return true;
  return [
    notification.title,
    notification.message,
    TYPE_LABELS[notification.type],
    notification.entityType,
    getPayloadString(notification.payloadJson, "actorName"),
    getPayloadString(notification.payloadJson, "senderName"),
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query));
}

export default function NotificationsInboxPage() {
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeNotificationId, setActiveNotificationId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const taskDrawer = useTaskDrawerOptional();
  const openTask = taskDrawer?.openTask;

  const currentFilter = FILTER_TABS.find((tab) => tab.value === filterTab);
  const queryParams = new URLSearchParams();
  if (filterTab === "unread") queryParams.set("unreadOnly", "true");
  if (currentFilter?.typeFilter) queryParams.set("typeFilter", currentFilter.typeFilter);
  queryParams.set("limit", "50");

  const {
    data: notificationPages,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery<PaginatedResponse>({
    queryKey: ["/api/notifications", "inbox", filterTab],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams(queryParams);
      if (pageParam) params.set("cursor", pageParam as string);
      const res = await fetch(`/api/notifications?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch notifications");
      return res.json();
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    refetchInterval: 60000,
  });

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    refetchInterval: 30000,
  });

  const notifications = notificationPages?.pages.flatMap((page) => page.items) ?? [];
  const visibleNotifications = useMemo(
    () => notifications.filter((notification) => matchesSearch(notification, search)),
    [notifications, search],
  );
  const unreadCount = unreadData?.count ?? 0;
  const selectedNotifications = useMemo(
    () => visibleNotifications.filter((notification) => selectedIds.has(notification.id)),
    [visibleNotifications, selectedIds],
  );
  const activeNotification =
    visibleNotifications.find((notification) => notification.id === activeNotificationId) ||
    visibleNotifications[0] ||
    null;
  const allVisibleSelected =
    visibleNotifications.length > 0 &&
    visibleNotifications.every((notification) => selectedIds.has(notification.id));

  const invalidateNotifications = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
  }, [queryClient]);

  const markReadMutation = useMutation({
    mutationFn: async (notificationIds: string[]) => {
      await Promise.all(notificationIds.map((id) => apiRequest("PATCH", `/api/notifications/${id}/read`)));
    },
    onSuccess: (_, notificationIds) => {
      invalidateNotifications();
      toast({
        title: notificationIds.length === 1 ? "Notification marked read" : `${notificationIds.length} notifications marked read`,
      });
      setSelectedIds(new Set());
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async (notificationIds: string[]) => {
      await Promise.all(notificationIds.map((id) => apiRequest("PATCH", `/api/notifications/${id}/dismiss`)));
    },
    onSuccess: (_, notificationIds) => {
      invalidateNotifications();
      toast({
        title: notificationIds.length === 1 ? "Notification cleared" : `${notificationIds.length} notifications cleared`,
        description: "Cleared notifications are removed from this inbox.",
      });
      setSelectedIds(new Set());
      setActiveNotificationId(null);
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/notifications/mark-all-read");
    },
    onSuccess: () => {
      invalidateNotifications();
      toast({ title: "All notifications marked read" });
    },
  });

  const toggleSelection = (notificationId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(notificationId)) {
        next.delete(notificationId);
      } else {
        next.add(notificationId);
      }
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleNotifications.forEach((notification) => next.delete(notification.id));
      } else {
        visibleNotifications.forEach((notification) => next.add(notification.id));
      }
      return next;
    });
  };

  const openNotification = (notification: InboxNotification) => {
    if (!notification.readAt) {
      markReadMutation.mutate([notification.id]);
    }

    const taskId =
      getTaskIdFromPayload(notification.payloadJson) ||
      (notification.entityType === "task" ? notification.entityId : null) ||
      getTaskIdFromHref(notification.href);

    if ((TASK_NOTIFICATION_TYPES.has(notification.type) || notification.entityType === "task") && taskId && openTask) {
      openTask(taskId);
      return;
    }

    const href = normalizeNotificationHref(notification);
    if (href) setLocation(href);
  };

  const selectedUnreadIds = selectedNotifications
    .filter((notification) => !notification.readAt)
    .map((notification) => notification.id);

  return (
    <PageShell>
      <div className="space-y-5" data-testid="notifications-inbox-page">
        <SurfacePanel className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
              <Inbox className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Notification Center</h1>
              <p className="text-sm text-muted-foreground">
                Review, open, mark read, or clear system notifications.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Badge variant="destructive" className="rounded-full">
                {unreadCount > 99 ? "99+" : unreadCount} unread
              </Badge>
            )}
            <Button
              variant="outline"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending || unreadCount === 0}
              data-testid="button-inbox-mark-all-read"
            >
              <CheckCheck className="mr-2 h-4 w-4" />
              Mark all read
            </Button>
          </div>
        </SurfacePanel>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <SurfacePanel padding="none" className="overflow-hidden">
            <div className="border-b p-4">
              <div className="space-y-3">
                <Tabs value={filterTab} onValueChange={(value) => { setFilterTab(value as FilterTab); setSelectedIds(new Set()); }}>
                  <TabsList className="h-auto flex-wrap justify-start">
                    {FILTER_TABS.map((tab) => (
                      <TabsTrigger key={tab.value} value={tab.value} data-testid={`inbox-filter-${tab.value}`}>
                        {tab.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                <div className="relative w-full max-w-2xl">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search notifications..."
                    className="pl-9"
                    data-testid="input-search-notifications"
                  />
                  {search && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                      onClick={() => setSearch("")}
                      aria-label="Clear search"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-b bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={toggleAllVisible}
                  aria-label="Select all visible notifications"
                  data-testid="checkbox-select-all-notifications"
                />
                <span className="text-sm text-muted-foreground">
                  {selectedIds.size > 0
                    ? `${selectedIds.size} selected`
                    : `${visibleNotifications.length} notification${visibleNotifications.length === 1 ? "" : "s"} loaded`}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={selectedUnreadIds.length === 0 || markReadMutation.isPending}
                  onClick={() => markReadMutation.mutate(selectedUnreadIds)}
                  data-testid="button-selected-mark-read"
                >
                  <Check className="mr-2 h-4 w-4" />
                  Mark read
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={selectedNotifications.length === 0 || dismissMutation.isPending}
                  onClick={() => dismissMutation.mutate(selectedNotifications.map((notification) => notification.id))}
                  data-testid="button-selected-clear"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Clear selected
                </Button>
              </div>
            </div>

            {isLoading ? (
              <div className="flex min-h-[360px] flex-col items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Loading notifications...</span>
              </div>
            ) : visibleNotifications.length === 0 ? (
              <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                <Bell className="h-12 w-12 opacity-25" />
                <div>
                  <p className="font-medium text-foreground">
                    {filterTab === "unread" ? "No unread notifications" : "No notifications found"}
                  </p>
                  <p className="text-sm">Your notification inbox is clear for this view.</p>
                </div>
              </div>
            ) : (
              <div className="divide-y">
                {visibleNotifications.map((notification) => {
                  const Icon = getNotificationIcon(notification.type);
                  const isUnread = !notification.readAt;
                  const isActive = activeNotification?.id === notification.id;
                  const href = normalizeNotificationHref(notification);

                  return (
                    <div
                      key={notification.id}
                      className={cn(
                        "group grid cursor-pointer grid-cols-[auto_auto_minmax(0,1fr)_auto] items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50",
                        isUnread && "bg-primary/5",
                        isActive && "bg-muted",
                      )}
                      onClick={() => {
                        setActiveNotificationId(notification.id);
                        if (!notification.readAt) {
                          markReadMutation.mutate([notification.id]);
                        }
                      }}
                      data-testid={`inbox-notification-${notification.id}`}
                    >
                      <Checkbox
                        checked={selectedIds.has(notification.id)}
                        onCheckedChange={() => toggleSelection(notification.id)}
                        onClick={(event) => event.stopPropagation()}
                        aria-label={`Select ${notification.title}`}
                      />
                      <div className={cn("mt-0.5 flex h-9 w-9 items-center justify-center rounded-full", isUnread ? "bg-primary/10" : "bg-muted")}>
                        <Icon className={cn("h-4 w-4", isUnread ? getSeverityColor(notification.severity) : "text-muted-foreground")} />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className={cn("truncate text-sm font-medium", !isUnread && "text-muted-foreground line-through decoration-muted-foreground/40")}>
                            {notification.title}
                          </p>
                          {isUnread ? (
                            <Badge className="h-5 rounded-full px-2 text-[10px]">New</Badge>
                          ) : (
                            <Badge variant="secondary" className="h-5 rounded-full px-2 text-[10px]">Read</Badge>
                          )}
                          <Badge variant="outline" className="h-5 rounded-full px-2 text-[10px]">
                            {TYPE_LABELS[notification.type] || notification.type}
                          </Badge>
                          {notification.eventCount > 1 && (
                            <Badge variant="secondary" className="h-5 rounded-full px-2 text-[10px] gap-1">
                              <Layers className="h-3 w-3" />
                              {notification.eventCount}
                            </Badge>
                          )}
                          {notification.severity === "urgent" && (
                            <Badge variant="destructive" className="h-5 rounded-full px-2 text-[10px] gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Urgent
                            </Badge>
                          )}
                        </div>
                        {notification.message && (
                          <p className="line-clamp-2 text-sm text-muted-foreground">{notification.message}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{formatDistanceToNow(new Date(notification.lastEventAt || notification.createdAt), { addSuffix: true })}</span>
                          <span aria-hidden="true">•</span>
                          <span>{getNotificationTarget(notification)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {isUnread && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                            onClick={(event) => {
                              event.stopPropagation();
                              markReadMutation.mutate([notification.id]);
                            }}
                            aria-label="Mark notification read"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                          onClick={(event) => {
                            event.stopPropagation();
                            dismissMutation.mutate([notification.id]);
                          }}
                          aria-label="Clear notification"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant={href || TASK_NOTIFICATION_TYPES.has(notification.type) ? "outline" : "ghost"}
                          size="sm"
                          className="h-8 gap-1"
                          onClick={(event) => {
                            event.stopPropagation();
                            openNotification(notification);
                          }}
                          disabled={!href && !(TASK_NOTIFICATION_TYPES.has(notification.type) || notification.entityType === "task")}
                          data-testid={`button-open-notification-${notification.id}`}
                        >
                          Open
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {hasNextPage && (
              <div className="border-t p-4 text-center">
                <Button
                  variant="outline"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  data-testid="button-load-more-notifications"
                >
                  {isFetchingNextPage ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    "Load more"
                  )}
                </Button>
              </div>
            )}
          </SurfacePanel>

          <SurfacePanel className="hidden xl:block">
            {activeNotification ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  {(() => {
                    const Icon = getNotificationIcon(activeNotification.type);
                    return (
                      <div className={cn("flex h-10 w-10 items-center justify-center rounded-full", activeNotification.readAt ? "bg-muted" : "bg-primary/10")}>
                        <Icon className={cn("h-5 w-5", activeNotification.readAt ? "text-muted-foreground" : getSeverityColor(activeNotification.severity))} />
                      </div>
                    );
                  })()}
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold leading-tight">{activeNotification.title}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(activeNotification.lastEventAt || activeNotification.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge variant={activeNotification.readAt ? "secondary" : "default"}>
                    {activeNotification.readAt ? "Read" : "Unread"}
                  </Badge>
                  <Badge variant="outline">{TYPE_LABELS[activeNotification.type] || activeNotification.type}</Badge>
                  <Badge variant="outline">{getNotificationTarget(activeNotification)}</Badge>
                </div>

                <Separator />

                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Message</h3>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                    {activeNotification.message || "No additional details were included with this notification."}
                  </p>
                </div>

                <Separator />

                <div className="grid gap-2">
                  <Button onClick={() => openNotification(activeNotification)} data-testid="button-preview-open-notification">
                    Open related item
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                  {!activeNotification.readAt && (
                    <Button
                      variant="outline"
                      onClick={() => markReadMutation.mutate([activeNotification.id])}
                      disabled={markReadMutation.isPending}
                    >
                      <Check className="mr-2 h-4 w-4" />
                      Mark read
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => dismissMutation.mutate([activeNotification.id])}
                    disabled={dismissMutation.isPending}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Clear from inbox
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                <Inbox className="h-12 w-12 opacity-25" />
                <div>
                  <p className="font-medium text-foreground">Select a notification</p>
                  <p className="text-sm">Notification details and actions will appear here.</p>
                </div>
              </div>
            )}
          </SurfacePanel>
        </div>
      </div>
    </PageShell>
  );
}
