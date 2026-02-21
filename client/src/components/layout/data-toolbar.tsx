import { ReactNode } from "react";
import { Search, Filter, SortAsc, LayoutGrid, List, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterConfig {
  key: string;
  label: string;
  options: FilterOption[];
}

export interface SortOption {
  value: string;
  label: string;
}

interface DataToolbarProps {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: FilterConfig[];
  filterValues?: Record<string, string>;
  onFilterChange?: (key: string, value: string) => void;
  onClearFilters?: () => void;
  sortOptions?: SortOption[];
  sortValue?: string;
  onSortChange?: (value: string) => void;
  viewMode?: "grid" | "list";
  onViewModeChange?: (mode: "grid" | "list") => void;
  showViewToggle?: boolean;
  actions?: ReactNode;
  className?: string;
}

export function DataToolbar({
  searchValue = "",
  onSearchChange,
  searchPlaceholder = "Search...",
  filters = [],
  filterValues = {},
  onFilterChange,
  onClearFilters,
  sortOptions = [],
  sortValue,
  onSortChange,
  viewMode = "list",
  onViewModeChange,
  showViewToggle = false,
  actions,
  className,
}: DataToolbarProps) {
  const activeFilterCount = Object.values(filterValues).filter(v => v && v !== "all").length;
  const isMobile = useIsMobile();
  
  const activeFilters = filters
    .filter(f => filterValues[f.key] && filterValues[f.key] !== "all")
    .map(f => ({
      key: f.key,
      label: f.label,
      value: f.options.find(o => o.value === filterValues[f.key])?.label || filterValues[f.key],
    }));

  return (
    <div className={cn("flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:gap-3 mb-4", className)} data-testid="data-toolbar">
      {onSearchChange && (
        <div className={cn("relative", isMobile ? "w-full" : "flex-1 min-w-[200px] max-w-md")}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-9"
            data-testid="input-search"
          />
          {searchValue && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2"
              onClick={() => onSearchChange("")}
              data-testid="button-clear-search"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
      
      <div className="flex items-center gap-2 flex-wrap">
        {filters.length > 0 && onFilterChange && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size={isMobile ? "sm" : "default"} className="gap-1.5" data-testid="button-filters">
                <Filter className="h-4 w-4" />
                <span className="hidden sm:inline">Filters</span>
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-0.5 h-5 px-1.5">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="start">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Filters</h4>
                  {activeFilterCount > 0 && onClearFilters && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={onClearFilters}
                      data-testid="button-clear-filters"
                    >
                      Clear all
                    </Button>
                  )}
                </div>
                {filters.map((filter) => (
                  <div key={filter.key} className="space-y-1.5">
                    <label className="text-sm font-medium">{filter.label}</label>
                    <Select
                      value={filterValues[filter.key] || "all"}
                      onValueChange={(value) => onFilterChange(filter.key, value)}
                    >
                      <SelectTrigger data-testid={`select-filter-${filter.key}`}>
                        <SelectValue placeholder={`All ${filter.label}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {filter.options.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}
        
        {sortOptions.length > 0 && onSortChange && (
          <Select value={sortValue} onValueChange={onSortChange}>
            <SelectTrigger className={cn(isMobile ? "w-[120px]" : "w-[180px]")} data-testid="select-sort">
              <SortAsc className="h-4 w-4 mr-1" />
              <SelectValue placeholder="Sort..." />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        
        {showViewToggle && onViewModeChange && (
          <div className="flex items-center border rounded-md">
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              className="h-9 w-9 rounded-r-none"
              onClick={() => onViewModeChange("list")}
              data-testid="button-view-list"
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="h-9 w-9 rounded-l-none"
              onClick={() => onViewModeChange("grid")}
              data-testid="button-view-grid"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        )}
        
        {actions && (
          <div className="flex items-center gap-2 ml-auto" data-testid="data-toolbar-actions">
            {actions}
          </div>
        )}
      </div>

      {isMobile && activeFilters.length > 0 && onFilterChange && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" data-testid="mobile-active-filters">
          {activeFilters.map((af) => (
            <Badge
              key={af.key}
              variant="secondary"
              className="shrink-0 gap-1 pl-2 pr-1 py-1 text-xs cursor-pointer hover:bg-destructive/10 touch-manipulation"
              onClick={() => onFilterChange(af.key, "all")}
              data-testid={`filter-chip-${af.key}`}
            >
              {af.value}
              <X className="h-3 w-3 ml-0.5" />
            </Badge>
          ))}
          {onClearFilters && activeFilters.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 text-xs h-6 px-2"
              onClick={onClearFilters}
              data-testid="button-clear-all-chips"
            >
              Clear all
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
