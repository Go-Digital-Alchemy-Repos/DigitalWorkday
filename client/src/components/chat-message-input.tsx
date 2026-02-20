import { useRef, forwardRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { LazyEmojiPicker } from "@/components/lazy-emoji-picker";

interface ChatMessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
}

export const ChatMessageInput = forwardRef<HTMLTextAreaElement, ChatMessageInputProps>(
  ({ value, onChange, onKeyDown, placeholder, disabled, className, "data-testid": dataTestId }, ref) => {
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
          <LazyEmojiPicker
            onEmojiSelect={handleEmojiSelect}
            disabled={disabled}
            data-testid="button-emoji-chat"
          />
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
