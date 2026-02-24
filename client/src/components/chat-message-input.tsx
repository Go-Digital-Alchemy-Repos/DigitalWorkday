import { useRef, useCallback, forwardRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { LazyEmojiPicker } from "@/components/lazy-emoji-picker";
import { Button } from "@/components/ui/button";
import { Bold, Italic, List, ListOrdered, Paperclip, Loader2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ChatMessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
  onAttachClick?: () => void;
  isUploading?: boolean;
  attachDisabled?: boolean;
}

export const ChatMessageInput = forwardRef<HTMLTextAreaElement, ChatMessageInputProps>(
  ({ value, onChange, onKeyDown, placeholder, disabled, className, "data-testid": dataTestId, onAttachClick, isUploading, attachDisabled }, ref) => {
    const internalRef = useRef<HTMLTextAreaElement>(null);
    const textareaRef = (ref as React.RefObject<HTMLTextAreaElement>) || internalRef;

    const handleEmojiSelect = (emoji: string) => {
      const textarea = textareaRef.current;
      if (!textarea) {
        onChange(value + emoji);
        return;
      }

      const start = textarea.selectionStart || 0;
      const end = textarea.selectionEnd || 0;
      const newValue = value.slice(0, start) + emoji + value.slice(end);
      onChange(newValue);

      setTimeout(() => {
        textarea.focus();
        const newPos = start + emoji.length;
        textarea.setSelectionRange(newPos, newPos);
      }, 0);
    };

    const wrapSelection = useCallback((before: string, after: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart || 0;
      const end = textarea.selectionEnd || 0;
      const selected = value.slice(start, end);

      if (selected) {
        const alreadyWrapped = value.slice(start - before.length, start) === before && value.slice(end, end + after.length) === after;
        if (alreadyWrapped) {
          const newValue = value.slice(0, start - before.length) + selected + value.slice(end + after.length);
          onChange(newValue);
          setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start - before.length, end - before.length);
          }, 0);
        } else {
          const newValue = value.slice(0, start) + before + selected + after + value.slice(end);
          onChange(newValue);
          setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + before.length, end + before.length);
          }, 0);
        }
      } else {
        const newValue = value.slice(0, start) + before + after + value.slice(end);
        onChange(newValue);
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(start + before.length, start + before.length);
        }, 0);
      }
    }, [value, onChange, textareaRef]);

    const insertListPrefix = useCallback((prefix: string, numbered: boolean) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart || 0;
      const end = textarea.selectionEnd || 0;
      const selected = value.slice(start, end);

      if (selected) {
        const lines = selected.split("\n");
        const formatted = lines.map((line, i) => {
          const trimmed = line.replace(/^(\d+\.\s|- )/, "");
          return numbered ? `${i + 1}. ${trimmed}` : `- ${trimmed}`;
        }).join("\n");
        const newValue = value.slice(0, start) + formatted + value.slice(end);
        onChange(newValue);
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(start, start + formatted.length);
        }, 0);
      } else {
        const lineStart = value.lastIndexOf("\n", start - 1) + 1;
        const currentLine = value.slice(lineStart, start);
        if (currentLine.trim() === "") {
          const insert = numbered ? "1. " : "- ";
          const newValue = value.slice(0, start) + insert + value.slice(end);
          onChange(newValue);
          setTimeout(() => {
            textarea.focus();
            const newPos = start + insert.length;
            textarea.setSelectionRange(newPos, newPos);
          }, 0);
        } else {
          const insert = numbered ? "\n1. " : "\n- ";
          const newValue = value.slice(0, start) + insert + value.slice(end);
          onChange(newValue);
          setTimeout(() => {
            textarea.focus();
            const newPos = start + insert.length;
            textarea.setSelectionRange(newPos, newPos);
          }, 0);
        }
      }
    }, [value, onChange, textareaRef]);

    return (
      <div className="flex flex-col border rounded-md bg-background focus-within:ring-1 focus-within:ring-ring transition-shadow">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={`resize-none min-h-[68px] max-h-[180px] border-0 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-b-none text-sm ${className || ""}`}
          data-testid={dataTestId}
        />
        <div className="flex items-center gap-0.5 px-1.5 py-1 border-t border-border/50">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => wrapSelection("**", "**")}
                disabled={disabled}
                data-testid="button-format-bold"
              >
                <Bold className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top"><p>Bold</p></TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => wrapSelection("_", "_")}
                disabled={disabled}
                data-testid="button-format-italic"
              >
                <Italic className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top"><p>Italic</p></TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => insertListPrefix("- ", false)}
                disabled={disabled}
                data-testid="button-format-bullet"
              >
                <List className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top"><p>Bullet list</p></TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => insertListPrefix("1. ", true)}
                disabled={disabled}
                data-testid="button-format-numbered"
              >
                <ListOrdered className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top"><p>Numbered list</p></TooltipContent>
          </Tooltip>

          <div className="w-px h-4 bg-border/60 mx-0.5" />

          <LazyEmojiPicker
            onEmojiSelect={handleEmojiSelect}
            disabled={disabled}
            data-testid="button-emoji-chat"
          />
          {onAttachClick && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={onAttachClick}
                  disabled={disabled || attachDisabled}
                  data-testid="button-attach-file"
                >
                  {isUploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Paperclip className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top"><p>Attach file</p></TooltipContent>
            </Tooltip>
          )}
          <span className="flex-1" />
          <span className="text-[10px] text-muted-foreground mr-1 select-none" data-testid="text-composer-hint">
            / for commands &middot; Enter to send
          </span>
        </div>
      </div>
    );
  }
);

ChatMessageInput.displayName = "ChatMessageInput";
