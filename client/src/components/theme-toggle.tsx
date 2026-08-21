import { BookOpen, Check, ListChecks, Moon, Orbit, Sun, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/lib/theme-provider";
import { cn } from "@/lib/utils";
import type { PrimaryThemePackId } from "@/theme/themePacks";

const THEME_ICONS: Record<PrimaryThemePackId, LucideIcon> = {
  light: Sun,
  dark: Moon,
  anthropic: BookOpen,
  huly: Orbit,
  asana: ListChecks,
};

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { availablePacks, packId, setPackId } = useTheme();
  const ActiveThemeIcon = THEME_ICONS[packId];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(className)}
          data-testid="button-theme-toggle"
          aria-label="Choose theme"
        >
          <ActiveThemeIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {availablePacks.map((pack) => {
          const ThemeIcon = THEME_ICONS[pack.id];
          return (
            <DropdownMenuItem
              key={pack.id}
              onClick={() => setPackId(pack.id)}
              data-testid={`theme-pack-${pack.id}`}
              className="flex items-center gap-2"
            >
              <ThemeIcon className="h-3.5 w-3.5" />
              <span className="flex-1">{pack.name}</span>
              {packId === pack.id && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
