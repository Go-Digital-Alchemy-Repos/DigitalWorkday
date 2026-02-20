import { useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { type SlashCommand } from "./slashCommands";

interface SlashCommandDropdownProps {
  commands: SlashCommand[];
  selectedIndex: number;
  onSelect: (command: SlashCommand) => void;
  onHover: (index: number) => void;
  visible: boolean;
}

export function SlashCommandDropdown({
  commands,
  selectedIndex,
  onSelect,
  onHover,
  visible,
}: SlashCommandDropdownProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current && selectedIndex >= 0) {
      const item = listRef.current.children[selectedIndex + 1] as HTMLElement;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (!visible || commands.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 w-80 mb-1 bg-popover border rounded-md shadow-lg z-50 max-h-64 overflow-y-auto py-1"
      data-testid="slash-command-dropdown"
    >
      <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
        Commands
      </div>
      {commands.map((cmd, idx) => {
        const Icon = cmd.icon;
        return (
          <button
            key={cmd.name}
            type="button"
            onClick={() => onSelect(cmd)}
            onMouseEnter={() => onHover(idx)}
            className={`w-full px-3 py-2 text-left text-sm flex items-start gap-2.5 transition-colors ${
              idx === selectedIndex
                ? "bg-accent text-accent-foreground"
                : "hover-elevate"
            }`}
            data-testid={`slash-command-${cmd.name}`}
          >
            <div className="flex-shrink-0 mt-0.5">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">/{cmd.name}</span>
                <Badge variant="secondary" className="text-[10px]">
                  {cmd.category}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {cmd.description}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
