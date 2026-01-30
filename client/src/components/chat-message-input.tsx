import { useState, useRef, forwardRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Smile } from "lucide-react";
import EmojiPicker, { Theme, EmojiClickData } from "emoji-picker-react";
import { useTheme } from "@/lib/theme-provider";

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
    const { theme } = useTheme();
    const [emojiOpen, setEmojiOpen] = useState(false);
    const internalRef = useRef<HTMLTextAreaElement>(null);
    const textareaRef = (ref as React.RefObject<HTMLTextAreaElement>) || internalRef;

    const handleEmojiClick = (emojiData: EmojiClickData) => {
      const textarea = textareaRef.current;
      if (!textarea) {
        onChange(value + emojiData.emoji);
        setEmojiOpen(false);
        return;
      }

      const start = textarea.selectionStart || 0;
      const end = textarea.selectionEnd || 0;
      const newValue = value.slice(0, start) + emojiData.emoji + value.slice(end);
      onChange(newValue);
      setEmojiOpen(false);
      
      setTimeout(() => {
        textarea.focus();
        const newPos = start + emojiData.emoji.length;
        textarea.setSelectionRange(newPos, newPos);
      }, 0);
    };

    return (
      <div className="flex flex-col border rounded-md bg-background overflow-hidden">
        <div className="flex items-center gap-1 px-2 py-1.5 border-b bg-muted/30">
          <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={disabled}
                aria-label="Insert emoji"
                data-testid="button-emoji-chat"
              >
                <Smile className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent 
              side="top" 
              align="start" 
              className="w-auto p-0 border-0"
              sideOffset={8}
            >
              <EmojiPicker
                onEmojiClick={handleEmojiClick}
                theme={theme === "dark" ? Theme.DARK : Theme.LIGHT}
                width={300}
                height={350}
                searchPlaceHolder="Search emoji..."
                previewConfig={{ showPreview: false }}
              />
            </PopoverContent>
          </Popover>
        </div>
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={`resize-none min-h-[80px] max-h-[200px] border-0 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none ${className || ""}`}
          data-testid={dataTestId}
        />
      </div>
    );
  }
);

ChatMessageInput.displayName = "ChatMessageInput";
