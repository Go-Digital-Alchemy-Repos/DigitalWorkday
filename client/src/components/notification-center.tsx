import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import {
  Bell, Check, CheckCheck, Settings, Clock, MessageSquare,
  Users, FolderKanban, X, Headphones, FileText, Hash,
  AlertTriangle, ChevronRight, Loader2, Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { getSocket } from "@/lib/realtime/socket";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { prefersReducedMotion } from "@/lib/motion";
import type { ServerToClientEvents } from "@shared/events";
import { useTaskDrawerOptional } from "@/lib/task-drawer-context";
import { useLocation } from "wouter";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
import { chatSounds } from "@/lib/sounds";

interface GroupMeta {
  count: number;
  lastActorId?: string;
  lastActorName?: string;
  actorIds?: string[];
  lastEntityId?: string;
  lastMessagePreview?: string;
}

interface Notification {
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
  readAt: Date | null;
  createdAt: Date;
}

interface NotificationGroup {
  key: string;
  dedupeKey: string;
  type: string;
  notifications: Notification[];
  totalEventCount: number;
  latestNotification: Notification;
  isUnread: boolean;
}

interface PaginatedResponse {
  items: Notification[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface NotificationPreferences {
  id: string;
  userId: string;
  taskDeadline: boolean;
  taskAssigned: boolean;
  taskCompleted: boolean;
  commentAdded: boolean;
  commentMention: boolean;
  projectUpdate: boolean;
  projectMemberAdded: boolean;
  taskStatusChanged: boolean;
  chatMessage: boolean;
  clientMessage: boolean;
  supportTicket: boolean;
  workOrder: boolean;
  emailEnabled: boolean;
}

type NotificationType =
  | "task_deadline"
  | "task_assigned"
  | "task_completed"
  | "comment_added"
  | "comment_mention"
  | "project_update"
  | "project_member_added"
  | "task_status_changed"
  | "chat_message"
  | "client_message"
  | "support_ticket"
  | "work_order";

const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  task_deadline: "Task Deadlines",
  task_assigned: "Task Assignments",
  task_completed: "Task Completions",
  comment_added: "New Comments",
  comment_mention: "Mentions",
  project_update: "Project Updates",
  project_member_added: "Team Additions",
  task_status_changed: "Status Changes",
  chat_message: "Chat Messages",
  client_message: "Client Messages",
  support_ticket: "Support Tickets",
  work_order: "Work Orders",
};

const NOTIFICATION_TYPE_ICONS: Record<NotificationType, typeof Bell> = {
  task_deadline: Clock,
  task_assigned: Users,
  task_completed: Check,
  comment_added: MessageSquare,
  comment_mention: MessageSquare,
  project_update: FolderKanban,
  project_member_added: Users,
  task_status_changed: FolderKanban,
  chat_message: Hash,
  client_message: MessageSquare,
  support_ticket: Headphones,
  work_order: FileText,
};

function getNotificationIcon(type: string) {
  return NOTIFICATION_TYPE_ICONS[type as NotificationType] || Bell;
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

const TASK_NOTIFICATION_TYPES = [
  "task_deadline",
  "task_assigned",
  "task_completed",
  "task_status_changed",
];

function isTaskNotification(type: string): boolean {
  return TASK_NOTIFICATION_TYPES.includes(type);
}

function getTaskIdFromPayload(payload: unknown): string | null {
  if (payload && typeof payload === "object" && "taskId" in payload) {
    return (payload as { taskId: string }).taskId;
  }
  return null;
}

type FilterTab = "all" | "unread" | "mentions" | "tasks" | "messages" | "tickets";

const FILTER_TAB_CONFIG: { value: FilterTab; label: string; typeFilter?: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "mentions", label: "Mentions", typeFilter: "comment_mention" },
  { value: "tasks", label: "Tasks", typeFilter: "task_deadline,task_assigned,task_completed,task_status_changed" },
  { value: "messages", label: "Chat", typeFilter: "chat_message,client_message" },
  { value: "tickets", label: "Tickets", typeFilter: "support_ticket,work_order" },
];

const GROUPABLE_TYPES = new Set([
  "chat_message", "client_message", "support_ticket", "work_order", "comment_added",
]);

function getEffectiveTimestamp(n: Notification): number {
  return new Date(n.lastEventAt || n.createdAt).getTime();
}

function groupNotifications(notifications: Notification[]): (Notification | NotificationGroup)[] {
  const result: (Notification | NotificationGroup)[] = [];
  const grouped = new Map<string, Notification[]>();
  const order: string[] = [];

  for (const n of notifications) {
    if (n.dedupeKey && GROUPABLE_TYPES.has(n.type) && n.eventCount > 1) {
      const key = n.dedupeKey;
      if (!grouped.has(key)) {
        grouped.set(key, []);
        order.push(key);
      }
      grouped.get(key)!.push(n);
    } else {
      result.push(n);
    }
  }

  for (const key of order) {
    const items = grouped.get(key)!;
    items.sort((a, b) => getEffectiveTimestamp(b) - getEffectiveTimestamp(a));
    const latest = items[0];
    const totalEventCount = items.reduce((sum, n) => sum + n.eventCount, 0);
    result.push({
      key,
      dedupeKey: key,
      type: latest.type,
      notifications: items,
      totalEventCount,
      latestNotification: latest,
      isUnread: items.some(n => !n.readAt),
    });
  }

  result.sort((a, b) => {
    const aTime = isGroup(a) ? getEffectiveTimestamp(a.latestNotification) : getEffectiveTimestamp(a);
    const bTime = isGroup(b) ? getEffectiveTimestamp(b.latestNotification) : getEffectiveTimestamp(b);
    return bTime - aTime;
  });

  return result;
}

function isGroup(item: Notification | NotificationGroup): item is NotificationGroup {
  return 'latestNotification' in item;
}

function NotificationGroupRow({
  group,
  onGroupRead,
  onGroupDismiss,
  onClick,
  isGroupReadPending,
  isGroupDismissPending,
}: {
  group: NotificationGroup;
  onGroupRead: (dedupeKey: string) => void;
  onGroupDismiss: (dedupeKey: string) => void;
  onClick: (notification: Notification) => void;
  isGroupReadPending: boolean;
  isGroupDismissPending: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const latest = group.latestNotification;
  const Icon = getNotificationIcon(latest.type);
  const severityColor = getSeverityColor(latest.severity);
  const meta = latest.groupMeta;

  const summaryText = useMemo(() => {
    if (meta?.lastActorName && group.totalEventCount > 1) {
      const others = group.totalEventCount - 1;
      return others > 0
        ? `${meta.lastActorName} and ${others} other${others > 1 ? 's' : ''}`
        : meta.lastActorName;
    }
    if (group.totalEventCount > 1) {
      return `${group.totalEventCount} events`;
    }
    return null;
  }, [meta, group.totalEventCount]);

  return (
    <div className="border-b" data-testid={`notification-group-${group.dedupeKey}`}>
      <div
        className={cn(
          "px-3 py-2.5 hover:bg-muted/50 cursor-pointer relative notif-row-hover group",
          group.isUnread && "bg-primary/5"
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex gap-2.5">
          <div className={cn(
            "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5",
            group.isUnread ? "bg-primary/10" : "bg-muted"
          )}>
            <Icon className={cn(
              "h-4 w-4",
              group.isUnread ? severityColor : "text-muted-foreground"
            )} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-1">
              <p className={cn(
                "text-sm leading-tight",
                group.isUnread ? "font-medium" : "text-muted-foreground"
              )}>
                {latest.title}
              </p>
              <div className="flex items-center gap-0.5 shrink-0">
                {group.isUnread && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => { e.stopPropagation(); onGroupRead(group.dedupeKey); }}
                    disabled={isGroupReadPending}
                    data-testid={`group-read-${group.dedupeKey}`}
                  >
                    <Check className="h-3 w-3" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => { e.stopPropagation(); onGroupDismiss(group.dedupeKey); }}
                  disabled={isGroupDismissPending}
                  data-testid={`group-dismiss-${group.dedupeKey}`}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
            {meta?.lastMessagePreview && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                {meta.lastMessagePreview}
              </p>
            )}
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary" className="h-4 text-[10px] px-1.5 gap-0.5">
                <Layers className="h-2.5 w-2.5" />
                {group.totalEventCount}
              </Badge>
              {summaryText && (
                <span className="text-[11px] text-muted-foreground">{summaryText}</span>
              )}
              <p className="text-[11px] text-muted-foreground">
                {formatDistanceToNow(new Date(latest.lastEventAt || latest.createdAt), { addSuffix: true })}
              </p>
              <ChevronRight className={cn(
                "h-3 w-3 text-muted-foreground/50 transition-transform",
                expanded && "rotate-90"
              )} />
            </div>
          </div>
        </div>
        {group.isUnread && (
          <div className="absolute left-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary" />
        )}
      </div>

      {expanded && (
        <div className="border-t bg-muted/20">
          {group.notifications.map((notification) => {
            const NIcon = getNotificationIcon(notification.type);
            const nSeverity = getSeverityColor(notification.severity);
            return (
              <div
                key={notification.id}
                className={cn(
                  "pl-8 pr-3 py-2 hover:bg-muted/50 cursor-pointer relative notif-row-hover",
                  !notification.readAt && "bg-primary/5"
                )}
                onClick={() => onClick(notification)}
                data-testid={`notification-item-${notification.id}`}
              >
                <div className="flex gap-2">
                  <NIcon className={cn(
                    "h-3.5 w-3.5 mt-0.5 shrink-0",
                    notification.readAt ? "text-muted-foreground" : nSeverity
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-xs leading-tight",
                      notification.readAt ? "text-muted-foreground" : "font-medium"
                    )}>
                      {notification.title}
                    </p>
                    {notification.message && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                        {notification.message}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
                {!notification.readAt && (
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-primary" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"notifications" | "settings">("notifications");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const taskDrawer = useTaskDrawerOptional();
  const openTask = taskDrawer?.openTask;
  const [, setLocation] = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [bellBounce, setBellBounce] = useState(false);
  const [badgePop, setBadgePop] = useState(false);
  const prevUnreadRef = useRef<number | null>(null);
  const lastBounceTimeRef = useRef(0);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const initialLoadDoneRef = useRef(false);
  const [newlyArrivedIds, setNewlyArrivedIds] = useState<Set<string>>(new Set());
  const [fadedHighlightIds, setFadedHighlightIds] = useState<Set<string>>(new Set());

  const currentFilter = FILTER_TAB_CONFIG.find(f => f.value === filterTab);
  const queryParams = new URLSearchParams();
  if (filterTab === "unread") queryParams.set("unreadOnly", "true");
  if (currentFilter?.typeFilter) queryParams.set("typeFilter", currentFilter.typeFilter);
  queryParams.set("limit", "30");

  const {
    data: notificationPages,
    isLoading: notificationsLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<PaginatedResponse>({
    queryKey: ["/api/notifications", filterTab],
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

  const notifications = notificationPages?.pages.flatMap(p => p.items) ?? [];
  const flags = useFeatureFlags();
  const groupingEnabled = flags.notificationsGroupingV1 ?? false;
  const groupedItems = useMemo(() => {
    if (!groupingEnabled) return null;
    return groupNotifications(notifications);
  }, [notifications, groupingEnabled]);

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    refetchInterval: 30000,
  });
  const unreadCount = unreadData?.count ?? 0;

  useEffect(() => {
    if (prefersReducedMotion()) return;
    if (prevUnreadRef.current === null) {
      prevUnreadRef.current = unreadCount;
      return;
    }
    if (unreadCount > prevUnreadRef.current) {
      const now = Date.now();
      if (now - lastBounceTimeRef.current > 1500) {
        lastBounceTimeRef.current = now;
        setBellBounce(true);
        setTimeout(() => setBellBounce(false), 250);
      }
      setBadgePop(true);
      setTimeout(() => setBadgePop(false), 200);
    }
    prevUnreadRef.current = unreadCount;
  }, [unreadCount]);

  const defaultPreferences: NotificationPreferences = {
    id: "",
    userId: "",
    taskDeadline: true,
    taskAssigned: true,
    taskCompleted: true,
    commentAdded: true,
    commentMention: true,
    projectUpdate: true,
    projectMemberAdded: true,
    taskStatusChanged: false,
    chatMessage: true,
    clientMessage: true,
    supportTicket: true,
    workOrder: true,
    emailEnabled: false,
  };

  const { data: preferences = defaultPreferences, isLoading: preferencesLoading } = useQuery<NotificationPreferences>({
    queryKey: ["/api/notifications/preferences"],
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      await apiRequest("PATCH", `/api/notifications/${notificationId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/notifications/mark-all-read");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      toast({ title: "All notifications marked as read" });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      await apiRequest("PATCH", `/api/notifications/${notificationId}/dismiss`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const dismissAllMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/notifications/dismiss-all");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      toast({ title: "All notifications dismissed" });
    },
  });

  const groupReadMutation = useMutation({
    mutationFn: async (dedupeKey: string) => {
      await apiRequest("POST", "/api/notifications/group/read", { dedupeKey });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const groupDismissMutation = useMutation({
    mutationFn: async (dedupeKey: string) => {
      await apiRequest("POST", "/api/notifications/group/dismiss", { dedupeKey });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const updatePreferenceMutation = useMutation({
    mutationFn: async ({ type, enabled, emailEnabled }: { type: string; enabled?: boolean; emailEnabled?: boolean }) => {
      await apiRequest("PATCH", "/api/notifications/preferences", { type, enabled, emailEnabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/preferences"] });
    },
  });

  useEffect(() => {
    if (notifications.length > 0 && !initialLoadDoneRef.current) {
      initialLoadDoneRef.current = true;
      notifications.forEach(n => seenIdsRef.current.add(n.id));
    }
  }, [notifications]);

  useEffect(() => {
    const socket = getSocket();

    const handleNewNotification: ServerToClientEvents["notification:new"] = (payload) => {
      const newId = payload.notification?.id;
      if (newId && initialLoadDoneRef.current && !seenIdsRef.current.has(newId)) {
        seenIdsRef.current.add(newId);
        setNewlyArrivedIds(prev => new Set(prev).add(newId));
        setTimeout(() => {
          setFadedHighlightIds(prev => new Set(prev).add(newId));
        }, 900);
        setTimeout(() => {
          setNewlyArrivedIds(prev => {
            const next = new Set(prev);
            next.delete(newId);
            return next;
          });
          setFadedHighlightIds(prev => {
            const next = new Set(prev);
            next.delete(newId);
            return next;
          });
        }, 3000);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      chatSounds.play("notification");
      toast({
        title: payload.notification.title,
        description: payload.notification.message || undefined,
      });
    };

    const handleNotificationRead: ServerToClientEvents["notification:read"] = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    };

    const handleNotificationAllRead: ServerToClientEvents["notification:allRead"] = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    };

    const handleNotificationDeleted: ServerToClientEvents["notification:deleted"] = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    };

    socket.on("notification:new", handleNewNotification);
    socket.on("notification:read", handleNotificationRead);
    socket.on("notification:allRead", handleNotificationAllRead);
    socket.on("notification:deleted", handleNotificationDeleted);

    return () => {
      socket.off("notification:new", handleNewNotification);
      socket.off("notification:read", handleNotificationRead);
      socket.off("notification:allRead", handleNotificationAllRead);
      socket.off("notification:deleted", handleNotificationDeleted);
    };
  }, [queryClient, toast]);

  const handleNotificationClick = useCallback((notification: Notification) => {
    if (!notification.readAt) {
      markAsReadMutation.mutate(notification.id);
    }

    if (notification.href) {
      setIsOpen(false);
      if (isTaskNotification(notification.type)) {
        const taskId = getTaskIdFromPayload(notification.payloadJson);
        if (taskId && openTask) {
          openTask(taskId);
          return;
        }
      }
      setLocation(notification.href);
      return;
    }

    if (isTaskNotification(notification.type)) {
      const taskId = getTaskIdFromPayload(notification.payloadJson);
      if (taskId && openTask) {
        setIsOpen(false);
        openTask(taskId);
      }
    }
  }, [markAsReadMutation, openTask, setIsOpen, setLocation]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const bottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (bottom < 100 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const typeToField: Record<NotificationType, keyof NotificationPreferences> = {
    task_deadline: "taskDeadline",
    task_assigned: "taskAssigned",
    task_completed: "taskCompleted",
    comment_added: "commentAdded",
    comment_mention: "commentMention",
    project_update: "projectUpdate",
    project_member_added: "projectMemberAdded",
    task_status_changed: "taskStatusChanged",
    chat_message: "chatMessage",
    client_message: "clientMessage",
    support_ticket: "supportTicket",
    work_order: "workOrder",
  };

  const getPreference = (type: NotificationType) => {
    const field = typeToField[type];
    return {
      enabled: preferences[field] as boolean ?? true,
      emailEnabled: preferences.emailEnabled ?? false,
    };
  };

  const handleToggleEnabled = (type: NotificationType, currentEnabled: boolean) => {
    updatePreferenceMutation.mutate({ type, enabled: !currentEnabled });
  };

  const handleToggleEmailEnabled = (type: NotificationType, currentEmailEnabled: boolean) => {
    updatePreferenceMutation.mutate({ type, emailEnabled: !currentEmailEnabled });
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          data-testid="button-notification-center"
        >
          <span className={cn("inline-flex", bellBounce && "animate-bell-bounce")}>
            <Bell className="h-5 w-5" />
          </span>
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className={cn(
                "absolute top-2 right-2 h-4 min-w-4 flex items-center justify-center p-0 text-[10px] ring-1 ring-background",
                badgePop && "animate-badge-pop"
              )}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[calc(100vw-2rem)] sm:w-[420px] max-w-[420px] p-0 notif-panel-motion origin-top-right" align="end">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "notifications" | "settings")}>
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="font-semibold text-sm">Notifications</h3>
            <div className="flex items-center gap-2">
              <TabsList className="h-8">
                <TabsTrigger value="notifications" className="h-7 px-2 text-xs" data-testid="tab-notifications">
                  <Bell className="h-3.5 w-3.5" />
                </TabsTrigger>
                <TabsTrigger value="settings" className="h-7 px-2 text-xs" data-testid="tab-notification-settings">
                  <Settings className="h-3.5 w-3.5" />
                </TabsTrigger>
              </TabsList>
            </div>
          </div>

          <TabsContent value="notifications" className="m-0">
            <div className="flex items-center gap-1 px-3 py-2 border-b overflow-x-auto no-scrollbar">
              {FILTER_TAB_CONFIG.map((tab) => (
                <Button
                  key={tab.value}
                  variant={filterTab === tab.value ? "default" : "ghost"}
                  size="sm"
                  className={cn(
                    "h-7 px-2.5 text-xs shrink-0 rounded-full",
                    filterTab === tab.value && "shadow-sm"
                  )}
                  onClick={() => setFilterTab(tab.value)}
                  data-testid={`filter-tab-${tab.value}`}
                >
                  {tab.label}
                </Button>
              ))}
            </div>

            {(unreadCount > 0 || notifications.length > 0) && (
              <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/30">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={() => markAllReadMutation.mutate()}
                  disabled={markAllReadMutation.isPending}
                  data-testid="button-mark-all-read"
                >
                  <CheckCheck className="h-3 w-3 mr-1" />
                  Mark all read
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs px-2 text-muted-foreground"
                  onClick={() => dismissAllMutation.mutate()}
                  disabled={dismissAllMutation.isPending}
                  data-testid="button-dismiss-all"
                >
                  <X className="h-3 w-3 mr-1" />
                  Clear all
                </Button>
              </div>
            )}

            <div
              className="h-[360px] overflow-y-auto"
              ref={scrollRef}
              onScroll={handleScroll}
            >
              {notificationsLoading ? (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                  Loading notifications...
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Bell className="h-10 w-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">
                    {filterTab === "unread" ? "No unread notifications" : "No notifications yet"}
                  </p>
                </div>
              ) : groupingEnabled && groupedItems ? (
                <>
                  {groupedItems.map((item) => {
                    if (isGroup(item)) {
                      return (
                        <NotificationGroupRow
                          key={item.key}
                          group={item}
                          onGroupRead={(k) => groupReadMutation.mutate(k)}
                          onGroupDismiss={(k) => groupDismissMutation.mutate(k)}
                          onClick={handleNotificationClick}
                          isGroupReadPending={groupReadMutation.isPending}
                          isGroupDismissPending={groupDismissMutation.isPending}
                        />
                      );
                    }
                    const notification = item;
                    const Icon = getNotificationIcon(notification.type);
                    const severityColor = getSeverityColor(notification.severity);
                    const isNewlyArrived = newlyArrivedIds.has(notification.id);
                    const isHighlightFaded = fadedHighlightIds.has(notification.id);
                    return (
                      <div
                        key={notification.id}
                        className={cn(
                          "px-3 py-2.5 hover:bg-muted/50 cursor-pointer relative border-b notif-row-hover group",
                          !notification.readAt && "bg-primary/5",
                          isNewlyArrived && "animate-notif-item-enter notif-highlight-overlay",
                          isHighlightFaded && "highlight-faded"
                        )}
                        onClick={() => handleNotificationClick(notification)}
                        data-testid={`notification-item-${notification.id}`}
                      >
                        <div className="flex gap-2.5">
                          <div className={cn(
                            "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5",
                            notification.readAt ? "bg-muted" : "bg-primary/10"
                          )}>
                            <Icon className={cn(
                              "h-4 w-4",
                              notification.readAt ? "text-muted-foreground" : severityColor
                            )} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-1">
                              <p className={cn(
                                "text-sm leading-tight",
                                notification.readAt ? "text-muted-foreground" : "font-medium"
                              )}>
                                {notification.title}
                              </p>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  dismissMutation.mutate(notification.id);
                                }}
                                data-testid={`dismiss-notification-${notification.id}`}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                            {notification.message && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                {notification.message}
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-1">
                              <p className="text-[11px] text-muted-foreground">
                                {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                              </p>
                              {notification.eventCount > 1 && (
                                <Badge variant="secondary" className="h-4 text-[10px] px-1.5 gap-0.5">
                                  <Layers className="h-2.5 w-2.5" />
                                  {notification.eventCount}
                                </Badge>
                              )}
                              {notification.href && (
                                <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
                              )}
                              {notification.severity === "urgent" && (
                                <AlertTriangle className="h-3 w-3 text-destructive" />
                              )}
                            </div>
                          </div>
                        </div>
                        {!notification.readAt && (
                          <div className="absolute left-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary" />
                        )}
                      </div>
                    );
                  })}
                  {isFetchingNextPage && (
                    <div className="p-3 text-center">
                      <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
                    </div>
                  )}
                  {!hasNextPage && notifications.length > 0 && (
                    <div className="p-3 text-center text-xs text-muted-foreground">
                      No more notifications
                    </div>
                  )}
                </>
              ) : (
                <>
                  {notifications.map((notification) => {
                    const Icon = getNotificationIcon(notification.type);
                    const severityColor = getSeverityColor(notification.severity);
                    const isNewlyArrived = newlyArrivedIds.has(notification.id);
                    const isHighlightFaded = fadedHighlightIds.has(notification.id);

                    return (
                      <div
                        key={notification.id}
                        className={cn(
                          "px-3 py-2.5 hover:bg-muted/50 cursor-pointer relative border-b notif-row-hover group",
                          !notification.readAt && "bg-primary/5",
                          isNewlyArrived && "animate-notif-item-enter notif-highlight-overlay",
                          isHighlightFaded && "highlight-faded"
                        )}
                        onClick={() => handleNotificationClick(notification)}
                        data-testid={`notification-item-${notification.id}`}
                      >
                        <div className="flex gap-2.5">
                          <div className={cn(
                            "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5",
                            notification.readAt ? "bg-muted" : "bg-primary/10"
                          )}>
                            <Icon className={cn(
                              "h-4 w-4",
                              notification.readAt ? "text-muted-foreground" : severityColor
                            )} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-1">
                              <p className={cn(
                                "text-sm leading-tight",
                                notification.readAt ? "text-muted-foreground" : "font-medium"
                              )}>
                                {notification.title}
                              </p>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  dismissMutation.mutate(notification.id);
                                }}
                                data-testid={`dismiss-notification-${notification.id}`}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                            {notification.message && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                {notification.message}
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-1">
                              <p className="text-[11px] text-muted-foreground">
                                {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                              </p>
                              {notification.href && (
                                <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
                              )}
                              {notification.severity === "urgent" && (
                                <AlertTriangle className="h-3 w-3 text-destructive" />
                              )}
                            </div>
                          </div>
                        </div>
                        {!notification.readAt && (
                          <div className="absolute left-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary" />
                        )}
                      </div>
                    );
                  })}
                  {isFetchingNextPage && (
                    <div className="p-3 text-center">
                      <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
                    </div>
                  )}
                  {!hasNextPage && notifications.length > 0 && (
                    <div className="p-3 text-center text-xs text-muted-foreground">
                      No more notifications
                    </div>
                  )}
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="settings" className="m-0">
            <ScrollArea className="h-80">
              {preferencesLoading ? (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  Loading preferences...
                </div>
              ) : (
                <div className="p-4 space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Choose which notifications you want to receive.
                  </p>
                  <Separator />
                  <div className="space-y-4">
                    {(Object.keys(NOTIFICATION_TYPE_LABELS) as NotificationType[]).map((type) => {
                      const pref = getPreference(type);
                      const Icon = NOTIFICATION_TYPE_ICONS[type];
                      return (
                        <div key={type} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">{NOTIFICATION_TYPE_LABELS[type]}</span>
                          </div>
                          <div className="flex items-center justify-between pl-6">
                            <Label htmlFor={`pref-${type}-enabled`} className="text-xs text-muted-foreground">
                              In-app notifications
                            </Label>
                            <Switch
                              id={`pref-${type}-enabled`}
                              checked={pref.enabled}
                              onCheckedChange={() => handleToggleEnabled(type, pref.enabled)}
                              data-testid={`switch-notification-${type}`}
                            />
                          </div>
                          <div className="flex items-center justify-between pl-6">
                            <Label htmlFor={`pref-${type}-email`} className="text-xs text-muted-foreground">
                              Email notifications
                            </Label>
                            <Switch
                              id={`pref-${type}-email`}
                              checked={pref.emailEnabled}
                              onCheckedChange={() => handleToggleEmailEnabled(type, pref.emailEnabled)}
                              data-testid={`switch-email-${type}`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
