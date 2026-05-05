import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getStorageUrl } from "@/lib/storageUrl";
import { AvatarPresenceIndicator } from "@/components/ui/presence-indicator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocalStorage } from "@/hooks/use-local-storage";
import {
  Search,
  Plus,
  MessageSquare,
  Hash,
  Lock,
  Users,
  CheckCheck,
  Inbox,
  MessagesSquare,
  Star,
  AtSign,
  ChevronDown,
  ChevronRight,
  Clock3,
  ArrowDownAZ,
  Compass,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { SelectedConversation, ConversationType } from "./ChatLayout";

export interface ChatChannel {
  id: string;
  tenantId: string;
  name: string;
  isPrivate: boolean;
  createdBy: string;
  createdAt: Date;
  unreadCount?: number;
  lastMessage?: {
    body: string;
    createdAt: Date;
    authorName?: string;
  };
  memberCount?: number;
}

export interface ChatDmThread {
  id: string;
  tenantId: string;
  createdAt: Date;
  unreadCount?: number;
  lastMessage?: {
    body: string;
    createdAt: Date;
    authorName?: string;
  };
  members: Array<{
    id: string;
    userId: string;
    user: {
      id: string;
      name: string;
      email: string;
      avatarUrl: string | null;
    };
  }>;
}

interface ConversationListPanelProps {
  channels: ChatChannel[];
  dmThreads: ChatDmThread[];
  currentUserId?: string;
  selectedConversation: SelectedConversation | null;
  onSelectConversation: (type: ConversationType, id: string) => void;
  onNewDm: () => void;
  onNewChannel: () => void;
  onMarkAllRead?: () => void;
  onBrowseChannels?: () => void;
  onOpenMentions?: () => void;
  onOpenThreads?: () => void;
  mentionUnreadCount?: number;
  threadInboxCount?: number;
  isLoading?: boolean;
  showCreateActions?: boolean;
  showNewChannelButton?: boolean;
  className?: string;
}

type ConversationSortMode = "recent" | "unread" | "alpha";

type RecentConversation =
  | { type: "channel"; id: string; item: ChatChannel; unreadCount: number; activityAt: number }
  | { type: "dm"; id: string; item: ChatDmThread; unreadCount: number; activityAt: number };

export function ConversationListPanel({
  channels,
  dmThreads,
  currentUserId,
  selectedConversation,
  onSelectConversation,
  onNewDm,
  onNewChannel,
  onMarkAllRead,
  onBrowseChannels,
  onOpenMentions,
  onOpenThreads,
  mentionUnreadCount = 0,
  threadInboxCount = 0,
  isLoading = false,
  showCreateActions = true,
  showNewChannelButton = true,
  className,
}: ConversationListPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [channelsExpanded, setChannelsExpanded] = useState(true);
  const [dmsExpanded, setDmsExpanded] = useState(true);
  const [starredExpanded, setStarredExpanded] = useState(true);
  const [recentExpanded, setRecentExpanded] = useState(true);

  const tenantId = channels[0]?.tenantId || dmThreads[0]?.tenantId || "workspace";
  const starredStorageKey = `chat:starred:${tenantId}:${currentUserId || "anonymous"}`;
  const [starredConversationKeys, setStarredConversationKeys] = useLocalStorage<string[]>(
    starredStorageKey,
    []
  );
  const sortStorageKey = `chat:sort:${tenantId}:${currentUserId || "anonymous"}`;
  const [sortMode, setSortMode] = useLocalStorage<ConversationSortMode>(sortStorageKey, "recent");
  const starredSet = useMemo(
    () => new Set(starredConversationKeys),
    [starredConversationKeys]
  );

  const totalUnreadChannels = useMemo(
    () => channels.reduce((sum, c) => sum + (c.unreadCount || 0), 0),
    [channels]
  );

  const totalUnreadDms = useMemo(
    () => dmThreads.reduce((sum, dm) => sum + (dm.unreadCount || 0), 0),
    [dmThreads]
  );
  const totalUnread = totalUnreadChannels + totalUnreadDms;
  const hasUnreadFilter = showUnreadOnly;

  const filteredChannels = useMemo(() => {
    const baseChannels = hasUnreadFilter
      ? channels.filter((c) => (c.unreadCount || 0) > 0)
      : channels;
    const query = searchQuery.trim().toLowerCase();
    const matchedChannels = query
      ? baseChannels.filter((channel) => matchesChannelSearch(channel, query))
      : baseChannels;

    return sortChannels(matchedChannels, sortMode);
  }, [channels, searchQuery, hasUnreadFilter, sortMode]);

  const filteredDmThreads = useMemo(() => {
    const baseDmThreads = hasUnreadFilter
      ? dmThreads.filter((dm) => (dm.unreadCount || 0) > 0)
      : dmThreads;
    const query = searchQuery.trim().toLowerCase();
    const matchedDmThreads = query
      ? baseDmThreads.filter((dm) => matchesDmSearch(dm, currentUserId, query))
      : baseDmThreads;

    return sortDmThreads(matchedDmThreads, currentUserId, sortMode);
  }, [dmThreads, searchQuery, currentUserId, hasUnreadFilter, sortMode]);

  const starredChannels = useMemo(
    () => channels.filter((channel) => starredSet.has(getConversationKey("channel", channel.id))),
    [channels, starredSet]
  );

  const starredDmThreads = useMemo(
    () => dmThreads.filter((dm) => starredSet.has(getConversationKey("dm", dm.id))),
    [dmThreads, starredSet]
  );

  const starredUnreadCount = useMemo(
    () =>
      [...starredChannels, ...starredDmThreads].reduce(
        (sum, item) => sum + (item.unreadCount || 0),
        0
      ),
    [starredChannels, starredDmThreads]
  );

  const recentConversations = useMemo<RecentConversation[]>(() => {
    if (searchQuery.trim() || showUnreadOnly) return [];

    return [
      ...channels.map((channel) => ({
        type: "channel" as const,
        id: channel.id,
        item: channel,
        unreadCount: channel.unreadCount || 0,
        activityAt: getActivityTime(channel),
      })),
      ...dmThreads.map((dm) => ({
        type: "dm" as const,
        id: dm.id,
        item: dm,
        unreadCount: dm.unreadCount || 0,
        activityAt: getActivityTime(dm),
      })),
    ]
      .filter((conversation) => conversation.activityAt > 0)
      .sort((a, b) => b.activityAt - a.activityAt)
      .slice(0, 5);
  }, [channels, dmThreads, searchQuery, showUnreadOnly]);

  const recentUnreadCount = useMemo(
    () => recentConversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0),
    [recentConversations]
  );

  const toggleStarredConversation = (type: ConversationType, id: string) => {
    const key = getConversationKey(type, id);
    setStarredConversationKeys((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    );
  };

  if (isLoading) {
    return (
      <div className={cn("flex flex-col h-full bg-sidebar", className)}>
        <div className="p-3 border-b space-y-3">
          <Skeleton className="h-9 w-full" />
          <div className="flex gap-2">
            <Skeleton className="h-8 flex-1" />
            <Skeleton className="h-8 flex-1" />
          </div>
        </div>
        <div className="p-3 space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("flex flex-col h-full bg-sidebar", className)}
      data-testid="conversation-list-panel"
    >
      <div className="p-3 border-b space-y-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-conversation-search"
          />
        </div>
        {showCreateActions && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={onNewDm}
              data-testid="button-new-dm"
            >
              <MessageSquare className="h-4 w-4 mr-1.5" />
              New DM
            </Button>
            {showNewChannelButton && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={onNewChannel}
                data-testid="button-new-channel"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Channel
              </Button>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
          <Button
            variant={!showUnreadOnly ? "secondary" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setShowUnreadOnly(false)}
            data-testid="button-chat-filter-all"
          >
            All
          </Button>
          <Button
            variant={showUnreadOnly ? "secondary" : "ghost"}
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => setShowUnreadOnly(true)}
            data-testid="button-chat-filter-unread"
          >
            <Inbox className="h-3.5 w-3.5" />
            Unread
            {totalUnread > 0 && (
              <Badge variant="destructive" className="h-4 min-w-4 rounded-full px-1 text-[10px] leading-none">
                {formatUnreadCount(totalUnread)}
              </Badge>
            )}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Select value={sortMode} onValueChange={(value) => setSortMode(value as ConversationSortMode)}>
            <SelectTrigger className="h-8 flex-1 text-xs" data-testid="select-chat-sort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">
                <span className="flex items-center gap-2">
                  <Clock3 className="h-3.5 w-3.5" />
                  Recent activity
                </span>
              </SelectItem>
              <SelectItem value="unread">
                <span className="flex items-center gap-2">
                  <Inbox className="h-3.5 w-3.5" />
                  Unread first
                </span>
              </SelectItem>
              <SelectItem value="alpha">
                <span className="flex items-center gap-2">
                  <ArrowDownAZ className="h-3.5 w-3.5" />
                  A to Z
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        {totalUnread > 0 && onMarkAllRead && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-full justify-center gap-1.5 text-xs text-muted-foreground"
            onClick={onMarkAllRead}
            data-testid="button-mark-all-chat-read"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark {formatUnreadCount(totalUnread)} read
          </Button>
        )}
        {onBrowseChannels && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-full justify-start gap-1.5 text-xs text-muted-foreground"
            onClick={onBrowseChannels}
            data-testid="button-chat-browse-channels"
          >
            <Compass className="h-3.5 w-3.5" />
            Browse channels
          </Button>
        )}
        {onOpenMentions && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-full justify-start gap-1.5 text-xs text-muted-foreground"
            onClick={onOpenMentions}
            data-testid="button-chat-sidebar-mentions"
          >
            <AtSign className="h-3.5 w-3.5" />
            Mentions
            {mentionUnreadCount > 0 && (
              <Badge variant="destructive" className="ml-auto h-4 min-w-4 rounded-full px-1 text-[10px] leading-none">
                {formatUnreadCount(mentionUnreadCount)}
              </Badge>
            )}
          </Button>
        )}
        {onOpenThreads && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-full justify-start gap-1.5 text-xs text-muted-foreground"
            onClick={onOpenThreads}
            data-testid="button-chat-sidebar-threads"
          >
            <MessagesSquare className="h-3.5 w-3.5" />
            Threads
            {threadInboxCount > 0 && (
              <Badge variant="secondary" className="ml-auto h-4 min-w-4 rounded-full px-1 text-[10px] leading-none">
                {formatUnreadCount(threadInboxCount)}
              </Badge>
            )}
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="py-2">
          {(starredChannels.length > 0 || starredDmThreads.length > 0) && !showUnreadOnly && (
            <>
              <SectionHeader
                title="Starred"
                count={starredChannels.length + starredDmThreads.length}
                unreadCount={starredUnreadCount}
                expanded={starredExpanded}
                onToggle={() => setStarredExpanded(!starredExpanded)}
              />
              {starredExpanded && (
                <div className="px-2 space-y-0.5">
                  {starredChannels.map((channel) => (
                    <ChannelRow
                      key={`starred-channel-${channel.id}`}
                      channel={channel}
                      isSelected={
                        selectedConversation?.type === "channel" &&
                        selectedConversation?.id === channel.id
                      }
                      isStarred
                      onToggleStar={() => toggleStarredConversation("channel", channel.id)}
                      onClick={() => onSelectConversation("channel", channel.id)}
                    />
                  ))}
                  {starredDmThreads.map((dm) => (
                    <DmRow
                      key={`starred-dm-${dm.id}`}
                      dm={dm}
                      currentUserId={currentUserId}
                      isSelected={
                        selectedConversation?.type === "dm" &&
                        selectedConversation?.id === dm.id
                      }
                      isStarred
                      onToggleStar={() => toggleStarredConversation("dm", dm.id)}
                      onClick={() => onSelectConversation("dm", dm.id)}
                    />
                  ))}
                </div>
              )}
              <div className="my-2" />
            </>
          )}

          {recentConversations.length > 0 && (
            <>
              <SectionHeader
                title="Recent"
                count={recentConversations.length}
                unreadCount={recentUnreadCount}
                expanded={recentExpanded}
                onToggle={() => setRecentExpanded(!recentExpanded)}
              />
              {recentExpanded && (
                <div className="px-2 space-y-0.5">
                  {recentConversations.map((conversation) =>
                    conversation.type === "channel" ? (
                      <ChannelRow
                        key={`recent-channel-${conversation.id}`}
                        channel={conversation.item}
                        isSelected={
                          selectedConversation?.type === "channel" &&
                          selectedConversation?.id === conversation.id
                        }
                        isStarred={starredSet.has(getConversationKey("channel", conversation.id))}
                        onToggleStar={() => toggleStarredConversation("channel", conversation.id)}
                        onClick={() => onSelectConversation("channel", conversation.id)}
                      />
                    ) : (
                      <DmRow
                        key={`recent-dm-${conversation.id}`}
                        dm={conversation.item}
                        currentUserId={currentUserId}
                        isSelected={
                          selectedConversation?.type === "dm" &&
                          selectedConversation?.id === conversation.id
                        }
                        isStarred={starredSet.has(getConversationKey("dm", conversation.id))}
                        onToggleStar={() => toggleStarredConversation("dm", conversation.id)}
                        onClick={() => onSelectConversation("dm", conversation.id)}
                      />
                    )
                  )}
                </div>
              )}
              <div className="my-2" />
            </>
          )}

          <SectionHeader
            title="Channels"
            count={filteredChannels.length}
            unreadCount={totalUnreadChannels}
            expanded={channelsExpanded}
            onToggle={() => setChannelsExpanded(!channelsExpanded)}
          />
          {channelsExpanded && (
            <div className="px-2 space-y-0.5">
              {filteredChannels.length === 0 ? (
                <div className="px-2 py-3 text-sm text-muted-foreground text-center">
                  {searchQuery
                    ? "No channels match your search"
                    : showUnreadOnly
                    ? "No unread channels"
                    : "No channels yet"}
                </div>
              ) : (
                filteredChannels.map((channel) => (
                  <ChannelRow
                    key={channel.id}
                    channel={channel}
                    isSelected={
                      selectedConversation?.type === "channel" &&
                      selectedConversation?.id === channel.id
                    }
                    isStarred={starredSet.has(getConversationKey("channel", channel.id))}
                    onToggleStar={() => toggleStarredConversation("channel", channel.id)}
                    onClick={() => onSelectConversation("channel", channel.id)}
                  />
                ))
              )}
            </div>
          )}

          <div className="my-2" />

          <SectionHeader
            title="Direct Messages"
            count={filteredDmThreads.length}
            unreadCount={totalUnreadDms}
            expanded={dmsExpanded}
            onToggle={() => setDmsExpanded(!dmsExpanded)}
          />
          {dmsExpanded && (
            <div className="px-2 space-y-0.5">
              {filteredDmThreads.length === 0 ? (
                <div className="px-2 py-6 text-center">
                  {searchQuery ? (
                    <p className="text-sm text-muted-foreground">No DMs match your search</p>
                  ) : showUnreadOnly ? (
                    <p className="text-sm text-muted-foreground">No unread direct messages</p>
                  ) : showCreateActions ? (
                    <>
                      <div className="flex items-center justify-center h-10 w-10 rounded-full bg-primary/10 mx-auto mb-2">
                        <MessageSquare className="h-5 w-5 text-primary" />
                      </div>
                      <p className="text-sm font-medium mb-1">No conversations yet</p>
                      <p className="text-xs text-muted-foreground mb-3">Start a direct message with a teammate</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={onNewDm}
                        className="mx-auto"
                        data-testid="button-start-first-dm"
                      >
                        <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                        Start a DM
                      </Button>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">No conversations yet</p>
                  )}
                </div>
              ) : (
                filteredDmThreads.map((dm) => (
                  <DmRow
                    key={dm.id}
                    dm={dm}
                    currentUserId={currentUserId}
                    isSelected={
                      selectedConversation?.type === "dm" &&
                      selectedConversation?.id === dm.id
                    }
                    isStarred={starredSet.has(getConversationKey("dm", dm.id))}
                    onToggleStar={() => toggleStarredConversation("dm", dm.id)}
                    onClick={() => onSelectConversation("dm", dm.id)}
                  />
                ))
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

interface SectionHeaderProps {
  title: string;
  count: number;
  unreadCount: number;
  expanded: boolean;
  onToggle: () => void;
}

function SectionHeader({
  title,
  count,
  unreadCount,
  expanded,
  onToggle,
}: SectionHeaderProps) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-1.5 px-3 py-1.5 w-full text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hover-elevate rounded-md mx-1"
      style={{ width: "calc(100% - 8px)" }}
      data-testid={`section-header-${title.toLowerCase().replace(/\s+/g, "-")}`}
    >
      {expanded ? (
        <ChevronDown className="h-3 w-3" />
      ) : (
        <ChevronRight className="h-3 w-3" />
      )}
      <span>{title}</span>
      <span className="text-muted-foreground/70">({count})</span>
      {unreadCount > 0 && (
        <Badge variant="destructive" className="ml-auto text-[10px] px-1.5 py-0 h-4">
          {formatUnreadCount(unreadCount)}
        </Badge>
      )}
    </button>
  );
}

interface ChannelRowProps {
  channel: ChatChannel;
  isSelected: boolean;
  isStarred?: boolean;
  onClick: () => void;
  onToggleStar?: () => void;
}

function ChannelRow({ channel, isSelected, isStarred = false, onClick, onToggleStar }: ChannelRowProps) {
  const hasUnread = (channel.unreadCount || 0) > 0;
  const lastActivityTime = channel.lastMessage?.createdAt
    ? formatRelativeTime(new Date(channel.lastMessage.createdAt))
    : null;

  return (
    <div
      className={cn(
        "group/conversation flex items-center gap-2.5 w-full min-h-[44px] rounded-md transition-colors",
        isSelected
          ? "bg-accent text-accent-foreground"
          : "hover-elevate"
      )}
      data-testid={`channel-row-${channel.id}`}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-2.5 text-left"
      >
        <div className="flex-shrink-0">
          {channel.isPrivate ? (
            <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center">
              <Lock className="h-4 w-4 text-muted-foreground" />
            </div>
          ) : (
            <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center">
              <Hash className="h-4 w-4 text-primary" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                "text-sm truncate",
                hasUnread ? "font-semibold" : "font-medium"
              )}
            >
              {channel.name}
            </span>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {lastActivityTime && (
                <span className="text-[11px] text-muted-foreground">
                  {lastActivityTime}
                </span>
              )}
              {hasUnread && (
                <span className="flex-shrink-0 w-2 h-2 rounded-full bg-primary" data-testid={`channel-unread-dot-${channel.id}`} />
              )}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            {channel.lastMessage ? (
              <p className="text-xs text-muted-foreground truncate">
                {channel.lastMessage.authorName && (
                  <span className={cn(hasUnread ? "font-medium text-foreground/70" : "font-medium")}>{channel.lastMessage.authorName}: </span>
                )}
                {cleanMessagePreview(channel.lastMessage.body)}
              </p>
            ) : (
              <span className="text-xs text-muted-foreground/60">No messages yet</span>
            )}
            {hasUnread ? (
              <UnreadBadge count={channel.unreadCount || 0} testId={`channel-unread-count-${channel.id}`} />
            ) : channel.memberCount !== undefined && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 flex-shrink-0">
                <Users className="h-3 w-3" />
                {channel.memberCount}
              </span>
            )}
          </div>
        </div>
      </button>
      <StarButton
        isStarred={isStarred}
        onClick={onToggleStar}
        testId={`button-star-channel-${channel.id}`}
      />
    </div>
  );
}

interface DmRowProps {
  dm: ChatDmThread;
  currentUserId?: string;
  isSelected: boolean;
  isStarred?: boolean;
  onClick: () => void;
  onToggleStar?: () => void;
}

function DmRow({ dm, currentUserId, isSelected, isStarred = false, onClick, onToggleStar }: DmRowProps) {
  const displayName = getDmDisplayName(dm, currentUserId);
  const hasUnread = (dm.unreadCount || 0) > 0;
  const lastActivityTime = dm.lastMessage?.createdAt
    ? formatRelativeTime(new Date(dm.lastMessage.createdAt))
    : null;

  const otherMembers = dm.members.filter((m) => m.userId !== currentUserId);
  const isGroup = otherMembers.length > 1;
  const firstMember = otherMembers[0];

  return (
    <div
      className={cn(
        "group/conversation flex items-center gap-2.5 w-full min-h-[44px] rounded-md transition-colors",
        isSelected
          ? "bg-accent text-accent-foreground"
          : "hover-elevate"
      )}
      data-testid={`dm-row-${dm.id}`}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-2.5 text-left"
      >
        <div className="flex-shrink-0">
          {isGroup ? (
            <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
          ) : firstMember ? (
            <div className="relative">
              <Avatar className="h-9 w-9">
                <AvatarImage src={getStorageUrl(firstMember.user.avatarUrl)} />
                <AvatarFallback className="text-xs">
                  {getInitials(firstMember.user.name || firstMember.user.email)}
                </AvatarFallback>
              </Avatar>
              <AvatarPresenceIndicator userId={firstMember.userId} avatarSize={36} />
            </div>
          ) : (
            <Avatar className="h-9 w-9">
              <AvatarFallback className="text-xs">?</AvatarFallback>
            </Avatar>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                "text-sm truncate",
                hasUnread ? "font-semibold" : "font-medium"
              )}
            >
              {displayName}
            </span>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {lastActivityTime && (
                <span className="text-[11px] text-muted-foreground">
                  {lastActivityTime}
                </span>
              )}
              {hasUnread && <UnreadBadge count={dm.unreadCount || 0} testId={`dm-unread-count-${dm.id}`} />}
            </div>
          </div>
          {dm.lastMessage && (
            <p className={cn(
              "text-xs truncate mt-0.5",
              hasUnread ? "text-foreground/70" : "text-muted-foreground"
            )}>
              {cleanMessagePreview(dm.lastMessage.body)}
            </p>
          )}
        </div>
      </button>
      <StarButton
        isStarred={isStarred}
        onClick={onToggleStar}
        testId={`button-star-dm-${dm.id}`}
      />
    </div>
  );
}

function StarButton({
  isStarred,
  onClick,
  testId,
}: {
  isStarred: boolean;
  onClick?: () => void;
  testId: string;
}) {
  if (!onClick) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "mr-2 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground",
        isStarred ? "opacity-100 text-amber-500" : "opacity-0 group-hover/conversation:opacity-100 focus:opacity-100"
      )}
      aria-label={isStarred ? "Remove from starred" : "Add to starred"}
      data-testid={testId}
    >
      <Star className={cn("h-3.5 w-3.5", isStarred && "fill-current")} />
    </button>
  );
}

export function formatUnreadCount(count: number): string {
  if (count <= 0) return "";
  if (count > 99) return "99+";
  return String(count);
}

function UnreadBadge({ count, testId }: { count: number; testId: string }) {
  if (count <= 0) return null;
  return (
    <Badge
      variant="destructive"
      className="h-4 min-w-4 rounded-full px-1 text-[10px] leading-none"
      data-testid={testId}
    >
      {formatUnreadCount(count)}
    </Badge>
  );
}

function getDmDisplayName(dm: ChatDmThread, currentUserId?: string): string {
  const otherMembers = dm.members.filter((m) => m.userId !== currentUserId);
  if (otherMembers.length === 0) return "Just you";
  return otherMembers.map((m) => m.user.name || m.user.email).join(", ");
}

function getConversationKey(type: ConversationType, id: string): string {
  return `${type}:${id}`;
}

function getActivityTime(conversation: ChatChannel | ChatDmThread): number {
  const date = conversation.lastMessage?.createdAt || conversation.createdAt;
  const timestamp = new Date(date).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sortChannels(channels: ChatChannel[], sortMode: ConversationSortMode): ChatChannel[] {
  return [...channels].sort((a, b) => compareConversations(a, b, sortMode, (channel) => channel.name));
}

function sortDmThreads(dmThreads: ChatDmThread[], currentUserId: string | undefined, sortMode: ConversationSortMode): ChatDmThread[] {
  return [...dmThreads].sort((a, b) =>
    compareConversations(a, b, sortMode, (dm) => getDmDisplayName(dm, currentUserId))
  );
}

function compareConversations<T extends ChatChannel | ChatDmThread>(
  a: T,
  b: T,
  sortMode: ConversationSortMode,
  getName: (conversation: T) => string
): number {
  if (sortMode === "alpha") {
    return getName(a).localeCompare(getName(b), undefined, { sensitivity: "base" });
  }

  if (sortMode === "unread") {
    const unreadDelta = (b.unreadCount || 0) - (a.unreadCount || 0);
    if (unreadDelta !== 0) return unreadDelta;
  }

  const activityDelta = getActivityTime(b) - getActivityTime(a);
  if (activityDelta !== 0) return activityDelta;

  return getName(a).localeCompare(getName(b), undefined, { sensitivity: "base" });
}

function matchesChannelSearch(channel: ChatChannel, query: string): boolean {
  return [
    channel.name,
    channel.isPrivate ? "private locked" : "public channel",
    channel.lastMessage?.body || "",
    channel.lastMessage?.authorName || "",
  ].some((value) => value.toLowerCase().includes(query));
}

function matchesDmSearch(dm: ChatDmThread, currentUserId: string | undefined, query: string): boolean {
  const memberText = dm.members
    .filter((member) => member.userId !== currentUserId)
    .flatMap((member) => [member.user.name, member.user.email])
    .join(" ");

  return [
    getDmDisplayName(dm, currentUserId),
    memberText,
    dm.lastMessage?.body || "",
    dm.lastMessage?.authorName || "",
  ].some((value) => value.toLowerCase().includes(query));
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function cleanMessagePreview(body: string, maxLength = 50): string {
  const mentionRegex = /@\[([^\]]+)\]\([^)]+\)/g;
  const cleaned = body.replace(mentionRegex, "@$1").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.substring(0, maxLength) + "...";
}

function formatRelativeTime(date: Date): string {
  try {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "now";
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return formatDistanceToNow(date, { addSuffix: false });
  } catch {
    return "";
  }
}
