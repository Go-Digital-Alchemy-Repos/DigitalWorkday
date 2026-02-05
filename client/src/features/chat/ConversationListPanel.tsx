import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Plus, Hash, MessageCircle } from "lucide-react";
import type { SelectedConversation, ConversationType } from "./ChatLayout";

interface ConversationListPanelProps {
  selectedConversation: SelectedConversation | null;
  onSelectConversation: (type: ConversationType, id: string) => void;
  className?: string;
}

export function ConversationListPanel({
  selectedConversation,
  onSelectConversation,
  className,
}: ConversationListPanelProps) {
  return (
    <div className={cn("flex flex-col bg-sidebar", className)}>
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Messages</h2>
          <Button variant="ghost" size="icon" data-testid="button-new-conversation">
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          <div className="mb-4">
            <div className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Channels
            </div>
            <div className="text-sm text-muted-foreground px-2 py-4 text-center">
              <Hash className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Channels will appear here</p>
            </div>
          </div>

          <div>
            <div className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Direct Messages
            </div>
            <div className="text-sm text-muted-foreground px-2 py-4 text-center">
              <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>DMs will appear here</p>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
