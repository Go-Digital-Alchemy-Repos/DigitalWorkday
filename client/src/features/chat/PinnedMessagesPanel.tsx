import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Pin, X } from "lucide-react";

interface PinnedMessage {
  id: string;
  messageId: string;
  channelId: string;
  pinnedByUserId: string;
  pinnedAt: string;
  message?: {
    id: string;
    body: string;
    authorId: string;
    authorName?: string;
    authorAvatarUrl?: string | null;
    createdAt: string;
  };
}

interface PinnedMessagesPanelProps {
  pinnedMessages: PinnedMessage[];
  onClose: () => void;
  onUnpin?: (messageId: string) => void;
  canUnpin?: boolean;
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

function formatPinDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function PinnedMessagesPanel({
  pinnedMessages,
  onClose,
  onUnpin,
  canUnpin = false,
  renderMessageBody,
}: PinnedMessagesPanelProps) {
  return (
    <div className="border-b bg-card" data-testid="pinned-messages-panel">
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Pin className="h-4 w-4" />
          <span>Pinned Messages ({pinnedMessages.length})</span>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={onClose}
          data-testid="button-close-pins-panel"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {pinnedMessages.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground text-center">
            No pinned messages yet
          </div>
        ) : (
          <div className="divide-y">
            {pinnedMessages.map((pin) => (
              <div
                key={pin.id}
                className="px-4 py-3 hover-elevate"
                data-testid={`pinned-message-${pin.messageId}`}
              >
                <div className="flex items-start gap-2">
                  <Avatar className="h-6 w-6 flex-shrink-0 mt-0.5">
                    {pin.message?.authorAvatarUrl && (
                      <AvatarImage src={pin.message.authorAvatarUrl} />
                    )}
                    <AvatarFallback className="text-[10px]">
                      {getInitials(pin.message?.authorName || "?")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">
                        {pin.message?.authorName || "Unknown"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {pin.message?.createdAt ? formatPinDate(pin.message.createdAt) : ""}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                      {renderMessageBody && pin.message?.body
                        ? renderMessageBody(pin.message.body)
                        : pin.message?.body || "Message unavailable"}
                    </div>
                  </div>
                  {canUnpin && onUnpin && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => onUnpin(pin.messageId)}
                      className="flex-shrink-0"
                      title="Unpin message"
                      data-testid={`button-unpin-${pin.messageId}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
