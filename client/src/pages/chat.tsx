// Mobile UX Phase 3B improvements applied here
import { useState, useRef, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, ApiError } from "@/lib/queryClient";
import { useChatUrlState, ConversationListPanel, ChatMessageTimeline, ChatContextPanelToggle, PinnedMessagesPanel, ChatAIAssist, ConvertToTaskAction, SlashCommandDropdown, getMatchingCommands, parseSlashCommand, isSlashCommandInput, findCommand, type SlashCommand, type ReadByUser } from "@/features/chat";

const LazyChatContextPanel = lazy(() =>
  import("@/features/chat/ChatContextPanel").then((mod) => ({
    default: mod.ChatContextPanel,
  }))
);
const LazyThreadPanel = lazy(() =>
  import("@/features/chat/ThreadPanel").then((mod) => ({
    default: mod.ThreadPanel,
  }))
);
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDebounce } from "@/hooks/use-debounce";
import { getSocket, joinChatRoom, leaveChatRoom, onConnectionChange, isSocketConnected } from "@/lib/realtime/socket";
import { useConversationTyping } from "@/hooks/use-typing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChatMessageInput } from "@/components/chat-message-input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Hash,
  Plus,
  Send,
  MessageCircle,
  Users,
  Lock,
  Paperclip,
  File,
  FileText,
  Image,
  X,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
  Check,
  CheckCheck,
  Search,
  AtSign,
  UserPlus,
  UserMinus,
  Settings,
  RefreshCw,
  AlertCircle,
  Wifi,
  WifiOff,
  ArrowLeft,
  Pin,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { PresenceIndicator, AvatarPresenceIndicator } from "@/components/ui/presence-indicator";
import { CHAT_EVENTS, CHAT_ROOM_EVENTS, ChatNewMessagePayload, ChatMessageUpdatedPayload, ChatMessageDeletedPayload, ChatMessageReactionPayload, ChatMemberJoinedPayload, ChatMemberLeftPayload, ChatMemberAddedPayload, ChatMemberRemovedPayload, ChatConversationReadPayload } from "@shared/events";

interface ChatChannel {
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

interface ChatAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
}

interface PendingAttachment extends ChatAttachment {
  uploading?: boolean;
  progress?: number;
  localPreviewUrl?: string;
}

interface ReadReceipt {
  userId: string;
  lastReadMessageId: string | null;
  lastReadAt: string | Date;
}

const MESSAGES_PAGE_SIZE = 50;

// Message status for optimistic updates
type MessageStatus = 'pending' | 'sent' | 'failed';

interface ChatMessage {
  id: string;
  tenantId: string;
  channelId: string | null;
  dmThreadId: string | null;
  authorUserId: string;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt?: Date | null;
  attachments?: ChatAttachment[];
  author?: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
  };
  // Optimistic update status (client-side only)
  _status?: MessageStatus;
  _tempId?: string; // Temporary ID for pending messages
}

interface ChatDmThread {
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

// Utility functions (moved outside component)
const getInitials = (name: string) => {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
};

const getFileIcon = (mimeType: string) => {
  if (mimeType.startsWith("image/")) return Image;
  if (mimeType === "application/pdf") return FileText;
  return File;
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatTime = (date: Date) => {
  return new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const formatRelativeTime = (date: Date) => {
  const now = new Date();
  const msgDate = new Date(date);
  const diffMs = now.getTime() - msgDate.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return msgDate.toLocaleDateString([], { month: "short", day: "numeric" });
};

const truncateMessage = (body: string, maxLength: number = 30) => {
  if (!body) return "";
  const cleaned = body.replace(/\n/g, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.substring(0, maxLength) + "...";
};

export default function ChatPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [selectedChannel, setSelectedChannel] = useState<ChatChannel | null>(null);
  const [selectedDm, setSelectedDm] = useState<ChatDmThread | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [quoteReply, setQuoteReply] = useState<{ authorName: string; body: string } | null>(null);
  const [createTaskModalOpen, setCreateTaskModalOpen] = useState(false);
  const [createTaskMessage, setCreateTaskMessage] = useState<{
    id: string;
    body: string;
    authorName: string;
    conversationType: "channel" | "dm";
    conversationId: string;
  } | null>(null);
  const [convertedTask, setConvertedTask] = useState<{
    id: string;
    title: string;
    description?: string;
    priority: string;
    status: string;
  } | null>(null);
  const [createChannelOpen, setCreateChannelOpen] = useState(false);
  const [startDmOpen, setStartDmOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelPrivate, setNewChannelPrivate] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [readReceipts, setReadReceipts] = useState<Map<string, ReadReceipt>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastMarkedReadRef = useRef<string | null>(null);
  
  // Typing indicator - compute conversationId based on selected channel/DM
  const currentConversationId = selectedChannel 
    ? `channel:${selectedChannel.id}` 
    : selectedDm 
      ? `dm:${selectedDm.id}` 
      : null;
  const { typingUsers, startTyping, stopTyping } = useConversationTyping(currentConversationId);
  
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionCursorPos, setMentionCursorPos] = useState(0);
  const [mentionIndex, setMentionIndex] = useState(0);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);

  // Team panel state
  const [sidebarTab, setSidebarTab] = useState<"chats" | "team">("chats");
  const [teamSearchQuery, setTeamSearchQuery] = useState("");
  const [selectedTeamUsers, setSelectedTeamUsers] = useState<Set<string>>(new Set());
  const [createGroupDialogOpen, setCreateGroupDialogOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  // Members drawer state
  const [membersDrawerOpen, setMembersDrawerOpen] = useState(false);
  // Pinned messages panel state
  const [pinnedPanelOpen, setPinnedPanelOpen] = useState(false);
  // Slash command state
  const [slashCommandOpen, setSlashCommandOpen] = useState(false);
  const [slashCommandIndex, setSlashCommandIndex] = useState(0);
  const [slashCommandMatches, setSlashCommandMatches] = useState<SlashCommand[]>([]);
  const [addMemberSearchQuery, setAddMemberSearchQuery] = useState("");
  const [removeMemberConfirmUserId, setRemoveMemberConfirmUserId] = useState<string | null>(null);

  // Thread panel state - close when conversation changes
  const [threadParentMessage, setThreadParentMessage] = useState<ChatMessage | null>(null);
  const threadPanelOpen = !!threadParentMessage;
  const prevConversationRef = useRef<string | null>(null);
  useEffect(() => {
    const currentId = selectedChannel?.id ?? selectedDm?.id ?? null;
    if (prevConversationRef.current !== null && prevConversationRef.current !== currentId) {
      setThreadParentMessage(null);
      setPinnedPanelOpen(false);
    }
    prevConversationRef.current = currentId;
  }, [selectedChannel?.id, selectedDm?.id]);

  // Context panel state - default open on desktop (>768px), closed on mobile
  const [contextPanelOpen, setContextPanelOpen] = useState(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth >= 768;
    }
    return true;
  });

  // Start New Chat drawer state
  const [startChatDrawerOpen, setStartChatDrawerOpen] = useState(false);
  const [startChatSearchQuery, setStartChatSearchQuery] = useState("");
  const [startChatSelectedUsers, setStartChatSelectedUsers] = useState<Set<string>>(new Set());
  const [startChatGroupName, setStartChatGroupName] = useState("");

  // Delete channel confirmation dialog state
  const [deleteChannelDialogOpen, setDeleteChannelDialogOpen] = useState(false);

  // URL-based conversation state management (shared hook for consistency)
  const { searchString, getConversationFromUrl, updateUrl: updateUrlForConversation } = useChatUrlState();

