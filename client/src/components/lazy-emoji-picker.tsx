import { lazy, Suspense, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Smile, Loader2 } from "lucide-react";
import { useTheme } from "@/lib/theme-provider";

const EmojiPickerModule = lazy(() =>
  import("emoji-picker-react").then((mod) => ({
    default: mod.default,
  }))
);

interface LazyEmojiPickerProps {
  onEmojiSelect: (emoji: string) => void;
  disabled?: boolean;
  "data-testid"?: string;
}

export function LazyEmojiPicker({ onEmojiSelect, disabled, "data-testid": testId }: LazyEmojiPickerProps) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen && !hasOpened) {
      setHasOpened(true);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          disabled={disabled}
          aria-label="Insert emoji"
          data-testid={testId || "button-emoji"}
        >
          <Smile className="h-4 w-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-auto p-0 border-0"
        sideOffset={8}
      >
        {hasOpened && (
          <Suspense
            fallback={
              <div className="flex items-center justify-center" style={{ width: 300, height: 350 }}>
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <EmojiPickerModule
              onEmojiClick={(emojiData: any) => {
                onEmojiSelect(emojiData.emoji);
                setOpen(false);
              }}
              theme={theme === "dark" ? 1 : 0}
              width={300}
              height={350}
              searchPlaceHolder="Search emoji..."
              previewConfig={{ showPreview: false }}
            />
          </Suspense>
        )}
      </PopoverContent>
    </Popover>
  );
}
