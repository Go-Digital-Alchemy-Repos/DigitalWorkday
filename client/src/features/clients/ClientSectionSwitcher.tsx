import { useRef, useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { ClientProfileSection } from "./clientProfileSections";

interface ClientSectionSwitcherProps {
  sections: ClientProfileSection[];
  activeSection: string;
  onSectionChange: (sectionId: string) => void;
  badgeCounts?: Record<string, number>;
}

export function ClientSectionSwitcher({
  sections,
  activeSection,
  onSectionChange,
  badgeCounts,
}: ClientSectionSwitcherProps) {
  return (
    <div data-testid="section-switcher">
      <div className="hidden lg:block">
        <ScrollableTabs
          sections={sections}
          activeSection={activeSection}
          onSectionChange={onSectionChange}
          badgeCounts={badgeCounts}
        />
      </div>
      <div className="hidden md:block lg:hidden">
        <PrimaryPlusMore
          sections={sections}
          activeSection={activeSection}
          onSectionChange={onSectionChange}
          badgeCounts={badgeCounts}
        />
      </div>
      <div className="block md:hidden">
        <MobileSelector
          sections={sections}
          activeSection={activeSection}
          onSectionChange={onSectionChange}
          badgeCounts={badgeCounts}
        />
      </div>
    </div>
  );
}

function ScrollableTabs({
  sections,
  activeSection,
  onSectionChange,
  badgeCounts,
}: ClientSectionSwitcherProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkScroll, { passive: true });
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      ro.disconnect();
    };
  }, [checkScroll, sections]);

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -200 : 200, behavior: "smooth" });
  };

  return (
    <div className="relative flex items-center">
      {canScrollLeft && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute left-0 z-10 h-8 w-8 bg-background/80 backdrop-blur-sm shadow-sm"
          onClick={() => scroll("left")}
          data-testid="button-scroll-tabs-left"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      )}
      <div
        ref={scrollRef}
        className="flex items-center gap-1 overflow-x-auto scrollbar-hide px-1"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {sections.map((section) => {
          const Icon = section.icon;
          const isActive = activeSection === section.id;
          const count = badgeCounts?.[section.id];
          return (
            <button
              key={section.id}
              onClick={() => onSectionChange(section.id)}
              data-testid={section.testId}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-medium rounded-md transition-colors shrink-0",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {section.label}
              {count !== undefined && (
                <span className="text-xs text-muted-foreground ml-0.5">({count})</span>
              )}
              {section.badgeText && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-0.5">
                  {section.badgeText}
                </Badge>
              )}
            </button>
          );
        })}
      </div>
      {canScrollRight && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-0 z-10 h-8 w-8 bg-background/80 backdrop-blur-sm shadow-sm"
          onClick={() => scroll("right")}
          data-testid="button-scroll-tabs-right"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

function PrimaryPlusMore({
  sections,
  activeSection,
  onSectionChange,
  badgeCounts,
}: ClientSectionSwitcherProps) {
  const primarySections = sections.filter((s) => s.primary);
  const overflowSections = sections.filter((s) => !s.primary);
  const activeOverflow = overflowSections.find((s) => s.id === activeSection);

  return (
    <div className="flex items-center gap-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
      {primarySections.map((section) => {
        const Icon = section.icon;
        const isActive = activeSection === section.id;
        const count = badgeCounts?.[section.id];
        return (
          <button
            key={section.id}
            onClick={() => onSectionChange(section.id)}
            data-testid={section.testId}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-medium rounded-md transition-colors shrink-0",
              isActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {section.label}
            {count !== undefined && (
              <span className="text-xs text-muted-foreground ml-0.5">({count})</span>
            )}
          </button>
        );
      })}

      {overflowSections.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-medium rounded-md transition-colors shrink-0",
                activeOverflow
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
              data-testid="button-more-sections"
            >
              {activeOverflow ? (
                <>
                  <activeOverflow.icon className="h-3.5 w-3.5" />
                  {activeOverflow.label}
                </>
              ) : (
                "More"
              )}
              <ChevronDown className="h-3.5 w-3.5 ml-0.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {overflowSections.map((section) => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;
              return (
                <DropdownMenuItem
                  key={section.id}
                  onClick={() => onSectionChange(section.id)}
                  className={cn(isActive && "bg-primary/5 text-primary")}
                  data-testid={`menu-item-${section.id}`}
                >
                  <Icon className="h-4 w-4 mr-2" />
                  {section.label}
                  {section.badgeText && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-auto">
                      {section.badgeText}
                    </Badge>
                  )}
                  {isActive && <Check className="h-3.5 w-3.5 ml-auto" />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function MobileSelector({
  sections,
  activeSection,
  onSectionChange,
}: ClientSectionSwitcherProps) {
  const [open, setOpen] = useState(false);
  const current = sections.find((s) => s.id === activeSection) || sections[0];
  const CurrentIcon = current.icon;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between"
          data-testid="button-mobile-section-selector"
        >
          <span className="flex items-center gap-2">
            <CurrentIcon className="h-4 w-4" />
            {current.label}
          </span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandList>
            <CommandGroup>
              {sections.map((section) => {
                const Icon = section.icon;
                const isActive = activeSection === section.id;
                return (
                  <CommandItem
                    key={section.id}
                    value={section.id}
                    onSelect={() => {
                      onSectionChange(section.id);
                      setOpen(false);
                    }}
                    data-testid={`mobile-section-${section.id}`}
                  >
                    <Icon className="h-4 w-4 mr-2" />
                    {section.label}
                    {section.badgeText && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
                        {section.badgeText}
                      </Badge>
                    )}
                    {isActive && <Check className="h-3.5 w-3.5 ml-auto" />}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