  // Mobile keyboard-safe viewport offset
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const composerRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!isMobile) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      const offset = window.innerHeight - vv.height;
      setKeyboardOffset(offset > 50 ? offset : 0);
    };
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    return () => {
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onResize);
    };
  }, [isMobile]);

  const handleMobileBack = useCallback(() => {
    setSelectedChannel(null);
    setSelectedDm(null);
    updateUrlForConversation(null, null);
  }, [updateUrlForConversation]);

  // Connection status tracking
  const [isConnected, setIsConnected] = useState(isSocketConnected());
  
  // Track seen message IDs to prevent duplicates
  const seenMessageIds = useRef<Set<string>>(new Set());
  
  // Track pending messages by tempId for reliable reconciliation
  const pendingMessagesRef = useRef<Map<string, { body: string; timestamp: number }>>(new Map());

  interface TeamUser {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    role: string;
    avatarUrl: string | null;
    displayName: string;
  }

  interface ChannelMember {
    id: string;
    userId: string;
    role: string;
    user: {
      id: string;
      name: string;
      email: string;
      avatarUrl: string | null;
    };
  }

  interface MentionableUser {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    displayName: string;
  }

  interface SearchResult {
    id: string;
    body: string;
    createdAt: Date;
    channelId: string | null;
    dmThreadId: string | null;
    channelName: string | null;
    author: { id: string; email: string; displayName: string };
  }

  const { data: channels = [], isLoading: isLoadingChannels, isError: isChannelsError, refetch: refetchChannels } = useQuery<ChatChannel[]>({
    queryKey: ["/api/v1/chat/channels"],
  });

  const { data: dmThreads = [], isLoading: isLoadingDmThreads, isError: isDmThreadsError, refetch: refetchDmThreads } = useQuery<ChatDmThread[]>({
    queryKey: ["/api/v1/chat/dm"],
  });

  const channelMessagesQuery = useQuery<ChatMessage[]>({
    queryKey: ["/api/v1/chat/channels", selectedChannel?.id, "messages", { limit: String(MESSAGES_PAGE_SIZE) }],
    enabled: !!selectedChannel,
  });

  const dmMessagesQuery = useQuery<ChatMessage[]>({
    queryKey: ["/api/v1/chat/dm", selectedDm?.id, "messages", { limit: String(MESSAGES_PAGE_SIZE) }],
    enabled: !!selectedDm,
  });

  const pinnedMessagesQuery = useQuery<any[]>({
    queryKey: ["/api/v1/chat/channels", selectedChannel?.id, "pins"],
    enabled: !!selectedChannel,
  });
  const pinnedMessages = pinnedMessagesQuery.data ?? [];
  const pinnedMessageIds = useMemo(
    () => new Set(pinnedMessages.map((p: any) => p.messageId)),
    [pinnedMessages]
  );
  const canPin = useMemo(() => {
    if (!selectedChannel || !user) return false;
    const isAdmin = user.role === "admin" || user.role === "super_admin";
    const isOwner = selectedChannel.createdBy === user.id;
    return isAdmin || isOwner;
  }, [selectedChannel, user]);

  const debouncedSearchQuery = useDebounce(searchQuery, 250);
  const searchResultsQuery = useQuery<{ messages: SearchResult[]; total: number }>({
    queryKey: ["/api/v1/chat/search", debouncedSearchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearchQuery) params.set("q", debouncedSearchQuery);
      const url = `/api/v1/chat/search${params.toString() ? `?${params}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to search messages");
      return res.json();
    },
    enabled: searchOpen && debouncedSearchQuery.length >= 2,
  });

  const mentionableUsersQuery = useQuery<MentionableUser[]>({
    queryKey: ["/api/v1/chat/users/mentionable", selectedChannel?.id, selectedDm?.id, mentionQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedChannel?.id) params.set("channelId", selectedChannel.id);
      if (selectedDm?.id) params.set("dmThreadId", selectedDm.id);
      if (mentionQuery) params.set("q", mentionQuery);
      const url = `/api/v1/chat/users/mentionable${params.toString() ? `?${params}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch mentionable users");
      return res.json();
    },
    enabled: mentionOpen && (!!selectedChannel || !!selectedDm),
  });

  // Team panel: fetch all tenant users
  const { data: teamUsers = [], isLoading: isLoadingTeamUsers } = useQuery<TeamUser[]>({
    queryKey: ["/api/v1/chat/users", "team", teamSearchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (teamSearchQuery) params.set("search", teamSearchQuery);
      const url = `/api/v1/chat/users${params.toString() ? `?${params}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch team users");
      return res.json();
    },
    enabled: sidebarTab === "team" || membersDrawerOpen,
  });

  // Separate query for Start Chat drawer to avoid cache conflicts
  const { data: startChatUsers = [], isLoading: isLoadingStartChatUsers } = useQuery<TeamUser[]>({
    queryKey: ["/api/v1/chat/users", "startChat", startChatSearchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startChatSearchQuery) params.set("search", startChatSearchQuery);
      const url = `/api/v1/chat/users${params.toString() ? `?${params}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
    enabled: startChatDrawerOpen,
  });

  // Thread summaries query (reply counts per parent message)
  const conversationType = selectedChannel ? "channel" : selectedDm ? "dm" : null;
  const conversationId = selectedChannel?.id ?? selectedDm?.id ?? null;
  const threadSummariesQuery = useQuery<Record<string, { replyCount: number; lastReplyAt: string | null; lastReplyAuthorId: string | null }>>({
    queryKey: [
      conversationType === "channel" ? "/api/v1/chat/channels" : "/api/v1/chat/dm",
      conversationId,
      "thread-summaries",
    ],
    enabled: !!conversationId,
  });

  const threadSummaries = useMemo(() => {
    if (!threadSummariesQuery.data) return undefined;
    const map = new Map<string, { replyCount: number; lastReplyAt: Date | string | null; lastReplyAuthorId: string | null }>();
    for (const [key, val] of Object.entries(threadSummariesQuery.data)) {
      map.set(key, val);
    }
    return map;
  }, [threadSummariesQuery.data]);

  // Build read-by-user map: messageId -> users who have read up to that message
  const readByMap = useMemo(() => {
    if (readReceipts.size === 0) return undefined;
    const map = new Map<string, ReadByUser[]>();
    readReceipts.forEach((receipt, recipientUserId) => {
      if (!receipt.lastReadMessageId || recipientUserId === user?.id) return;
      const teamUser = teamUsers.find(u => u.id === recipientUserId);
      if (!teamUser) return;
      const entry: ReadByUser = {
        userId: recipientUserId,
        name: teamUser.displayName || teamUser.email?.split("@")[0] || "Unknown",
        avatarUrl: teamUser.avatarUrl || null,
      };
      const existing = map.get(receipt.lastReadMessageId) || [];
      existing.push(entry);
      map.set(receipt.lastReadMessageId, existing);
    });
    return map.size > 0 ? map : undefined;
  }, [readReceipts, user?.id, teamUsers]);

  // Channel members query for the members drawer and context panel
  const { data: channelMembers = [], refetch: refetchChannelMembers } = useQuery<ChannelMember[]>({
    queryKey: ["/api/v1/chat/channels", selectedChannel?.id, "members"],
    enabled: !!selectedChannel && (membersDrawerOpen || contextPanelOpen),
  });

  // Mutation: Add members to channel
  const addMembersMutation = useMutation({
    mutationFn: async ({ channelId, userIds }: { channelId: string; userIds: string[] }) => {
      return apiRequest("POST", `/api/v1/chat/channels/${channelId}/members`, { userIds });
    },
    onSuccess: () => {
      refetchChannelMembers();
      setAddMemberSearchQuery("");
      toast({ title: "Members added successfully" });
    },
    onError: (error: any) => {
      const requestId = error instanceof ApiError ? error.requestId : null;
      toast({
        title: "Failed to add members",
        description: requestId ? `${error.message || "An error occurred"} (Request ID: ${requestId})` : (error.message || "An error occurred"),
        variant: "destructive",
      });
    },
  });

  // Mutation: Remove member from channel
  const removeMemberMutation = useMutation({
    mutationFn: async ({ channelId, userId }: { channelId: string; userId: string }) => {
      return apiRequest("DELETE", `/api/v1/chat/channels/${channelId}/members/${userId}`);
    },
    onSuccess: (_, { userId }) => {
      refetchChannelMembers();
      setRemoveMemberConfirmUserId(null);
      // If user removed themselves, close drawer and deselect channel
      if (userId === user?.id) {
        setMembersDrawerOpen(false);
        setSelectedChannel(null);
        queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/channels"] });
      }
      toast({ title: "Member removed" });
    },
    onError: (error: any) => {
      const requestId = error instanceof ApiError ? error.requestId : null;
      toast({
        title: "Failed to remove member",
        description: requestId ? `${error.message || "An error occurred"} (Request ID: ${requestId})` : (error.message || "An error occurred"),
        variant: "destructive",
      });
    },
  });

  // Mutation: Start DM with selected users
  const startDmMutation = useMutation({
    mutationFn: async (userIds: string[]) => {
      return apiRequest("POST", "/api/v1/chat/dm", { userIds });
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/dm"] });
      setSelectedTeamUsers(new Set());
      setSidebarTab("chats");
      // Select the newly created/returned DM
      if (result && result.id) {
        setSelectedDm(result);
        setSelectedChannel(null);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Failed to start conversation",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  // Mutation: Create group channel with selected users
  const createGroupWithMembersMutation = useMutation({
    mutationFn: async ({ name, userIds }: { name: string; userIds: string[] }) => {
      const channel: any = await apiRequest("POST", "/api/v1/chat/channels", { name, isPrivate: true });
      let addMembersFailed = false;
      if (userIds.length > 0 && channel?.id) {
        try {
          await apiRequest("POST", `/api/v1/chat/channels/${channel.id}/members`, { userIds });
        } catch (err) {
          addMembersFailed = true;
        }
      }
      return { channel, addMembersFailed };
    },
    onSuccess: (result: { channel: any; addMembersFailed: boolean }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/channels"] });
      setSelectedTeamUsers(new Set());
      setCreateGroupDialogOpen(false);
      setNewGroupName("");
      setSidebarTab("chats");
      if (result.channel?.id) {
        setSelectedChannel(result.channel);
        setSelectedDm(null);
      }
      if (result.addMembersFailed) {
        toast({
          title: "Group created with warning",
          description: "The group was created but some members could not be added. You can add them later.",
          variant: "default",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create group",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  // Handle start chat from team panel
  const handleStartChat = () => {
    if (selectedTeamUsers.size === 0) return;
    const userIds = Array.from(selectedTeamUsers);
    
    if (userIds.length === 1) {
      // Start DM
      startDmMutation.mutate(userIds);
    } else {
      // Multiple users - open group creation dialog
      setCreateGroupDialogOpen(true);
    }
  };

  // Toggle user selection in team panel
  const toggleUserSelection = useCallback((userId: string) => {
    setSelectedTeamUsers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  }, []);

  // Filter team users excluding self
  const filteredTeamUsers = useMemo(
    () => teamUsers.filter(u => u.id !== user?.id),
    [teamUsers, user?.id]
  );

  // Get users not in current channel for add member dropdown
  const channelMemberIds = useMemo(
    () => new Set(channelMembers.map(m => m.userId)),
    [channelMembers]
  );

  const usersNotInChannel = useMemo(
    () => teamUsers.filter(u => !channelMemberIds.has(u.id) && u.id !== user?.id),
    [teamUsers, channelMemberIds, user?.id]
  );

  const filteredUsersNotInChannel = useMemo(
    () => addMemberSearchQuery
      ? usersNotInChannel.filter(u =>
          u.displayName.toLowerCase().includes(addMemberSearchQuery.toLowerCase()) ||
          u.email.toLowerCase().includes(addMemberSearchQuery.toLowerCase())
        )
      : usersNotInChannel,
    [usersNotInChannel, addMemberSearchQuery]
  );

  // Start Chat drawer: filter users by search and exclude self (uses dedicated query)
  const startChatFilteredUsers = useMemo(
    () => startChatUsers.filter(u => u.id !== user?.id),
    [startChatUsers, user?.id]
  );

  // Get selected users for display in chips (uses dedicated query)
  const startChatSelectedUsersList = useMemo(
    () => startChatUsers.filter(u => startChatSelectedUsers.has(u.id)),
    [startChatUsers, startChatSelectedUsers]
  );

  // Toggle user selection in Start Chat drawer
  const toggleStartChatUserSelection = useCallback((userId: string) => {
    setStartChatSelectedUsers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  }, []);

  // Mutation for starting a new chat from drawer
  const startNewChatMutation = useMutation({
    mutationFn: async (userIds: string[]) => {
      const res = await apiRequest("POST", "/api/v1/chat/dm", { userIds });
      return res.json();
    },
    onSuccess: async (result: any) => {
      setStartChatSelectedUsers(new Set());
      setStartChatSearchQuery("");
      setStartChatDrawerOpen(false);
      
      // Refetch to get full thread with members (refetchQueries waits for completion)
      await queryClient.refetchQueries({ queryKey: ["/api/v1/chat/dm"] });
      
      // After refetch, find and select the new DM from the updated cache
      if (result && result.id) {
        const dmList = queryClient.getQueryData<ChatDmThread[]>(["/api/v1/chat/dm"]);
        const newDm = dmList?.find(dm => dm.id === result.id);
        if (newDm) {
          setSelectedDm(newDm);
          setSelectedChannel(null);
          // Navigate to the new DM via URL
          updateUrlForConversation("dm", newDm.id);
        }
      }
    },
    onError: (error: any) => {
      toast({
        title: "Failed to start conversation",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  // Mutation for creating a group from drawer
  const createGroupFromDrawerMutation = useMutation({
    mutationFn: async ({ name, userIds }: { name: string; userIds: string[] }) => {
      const channel: any = await apiRequest("POST", "/api/v1/chat/channels", { name, isPrivate: true });
      let addMembersFailed = false;
      if (userIds.length > 0 && channel?.id) {
        try {
          await apiRequest("POST", `/api/v1/chat/channels/${channel.id}/members`, { userIds });
        } catch (err) {
          addMembersFailed = true;
        }
      }
      return { channel, addMembersFailed };
    },
    onSuccess: (result: { channel: any; addMembersFailed: boolean }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/channels"] });
      setStartChatSelectedUsers(new Set());
      setStartChatSearchQuery("");
      setStartChatGroupName("");
      setStartChatDrawerOpen(false);
      if (result.channel?.id) {
        setSelectedChannel(result.channel);
        setSelectedDm(null);
        // Navigate to the new channel via URL
        updateUrlForConversation("channel", result.channel.id);
      }
      if (result.addMembersFailed) {
        toast({
          title: "Group created with warning",
          description: "The group was created but some members could not be added.",
          variant: "default",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create group",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  // Handle create chat from drawer
  const handleCreateChatFromDrawer = () => {
    if (startChatSelectedUsers.size === 0) return;
    const userIds = Array.from(startChatSelectedUsers);
    
    if (userIds.length === 1) {
      // Start DM
      startNewChatMutation.mutate(userIds);
    } else {
      // Multiple users - create group
      const groupName = startChatGroupName.trim() || `Group (${userIds.length + 1} members)`;
      createGroupFromDrawerMutation.mutate({ name: groupName, userIds });
    }
  };

  const handleMessageInputChange = (newValue: string) => {
    setMessageInput(newValue);
    
    // Emit typing start event (throttled by the hook)
    if (newValue.trim()) {
      startTyping();
    }
    
    // Slash command detection
    const matches = getMatchingCommands(newValue);
    if (matches.length > 0 && !newValue.includes(" ")) {
      setSlashCommandOpen(true);
      setSlashCommandMatches(matches);
      setSlashCommandIndex(0);
    } else {
      setSlashCommandOpen(false);
      setSlashCommandMatches([]);
    }
    
    const textarea = messageInputRef.current;
    const cursorPos = textarea?.selectionStart || newValue.length;
    const textBeforeCursor = newValue.slice(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
    
    if (mentionMatch) {
      setMentionOpen(true);
      setMentionQuery(mentionMatch[1]);
      setMentionCursorPos(cursorPos);
      setMentionIndex(0);
    } else {
      setMentionOpen(false);
      setMentionQuery("");
      setMentionIndex(0);
    }
  };

  const insertMention = (user: MentionableUser) => {
    const textBeforeMention = messageInput.slice(0, mentionCursorPos).replace(/@\w*$/, "");
    const textAfterMention = messageInput.slice(mentionCursorPos);
    const mentionText = `@[${user.displayName}](${user.id}) `;
    setMessageInput(textBeforeMention + mentionText + textAfterMention);
    setMentionOpen(false);
    setMentionQuery("");
    messageInputRef.current?.focus();
  };

  const renderMessageBody = (body: string) => {
    const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
    const parts = [];
    let lastIndex = 0;
    let match;
    
    while ((match = mentionRegex.exec(body)) !== null) {
      if (match.index > lastIndex) {
        parts.push(body.slice(lastIndex, match.index));
      }
      const displayName = match[1];
      const userId = match[2];
      parts.push(
        <Badge 
          key={`${userId}-${match.index}`} 
          variant="secondary" 
          className="cursor-pointer text-xs py-0 px-1"
        >
          <AtSign className="h-3 w-3 mr-0.5" />
          {displayName}
        </Badge>
      );
      lastIndex = mentionRegex.lastIndex;
    }
    
    if (lastIndex < body.length) {
      parts.push(body.slice(lastIndex));
    }
    
    return parts.length > 0 ? parts : body;
  };

  // Sort messages by createdAt with ID fallback for consistent ordering
  const sortMessages = (msgs: ChatMessage[]): ChatMessage[] => {
    return [...msgs].sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      if (timeA !== timeB) return timeA - timeB;
      // Fallback to ID comparison for messages with same timestamp
      return a.id.localeCompare(b.id);
    });
  };

  useEffect(() => {
    if (selectedChannel && channelMessagesQuery.data) {
      const sorted = sortMessages(channelMessagesQuery.data);
      setMessages(sorted);
      setHasMoreMessages(channelMessagesQuery.data.length >= MESSAGES_PAGE_SIZE);
      seenMessageIds.current.clear();
      channelMessagesQuery.data.forEach(m => seenMessageIds.current.add(m.id));
    } else if (selectedDm && dmMessagesQuery.data) {
      const sorted = sortMessages(dmMessagesQuery.data);
      setMessages(sorted);
      setHasMoreMessages(dmMessagesQuery.data.length >= MESSAGES_PAGE_SIZE);
      seenMessageIds.current.clear();
      dmMessagesQuery.data.forEach(m => seenMessageIds.current.add(m.id));
    } else {
      setMessages([]);
      setHasMoreMessages(false);
      seenMessageIds.current.clear();
    }
  }, [selectedChannel, selectedDm, channelMessagesQuery.data, dmMessagesQuery.data]);

  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;
  const hasMoreRef = useRef(hasMoreMessages);
  hasMoreRef.current = hasMoreMessages;
  const isLoadingMoreRef = useRef(isLoadingMore);
  isLoadingMoreRef.current = isLoadingMore;

  const loadAbortRef = useRef<AbortController | null>(null);

  const loadOlderMessages = useCallback(async () => {
    if (isLoadingMoreRef.current || !hasMoreRef.current || messagesRef.current.length === 0) return;
    
    if (loadAbortRef.current) {
      loadAbortRef.current.abort();
    }
    const abortController = new AbortController();
    loadAbortRef.current = abortController;
    
    const conversationId = selectedChannel?.id ?? selectedDm?.id;
    
    setIsLoadingMore(true);
    try {
      const oldestMessage = messagesRef.current[0];
      const beforeDate = new Date(oldestMessage.createdAt).toISOString();
      let url: string;
      if (selectedChannel) {
        url = `/api/v1/chat/channels/${selectedChannel.id}/messages?limit=${MESSAGES_PAGE_SIZE}&before=${encodeURIComponent(beforeDate)}`;
      } else if (selectedDm) {
        url = `/api/v1/chat/dm/${selectedDm.id}/messages?limit=${MESSAGES_PAGE_SIZE}&before=${encodeURIComponent(beforeDate)}`;
      } else {
        return;
      }
      const res = await fetch(url, { credentials: "include", signal: abortController.signal });
      if (!res.ok) throw new Error("Failed to load older messages");
      const olderMessages: ChatMessage[] = await res.json();
      
      const currentConversationId = selectedChannel?.id ?? selectedDm?.id;
      if (currentConversationId !== conversationId) {
        return;
      }
      
      if (olderMessages.length < MESSAGES_PAGE_SIZE) {
        setHasMoreMessages(false);
      }
      if (olderMessages.length > 0) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newMsgs = olderMessages.filter((m) => !existingIds.has(m.id));
          newMsgs.forEach((m) => seenMessageIds.current.add(m.id));
          return sortMessages([...newMsgs, ...prev]);
        });
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("[chat] Failed to load older messages:", err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [selectedChannel?.id, selectedDm?.id]);

  // Mark thread as read when messages load and there are messages
  // Uses ref to prevent redundant POST requests when the same message is already marked
  useEffect(() => {
    if (messages.length > 0 && (selectedChannel || selectedDm)) {
      const lastMessage = messages[messages.length - 1];
      const threadKey = selectedChannel 
        ? `channel:${selectedChannel.id}:${lastMessage.id}`
        : `dm:${selectedDm?.id}:${lastMessage.id}`;
      
      // Skip if we've already marked this exact message as read
      if (lastMarkedReadRef.current === threadKey) {
        return;
      }
      
      lastMarkedReadRef.current = threadKey;
      
      if (selectedChannel) {
        markAsReadMutation.mutate({
          targetType: "channel",
          targetId: selectedChannel.id,
          lastReadMessageId: lastMessage.id,
        });
      } else if (selectedDm) {
        markAsReadMutation.mutate({
          targetType: "dm",
          targetId: selectedDm.id,
          lastReadMessageId: lastMessage.id,
        });
      }
    }
  }, [messages.length, selectedChannel?.id, selectedDm?.id]);


  // Auto-focus message input when conversation is selected
  useEffect(() => {
    if ((selectedChannel || selectedDm) && messageInputRef.current) {
      // Small delay to ensure the input is mounted
      const timer = setTimeout(() => {
        messageInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [selectedChannel?.id, selectedDm?.id]);

  // Draft saving: Get conversation key for localStorage
  const getConversationKey = () => {
    if (selectedChannel) return `chat-draft:channel:${selectedChannel.id}`;
    if (selectedDm) return `chat-draft:dm:${selectedDm.id}`;
    return null;
  };

  // Load draft when conversation changes
  useEffect(() => {
    const key = getConversationKey();
    if (key) {
      const savedDraft = localStorage.getItem(key);
      if (savedDraft) {
        setMessageInput(savedDraft);
      } else {
        setMessageInput("");
      }
    }
    // Clear send error when switching conversations
    setSendError(null);
    setQuoteReply(null);
  }, [selectedChannel?.id, selectedDm?.id]);

  // Save draft to localStorage (debounced)
  useEffect(() => {
    const key = getConversationKey();
    if (!key) return;
    
    const timeoutId = setTimeout(() => {
      if (messageInput.trim()) {
        localStorage.setItem(key, messageInput);
      } else {
        localStorage.removeItem(key);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [messageInput, selectedChannel?.id, selectedDm?.id]);

  // Keyboard shortcuts: Esc closes panels/menus, Ctrl/Cmd+K focuses conversation search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd+K: Focus conversation search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.querySelector('[data-testid="input-conversation-search"]') as HTMLInputElement;
        searchInput?.focus();
        return;
      }
      
      // Escape: Close open panels/menus in priority order
      if (e.key === 'Escape') {
        // Close search popover first
        if (searchOpen) {
          setSearchOpen(false);
          return;
        }
        // Close context panel
        if (contextPanelOpen) {
          setContextPanelOpen(false);
          return;
        }
        // Close members drawer
        if (membersDrawerOpen) {
          setMembersDrawerOpen(false);
          return;
        }
        // Close create channel dialog
        if (createChannelOpen) {
          setCreateChannelOpen(false);
          return;
        }
        // Close start DM dialog
        if (startDmOpen) {
          setStartDmOpen(false);
          return;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [searchOpen, contextPanelOpen, membersDrawerOpen, createChannelOpen, startDmOpen]);

  // Bi-directional URL sync - react to URL changes (back/forward nav) and restore from URL
  // Derive selection keys for proper dependency tracking
  const selectedChannelId = selectedChannel?.id ?? null;
  const selectedDmId = selectedDm?.id ?? null;
  
  useEffect(() => {
    const urlConversation = getConversationFromUrl();
    const currentUrlKey = urlConversation ? `${urlConversation.type}:${urlConversation.id}` : null;
    
    // Build current selection key
    const currentSelectionKey = selectedChannelId 
      ? `channel:${selectedChannelId}` 
      : selectedDmId 
        ? `dm:${selectedDmId}` 
        : null;
    
    // If URL is empty but we have a selection, clear selection
    if (!urlConversation) {
      if (selectedChannelId || selectedDmId) {
        setSelectedChannel(null);
        setSelectedDm(null);
      }
      return;
    }
    
    // If selection matches URL, nothing to do
    if (currentSelectionKey === currentUrlKey) return;
    
    // URL-driven sync - restore selection from URL when data is available
    if (urlConversation.type === "channel" && channels.length > 0) {
      const channel = channels.find(c => c.id === urlConversation.id);
      if (channel) {
        setSelectedChannel(channel);
        setSelectedDm(null);
        joinChannelMutation.mutate(channel.id);
      }
    } else if (urlConversation.type === "dm" && dmThreads.length > 0) {
      const dm = dmThreads.find(d => d.id === urlConversation.id);
      if (dm) {
        setSelectedDm(dm);
        setSelectedChannel(null);
      }
    }
  }, [channels, dmThreads, searchString, getConversationFromUrl, selectedChannelId, selectedDmId]);

  // Reset read receipts when switching conversations
  useEffect(() => {
    setReadReceipts(new Map());
  }, [selectedChannel?.id, selectedDm?.id]);

  // Fetch initial read receipts for the active conversation
  const activeTargetType = selectedChannel ? "channel" : selectedDm ? "dm" : null;
  const activeTargetId = selectedChannel?.id ?? selectedDm?.id ?? null;
  const { data: initialReceipts } = useQuery<ReadReceipt[]>({
    queryKey: ["/api/v1/chat/reads", activeTargetType, activeTargetId],
    enabled: !!activeTargetType && !!activeTargetId,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (initialReceipts && initialReceipts.length > 0) {
      setReadReceipts(prev => {
        const next = new Map(prev);
        for (const r of initialReceipts) {
          if (r.userId !== user?.id) {
            next.set(r.userId, r);
          }
        }
        return next;
      });
    }
  }, [initialReceipts, user?.id]);

  // Track connection status for UI feedback
  useEffect(() => {
    const unsubscribe = onConnectionChange((connected) => {
      setIsConnected(connected);
      if (connected) {
        // Refetch data on reconnect to ensure fresh state
        queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/channels"] });
        queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/dm"] });
        if (selectedChannel) {
          queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/channels", selectedChannel.id, "messages"] });
        }
        if (selectedDm) {
          queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/dm", selectedDm.id, "messages"] });
        }
      }
    });
    return unsubscribe;
  }, [selectedChannel, selectedDm]);

  // Join/leave socket rooms when selection changes
  // Uses centralized room management with reconnect support
  useEffect(() => {
    if (!user) return;

    // Join the appropriate room (server validates access using session data)
    if (selectedChannel) {
      joinChatRoom('channel', selectedChannel.id);
    } else if (selectedDm) {
      joinChatRoom('dm', selectedDm.id);
    }

    // Leave the room on cleanup or selection change
    return () => {
      if (selectedChannel) {
        leaveChatRoom('channel', selectedChannel.id);
      } else if (selectedDm) {
        leaveChatRoom('dm', selectedDm.id);
      }
    };
  }, [selectedChannel, selectedDm, user]);

  // Periodically clean up stale pending messages (older than 2 minutes)
  useEffect(() => {
    const cleanup = () => {
      const now = Date.now();
      const staleThreshold = 2 * 60 * 1000; // 2 minutes
      
      for (const [tempId, pending] of pendingMessagesRef.current.entries()) {
        if (now - pending.timestamp > staleThreshold) {
          pendingMessagesRef.current.delete(tempId);
          // Also mark the message as failed if still pending
          setMessages(prev => 
            prev.map(m => 
              m._tempId === tempId && m._status === 'pending'
                ? { ...m, _status: 'failed' as const }
                : m
            )
          );
        }
      }
    };
    
    const interval = setInterval(cleanup, 30000); // Run every 30 seconds
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleNewMessage = (payload: ChatNewMessagePayload) => {
      const isCurrentChannel = selectedChannel && payload.targetType === "channel" && payload.targetId === selectedChannel.id;
      const isCurrentDm = selectedDm && payload.targetType === "dm" && payload.targetId === selectedDm.id;
      
      if (isCurrentChannel || isCurrentDm) {
        const message = payload.message as ChatMessage;
        
        // Guard against duplicate messages
        if (seenMessageIds.current.has(message.id)) {
          console.debug("[Chat] Ignoring duplicate message:", message.id);
          return;
        }
        seenMessageIds.current.add(message.id);
        
        // Try to find a matching pending message using the ref
        // This provides reliable reconciliation by finding the oldest pending message
        // with matching body from the same author
        let matchedTempId: string | null = null;
        const messageTime = new Date(message.createdAt).getTime();
        
        for (const [tempId, pending] of pendingMessagesRef.current.entries()) {
          // Match by body and recency (within 30 seconds)
          if (pending.body === message.body && 
              Math.abs(messageTime - pending.timestamp) < 30000) {
            matchedTempId = tempId;
            break; // Take the first (oldest) matching pending message
          }
        }
        
        // Replace pending message with confirmed one or add new message
        setMessages(prev => {
          let updated: ChatMessage[];
          
          if (matchedTempId) {
            // Find and replace the pending message by tempId
            const pendingIndex = prev.findIndex(m => m._tempId === matchedTempId);
            
            if (pendingIndex >= 0) {
              updated = [...prev];
              updated[pendingIndex] = { ...message, _status: 'sent' };
              // Clean up the pending reference
              pendingMessagesRef.current.delete(matchedTempId);
            } else {
              // Pending message not found in array (race condition), just add
              updated = [...prev, { ...message, _status: 'sent' }];
              pendingMessagesRef.current.delete(matchedTempId);
            }
          } else if (prev.some(m => m.id === message.id)) {
            // Message already exists, skip
            return prev;
          } else {
            // Add new message (from another user or reconnect)
            updated = [...prev, { ...message, _status: 'sent' }];
          }
          
          // Re-sort to maintain consistent ordering
          return sortMessages(updated);
        });
      }
      
      // Invalidate conversation list to update last message preview
      queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/channels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/dm"] });
    };

    const handleMessageUpdated = (payload: ChatMessageUpdatedPayload) => {
      const isCurrentChannel = selectedChannel && payload.targetType === "channel" && payload.targetId === selectedChannel.id;
      const isCurrentDm = selectedDm && payload.targetType === "dm" && payload.targetId === selectedDm.id;
      
      if (isCurrentChannel || isCurrentDm) {
        setMessages(prev => prev.map(msg => 
          msg.id === payload.messageId 
            ? { ...msg, ...payload.updates }
            : msg
        ));
      }
    };

    const handleMessageDeleted = (payload: ChatMessageDeletedPayload) => {
      const isCurrentChannel = selectedChannel && payload.targetType === "channel" && payload.targetId === selectedChannel.id;
      const isCurrentDm = selectedDm && payload.targetType === "dm" && payload.targetId === selectedDm.id;
      
      if (isCurrentChannel || isCurrentDm) {
        setMessages(prev => prev.map(msg => 
          msg.id === payload.messageId 
            ? { ...msg, body: "Message deleted", deletedAt: new Date() }
            : msg
        ));
      }
    };

    const handleMemberJoined = (payload: ChatMemberJoinedPayload) => {
      // Refresh channel members if currently viewing this channel's members
      if (payload.targetType === 'channel' && selectedChannel && payload.targetId === selectedChannel.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/channels", selectedChannel.id, "members"] });
      }
      // Refresh channel list in case user was added to a new channel
      if (payload.targetType === 'channel') {
        queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/channels"] });
      }
    };

    const handleMemberLeft = (payload: ChatMemberLeftPayload) => {
      // Refresh channel members if currently viewing this channel's members
      if (payload.targetType === 'channel' && selectedChannel && payload.targetId === selectedChannel.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/channels", selectedChannel.id, "members"] });
        // If current user was removed, deselect and show notification
        if (payload.userId === user?.id) {
          setSelectedChannel(null);
          setMembersDrawerOpen(false);
          queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/channels"] });
          toast({
            title: "Removed from channel",
            description: "You've been removed from this chat.",
            variant: "default",
          });
        }
      }
      // Refresh channel list
      if (payload.targetType === 'channel') {
        queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/channels"] });
      }
    };

    // Handle member added (richer info, emitted to channel room)
    const handleMemberAdded = (payload: ChatMemberAddedPayload) => {
      if (payload.targetType === 'channel' && selectedChannel && payload.targetId === selectedChannel.id) {
        // Invalidate members list to refresh with new member
        queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/channels", selectedChannel.id, "members"] });
      }
    };

    // Handle member removed (richer info, emitted to channel room)
    const handleMemberRemoved = (payload: ChatMemberRemovedPayload) => {
      if (payload.targetType === 'channel' && selectedChannel && payload.targetId === selectedChannel.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/channels", selectedChannel.id, "members"] });
        // If current user was removed, deselect and navigate out with message
        if (payload.userId === user?.id) {
          // Leave the socket room immediately
          leaveChatRoom('channel', selectedChannel.id);
          setSelectedChannel(null);
          setMembersDrawerOpen(false);
          queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/channels"] });
          toast({
            title: "Removed from channel",
            description: "You have been removed from this channel and can no longer access it.",
            variant: "destructive",
          });
        }
      }
    };

    const handleMessageReaction = (payload: ChatMessageReactionPayload) => {
      const currentTargetId = selectedChannel?.id ?? selectedDm?.id;
      if (payload.targetId !== currentTargetId) return;
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== payload.messageId) return msg;
          const existing = (msg as any).reactions || [];
          if (payload.action === 'add') {
            if (existing.some((r: any) => r.userId === payload.userId && r.emoji === payload.emoji)) return msg;
            return {
              ...msg,
              reactions: [...existing, { id: `socket-${Date.now()}`, emoji: payload.emoji, userId: payload.userId, user: payload.user || { id: payload.userId, name: 'Unknown', avatarUrl: null } }],
            };
          } else {
            return {
              ...msg,
              reactions: existing.filter((r: any) => !(r.userId === payload.userId && r.emoji === payload.emoji)),
            };
          }
        })
      );
    };

    const handleConversationRead = (payload: ChatConversationReadPayload) => {
      if (payload.userId === user?.id) {
        // Current user read - update unread counts
        if (payload.targetType === 'channel') {
          queryClient.setQueryData(["/api/v1/chat/channels"], (old: ChatChannel[] | undefined) => {
            if (!old) return old;
            return old.map(ch => 
              ch.id === payload.targetId ? { ...ch, unreadCount: 0 } : ch
            );
          });
        } else {
          queryClient.setQueryData(["/api/v1/chat/dm-threads"], (old: ChatDmThread[] | undefined) => {
            if (!old) return old;
            return old.map(dm => 
              dm.id === payload.targetId ? { ...dm, unreadCount: 0 } : dm
            );
          });
        }
      } else {
        const currentTargetId = selectedChannel?.id ?? selectedDm?.id;
        if (payload.targetId === currentTargetId) {
          setReadReceipts(prev => {
            const next = new Map(prev);
            next.set(payload.userId, {
              userId: payload.userId,
              lastReadMessageId: payload.lastReadMessageId,
              lastReadAt: payload.lastReadAt,
            });
            return next;
          });
        }
      }
    };

    const handleThreadReply = (payload: ChatNewMessagePayload) => {
      const isCurrentChannel = selectedChannel && payload.targetType === "channel" && payload.targetId === selectedChannel.id;
      const isCurrentDm = selectedDm && payload.targetType === "dm" && payload.targetId === selectedDm.id;
      if (isCurrentChannel || isCurrentDm) {
        queryClient.invalidateQueries({
          queryKey: [
            isCurrentChannel ? "/api/v1/chat/channels" : "/api/v1/chat/dm",
            payload.targetId,
            "thread-summaries",
          ],
        });
        const parentId = (payload.message as any).parentMessageId;
        if (parentId) {
          queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/messages", parentId, "thread"] });
        }
      }
    };

    socket.on(CHAT_EVENTS.NEW_MESSAGE as any, handleNewMessage as any);
    socket.on(CHAT_EVENTS.MESSAGE_UPDATED as any, handleMessageUpdated as any);
    socket.on(CHAT_EVENTS.MESSAGE_DELETED as any, handleMessageDeleted as any);
    socket.on(CHAT_EVENTS.MESSAGE_REACTION as any, handleMessageReaction as any);
    socket.on(CHAT_EVENTS.MEMBER_JOINED as any, handleMemberJoined as any);
    socket.on(CHAT_EVENTS.MEMBER_LEFT as any, handleMemberLeft as any);
    socket.on(CHAT_EVENTS.MEMBER_ADDED as any, handleMemberAdded as any);
    socket.on(CHAT_EVENTS.MEMBER_REMOVED as any, handleMemberRemoved as any);
    socket.on(CHAT_EVENTS.CONVERSATION_READ as any, handleConversationRead as any);
    socket.on(CHAT_EVENTS.THREAD_REPLY_CREATED as any, handleThreadReply as any);

    const handlePinChange = () => {
      if (selectedChannel) {
        queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/channels", selectedChannel.id, "pins"] });
      }
    };
    socket.on(CHAT_EVENTS.MESSAGE_PINNED as any, handlePinChange);
    socket.on(CHAT_EVENTS.MESSAGE_UNPINNED as any, handlePinChange);

    return () => {
      socket.off(CHAT_EVENTS.NEW_MESSAGE as any, handleNewMessage as any);
      socket.off(CHAT_EVENTS.MESSAGE_UPDATED as any, handleMessageUpdated as any);
      socket.off(CHAT_EVENTS.MESSAGE_DELETED as any, handleMessageDeleted as any);
      socket.off(CHAT_EVENTS.MESSAGE_REACTION as any, handleMessageReaction as any);
      socket.off(CHAT_EVENTS.MEMBER_JOINED as any, handleMemberJoined as any);
      socket.off(CHAT_EVENTS.MEMBER_LEFT as any, handleMemberLeft as any);
      socket.off(CHAT_EVENTS.MEMBER_ADDED as any, handleMemberAdded as any);
      socket.off(CHAT_EVENTS.MEMBER_REMOVED as any, handleMemberRemoved as any);
      socket.off(CHAT_EVENTS.CONVERSATION_READ as any, handleConversationRead as any);
      socket.off(CHAT_EVENTS.THREAD_REPLY_CREATED as any, handleThreadReply as any);
      socket.off(CHAT_EVENTS.MESSAGE_PINNED as any, handlePinChange);
      socket.off(CHAT_EVENTS.MESSAGE_UNPINNED as any, handlePinChange);
    };
  }, [selectedChannel, selectedDm, user?.id]);

  const createChannelMutation = useMutation({
    mutationFn: async (data: { name: string; isPrivate: boolean }) => {
      return apiRequest("POST", "/api/v1/chat/channels", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/channels"] });
      setCreateChannelOpen(false);
      setNewChannelName("");
      setNewChannelPrivate(false);
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async ({ body, attachmentIds, tempId }: { body: string; attachmentIds?: string[]; tempId: string }) => {
      const payload = { body, attachmentIds };
      if (selectedChannel) {
        return apiRequest("POST", `/api/v1/chat/channels/${selectedChannel.id}/messages`, payload);
      } else if (selectedDm) {
        return apiRequest("POST", `/api/v1/chat/dm/${selectedDm.id}/messages`, payload);
      }
      throw new Error("No channel or DM selected");
    },
    onMutate: async ({ body, tempId }) => {
      // Clear any previous send error
      setSendError(null);
      
      // Track pending message for reliable reconciliation
      pendingMessagesRef.current.set(tempId, { 
        body, 
        timestamp: Date.now() 
      });
      
      // Optimistic update: add pending message immediately
      const pendingMessage: ChatMessage = {
        id: tempId,
        tenantId: user?.tenantId || '',
        channelId: selectedChannel?.id || null,
        dmThreadId: selectedDm?.id || null,
        authorUserId: user?.id || '',
        body,
        createdAt: new Date(),
        editedAt: null,
        author: user ? {
          id: user.id,
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
          email: user.email,
          avatarUrl: user.avatarUrl || null,
        } : undefined,
        _status: 'pending',
        _tempId: tempId,
      };
      
      setMessages(prev => [...prev, pendingMessage]);
      setMessageInput("");
      stopTyping(); // Stop typing indicator on send
      setQuoteReply(null);
      setPendingAttachments(prev => {
        prev.forEach(a => { if (a.localPreviewUrl) URL.revokeObjectURL(a.localPreviewUrl); });
        return [];
      });
      
      // Clear draft from localStorage on send
      const key = getConversationKey();
      if (key) localStorage.removeItem(key);
      
      return { tempId, body };
    },
    onError: (error, _variables, context) => {
      // Set inline error for display
      const errorMessage = error instanceof Error ? error.message : "Failed to send message";
      setSendError(errorMessage);
      
      // Mark the pending message as failed
      if (context?.tempId) {
        // Remove from pending ref since it failed
        pendingMessagesRef.current.delete(context.tempId);
        
        setMessages(prev => 
          prev.map(msg => 
            msg._tempId === context.tempId 
              ? { ...msg, _status: 'failed' as const }
              : msg
          )
        );
      }
      const requestId = error instanceof ApiError ? error.requestId : null;
      toast({
        title: "Failed to send message",
        description: requestId 
          ? `Click retry to try again. Request ID: ${requestId}`
          : "Click the retry button to try again.",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      // Message will be replaced by socket event with confirmed ID
    },
  });

  // Retry failed message
  const retryFailedMessage = (failedMsg: ChatMessage) => {
    // Remove the failed message
    setMessages(prev => prev.filter(m => m._tempId !== failedMsg._tempId));
    
    // Re-send the message
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    sendMessageMutation.mutate({ 
      body: failedMsg.body, 
      attachmentIds: failedMsg.attachments?.map(a => a.id),
      tempId 
    });
  };

  // Remove failed message
  const removeFailedMessage = (tempId: string) => {
    setMessages(prev => prev.filter(m => m._tempId !== tempId));
  };

  const deleteChannelMutation = useMutation({
    mutationFn: async (channelId: string) => {
      const res = await apiRequest("DELETE", `/api/v1/chat/channels/${channelId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/channels"] });
      setSelectedChannel(null);
      toast({ title: "Channel deleted" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete channel",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const joinChannelMutation = useMutation({
    mutationFn: async (channelId: string) => {
      return apiRequest("POST", `/api/v1/chat/channels/${channelId}/join`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/channels/my"] });
    },
  });

  const markAsReadMutation = useMutation({
    mutationFn: async ({ targetType, targetId, lastReadMessageId }: { targetType: "channel" | "dm"; targetId: string; lastReadMessageId: string }) => {
      return apiRequest("POST", "/api/v1/chat/reads", { targetType, targetId, lastReadMessageId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/channels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/dm"] });
    },
  });

  const editMessageMutation = useMutation({
    mutationFn: async ({ messageId, body }: { messageId: string; body: string }): Promise<ChatMessage> => {
      const res = await apiRequest("PATCH", `/api/v1/chat/messages/${messageId}`, { body });
      return res.json();
    },
    onSuccess: (data: ChatMessage) => {
      setMessages((prev) =>
        prev.map((msg) => (msg.id === data.id ? { ...msg, body: data.body, editedAt: data.editedAt } : msg))
      );
      // Editing state is managed inside ChatMessageTimeline
    },
    onError: (error: Error) => {
      const requestId = error instanceof ApiError ? error.requestId : null;
      toast({
        title: "Failed to edit message",
        description: requestId ? `${error.message} (Request ID: ${requestId})` : error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: async (messageId: string) => {
      return apiRequest("DELETE", `/api/v1/chat/messages/${messageId}`);
    },
    onSuccess: (_data, messageId) => {
      setMessages((prev) =>
        prev.map((msg) => (msg.id === messageId ? { ...msg, body: "Message deleted", deletedAt: new Date() } : msg))
      );
    },
    onError: (error: Error) => {
      const requestId = error instanceof ApiError ? error.requestId : null;
      toast({
        title: "Failed to delete message",
        description: requestId ? `${error.message} (Request ID: ${requestId})` : error.message,
        variant: "destructive",
      });
    },
  });

  const addReactionMutation = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      const res = await apiRequest("POST", `/api/v1/chat/messages/${messageId}/reactions`, { emoji });
      return res.json();
    },
    onMutate: ({ messageId, emoji }) => {
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== messageId) return msg;
          const existing = (msg as any).reactions || [];
          if (existing.some((r: any) => r.userId === user?.id && r.emoji === emoji)) return msg;
          return {
            ...msg,
            reactions: [...existing, { id: 'optimistic', emoji, userId: user?.id, user: { id: user?.id, name: user?.name || '', avatarUrl: user?.avatarUrl || null } }],
          };
        })
      );
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add reaction", description: error.message, variant: "destructive" });
    },
  });

  const removeReactionMutation = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      return apiRequest("DELETE", `/api/v1/chat/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`);
    },
    onMutate: ({ messageId, emoji }) => {
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== messageId) return msg;
          const existing = (msg as any).reactions || [];
          return {
            ...msg,
            reactions: existing.filter((r: any) => !(r.userId === user?.id && r.emoji === emoji)),
          };
        })
      );
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove reaction", description: error.message, variant: "destructive" });
    },
  });

  const convertToTaskMutation = useMutation({
    mutationFn: async (params: { messageId: string; channelId?: string; dmThreadId?: string }) => {
      const res = await apiRequest("POST", "/api/v1/chat/ai/convert-to-task", params);
      return res.json();
    },
    onSuccess: (data) => {
      setConvertedTask(data.task);
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task Created", description: `"${data.task.title}" has been created` });
    },
    onError: (error: Error) => {
      toast({ title: "Convert to Task Failed", description: error.message, variant: "destructive" });
    },
  });

  const pinMessageMutation = useMutation({
    mutationFn: async (messageId: string) => {
      if (!selectedChannel) throw new Error("No channel selected");
      return apiRequest("POST", `/api/v1/chat/channels/${selectedChannel.id}/pins`, { messageId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/channels", selectedChannel?.id, "pins"] });
      toast({ title: "Message pinned" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to pin message", description: error.message, variant: "destructive" });
    },
  });

  const unpinMessageMutation = useMutation({
    mutationFn: async (messageId: string) => {
      if (!selectedChannel) throw new Error("No channel selected");
      return apiRequest("DELETE", `/api/v1/chat/channels/${selectedChannel.id}/pins`, { messageId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/channels", selectedChannel?.id, "pins"] });
      toast({ title: "Message unpinned" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to unpin message", description: error.message, variant: "destructive" });
    },
  });

  const markCurrentThreadAsRead = () => {
    if (messages.length === 0) return;
    const lastMessage = messages[messages.length - 1];
    if (selectedChannel) {
      markAsReadMutation.mutate({
        targetType: "channel",
        targetId: selectedChannel.id,
        lastReadMessageId: lastMessage.id,
      });
    } else if (selectedDm) {
      markAsReadMutation.mutate({
        targetType: "dm",
        targetId: selectedDm.id,
        lastReadMessageId: lastMessage.id,
      });
    }
  };

  const handleSelectChannel = (channel: ChatChannel) => {
    setSelectedChannel(channel);
    setSelectedDm(null);
    joinChannelMutation.mutate(channel.id);
    updateUrlForConversation("channel", channel.id);
  };

  const handleSelectDm = (dm: ChatDmThread) => {
    setSelectedDm(dm);
    setSelectedChannel(null);
    updateUrlForConversation("dm", dm.id);
  };

  // Derived selected conversation for ConversationListPanel
  const selectedConversation = useMemo(() => 
    selectedChannel
      ? { type: "channel" as const, id: selectedChannel.id }
      : selectedDm
        ? { type: "dm" as const, id: selectedDm.id }
        : null,
    [selectedChannel, selectedDm]
  );

  // Handler for ConversationListPanel selection
  const handleConversationSelect = (type: "channel" | "dm", id: string) => {
    if (type === "channel") {
      const channel = channels.find((c) => c.id === id);
      if (channel) handleSelectChannel(channel);
    } else {
      const dm = dmThreads.find((d) => d.id === id);
      if (dm) handleSelectDm(dm);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    await uploadFiles(files);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removePendingAttachment = (id: string) => {
    setPendingAttachments(prev => {
      const toRemove = prev.find(a => a.id === id);
      if (toRemove?.localPreviewUrl) {
        URL.revokeObjectURL(toRemove.localPreviewUrl);
      }
      return prev.filter(a => a.id !== id);
    });
  };

  const uploadFiles = async (files: FileList | File[]) => {
    setIsUploading(true);
    
    for (const file of Array.from(files)) {
      const tempId = `uploading-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      const isImage = file.type.startsWith("image/");
      const localPreviewUrl = isImage ? URL.createObjectURL(file) : undefined;
      
      setPendingAttachments(prev => [...prev, {
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
        const result = await new Promise<any>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/v1/chat/uploads");
          xhr.withCredentials = true;
          
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const pct = Math.round((e.loaded / e.total) * 100);
              setPendingAttachments(prev =>
                prev.map(a => a.id === tempId ? { ...a, progress: pct } : a)
              );
            }
          };
          
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                resolve(JSON.parse(xhr.responseText));
              } catch { reject(new Error("Invalid response")); }
            } else {
              try {
                const err = JSON.parse(xhr.responseText);
                reject(new Error(err.message || "Upload failed"));
              } catch { reject(new Error("Upload failed")); }
            }
          };
          
          xhr.onerror = () => reject(new Error("Network error"));
          
          const formData = new FormData();
          formData.append("file", file);
          xhr.send(formData);
        });
        
        if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
        
        setPendingAttachments(prev =>
          prev.map(a => a.id === tempId ? { ...result, uploading: false, progress: 100 } : a)
        );
      } catch (error: any) {
        if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
        setPendingAttachments(prev => prev.filter(a => a.id !== tempId));
        toast({
          title: "Upload failed",
          description: error.message || `Could not upload ${file.name}`,
          variant: "destructive",
        });
      }
    }
    
    setIsUploading(false);
  };

  const dragCounterRef = useRef(0);
  
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragOver(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragOver(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragOver(false);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await uploadFiles(files);
    }
  };

  const slashCommandMutation = useMutation({
    mutationFn: async ({ command, args, channelId }: { command: string; args: string; channelId?: string }) => {
      const res = await apiRequest("POST", "/api/v1/chat/slash-command", { command, args, channelId });
      return res.json();
    },
    onSuccess: (data) => {
      setMessageInput("");
      setSlashCommandOpen(false);
      setSlashCommandMatches([]);

      if (data.type === "help") {
        const helpLines = data.data.commands.map(
          (c: { name: string; usage: string; description: string }) =>
            `${c.name} - ${c.description}\n  Usage: ${c.usage}`
        );
        toast({
          title: "Available Commands",
          description: helpLines.join("\n"),
        });
      } else {
        toast({
          title: "Command executed",
          description: data.message,
        });
      }

      if (selectedChannel) {
        queryClient.invalidateQueries({
          queryKey: ["/api/v1/chat/channels", selectedChannel.id, "messages"],
        });
      }
    },
    onError: (error) => {
      let msg = "Command failed";
      if (error instanceof ApiError) {
        msg = error.message;
      } else if (error instanceof Error) {
        msg = error.message;
      }
      toast({
        title: "Command failed",
        description: msg,
        variant: "destructive",
      });
    },
  });

  const handleSlashCommandSelect = (cmd: SlashCommand) => {
    setSlashCommandOpen(false);
    setSlashCommandMatches([]);
    setSlashCommandIndex(0);

    if (cmd.name === "help") {
      slashCommandMutation.mutate({
        command: "help",
        args: "",
        channelId: selectedChannel?.id,
      });
      setMessageInput("");
      return;
    }

    setMessageInput(`/${cmd.name} `);
    messageInputRef.current?.focus();
  };

  const executeSlashCommand = (input: string): boolean => {
    const parsed = parseSlashCommand(input);
    if (!parsed) return false;

    const cmd = findCommand(parsed.command);
    if (!cmd) {
      toast({
        title: "Unknown command",
        description: `"/${parsed.command}" is not a recognized command. Type /help for available commands.`,
        variant: "destructive",
      });
      setMessageInput("");
      return true;
    }

    if (cmd.requiresArgs && !parsed.args) {
      toast({
        title: "Missing arguments",
        description: `Usage: ${cmd.usage}`,
        variant: "destructive",
      });
      return true;
    }

    slashCommandMutation.mutate({
      command: parsed.command,
      args: parsed.args,
      channelId: selectedChannel?.id,
    });
    return true;
  };

  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const readyAttachments = pendingAttachments.filter(a => !a.uploading);
    if (!messageInput.trim() && readyAttachments.length === 0) return;

    if (isSlashCommandInput(messageInput) && readyAttachments.length === 0) {
      if (executeSlashCommand(messageInput.trim())) return;
    }
    
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    sendMessageMutation.mutate({
      body: messageInput.trim() || " ",
      attachmentIds: readyAttachments.map(a => a.id),
      tempId,
    });
  };

  const handleMessageKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Slash command keyboard navigation
    if (slashCommandOpen && slashCommandMatches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashCommandIndex((prev) => (prev + 1) % slashCommandMatches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashCommandIndex((prev) => (prev - 1 + slashCommandMatches.length) % slashCommandMatches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        handleSlashCommandSelect(slashCommandMatches[slashCommandIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlashCommandOpen(false);
        setSlashCommandMatches([]);
        setSlashCommandIndex(0);
        return;
      }
    }

    const mentionUsers = mentionableUsersQuery.data;
    if (mentionOpen && mentionUsers && mentionUsers.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((prev) => (prev + 1) % mentionUsers.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((prev) => (prev - 1 + mentionUsers.length) % mentionUsers.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(mentionUsers[mentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionOpen(false);
        setMentionQuery("");
        setMentionIndex(0);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Message action handlers
  const handleCopyMessage = async (body: string) => {
    try {
      await navigator.clipboard.writeText(body);
      toast({
        title: "Copied to clipboard",
        description: "Message text copied successfully.",
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Could not copy text. Try selecting and copying manually.",
        variant: "destructive",
      });
    }
  };

  const handleQuoteReply = (authorName: string, body: string) => {
    setQuoteReply({ authorName, body });
    // Focus the input
    setTimeout(() => messageInputRef.current?.focus(), 100);
  };

  const handleCreateTaskFromMessage = (message: ChatMessage) => {
    const conversationType = selectedChannel ? "channel" : "dm";
    const conversationId = selectedChannel?.id || selectedDm?.id || "";
    const authorName = message.author?.name || message.author?.email || "Unknown";
    
    setCreateTaskMessage({
      id: message.id,
      body: message.body,
      authorName,
      conversationType,
      conversationId,
    });
    setCreateTaskModalOpen(true);
  };

  const handleOpenThread = useCallback((messageId: string) => {
    const msg = messages.find(m => m.id === messageId);
    if (msg) {
      setThreadParentMessage(msg);
    }
  }, [messages]);

  const handleCloseThread = useCallback(() => {
    setThreadParentMessage(null);
  }, []);

  const getDmDisplayName = (dm: ChatDmThread) => {
    const otherMembers = dm.members.filter((m) => m.userId !== user?.id);
    if (otherMembers.length === 0) return "Just you";
    return otherMembers.map((m) => m.user.name || m.user.email).join(", ");
  };

  const hasConversation = !!(selectedChannel || selectedDm);
  const showMobileList = isMobile && !hasConversation;
  const showMobileConversation = isMobile && hasConversation;

  return (
    <div className="flex h-full" data-testid="chat-page">
      <div className={`${isMobile ? (showMobileList ? "flex flex-col w-full" : "hidden") : "w-64"} border-r bg-sidebar flex flex-col`}>
        <Tabs value={sidebarTab} onValueChange={(v) => setSidebarTab(v as "chats" | "team")} className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-2 mx-2 mt-2" style={{ width: "calc(100% - 16px)" }}>
            <TabsTrigger value="chats" data-testid="tab-chats">
              <MessageCircle className="h-4 w-4 mr-1" />
              Chats
            </TabsTrigger>
            <TabsTrigger value="team" data-testid="tab-team">
              <Users className="h-4 w-4 mr-1" />
              Team
            </TabsTrigger>
          </TabsList>
          {/* Chats Tab - Using new ConversationListPanel */}
          <TabsContent value="chats" className="flex-1 flex flex-col overflow-hidden mt-0 p-0">
            <ConversationListPanel
              channels={channels}
              dmThreads={dmThreads}
              currentUserId={user?.id}
              selectedConversation={selectedConversation}
              onSelectConversation={handleConversationSelect}
              onNewDm={() => setStartChatDrawerOpen(true)}
              onNewChannel={() => setCreateChannelOpen(true)}
              isLoading={isLoadingChannels || isLoadingDmThreads}
              showNewChannelButton={true}
              className="flex-1"
            />
          </TabsContent>
          {/* Team Tab */}
          <TabsContent value="team" className="flex-1 flex flex-col overflow-hidden mt-0 p-0">
            <div className="p-4 border-b">
              <Input
                placeholder="Search team members..."
                value={teamSearchQuery}
                onChange={(e) => setTeamSearchQuery(e.target.value)}
                className="mb-2"
                data-testid="input-team-search"
              />
              {selectedTeamUsers.size > 0 && (
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="secondary">
                    {selectedTeamUsers.size} selected
                  </Badge>
                  <Button
                    size="sm"
                    onClick={handleStartChat}
                    disabled={startDmMutation.isPending || createGroupWithMembersMutation.isPending}
                    data-testid="button-start-chat"
                  >
                    {startDmMutation.isPending || createGroupWithMembersMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <MessageCircle className="h-4 w-4 mr-1" />
                    )}
                    Start Chat
                  </Button>
                </div>
              )}
            </div>
            <ScrollArea className="flex-1 p-2">
              {isLoadingTeamUsers ? (
                <div className="flex justify-center p-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredTeamUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center p-4">
                  {teamSearchQuery ? "No users found" : "No team members"}
                </p>
              ) : (
                <div className="space-y-1">
                  {filteredTeamUsers.map((teamUser) => (
                    <div
                      key={teamUser.id}
                      className="flex items-center gap-2 px-2 py-2 rounded hover-elevate cursor-pointer"
                      onClick={() => toggleUserSelection(teamUser.id)}
                      data-testid={`team-user-${teamUser.id}`}
                    >
                      <Checkbox
                        checked={selectedTeamUsers.has(teamUser.id)}
                        onCheckedChange={() => toggleUserSelection(teamUser.id)}
                        data-testid={`checkbox-user-${teamUser.id}`}
                      />
                      <div className="relative">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {getInitials(teamUser.displayName)}
                          </AvatarFallback>
                        </Avatar>
                        <AvatarPresenceIndicator userId={teamUser.id} avatarSize={32} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{teamUser.displayName}</p>
                        <p className="text-xs text-muted-foreground truncate">{teamUser.email}</p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {teamUser.role}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>

      <div 
        className={`flex-1 flex flex-col relative ${isMobile && !hasConversation ? "hidden" : ""}`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragOver && (selectedChannel || selectedDm) && (
          <div 
            className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary rounded-md pointer-events-none"
            data-testid="drag-drop-overlay"
          >
            <div className="flex flex-col items-center gap-3 text-center p-8">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Paperclip className="h-8 w-8 text-primary" />
              </div>
              <div>
                <p className="text-base font-medium">Drop files to upload</p>
                <p className="text-sm text-muted-foreground mt-1">Images, PDFs, documents and more</p>
              </div>
            </div>
          </div>
        )}
        {selectedChannel || selectedDm ? (
          <>
            <div className="h-14 border-b flex items-center px-2 sm:px-4 gap-2 justify-between">
              <div className="flex items-center gap-2 min-w-0">
                {isMobile && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={handleMobileBack}
                    aria-label="Go back"
                    data-testid="button-chat-back"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                )}
                {selectedChannel && (
                  <>
                    {selectedChannel.isPrivate ? (
                      <Lock className="h-5 w-5" />
                    ) : (
                      <Hash className="h-5 w-5" />
                    )}
                    <div>
                      <span className="font-semibold">{selectedChannel.name}</span>
                      {selectedChannel.memberCount !== undefined && selectedChannel.memberCount > 0 && (
                        <span className="text-xs text-muted-foreground ml-2">
                          {selectedChannel.memberCount} member{selectedChannel.memberCount !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </>
                )}
                {selectedDm && (
                  <>
                    <MessageCircle className="h-5 w-5" />
                    <div>
                      <span className="font-semibold">{getDmDisplayName(selectedDm)}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {selectedDm.members.length} member{selectedDm.members.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </>
                )}
              </div>
              <div className="flex items-center gap-1">
                {/* Connection status indicator */}
                {!isConnected && (
                  <div 
                    className="flex items-center gap-1 text-xs text-muted-foreground px-2"
                    data-testid="connection-status-offline"
                  >
                    <WifiOff className="h-3 w-3 text-destructive" />
                    <span>Reconnecting...</span>
                  </div>
                )}
                {selectedChannel && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPinnedPanelOpen(prev => !prev)}
                      className="gap-1"
                      data-testid="button-pinned-messages"
                    >
                      <Pin className="h-4 w-4" />
                      <span className="text-xs">Pins</span>
                      {pinnedMessages.length > 0 && (
                        <span className="text-xs text-muted-foreground">({pinnedMessages.length})</span>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setMembersDrawerOpen(true)}
                      className="gap-1"
                      data-testid="button-channel-members"
                    >
                      <Users className="h-4 w-4" />
                      <span className="text-xs">Members</span>
                    </Button>
                  </>
                )}
                <ChatAIAssist
                  channelId={selectedChannel?.id}
                  dmThreadId={selectedDm?.id}
                  threadParentMessageId={threadParentMessage?.id}
                  onInsertDraft={(text) => setNewMessage(text)}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSearchOpen(true)}
                  aria-label="Search messages"
                  title="Search messages"
                  data-testid="button-chat-search"
                >
                  <Search className="h-4 w-4" />
                </Button>
                {user?.role === "admin" && selectedChannel && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteChannelDialogOpen(true)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      aria-label="Delete channel"
                      title="Delete channel"
                      data-testid="button-delete-channel"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <AlertDialog open={deleteChannelDialogOpen} onOpenChange={setDeleteChannelDialogOpen}>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Channel</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete channel #{selectedChannel.name}? This action cannot be undone and all messages will be permanently lost.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel data-testid="button-cancel-delete-channel">Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => {
                              deleteChannelMutation.mutate(selectedChannel.id);
                              setDeleteChannelDialogOpen(false);
                            }}
                            className="bg-destructive text-destructive-foreground"
                            data-testid="button-confirm-delete-channel"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                )}
                <ChatContextPanelToggle
                  onClick={() => setContextPanelOpen(true)}
                  isOpen={contextPanelOpen}
                />
              </div>
            </div>

            {pinnedPanelOpen && selectedChannel && (
              <PinnedMessagesPanel
                pinnedMessages={pinnedMessages}
                onClose={() => setPinnedPanelOpen(false)}
                onUnpin={(messageId) => unpinMessageMutation.mutate(messageId)}
                canUnpin={canPin}
                renderMessageBody={renderMessageBody}
              />
            )}

            <ChatMessageTimeline
              messages={messages}
              currentUserId={user?.id}
              currentUserRole={user?.role}
              isLoading={channelMessagesQuery.isLoading || dmMessagesQuery.isLoading}
              hasMoreMessages={hasMoreMessages}
              onLoadMore={loadOlderMessages}
              isLoadingMore={isLoadingMore}
              onEditMessage={(messageId, body) => editMessageMutation.mutate({ messageId, body })}
              onDeleteMessage={(messageId) => deleteMessageMutation.mutate(messageId)}
              onAddReaction={(messageId, emoji) => addReactionMutation.mutate({ messageId, emoji })}
              onRemoveReaction={(messageId, emoji) => removeReactionMutation.mutate({ messageId, emoji })}
              onPinMessage={(messageId) => pinMessageMutation.mutate(messageId)}
              onUnpinMessage={(messageId) => unpinMessageMutation.mutate(messageId)}
              pinnedMessageIds={pinnedMessageIds}
              canPin={canPin}
              onRetryMessage={retryFailedMessage}
              onRemoveFailedMessage={removeFailedMessage}
              onCopyMessage={handleCopyMessage}
              onQuoteReply={handleQuoteReply}
              onCreateTaskFromMessage={handleCreateTaskFromMessage}
              onOpenThread={handleOpenThread}
              threadSummaries={threadSummaries}
              readByMap={readByMap}
              renderMessageBody={renderMessageBody}
              getFileIcon={getFileIcon}
              formatFileSize={formatFileSize}
              isDm={!!selectedDm}
              className="flex-1"
            />
            {messages.length > 0 && (() => {
              const lastMsg = messages[messages.length - 1];
              if (selectedDm && lastMsg.authorId === user?.id) {
                const otherReceipts = Array.from(readReceipts.values());
                const seenByOther = otherReceipts.find(r => r.lastReadMessageId === lastMsg.id);
                if (seenByOther) {
                  return (
                    <div className="h-5 flex justify-end px-4" data-testid="dm-seen-indicator">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <CheckCheck className="h-3 w-3" />
                        Seen
                      </span>
                    </div>
                  );
                }
              } else if (selectedChannel) {
                const readByOthers = Array.from(readReceipts.values()).filter(
                  r => r.lastReadMessageId === lastMsg.id
                );
                if (readByOthers.length > 0) {
                  return (
                    <div className="h-5 flex justify-end px-4" data-testid="channel-read-indicator">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <CheckCheck className="h-3 w-3" />
                        Read by {readByOthers.length}
                      </span>
                    </div>
                  );
                }
              }
              return <div className="h-5" />;
            })()}

            <div className="h-6 px-4 text-xs text-muted-foreground flex items-center gap-2" data-testid="typing-indicator">
              {typingUsers.length > 0 && (
                <>
                  <span className="flex gap-0.5 items-center">
                    <span className="w-1 h-1 bg-muted-foreground/70 rounded-full animate-bounce" style={{ animationDelay: "0ms", animationDuration: "1s" }} />
                    <span className="w-1 h-1 bg-muted-foreground/70 rounded-full animate-bounce" style={{ animationDelay: "150ms", animationDuration: "1s" }} />
                    <span className="w-1 h-1 bg-muted-foreground/70 rounded-full animate-bounce" style={{ animationDelay: "300ms", animationDuration: "1s" }} />
                  </span>
                  <span>
                    {(() => {
                      const names = typingUsers.map(userId => {
                        const teamUser = teamUsers.find(u => u.id === userId);
                        return teamUser?.displayName || teamUser?.email?.split("@")[0] || "Someone";
                      });
                      if (names.length === 1) {
                        return `${names[0]} is typing...`;
                      } else if (names.length === 2) {
                        return `${names[0]} and ${names[1]} are typing...`;
                      } else {
                        return "Several people are typing...";
                      }
                    })()}
                  </span>
                </>
              )}
            </div>

            <form 
              ref={composerRef}
              onSubmit={handleSendMessage} 
              className="px-2 sm:px-4 py-2 sm:py-3 border-t"
              style={isMobile && keyboardOffset > 0 ? { paddingBottom: `calc(${keyboardOffset}px + env(safe-area-inset-bottom, 0px))` } : undefined}
              data-testid="message-composer-form"
            >
              {quoteReply && (
                <div className="mb-2 flex items-start gap-2 p-2 rounded-md bg-muted/60 border-l-2 border-primary" data-testid="quote-reply-indicator">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-muted-foreground mb-0.5">
                      Replying to {quoteReply.authorName}
                    </div>
                    <div className="text-sm text-muted-foreground truncate">
                      {quoteReply.body.length > 100 ? quoteReply.body.substring(0, 100) + "..." : quoteReply.body}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => setQuoteReply(null)}
                    aria-label="Cancel quote"
                    data-testid="button-cancel-quote"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              {/* Inline send error */}
              {sendError && (
                <div className="mb-2 flex items-center gap-2 p-2 rounded-md bg-destructive/10 text-destructive text-sm" data-testid="send-error-indicator">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span className="flex-1">{sendError}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => setSendError(null)}
                    data-testid="button-dismiss-error"
                  >
                    Dismiss
                  </Button>
                </div>
              )}
              {pendingAttachments.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {pendingAttachments.map(attachment => {
                    const FileIcon = getFileIcon(attachment.mimeType);
                    const isImage = attachment.mimeType.startsWith("image/");
                    const previewSrc = attachment.localPreviewUrl || (isImage && attachment.url ? attachment.url : null);
                    return (
                      <div
                        key={attachment.id}
                        className="relative flex items-center gap-2 p-2 rounded-md bg-muted text-sm min-w-[120px] max-w-[200px]"
                        data-testid={`pending-attachment-${attachment.id}`}
                      >
                        {previewSrc ? (
                          <img 
                            src={previewSrc} 
                            alt={attachment.fileName}
                            className="h-10 w-10 object-cover rounded flex-shrink-0"
                          />
                        ) : (
                          <FileIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <span className="text-xs truncate block">{attachment.fileName}</span>
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
                          data-testid={`remove-attachment-${attachment.id}`}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                        {attachment.uploading && (
                          <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted-foreground/20 rounded-b-md overflow-hidden">
                            <div 
                              className="h-full bg-primary transition-all duration-200"
                              style={{ width: `${attachment.progress || 0}%` }}
                              data-testid={`upload-progress-${attachment.id}`}
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
                  data-testid="input-file-upload"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || sendMessageMutation.isPending}
                  aria-label="Attach file"
                  title="Attach file"
                  data-testid="button-attach-file"
                >
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Paperclip className="h-4 w-4" />
                  )}
                </Button>
                <div className="relative flex-1">
                  <ChatMessageInput
                    ref={messageInputRef}
                    value={messageInput}
                    onChange={handleMessageInputChange}
                    onKeyDown={handleMessageKeyDown}
                    placeholder={`Message ${selectedChannel ? "#" + selectedChannel.name : getDmDisplayName(selectedDm!)}`}
                    disabled={sendMessageMutation.isPending}
                    data-testid="input-message"
                  />
                  <SlashCommandDropdown
                    commands={slashCommandMatches}
                    selectedIndex={slashCommandIndex}
                    onSelect={handleSlashCommandSelect}
                    onHover={setSlashCommandIndex}
                    visible={slashCommandOpen}
                  />
                  {mentionOpen && mentionableUsersQuery.data && mentionableUsersQuery.data.length > 0 && (
                    <div className="absolute bottom-full left-0 w-72 mb-1 bg-popover border rounded-md shadow-lg z-50 max-h-52 overflow-y-auto py-1" data-testid="mention-popup">
                      <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                        People
                      </div>
                      {mentionableUsersQuery.data.map((u, idx) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => insertMention(u)}
                          className={`w-full px-3 py-1.5 text-left text-sm flex items-center gap-2.5 transition-colors ${
                            idx === mentionIndex
                              ? "bg-accent text-accent-foreground"
                              : "hover-elevate"
                          }`}
                          data-testid={`mention-user-${u.id}`}
                          onMouseEnter={() => setMentionIndex(idx)}
                        >
                          <div className="relative">
                            <Avatar className="h-6 w-6">
                              <AvatarFallback className="text-xs">
                                {u.displayName.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <AvatarPresenceIndicator userId={u.id} avatarSize={24} size="sm" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium truncate text-sm">{u.displayName}</div>
                          </div>
                          <div className="text-xs text-muted-foreground truncate max-w-[100px]">{u.email}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Button
                  type="submit"
                  size="icon"
                  disabled={(!messageInput.trim() && pendingAttachments.filter(a => !a.uploading).length === 0) || sendMessageMutation.isPending || pendingAttachments.some(a => a.uploading)}
                  aria-label="Send message"
                  title="Send message"
                  data-testid="button-send-message"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <Card className="p-8 text-center max-w-sm">
              <div className="flex items-center justify-center h-16 w-16 rounded-full bg-primary/10 mx-auto mb-4">
                <MessageCircle className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Welcome to Chat</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Select a conversation from the sidebar or start a new one to begin chatting with your team.
              </p>
              <div className="flex gap-2 justify-center">
                <Button
                  variant="outline"
                  onClick={() => setStartDmOpen(true)}
                  data-testid="button-start-first-dm-welcome"
                >
                  <MessageCircle className="h-4 w-4 mr-2" />
                  Start DM
                </Button>
                <Button
                  onClick={() => setCreateChannelOpen(true)}
                  data-testid="button-create-first-channel"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Channel
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Thread Panel - Right Side */}
      {threadPanelOpen && threadParentMessage && (
        <Suspense
          fallback={
            <div className="w-80 border-l bg-background flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          }
        >
          <div className="w-80 flex-shrink-0" data-testid="thread-panel-container">
            <LazyThreadPanel
              parentMessage={threadParentMessage}
              conversationType={selectedChannel ? "channel" : "dm"}
              conversationId={selectedChannel?.id || selectedDm?.id || ""}
              currentUserId={user?.id || ""}
              onClose={handleCloseThread}
              renderMessageBody={renderMessageBody}
            />
          </div>
        </Suspense>
      )}

      {/* Context Panel - Right Side (lazy-loaded) */}
      {(selectedChannel || selectedDm) && contextPanelOpen && !threadPanelOpen && (
        <Suspense
          fallback={
            <div className="w-72 border-l bg-background flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          }
        >
          <LazyChatContextPanel
            selectedChannel={selectedChannel}
            selectedDm={selectedDm}
            currentUserId={user?.id}
            channelMembers={channelMembers}
            isOpen={contextPanelOpen}
            onToggle={() => setContextPanelOpen(false)}
          />
        </Suspense>
      )}

      <Dialog open={createChannelOpen} onOpenChange={setCreateChannelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Channel</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="channel-name">Channel Name</Label>
              <Input
                id="channel-name"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                placeholder="e.g. general, random, project-updates"
                data-testid="input-channel-name"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="channel-private">Private Channel</Label>
                <p className="text-xs text-muted-foreground">
                  Only invited members can join
                </p>
              </div>
              <Switch
                id="channel-private"
                checked={newChannelPrivate}
                onCheckedChange={setNewChannelPrivate}
                data-testid="switch-channel-private"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateChannelOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createChannelMutation.mutate({ name: newChannelName, isPrivate: newChannelPrivate })}
              disabled={!newChannelName.trim() || createChannelMutation.isPending}
              data-testid="button-confirm-create-channel"
            >
              Create Channel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Task from Message Modal */}
      <Dialog open={createTaskModalOpen} onOpenChange={(open) => {
        setCreateTaskModalOpen(open);
        if (!open) {
          setCreateTaskMessage(null);
          setConvertedTask(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Task from Message</DialogTitle>
            <DialogDescription>
              {convertedTask ? "Task created successfully" : "Use AI to extract a task from this message, or create one manually."}
            </DialogDescription>
          </DialogHeader>
          {createTaskMessage && !convertedTask && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Message Content</Label>
                <div className="p-3 rounded-md bg-muted text-sm">
                  <div className="text-xs text-muted-foreground mb-1">
                    From {createTaskMessage.authorName}
                  </div>
                  <p className="whitespace-pre-wrap">
                    {createTaskMessage.body.length > 300 
                      ? createTaskMessage.body.substring(0, 300) + "..." 
                      : createTaskMessage.body}
                  </p>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                Reference: {createTaskMessage.conversationType === "channel" ? "Channel" : "DM"} &bull; Message ID: {createTaskMessage.id.substring(0, 8)}...
              </div>
            </div>
          )}
          {convertedTask && (
            <div className="space-y-3 py-4" data-testid="converted-task-result">
              <div className="p-3 rounded-md border space-y-2">
                <div className="font-medium text-sm">{convertedTask.title}</div>
                {convertedTask.description && (
                  <p className="text-sm text-muted-foreground">{convertedTask.description}</p>
                )}
                <div className="flex gap-2">
                  <Badge variant="outline">{convertedTask.priority}</Badge>
                  <Badge variant="outline">{convertedTask.status}</Badge>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCreateTaskModalOpen(false)}>
              {convertedTask ? "Close" : "Cancel"}
            </Button>
            {!convertedTask && (
              <Button
                onClick={() => {
                  if (createTaskMessage) {
                    convertToTaskMutation.mutate({
                      messageId: createTaskMessage.id,
                      channelId: createTaskMessage.conversationType === "channel" ? createTaskMessage.conversationId : undefined,
                      dmThreadId: createTaskMessage.conversationType === "dm" ? createTaskMessage.conversationId : undefined,
                    });
                  }
                }}
                disabled={convertToTaskMutation.isPending}
                data-testid="button-confirm-create-task"
              >
                {convertToTaskMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Task with AI"
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Search Messages</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search messages (min 2 characters)"
              data-testid="input-search-messages"
            />
            <ScrollArea className="h-80">
              {searchResultsQuery.isLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              )}
              {searchResultsQuery.data && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground mb-2">
                    Found {searchResultsQuery.data.total} message{searchResultsQuery.data.total !== 1 ? "s" : ""}
                  </p>
                  {searchResultsQuery.data.messages.map((result) => (
                    <Card
                      key={result.id}
                      className="p-3 cursor-pointer hover-elevate"
                      onClick={() => {
                        if (result.channelId) {
                          const channel = channels.find(c => c.id === result.channelId);
                          if (channel) {
                            setSelectedChannel(channel);
                            setSelectedDm(null);
                          }
                        } else if (result.dmThreadId) {
                          const dm = dmThreads.find(d => d.id === result.dmThreadId);
                          if (dm) {
                            setSelectedDm(dm);
                            setSelectedChannel(null);
                          }
                        }
                        setSearchOpen(false);
                        setSearchQuery("");
                      }}
                      data-testid={`search-result-${result.id}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Avatar className="h-5 w-5">
                          <AvatarFallback className="text-xs">
                            {result.author.displayName.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium">{result.author.displayName}</span>
                        {result.channelName && (
                          <Badge variant="outline" className="text-xs">
                            <Hash className="h-3 w-3 mr-0.5" />
                            {result.channelName}
                          </Badge>
                        )}
                        {result.dmThreadId && (
                          <Badge variant="outline" className="text-xs">
                            <MessageCircle className="h-3 w-3 mr-0.5" />
                            DM
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground ml-auto">
                          {new Date(result.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {renderMessageBody(result.body)}
                      </p>
                    </Card>
                  ))}
                  {searchResultsQuery.data.messages.length === 0 && debouncedSearchQuery.length >= 2 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No messages found matching "{searchQuery}"
                    </p>
                  )}
                </div>
              )}
              {!searchResultsQuery.data && searchQuery.length < 2 && searchQuery.length > 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Type at least 2 characters to search
                </p>
              )}
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSearchOpen(false); setSearchQuery(""); }}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Members Drawer */}
      <Sheet open={membersDrawerOpen} onOpenChange={setMembersDrawerOpen}>
        <SheetContent className="w-80">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Channel Members
            </SheetTitle>
            <SheetDescription>
              {selectedChannel?.name} has {channelMembers.length} member{channelMembers.length !== 1 ? "s" : ""}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            {/* Add members section - only for channel creator */}
            {selectedChannel?.createdBy === user?.id && usersNotInChannel.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Add Members</p>
                <div className="flex gap-2">
                  <Input
                    placeholder="Search users..."
                    value={addMemberSearchQuery}
                    onChange={(e) => setAddMemberSearchQuery(e.target.value)}
                    className="flex-1"
                    data-testid="input-add-member-search"
                  />
                </div>
                <ScrollArea className="h-32 border rounded-md p-2">
                  {isLoadingTeamUsers ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Loading team members...</p>
                  ) : filteredUsersNotInChannel.length > 0 ? (
                    filteredUsersNotInChannel.map((u) => (
                      <button
                        key={u.id}
                        className="w-full flex items-center gap-2 p-2 rounded hover-elevate text-left"
                        onClick={() => {
                          if (selectedChannel) {
                            addMembersMutation.mutate({ 
                              channelId: selectedChannel.id, 
                              userIds: [u.id] 
                            });
                          }
                        }}
                        data-testid={`add-member-${u.id}`}
                      >
                        <div className="relative">
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-xs">
                              {getInitials(u.displayName)}
                            </AvatarFallback>
                          </Avatar>
                          <AvatarPresenceIndicator userId={u.id} avatarSize={24} size="sm" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{u.displayName}</p>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        </div>
                        <Plus className="h-4 w-4 text-muted-foreground" />
                      </button>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      {addMemberSearchQuery ? "No users found" : "All team members are already in this channel"}
                    </p>
                  )}
                </ScrollArea>
              </div>
            )}

            {/* Current members list */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Members</p>
              <ScrollArea className="h-64">
                {channelMembers.map((member) => {
                  const isCreator = selectedChannel?.createdBy === member.userId;
                  const isCurrentUser = member.userId === user?.id;
                  const canRemove = selectedChannel?.createdBy === user?.id || isCurrentUser;
                  
                  return (
                    <div 
                      key={member.id} 
                      className="flex items-center gap-2 p-2 rounded"
                      data-testid={`member-${member.userId}`}
                    >
                      <div className="relative">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {getInitials(member.user?.name || member.user?.email || "?")}
                          </AvatarFallback>
                        </Avatar>
                        <AvatarPresenceIndicator userId={member.userId} avatarSize={32} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {member.user?.name || member.user?.email || "Unknown"}
                          {isCurrentUser && " (you)"}
                        </p>
                        {isCreator && (
                          <Badge variant="outline" className="text-xs">Owner</Badge>
                        )}
                      </div>
                      {canRemove && !isCreator && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => setRemoveMemberConfirmUserId(member.userId)}
                          aria-label="Remove member"
                          data-testid={`remove-member-${member.userId}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </ScrollArea>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Create Group Dialog */}
      <Dialog open={createGroupDialogOpen} onOpenChange={setCreateGroupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Group Chat</DialogTitle>
            <DialogDescription>
              Create a group chat with {selectedTeamUsers.size} selected member{selectedTeamUsers.size !== 1 ? "s" : ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="group-name">Group Name</Label>
            <Input
              id="group-name"
              placeholder="Enter group name..."
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              className="mt-2"
              data-testid="input-group-name"
            />
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setCreateGroupDialogOpen(false);
                setNewGroupName("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (newGroupName.trim()) {
                  createGroupWithMembersMutation.mutate({
                    name: newGroupName.trim(),
                    userIds: Array.from(selectedTeamUsers),
                  });
                }
              }}
              disabled={!newGroupName.trim() || createGroupWithMembersMutation.isPending}
              data-testid="button-confirm-create-group"
            >
              {createGroupWithMembersMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              Create Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Member Confirmation Dialog */}
      <AlertDialog 
        open={!!removeMemberConfirmUserId} 
        onOpenChange={(open) => !open && setRemoveMemberConfirmUserId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {removeMemberConfirmUserId === user?.id ? "Leave Channel?" : "Remove Member?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {removeMemberConfirmUserId === user?.id 
                ? "Are you sure you want to leave this channel? You will need to be re-added by the channel owner to rejoin."
                : "Are you sure you want to remove this member from the channel?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedChannel && removeMemberConfirmUserId) {
                  removeMemberMutation.mutate({
                    channelId: selectedChannel.id,
                    userId: removeMemberConfirmUserId,
                  });
                }
              }}
              data-testid="button-confirm-remove-member"
            >
              {removeMemberMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              {removeMemberConfirmUserId === user?.id ? "Leave" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Start New Chat Drawer */}
      <Sheet open={startChatDrawerOpen} onOpenChange={(open) => {
        setStartChatDrawerOpen(open);
        if (!open) {
          // Reset state when drawer closes
          setStartChatSearchQuery("");
          setStartChatSelectedUsers(new Set());
          setStartChatGroupName("");
        }
      }}>
        <SheetContent side="left" className="w-80 flex flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Start New Chat
            </SheetTitle>
            <SheetDescription>
              Select one or more team members to start a conversation.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 flex flex-col overflow-hidden mt-4">
            {/* Search input */}
            <Input
              placeholder="Search by name or email..."
              value={startChatSearchQuery}
              onChange={(e) => setStartChatSearchQuery(e.target.value)}
              className="mb-4"
              data-testid="input-start-chat-search"
            />

            {/* Selected users chips */}
            {startChatSelectedUsersList.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-4 p-2 border rounded-md bg-muted/50">
                {startChatSelectedUsersList.map((u) => (
                  <Badge 
                    key={u.id} 
                    variant="secondary" 
                    className="flex items-center gap-1 pr-1"
                  >
                    {u.displayName}
                    <button
                      onClick={() => toggleStartChatUserSelection(u.id)}
                      className="ml-1 rounded-full hover:bg-muted p-0.5"
                      data-testid={`remove-chip-${u.id}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {/* Group name input (shown for 2+ selections) */}
            {startChatSelectedUsers.size >= 2 && (
              <div className="mb-4">
                <Label htmlFor="start-chat-group-name" className="text-sm">Group Name (optional)</Label>
                <Input
                  id="start-chat-group-name"
                  placeholder="Enter group name..."
                  value={startChatGroupName}
                  onChange={(e) => setStartChatGroupName(e.target.value)}
                  className="mt-1"
                  data-testid="input-start-chat-group-name"
                />
              </div>
            )}

            {/* User list */}
            <ScrollArea className="flex-1">
              {isLoadingStartChatUsers ? (
                <div className="flex justify-center p-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : startChatFilteredUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center p-4">
                  {startChatSearchQuery ? "No users found" : "No team members available"}
                </p>
              ) : (
                <div className="space-y-1">
                  {startChatFilteredUsers.map((teamUser) => (
                    <div
                      key={teamUser.id}
                      className={`flex items-center gap-2 px-2 py-2 rounded hover-elevate cursor-pointer ${
                        startChatSelectedUsers.has(teamUser.id) ? "bg-accent" : ""
                      }`}
                      onClick={() => toggleStartChatUserSelection(teamUser.id)}
                      data-testid={`start-chat-user-${teamUser.id}`}
                    >
                      <Checkbox
                        checked={startChatSelectedUsers.has(teamUser.id)}
                        onCheckedChange={() => toggleStartChatUserSelection(teamUser.id)}
                        data-testid={`start-chat-checkbox-${teamUser.id}`}
                      />
                      <div className="relative">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {getInitials(teamUser.displayName)}
                          </AvatarFallback>
                        </Avatar>
                        <AvatarPresenceIndicator userId={teamUser.id} avatarSize={32} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{teamUser.displayName}</p>
                        <p className="text-xs text-muted-foreground truncate">{teamUser.email}</p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {teamUser.role}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* Action button */}
            <div className="pt-4 border-t mt-auto">
              <Button
                className="w-full"
                onClick={handleCreateChatFromDrawer}
                disabled={
                  startChatSelectedUsers.size === 0 ||
                  startNewChatMutation.isPending ||
                  createGroupFromDrawerMutation.isPending
                }
                data-testid="button-create-chat-from-drawer"
              >
                {(startNewChatMutation.isPending || createGroupFromDrawerMutation.isPending) ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <MessageCircle className="h-4 w-4 mr-2" />
                )}
                {startChatSelectedUsers.size === 0
                  ? "Select Recipients"
                  : startChatSelectedUsers.size === 1
                  ? "Start Direct Message"
                  : `Create Group Chat (${startChatSelectedUsers.size + 1} members)`}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
