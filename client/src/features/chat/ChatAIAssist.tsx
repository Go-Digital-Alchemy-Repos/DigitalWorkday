import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles, MessageSquareText, FileText, ListTodo, PenLine, Loader2, Copy, Check, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ChatAIAssistProps {
  channelId?: string | null;
  dmThreadId?: string | null;
  threadParentMessageId?: string | null;
  onInsertDraft?: (text: string) => void;
}

export function ChatAIAssist({
  channelId,
  dmThreadId,
  threadParentMessageId,
  onInsertDraft,
}: ChatAIAssistProps) {
  const { toast } = useToast();
  const [summaryDialogOpen, setSummaryDialogOpen] = useState(false);
  const [summaryType, setSummaryType] = useState<"channel" | "thread">("channel");
  const [draftDialogOpen, setDraftDialogOpen] = useState(false);
  const [draftTone, setDraftTone] = useState<"professional" | "casual" | "friendly" | "concise">("professional");
  const [copied, setCopied] = useState(false);

  const aiStatusQuery = useQuery<{ aiChatEnabled: boolean; aiAvailable: boolean; ready: boolean }>({
    queryKey: ["/api/v1/chat/ai/status"],
    staleTime: 60000,
  });

  const summarizeMutation = useMutation({
    mutationFn: async (params: { type: "channel" | "thread" }) => {
      const url = params.type === "channel"
        ? "/api/v1/chat/ai/summarize-channel"
        : "/api/v1/chat/ai/summarize-thread";

      const body: Record<string, unknown> = {};
      if (params.type === "channel") {
        body.channelId = channelId;
        body.messageCount = 50;
      } else {
        if (channelId) body.channelId = channelId;
        if (dmThreadId) body.dmThreadId = dmThreadId;
        body.parentMessageId = threadParentMessageId;
      }

      const res = await apiRequest("POST", url, body);
      return res.json();
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "AI Summary Failed",
        description: err.message,
      });
    },
  });

  const draftReplyMutation = useMutation({
    mutationFn: async (params: { tone: string }) => {
      const body: Record<string, unknown> = {
        tone: params.tone,
        contextMessageCount: 20,
      };
      if (channelId) body.channelId = channelId;
      if (dmThreadId) body.dmThreadId = dmThreadId;
      if (threadParentMessageId) body.parentMessageId = threadParentMessageId;

      const res = await apiRequest("POST", "/api/v1/chat/ai/draft-reply", body);
      return res.json();
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Draft Reply Failed",
        description: err.message,
      });
    },
  });

  const handleSummarize = useCallback((type: "channel" | "thread") => {
    setSummaryType(type);
    setSummaryDialogOpen(true);
    summarizeMutation.mutate({ type });
  }, [summarizeMutation]);

  const handleDraftReply = useCallback(() => {
    setDraftDialogOpen(true);
    draftReplyMutation.mutate({ tone: draftTone });
  }, [draftReplyMutation, draftTone]);

  const handleRegenerateDraft = useCallback(() => {
    draftReplyMutation.mutate({ tone: draftTone });
  }, [draftReplyMutation, draftTone]);

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const handleInsertDraft = useCallback(() => {
    if (draftReplyMutation.data?.draft && onInsertDraft) {
      onInsertDraft(draftReplyMutation.data.draft);
      setDraftDialogOpen(false);
      toast({ title: "Draft inserted into message input" });
    }
  }, [draftReplyMutation.data, onInsertDraft, toast]);

  if (!aiStatusQuery.data?.ready) return null;

  const hasThread = !!threadParentMessageId;
  const hasConversation = !!channelId || !!dmThreadId;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1"
            data-testid="button-chat-ai-assist"
          >
            <Sparkles className="h-4 w-4" />
            <span className="text-xs">AI</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {channelId && (
            <DropdownMenuItem
              onClick={() => handleSummarize("channel")}
              data-testid="menu-ai-summarize-channel"
            >
              <FileText className="h-4 w-4 mr-2" />
              Summarize Channel
            </DropdownMenuItem>
          )}
          {hasThread && (
            <DropdownMenuItem
              onClick={() => handleSummarize("thread")}
              data-testid="menu-ai-summarize-thread"
            >
              <MessageSquareText className="h-4 w-4 mr-2" />
              Summarize Thread
            </DropdownMenuItem>
          )}
          {(channelId || hasThread) && <DropdownMenuSeparator />}
          {hasConversation && (
            <DropdownMenuItem
              onClick={handleDraftReply}
              data-testid="menu-ai-draft-reply"
            >
              <PenLine className="h-4 w-4 mr-2" />
              Draft Reply
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={summaryDialogOpen} onOpenChange={setSummaryDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              {summaryType === "channel" ? "Channel Summary" : "Thread Summary"}
            </DialogTitle>
            <DialogDescription>
              AI-generated summary of {summaryType === "channel" ? "recent channel messages" : "this thread"}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {summarizeMutation.isPending ? (
              <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground" data-testid="ai-summary-loading">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Generating summary...</span>
              </div>
            ) : summarizeMutation.isError ? (
              <div className="text-destructive py-4 text-sm" data-testid="ai-summary-error">
                Failed to generate summary. Please try again.
              </div>
            ) : summarizeMutation.data ? (
              <div data-testid="ai-summary-content">
                <ScrollArea className="max-h-[400px]">
                  <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm leading-relaxed">
                    {summarizeMutation.data.summary}
                  </div>
                </ScrollArea>
                {summarizeMutation.data.messageCount > 0 && (
                  <p className="text-xs text-muted-foreground mt-3">
                    Based on {summarizeMutation.data.messageCount} messages
                  </p>
                )}
              </div>
            ) : null}
          </div>
          <DialogFooter className="gap-2">
            {summarizeMutation.data && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy(summarizeMutation.data.summary)}
                data-testid="button-copy-summary"
              >
                {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSummaryDialogOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={draftDialogOpen} onOpenChange={setDraftDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PenLine className="h-4 w-4" />
              Draft Reply
            </DialogTitle>
            <DialogDescription>
              AI-generated reply suggestion
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Tone:</span>
              <Select value={draftTone} onValueChange={(v) => setDraftTone(v as typeof draftTone)}>
                <SelectTrigger className="w-[160px]" data-testid="select-draft-tone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="casual">Casual</SelectItem>
                  <SelectItem value="friendly">Friendly</SelectItem>
                  <SelectItem value="concise">Concise</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRegenerateDraft}
                disabled={draftReplyMutation.isPending}
                data-testid="button-regenerate-draft"
              >
                Regenerate
              </Button>
            </div>

            {draftReplyMutation.isPending ? (
              <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground" data-testid="ai-draft-loading">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Drafting reply...</span>
              </div>
            ) : draftReplyMutation.isError ? (
              <div className="text-destructive py-4 text-sm" data-testid="ai-draft-error">
                Failed to generate draft. Please try again.
              </div>
            ) : draftReplyMutation.data ? (
              <div
                className="p-3 rounded-md bg-muted text-sm leading-relaxed"
                data-testid="ai-draft-content"
              >
                {draftReplyMutation.data.draft}
              </div>
            ) : null}
          </div>
          <DialogFooter className="gap-2">
            {draftReplyMutation.data && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(draftReplyMutation.data.draft)}
                  data-testid="button-copy-draft"
                >
                  {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
                {onInsertDraft && (
                  <Button
                    size="sm"
                    onClick={handleInsertDraft}
                    data-testid="button-insert-draft"
                  >
                    <ArrowRight className="h-4 w-4 mr-1" />
                    Insert into Message
                  </Button>
                )}
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDraftDialogOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface ConvertToTaskButtonProps {
  messageId: string;
  messageBody: string;
  channelId?: string | null;
  dmThreadId?: string | null;
  onConverted?: (task: { id: string; title: string }) => void;
}

export function ConvertToTaskAction({
  messageId,
  messageBody,
  channelId,
  dmThreadId,
  onConverted,
}: ConvertToTaskButtonProps) {
  const { toast } = useToast();

  const aiStatusQuery = useQuery<{ aiChatEnabled: boolean; aiAvailable: boolean; ready: boolean }>({
    queryKey: ["/api/v1/chat/ai/status"],
    staleTime: 60000,
  });

  const convertMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { messageId };
      if (channelId) body.channelId = channelId;
      if (dmThreadId) body.dmThreadId = dmThreadId;

      const res = await apiRequest("POST", "/api/v1/chat/ai/convert-to-task", body);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Task Created",
        description: `"${data.task.title}" has been created`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      onConverted?.(data.task);
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Convert to Task Failed",
        description: err.message,
      });
    },
  });

  if (!aiStatusQuery.data?.ready) return null;

  return (
    <DropdownMenuItem
      onClick={() => convertMutation.mutate()}
      disabled={convertMutation.isPending}
      data-testid={`menu-convert-to-task-${messageId}`}
    >
      {convertMutation.isPending ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <ListTodo className="h-4 w-4 mr-2" />
      )}
      Convert to Task
    </DropdownMenuItem>
  );
}
