import { Moon, Sun, Palette, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/lib/theme-provider";
import { cn } from "@/lib/utils";
import { type ThemePack } from "@/theme/themePacks";

interface ThemeToggleProps {
  className?: string;
}

function PackSwatch({ pack }: { pack: ThemePack }) {
  const bg = pack.tokens["--background"];
  const primary = pack.tokens["--primary"];
  const sidebar = pack.tokens["--sidebar"];

  return (
    <div className="flex gap-0.5 rounded-sm overflow-hidden border border-border/50" style={{ width: 28, height: 16 }}>
      <div style={{ backgroundColor: `hsl(${sidebar})`, flex: 1 }} />
      <div className="flex flex-col flex-[2]">
        <div style={{ backgroundColor: `hsl(${bg})`, flex: 1 }} />
        <div style={{ backgroundColor: `hsl(${primary})`, flex: 0.4 }} />
      </div>
    </div>
  );
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { resolvedTheme, packId, setPackId, availablePacks } = useTheme();

  const lightPacks = availablePacks.filter((p) => p.kind === "light");
  const darkPacks = availablePacks.filter((p) => p.kind === "dark");

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
      <DropdownMenuContent align="end" className="w-52 max-h-80 overflow-y-auto">
        <DropdownMenuLabel className="flex items-center gap-2 text-xs">
          <Sun className="h-3.5 w-3.5" />
          Light Themes
        </DropdownMenuLabel>
        {lightPacks.map((pack) => (
          <DropdownMenuItem
            key={pack.id}
            onClick={() => setPackId(pack.id)}
            data-testid={`theme-pack-${pack.id}`}
            className="flex items-center gap-2"
          >
            <PackSwatch pack={pack} />
            <span className="flex-1 truncate">{pack.name}</span>
            {packId === pack.id && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="flex items-center gap-2 text-xs">
          <Moon className="h-3.5 w-3.5" />
          Dark Themes
        </DropdownMenuLabel>
        {darkPacks.map((pack) => (
          <DropdownMenuItem
            key={pack.id}
            onClick={() => setPackId(pack.id)}
            data-testid={`theme-pack-${pack.id}`}
            className="flex items-center gap-2"
          >
            <PackSwatch pack={pack} />
            <span className="flex-1 truncate">{pack.name}</span>
            {packId === pack.id && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
