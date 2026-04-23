import { Moon, Sun, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/lib/theme-provider";
import { cn } from "@/lib/utils";
interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { resolvedTheme, packId, setPackId } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(className)}
          data-testid="button-theme-toggle"
          aria-label="Toggle theme"
        >
          {resolvedTheme === "light" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem
          onClick={() => setPackId("light")}
          data-testid="theme-pack-light"
          className="flex items-center gap-2"
        >
          <Sun className="h-3.5 w-3.5" />
          <span className="flex-1">Light</span>
          {packId === "light" && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setPackId("dark")}
          data-testid="theme-pack-dark"
          className="flex items-center gap-2"
        >
          <Moon className="h-3.5 w-3.5" />
          <span className="flex-1">Dark</span>
          {packId === "dark" && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
