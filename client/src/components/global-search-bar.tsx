import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Search, X, Building2, FolderKanban, CheckSquare, Users, UserCircle, MessageSquare, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDebounce } from "@/hooks/use-debounce";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface SearchResults {
  clients: Array<{ id: string; name: string; type: string }>;
  projects: Array<{ id: string; name: string; type: string; status: string }>;
  tasks: Array<{ id: string; name: string; type: string; projectId: string; status: string }>;
  users: Array<{ id: string; name: string; email: string; type: string; role: string }>;
  teams: Array<{ id: string; name: string; type: string }>;
  comments: Array<{ id: string; name: string; type: string; taskId: string; projectId: string | null }>;
}

const categoryConfig = [
  { key: "clients" as const, label: "Clients", icon: Building2, color: "text-blue-500" },
  { key: "projects" as const, label: "Projects", icon: FolderKanban, color: "text-emerald-500" },
  { key: "tasks" as const, label: "Tasks", icon: CheckSquare, color: "text-violet-500" },
  { key: "users" as const, label: "People", icon: UserCircle, color: "text-amber-500" },
  { key: "teams" as const, label: "Teams", icon: Users, color: "text-cyan-500" },
  { key: "comments" as const, label: "Comments", icon: MessageSquare, color: "text-orange-500" },
];

export function GlobalSearchBar() {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const debouncedSearch = useDebounce(search, 250);
  const [, setLocation] = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

  const { data: results, isLoading } = useQuery<SearchResults>({
    queryKey: ["/api/search", { q: debouncedSearch, limit: "8" }],
    enabled: debouncedSearch.length >= 2,
  });

  const flatResults = useCallback(() => {
    if (!results) return [];
    const items: Array<{ type: string; id: string; name: string; meta?: Record<string, any> }> = [];
    for (const cat of categoryConfig) {
      const arr = results[cat.key];
      if (arr && arr.length > 0) {
        for (const item of arr) {
          items.push({ type: cat.key, id: item.id, name: item.name, meta: item as any });
        }
      }
    }
    return items;
  }, [results]);

  const allItems = flatResults();
  const totalResults = allItems.length;

  const hasResults = totalResults > 0;
  const showDropdown = isOpen && debouncedSearch.length >= 2;

  useEffect(() => {
    setSelectedIndex(-1);
  }, [debouncedSearch]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !isInputFocused())) {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
    }
    function isInputFocused() {
      const active = document.activeElement;
      if (!active) return false;
      const tag = active.tagName.toLowerCase();
      return tag === "input" || tag === "textarea" || (active as HTMLElement).isContentEditable;
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const navigateToResult = useCallback((item: { type: string; id: string; meta?: Record<string, any> }) => {
    setIsOpen(false);
    setSearch("");
    switch (item.type) {
      case "clients":
        setLocation(`/clients/${item.id}`);
        break;
      case "projects":
        setLocation(`/projects/${item.id}`);
        break;
      case "tasks":
        setLocation(`/projects/${item.meta?.projectId}?task=${item.id}`);
        break;
      case "users":
        setLocation(`/reports/employees/${item.id}`);
        break;
      case "teams":
        setLocation(`/teams/${item.id}`);
        break;
      case "comments":
        if (item.meta?.projectId && item.meta?.taskId) {
          setLocation(`/projects/${item.meta.projectId}?task=${item.meta.taskId}`);
        }
        break;
    }
  }, [setLocation]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || !hasResults) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, totalResults - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault();
      navigateToResult(allItems[selectedIndex]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  const getCategoryIcon = (type: string) => {
    const config = categoryConfig.find(c => c.key === type);
    return config ? { Icon: config.icon, color: config.color } : { Icon: Search, color: "text-muted-foreground" };
  };

  let globalIndex = -1;

  return (
    <div ref={containerRef} className={cn("relative", isMobile ? "w-full" : "w-64 lg:w-80")} data-testid="global-search-container">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            if (search.length >= 2) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={isMobile ? "Search..." : "Search everything... (/)"}
          className={cn(
            "pl-8 pr-8 h-8 text-sm bg-muted/50 border-transparent focus:border-border focus:bg-background transition-colors",
            isMobile && "h-9"
          )}
          data-testid="input-global-search"
        />
        {search && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-0.5 top-1/2 -translate-y-1/2 h-6 w-6"
            onClick={() => {
              setSearch("");
              setIsOpen(false);
              inputRef.current?.focus();
            }}
            data-testid="button-clear-global-search"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {showDropdown && (
        <div className={cn(
          "absolute top-full mt-1 bg-popover border border-border rounded-lg shadow-lg z-50 overflow-hidden",
          isMobile ? "left-0 right-0" : "w-[420px] left-0"
        )} data-testid="global-search-results">
          {isLoading && (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground" data-testid="search-loading">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Searching...
            </div>
          )}

          {!isLoading && !hasResults && debouncedSearch.length >= 2 && (
            <div className="py-6 text-center text-sm text-muted-foreground" data-testid="search-no-results">
              No results found for "{debouncedSearch}"
            </div>
          )}

          {!isLoading && hasResults && (
            <ScrollArea className="max-h-[400px]">
              <div className="py-1">
                {categoryConfig.map(cat => {
                  const items = results?.[cat.key];
                  if (!items || items.length === 0) return null;
                  const CatIcon = cat.icon;
                  return (
                    <div key={cat.key}>
                      <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <CatIcon className={cn("h-3 w-3", cat.color)} />
                        {cat.label}
                      </div>
                      {items.map((item: any) => {
                        globalIndex++;
                        const idx = globalIndex;
                        const isSelected = selectedIndex === idx;
                        const { Icon, color } = getCategoryIcon(cat.key);
                        return (
                          <button
                            key={`${cat.key}-${item.id}`}
                            className={cn(
                              "w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors",
                              isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted/50"
                            )}
                            onClick={() => navigateToResult({ type: cat.key, id: item.id, meta: item })}
                            onMouseEnter={() => setSelectedIndex(idx)}
                            data-testid={`search-result-${cat.key}-${item.id}`}
                          >
                            <Icon className={cn("h-4 w-4 shrink-0", color)} />
                            <div className="flex-1 min-w-0">
                              <div className="truncate font-medium">{item.name}</div>
                              {cat.key === "users" && item.email && (
                                <div className="text-xs text-muted-foreground truncate">{item.email}</div>
                              )}
                              {cat.key === "tasks" && item.status && (
                                <div className="text-xs text-muted-foreground capitalize">{item.status?.replace("_", " ")}</div>
                              )}
                            </div>
                            {cat.key === "projects" && item.status && (
                              <Badge variant="outline" className="text-xs shrink-0 capitalize">{item.status}</Badge>
                            )}
                            {cat.key === "users" && item.role && (
                              <Badge variant="secondary" className="text-xs shrink-0 capitalize">{item.role}</Badge>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              <div className="border-t px-3 py-2 text-xs text-muted-foreground flex items-center justify-between">
                <span>{totalResults} result{totalResults !== 1 ? "s" : ""}</span>
                <span className="hidden sm:inline">
                  <kbd className="px-1.5 py-0.5 rounded border bg-muted text-[10px] font-mono">&uarr;&darr;</kbd> navigate
                  <kbd className="px-1.5 py-0.5 rounded border bg-muted text-[10px] font-mono ml-1.5">Enter</kbd> open
                  <kbd className="px-1.5 py-0.5 rounded border bg-muted text-[10px] font-mono ml-1.5">Esc</kbd> close
                </span>
              </div>
            </ScrollArea>
          )}
        </div>
      )}
    </div>
  );
}
