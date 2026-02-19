import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";

export function ChatContextPanelToggle({
  onClick,
  isOpen,
}: {
  onClick: () => void;
  isOpen: boolean;
}) {
  if (isOpen) return null;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-label="Show details panel"
      title="Show details"
      data-testid="button-open-context-panel"
    >
      <ChevronLeft className="h-4 w-4" />
    </Button>
  );
}
