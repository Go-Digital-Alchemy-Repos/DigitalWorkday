import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getStorageUrl } from "@/lib/storageUrl";
import { AvatarPresenceIndicator } from "@/components/ui/presence-indicator";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Link } from "wouter";
import {
  X,
  Users,
  FileText,
  Pin,
  Mail,
  User,
  Hash,
  Lock,
  ExternalLink,
  Download,
  Calendar,
} from "lucide-react";

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
  projectId?: string;
  projectName?: string;
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

interface ChannelMember {
  id: string;
  userId: string;
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
  };
}

interface PinnedMessage {
  id: string;
  messageId: string;
  createdAt: Date | string;
  message: {
    body: string;
    createdAt: Date | string;
    author?: {
      name?: string | null;
      email?: string | null;
    } | null;
  };
  pinnedBy?: {
    name?: string | null;
    email?: string | null;
  } | null;
}

interface SharedFile {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  messageId: string;
  createdAt: Date | string;
  authorName?: string | null;
}

interface ChatContextPanelProps {
  selectedChannel: ChatChannel | null;
  selectedDm: ChatDmThread | null;
  currentUserId?: string;
  channelMembers?: ChannelMember[];
  pinnedMessages?: PinnedMessage[];
  sharedFiles?: SharedFile[];
  isOpen: boolean;
  onToggle: () => void;
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

function getChatMemberProfilePath(userId: string): string {
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/super-admin")) {
    return `/super-admin/reports/employees/${userId}`;
  }

  return `/reports/employees/${userId}`;
}

