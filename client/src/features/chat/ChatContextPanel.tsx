import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Users, Settings, FileText, Link2 } from "lucide-react";
import type { SelectedConversation } from "./ChatLayout";

interface ChatContextPanelProps {
  selectedConversation: SelectedConversation | null;
  onClose: () => void;
  className?: string;
}

export function ChatContextPanel({
  selectedConversation,
  onClose,
  className,
}: ChatContextPanelProps) {
  return (
    <div className={cn("flex flex-col bg-background", className)}>
      <div className="p-4 border-b flex items-center justify-between">
        <h3 className="font-semibold">Details</h3>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          data-testid="button-close-context-panel"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {selectedConversation ? (
            <>
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Members
                </h4>
                <p className="text-sm text-muted-foreground">
                  Member list will appear here
                </p>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Shared Files
                </h4>
                <p className="text-sm text-muted-foreground">
                  Shared files will appear here
                </p>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Link2 className="h-4 w-4" />
                  Shared Links
                </h4>
                <p className="text-sm text-muted-foreground">
                  Shared links will appear here
                </p>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Settings
                </h4>
                <p className="text-sm text-muted-foreground">
                  Conversation settings will appear here
                </p>
              </div>
            </>
          ) : (
            <div className="text-center text-muted-foreground py-8">
              <p className="text-sm">Select a conversation to see details</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