export function ChatContextPanel({
  selectedChannel,
  selectedDm,
  currentUserId,
  channelMembers = [],
  pinnedMessages = [],
  sharedFiles = [],
  isOpen,
  onToggle,
  className,
}: ChatContextPanelProps) {
  const getOtherDmMember = () => {
    if (!selectedDm || !currentUserId) return null;
    return selectedDm.members.find((m) => m.userId !== currentUserId)?.user;
  };

  const otherMember = getOtherDmMember();
  const otherMemberProfilePath = otherMember ? getChatMemberProfilePath(otherMember.id) : null;

  if (!selectedChannel && !selectedDm) {
    return null;
  }

  return (
    <div
      className={cn(
        "bg-background border border-border/50 rounded-xl transition-all duration-300 flex flex-col overflow-hidden shadow-sm",
        isOpen ? "w-72" : "w-0",
        className
      )}
      data-testid="chat-context-panel"
    >
      {isOpen && (
        <>
          <div className="h-14 border-b flex items-center justify-between px-4 shrink-0">
            <span className="font-semibold text-sm">
              {selectedChannel ? "Channel Info" : "Conversation"}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggle}
              aria-label="Close panel"
              data-testid="button-close-context-panel"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <ScrollArea className="flex-1">
            {selectedChannel && (
              <div className="p-4 space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    {selectedChannel.isPrivate ? (
                      <Lock className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <Hash className="h-5 w-5 text-muted-foreground" />
                    )}
                    <span className="font-semibold">{selectedChannel.name}</span>
                  </div>

                  {selectedChannel.isPrivate && (
                    <Badge variant="secondary" className="text-xs">
                      <Lock className="h-3 w-3 mr-1" />
                      Private Channel
                    </Badge>
                  )}

                  {selectedChannel.projectId && selectedChannel.projectName && (
                    <div className="flex items-center gap-2 p-2 rounded-md bg-muted">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground">Project</p>
                        <p className="text-sm font-medium truncate">
                          {selectedChannel.projectName}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        aria-label="View project"
                        asChild
                      >
                        <a
                          href={`/projects/${selectedChannel.projectId}`}
                          data-testid="link-project"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </Button>
                    </div>
                  )}
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Members</span>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {channelMembers.length || selectedChannel.memberCount || 0}
                    </Badge>
                  </div>

                  {channelMembers.length > 0 ? (
                    <div className="space-y-1">
                      {channelMembers.slice(0, 10).map((member) => (
                        <div
                          key={member.id}
                          className="flex items-center gap-2 p-2 rounded-md hover-elevate"
                          data-testid={`member-${member.userId}`}
                        >
                          <div className="relative">
                            <Avatar className="h-7 w-7">
                              {member.user.avatarUrl && (
                                <AvatarImage src={getStorageUrl(member.user.avatarUrl)} />
                              )}
                              <AvatarFallback className="text-xs">
                                {getInitials(member.user.name || member.user.email)}
                              </AvatarFallback>
                            </Avatar>
                            <AvatarPresenceIndicator userId={member.userId} avatarSize={28} size="sm" />
                          </div>
                          <span className="text-sm truncate flex-1">
                            {member.user.name || member.user.email}
                          </span>
                          {member.userId === currentUserId && (
                            <Badge variant="secondary" className="text-xs">
                              You
                            </Badge>
                          )}
                        </div>
                      ))}
                      {channelMembers.length > 10 && (
                        <p className="text-xs text-muted-foreground text-center py-1">
                          +{channelMembers.length - 10} more
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Member list not available
                    </p>
                  )}
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Pin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Pinned Messages</span>
                    {pinnedMessages.length > 0 && (
                      <Badge variant="outline" className="ml-auto text-xs">
                        {pinnedMessages.length}
                      </Badge>
                    )}
                  </div>
                  {pinnedMessages.length > 0 ? (
                    <div className="space-y-2">
                      {pinnedMessages.slice(0, 5).map((pin) => (
                        <div key={pin.id} className="rounded-md border border-border/50 bg-muted/30 p-2">
                          <p className="text-xs line-clamp-3 whitespace-pre-wrap">
                            {pin.message.body}
                          </p>
                          <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            <span>
                              {new Date(pin.createdAt).toLocaleDateString()}
                            </span>
                            <span>by {pin.pinnedBy?.name || pin.pinnedBy?.email || "Unknown"}</span>
                          </div>
                        </div>
                      ))}
                      {pinnedMessages.length > 5 && (
                        <p className="text-xs text-muted-foreground text-center py-1">
                          +{pinnedMessages.length - 5} more pinned
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="p-3 rounded-md bg-muted/50 text-center">
                      <p className="text-xs text-muted-foreground">
                        No pinned messages
                      </p>
                    </div>
                  )}
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Shared Files</span>
                    {sharedFiles.length > 0 && (
                      <Badge variant="outline" className="ml-auto text-xs">
                        {sharedFiles.length}
                      </Badge>
                    )}
                  </div>
                  <SharedFilesList files={sharedFiles} />
                </div>
              </div>
            )}

            {selectedDm && otherMember && (
              <div className="p-4 space-y-6">
                <div className="flex flex-col items-center text-center space-y-3">
                  <div className="relative">
                    <Avatar className="h-20 w-20">
                      {otherMember.avatarUrl && (
                        <AvatarImage src={getStorageUrl(otherMember.avatarUrl)} />
                      )}
                      <AvatarFallback className="text-xl">
                        {getInitials(otherMember.name || otherMember.email)}
                      </AvatarFallback>
                    </Avatar>
                    <AvatarPresenceIndicator userId={otherMember.id} avatarSize={80} size="lg" />
                  </div>
                  <div>
                    <h3 className="font-semibold">
                      {otherMember.name || "Unknown User"}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {otherMember.email}
                    </p>
                  </div>
                </div>

                <Separator />

                <div className="bg-muted/30 rounded-lg p-3 border border-border/50 mx-4">
                  <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Quick Actions</h3>
                  <div className="space-y-1">
                    <Button
                      variant="ghost"
                      className="w-full justify-start h-8 text-xs px-2"
                      asChild
                    >
                      <Link
                        href={otherMemberProfilePath ?? "/reports"}
                        data-testid="button-view-profile"
                      >
                        <User className="h-3 w-3 mr-2" />
                        View Profile
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full justify-start h-8 text-xs px-2"
                      asChild
                    >
                      <a
                        href={`mailto:${otherMember.email}`}
                        data-testid="button-send-email"
                      >
                        <Mail className="h-3 w-3 mr-2" />
                        Send Email
                      </a>
                    </Button>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    Conversation
                  </p>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>
                      Started:{" "}
                      {new Date(selectedDm.createdAt).toLocaleDateString()}
                    </p>
                    <p>Participants: {selectedDm.members.length}</p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Shared Files</span>
                    {sharedFiles.length > 0 && (
                      <Badge variant="outline" className="ml-auto text-xs">
                        {sharedFiles.length}
                      </Badge>
                    )}
                  </div>
                  <SharedFilesList files={sharedFiles} />
                </div>
              </div>
            )}
          </ScrollArea>
        </>
      )}
    </div>
  );
}

function SharedFilesList({ files }: { files: SharedFile[] }) {
  if (files.length === 0) {
    return (
      <div className="p-3 rounded-md bg-muted/50 text-center">
        <p className="text-xs text-muted-foreground">No shared files</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {files.slice(0, 8).map((file) => (
        <a
          key={file.id}
          href={file.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 p-2 hover:bg-muted/60 transition-colors"
          data-testid={`shared-file-${file.id}`}
        >
          <div className="h-8 w-8 rounded-md bg-background flex items-center justify-center flex-shrink-0">
            <FileText className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium truncate">{file.fileName}</p>
            <p className="text-[10px] text-muted-foreground truncate">
              {formatFileSize(file.sizeBytes)} - {file.authorName || "Unknown"}
            </p>
          </div>
          <Download className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        </a>
      ))}
      {files.length > 8 && (
        <p className="text-xs text-muted-foreground text-center py-1">
          +{files.length - 8} more files
        </p>
      )}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
