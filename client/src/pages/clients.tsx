import { useState, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { VirtualizedList } from "@/components/ui/virtualized-list";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
import { ClientDrawer } from "@/features/clients";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Plus,
  Building2,
  FolderKanban,
  User,
  ChevronRight,
  Rows3,
  LayoutGrid,
  Bookmark,
  BookmarkCheck,
  Trash2,
  Mail,
  Phone,
  Globe,
  AlignJustify,
  AlignCenter,
  Tag,
  AlertTriangle,
  Clock,
  Download,
  ListChecks,
  ExternalLink,
  Users,
  TrendingUp,
  Star,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  PageShell,
  PageHeader,
  DataToolbar,
  EmptyState,
  ErrorState,
} from "@/components/layout";
import type { FilterConfig, SortOption } from "@/components/layout";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useLocalStorage, useSavedViews } from "@/hooks/use-local-storage";
import type { SavedView } from "@/hooks/use-local-storage";
import type { ClientWithContacts, Client } from "@shared/schema";
import { CLIENT_STAGES_ORDERED, CLIENT_STAGE_LABELS, type ClientStageType } from "@shared/schema";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";

interface ClientWithHierarchy extends Client {
  depth: number;
  parentName?: string;
  contactCount: number;
  projectCount: number;
  openTasksCount: number;
  lastActivityAt: string | null;
  needsAttention: boolean;
}

interface ClientSummary {
  total: number;
  active: number;
  inactive: number;
  prospect: number;
  newThisMonth: number;
  needsAttention: number;
}

interface StageSummaryItem {
  stage: string;
  clientCount: number;
  projectCount: number;
}

type SegmentTab = "all" | ClientStageType | "needs-attention";

const STAGE_COLORS: Record<string, string> = {
  lead: "bg-slate-500",
  proposal: "bg-blue-500",
  content_strategy: "bg-indigo-500",
  design: "bg-violet-500",
  development: "bg-amber-500",
  final_testing: "bg-orange-500",
  active_maintenance: "bg-green-500",
};

const STAGE_TEXT_COLORS: Record<string, string> = {
  lead: "text-slate-600 dark:text-slate-400",
  proposal: "text-blue-600 dark:text-blue-400",
  content_strategy: "text-indigo-600 dark:text-indigo-400",
  design: "text-violet-600 dark:text-violet-400",
  development: "text-amber-600 dark:text-amber-400",
  final_testing: "text-orange-600 dark:text-orange-400",
  active_maintenance: "text-green-600 dark:text-green-400",
};

const STAGE_FILTER: FilterConfig = {
  key: "stage",
  label: "Stage",
  options: [
    { value: "all", label: "All stages" },
    ...CLIENT_STAGES_ORDERED.map((s) => ({
      value: s,
      label: CLIENT_STAGE_LABELS[s],
    })),
  ],
};

const SORT_OPTIONS: SortOption[] = [
  { value: "name-asc", label: "Name (A-Z)" },
  { value: "name-desc", label: "Name (Z-A)" },
  { value: "projects-desc", label: "Most projects" },
  { value: "projects-asc", label: "Fewest projects" },
  { value: "contacts-desc", label: "Most contacts" },
  { value: "contacts-asc", label: "Fewest contacts" },
  { value: "tasks-desc", label: "Most open tasks" },
  { value: "tasks-asc", label: "Fewest open tasks" },
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
];

function getStatusColor(status: string) {
  switch (status) {
    case "active":
      return "bg-green-500/10 text-green-600 dark:text-green-400";
    case "inactive":
      return "bg-muted text-muted-foreground";
    case "prospect":
      return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function KPIStrip({ summary, isLoading }: { summary?: ClientSummary; isLoading: boolean }) {
  const kpis = [
    { label: "Total Clients", value: summary?.total ?? 0, icon: Building2, color: "text-foreground" },
    { label: "Active", value: summary?.active ?? 0, icon: TrendingUp, color: "text-green-600 dark:text-green-400" },
    { label: "New This Month", value: summary?.newThisMonth ?? 0, icon: Users, color: "text-blue-600 dark:text-blue-400" },
    { label: "Needs Attention", value: summary?.needsAttention ?? 0, icon: AlertTriangle, color: "text-amber-600 dark:text-amber-400" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4" data-testid="kpi-strip">
      {kpis.map((kpi) => (
        <Card key={kpi.label} data-testid={`kpi-${kpi.label.toLowerCase().replace(/\s+/g, "-")}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">{kpi.label}</p>
                {isLoading ? (
                  <Skeleton className="h-7 w-12 mt-1" />
                ) : (
                  <p className={cn("text-2xl font-semibold", kpi.color)}>{kpi.value}</p>
                )}
              </div>
              <kpi.icon className={cn("h-5 w-5 shrink-0", kpi.color)} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function PipelineBar({
  activeStage,
  onStageChange,
  stageSummary,
  totalClients,
  needsAttentionCount,
  isLoading,
}: {
  activeStage: SegmentTab;
  onStageChange: (stage: SegmentTab) => void;
  stageSummary?: StageSummaryItem[];
  totalClients: number;
  needsAttentionCount: number;
  isLoading: boolean;
}) {
  const stageCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    if (stageSummary) {
      stageSummary.forEach((s) => {
        map[s.stage] = s.clientCount;
      });
    }
    return map;
  }, [stageSummary]);

  if (isLoading) {
    return (
      <div className="mb-4 space-y-3" data-testid="pipeline-bar-skeleton">
        <div className="flex gap-1 h-2 rounded-full overflow-hidden bg-muted">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="flex-1 h-full" />
          ))}
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-24 shrink-0 rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4 space-y-3" data-testid="pipeline-bar">
      <div className="flex gap-0.5 h-2.5 rounded-full overflow-hidden bg-muted">
        {CLIENT_STAGES_ORDERED.map((stage) => {
          const count = stageCountMap[stage] || 0;
          const pct = totalClients > 0 ? (count / totalClients) * 100 : 0;
          if (pct === 0) return null;
          return (
            <div
              key={stage}
              className={cn(
                STAGE_COLORS[stage],
                "transition-all duration-300 cursor-pointer",
                activeStage === stage ? "opacity-100 ring-2 ring-foreground/20" : "opacity-70 hover:opacity-90"
              )}
              style={{ width: `${Math.max(pct, 2)}%` }}
              onClick={() => onStageChange(activeStage === stage ? "all" : stage as SegmentTab)}
              title={`${CLIENT_STAGE_LABELS[stage]}: ${count}`}
              data-testid={`pipeline-segment-${stage}`}
            />
          );
        })}
      </div>

      <div className="flex items-center gap-1 overflow-x-auto pb-1" data-testid="pipeline-tabs">
        <Button
          variant={activeStage === "all" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => onStageChange("all")}
          className="shrink-0"
          data-testid="tab-all"
        >
          All
          <span className="ml-1.5 text-xs text-muted-foreground">{totalClients}</span>
        </Button>

        {CLIENT_STAGES_ORDERED.map((stage) => {
          const count = stageCountMap[stage] || 0;
          return (
            <Button
              key={stage}
              variant={activeStage === stage ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onStageChange(stage as SegmentTab)}
              className="shrink-0"
              data-testid={`tab-${stage}`}
            >
              <span className={cn("h-2 w-2 rounded-full mr-1.5 shrink-0", STAGE_COLORS[stage])} />
              {CLIENT_STAGE_LABELS[stage]}
              <span className="ml-1.5 text-xs text-muted-foreground">{count}</span>
            </Button>
          );
        })}

        <Button
          variant={activeStage === "needs-attention" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => onStageChange("needs-attention")}
          className="shrink-0"
          data-testid="tab-needs-attention"
        >
          <AlertTriangle className="h-3.5 w-3.5 mr-1.5 text-amber-500" />
          Needs Attention
          <span className="ml-1.5 text-xs text-muted-foreground">{needsAttentionCount}</span>
        </Button>
      </div>
    </div>
  );
}

function ClientGridCard({
  client,
  isSelected,
  onSelect,
  showCheckbox,
  onOpenProfile,
}: {
  client: ClientWithHierarchy;
  isSelected: boolean;
  onSelect: (id: string) => void;
  showCheckbox: boolean;
  onOpenProfile: (id: string) => void;
}) {
  return (
    <div className="relative group">
      {showCheckbox && (
        <div
          className="absolute top-3 left-3 z-10"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onSelect(client.id)}
            data-testid={`checkbox-client-${client.id}`}
          />
        </div>
      )}
      <div onClick={() => onOpenProfile(client.id)} className="cursor-pointer">
        <Card
          className={cn(
            "cursor-pointer transition-colors hover-elevate overflow-hidden",
            isSelected && "ring-2 ring-primary"
          )}
          data-testid={`card-client-${client.id}`}
        >
          <CardHeader className="pb-3">
            <div className="flex items-start gap-3 min-w-0">
              {client.depth > 0 && (
                <div
                  className="flex items-center text-muted-foreground shrink-0 pt-0.5"
                  style={{ paddingLeft: `${(client.depth - 1) * 12}px` }}
                >
                  <ChevronRight className="h-4 w-4" />
                </div>
              )}
              <Avatar className="h-10 w-10 shrink-0">
                <AvatarFallback className="bg-primary/10 text-primary">
                  {getInitials(client.companyName)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 min-w-0">
                  <CardTitle className="text-base truncate min-w-0">
                    {client.companyName}
                  </CardTitle>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {client.needsAttention && (
                      <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                    )}
                  </div>
                </div>
                {client.parentName ? (
                  <p className="text-xs text-muted-foreground truncate">
                    Sub-client of {client.parentName}
                  </p>
                ) : (
                  client.displayName && (
                    <p className="text-xs text-muted-foreground truncate">
                      {client.displayName}
                    </p>
                  )
                )}
                <div className="mt-1.5">
                  <Badge variant="outline" className={cn("text-xs", STAGE_TEXT_COLORS[client.stage] || "")}>
                    <span className={cn("h-1.5 w-1.5 rounded-full mr-1.5 shrink-0", STAGE_COLORS[client.stage] || "bg-muted")} />
                    {CLIENT_STAGE_LABELS[client.stage as ClientStageType] || client.stage}
                  </Badge>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <FolderKanban className="h-3.5 w-3.5 shrink-0" />
                <span>{client.projectCount} projects</span>
              </div>
              <div className="flex items-center gap-1">
                <User className="h-3.5 w-3.5 shrink-0" />
                <span>{client.contactCount} contacts</span>
              </div>
              {client.openTasksCount > 0 && (
                <div className="flex items-center gap-1">
                  <ListChecks className="h-3.5 w-3.5 shrink-0" />
                  <span>{client.openTasksCount} tasks</span>
                </div>
              )}
            </div>
            {client.lastActivityAt && (
              <p className="text-xs text-muted-foreground mt-1.5 truncate">
                Last activity {formatDistanceToNow(new Date(client.lastActivityAt), { addSuffix: true })}
              </p>
            )}
            {client.industry && (
              <p className="text-xs text-muted-foreground mt-2 truncate">
                {client.industry}
              </p>
            )}
            {client.tags && client.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2" data-testid={`tags-client-${client.id}`}>
                {client.tags.slice(0, 3).map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs" data-testid={`tag-${tag}-${client.id}`}>
                    {tag}
                  </Badge>
                ))}
                {client.tags.length > 3 && (
                  <span className="text-xs text-muted-foreground" data-testid={`tags-more-${client.id}`}>+{client.tags.length - 3}</span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ClientGroupCard({
  parent,
  children,
  selectedIds,
  onSelect,
  showCheckbox,
  onOpenProfile,
}: {
  parent: ClientWithHierarchy;
  children: ClientWithHierarchy[];
  selectedIds: Set<string>;
  onSelect: (id: string) => void;
  showCheckbox: boolean;
  onOpenProfile: (id: string) => void;
}) {
  if (children.length === 0) {
    return (
      <ClientGridCard
        client={parent}
        isSelected={selectedIds.has(parent.id)}
        onSelect={onSelect}
        showCheckbox={showCheckbox}
        onOpenProfile={onOpenProfile}
      />
    );
  }

  return (
    <div className="relative group">
      {showCheckbox && (
        <div
          className="absolute top-3 left-3 z-10"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <Checkbox
            checked={selectedIds.has(parent.id)}
            onCheckedChange={() => onSelect(parent.id)}
            data-testid={`checkbox-client-${parent.id}`}
          />
        </div>
      )}
      <Card
        className={cn(
          "transition-colors overflow-hidden",
          selectedIds.has(parent.id) && "ring-2 ring-primary"
        )}
        data-testid={`card-client-group-${parent.id}`}
      >
        <div
          onClick={() => onOpenProfile(parent.id)}
          className="cursor-pointer overflow-hidden hover-elevate rounded-t-md"
        >
          <CardHeader className="pb-3">
            <div className="flex items-start gap-3 min-w-0">
              <Avatar className="h-10 w-10 shrink-0">
                <AvatarFallback className="bg-primary/10 text-primary">
                  {getInitials(parent.companyName)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 min-w-0">
                  <CardTitle className="text-base truncate min-w-0">
                    {parent.companyName}
                  </CardTitle>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {parent.needsAttention && (
                      <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                    )}
                  </div>
                </div>
                {parent.displayName && (
                  <p className="text-xs text-muted-foreground truncate">
                    {parent.displayName}
                  </p>
                )}
                <div className="mt-1.5">
                  <Badge className={cn("text-xs", getStatusColor(parent.status))}>
                    {parent.status}
                  </Badge>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 pb-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <FolderKanban className="h-3.5 w-3.5 shrink-0" />
                <span>{parent.projectCount} projects</span>
              </div>
              <div className="flex items-center gap-1">
                <User className="h-3.5 w-3.5 shrink-0" />
                <span>{parent.contactCount} contacts</span>
              </div>
            </div>
            {parent.industry && (
              <p className="text-xs text-muted-foreground mt-2 truncate">
                {parent.industry}
              </p>
            )}
            {parent.tags && parent.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2" data-testid={`tags-client-${parent.id}`}>
                {parent.tags.slice(0, 3).map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs" data-testid={`tag-${tag}-${parent.id}`}>
                    {tag}
                  </Badge>
                ))}
                {parent.tags.length > 3 && (
                  <span className="text-xs text-muted-foreground" data-testid={`tags-more-${parent.id}`}>+{parent.tags.length - 3}</span>
                )}
              </div>
            )}
          </CardContent>
        </div>

        <div className="border-t border-border mx-4" />
        <div className="px-4 py-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
            Divisions ({children.length})
          </p>
          <div className="space-y-1">
            {children.map((child) => (
              <div
                key={child.id}
                onClick={() => onOpenProfile(child.id)}
                className={cn(
                  "flex flex-wrap items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover-elevate min-w-0",
                  selectedIds.has(child.id) && "ring-1 ring-primary"
                )}
                data-testid={`card-child-client-${child.id}`}
              >
                {showCheckbox && (
                  <div
                    className="shrink-0"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onSelect(child.id);
                    }}
                  >
                    <Checkbox
                      checked={selectedIds.has(child.id)}
                      onCheckedChange={() => onSelect(child.id)}
                      data-testid={`checkbox-child-client-${child.id}`}
                    />
                  </div>
                )}
                <Avatar className="h-6 w-6 shrink-0">
                  <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                    {getInitials(child.companyName)}
                  </AvatarFallback>
                </Avatar>
                <span
                  className="text-sm truncate flex-1 min-w-0"
                  data-testid={`text-child-client-name-${child.id}`}
                >
                  {child.companyName}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {child.needsAttention && (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  )}
                  <Badge
                    className={cn(getStatusColor(child.status), "text-xs")}
                  >
                    {child.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

function ClientGroupRows({
  parent,
  children,
  selectedIds,
  onSelect,
  showCheckbox,
  compact,
  onOpenProfile,
}: {
  parent: ClientWithHierarchy;
  children: ClientWithHierarchy[];
  selectedIds: Set<string>;
  onSelect: (id: string) => void;
  showCheckbox: boolean;
  compact: boolean;
  onOpenProfile: (id: string) => void;
}) {
  return (
    <>
      <ClientTableRow
        client={parent}
        isSelected={selectedIds.has(parent.id)}
        onSelect={onSelect}
        showCheckbox={showCheckbox}
        compact={compact}
        onOpenProfile={onOpenProfile}
      />
      {children.map((child) => (
        <ClientTableRow
          key={child.id}
          client={child}
          isSelected={selectedIds.has(child.id)}
          onSelect={onSelect}
          showCheckbox={showCheckbox}
          compact={compact}
          onOpenProfile={onOpenProfile}
        />
      ))}
    </>
  );
}

function ClientTableRow({
  client,
  isSelected,
  onSelect,
  showCheckbox,
  compact,
  onOpenProfile,
}: {
  client: ClientWithHierarchy;
  isSelected: boolean;
  onSelect: (id: string) => void;
  showCheckbox: boolean;
  compact: boolean;
  onOpenProfile: (id: string) => void;
}) {
  return (
    <div
      onClick={() => onOpenProfile(client.id)}
      className={cn(
        "flex items-center gap-3 border-b border-border hover-elevate cursor-pointer",
        compact ? "px-3 py-2" : "px-4 py-3",
        isSelected && "bg-primary/5"
      )}
      data-testid={`row-client-${client.id}`}
    >
        {showCheckbox && (
          <div
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelect(client.id);
            }}
          >
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onSelect(client.id)}
              data-testid={`checkbox-client-${client.id}`}
            />
          </div>
        )}

        <div className="flex items-center gap-3 flex-1 min-w-0">
          {client.depth > 0 && (
            <div
              className="shrink-0"
              style={{ width: `${client.depth * 16}px` }}
            />
          )}
          <Avatar className={compact ? "h-7 w-7" : "h-9 w-9"}>
            <AvatarFallback
              className={cn(
                "bg-primary/10 text-primary",
                compact && "text-xs"
              )}
            >
              {getInitials(client.companyName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p
                className={cn(
                  "font-medium truncate",
                  compact ? "text-sm" : "text-sm"
                )}
                data-testid={`text-client-name-${client.id}`}
              >
                {client.companyName}
              </p>
              {client.needsAttention && (
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              )}
            </div>
            {!compact &&
              (client.parentName ? (
                <p className="text-xs text-muted-foreground truncate">
                  Sub-client of {client.parentName}
                </p>
              ) : (
                client.displayName && (
                  <p className="text-xs text-muted-foreground truncate">
                    {client.displayName}
                  </p>
                )
              ))}
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 w-32 shrink-0 justify-end">
          <Badge
            variant="outline"
            className={cn(STAGE_TEXT_COLORS[client.stage] || "", compact && "text-xs")}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full mr-1 shrink-0", STAGE_COLORS[client.stage] || "bg-muted")} />
            {CLIENT_STAGE_LABELS[client.stage as ClientStageType] || client.stage}
          </Badge>
        </div>

        <div className="hidden md:flex items-center gap-1 text-sm text-muted-foreground w-24 shrink-0 justify-end">
          {client.industry ? (
            <span className="truncate text-xs">{client.industry}</span>
          ) : (
            <span className="text-xs text-muted-foreground/50">--</span>
          )}
        </div>

        <div className="hidden lg:flex items-center gap-1 text-xs text-muted-foreground w-28 shrink-0 justify-end">
          {client.lastActivityAt ? (
            <span className="truncate">
              {formatDistanceToNow(new Date(client.lastActivityAt), { addSuffix: true })}
            </span>
          ) : (
            <span className="text-muted-foreground/50">No activity</span>
          )}
        </div>

        <div className="hidden lg:flex items-center gap-4 text-sm text-muted-foreground w-32 shrink-0 justify-end">
          <div className="flex items-center gap-1">
            <FolderKanban className="h-3.5 w-3.5" />
            <span>{client.projectCount}</span>
          </div>
          <div className="flex items-center gap-1">
            <ListChecks className="h-3.5 w-3.5" />
            <span>{client.openTasksCount}</span>
          </div>
          <div className="flex items-center gap-1">
            <User className="h-3.5 w-3.5" />
            <span>{client.contactCount}</span>
          </div>
        </div>

        {!compact && (
          <div className="hidden xl:flex items-center gap-3 text-muted-foreground w-24 shrink-0 justify-end">
            {client.email && <Mail className="h-3.5 w-3.5" />}
            {client.phone && <Phone className="h-3.5 w-3.5" />}
            {client.website && <Globe className="h-3.5 w-3.5" />}
          </div>
        )}
    </div>
  );
}

function TableHeader({ compact }: { compact: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 border-b-2 border-border bg-muted/30 text-xs font-medium text-muted-foreground uppercase tracking-wider",
        compact ? "px-3 py-1.5" : "px-4 py-2"
      )}
    >
      <div className="flex-1">Client</div>
      <div className="hidden sm:block w-32 text-right">Stage</div>
      <div className="hidden md:block w-24 text-right">Industry</div>
      <div className="hidden lg:block w-28 text-right">Last Activity</div>
      <div className="hidden lg:block w-32 text-right">Stats</div>
      {!compact && (
        <div className="hidden xl:block w-24 text-right">Contact</div>
      )}
    </div>
  );
}

function BulkActionBar({
  count,
  onClear,
  onBulkStatusChange,
  onExportCsv,
}: {
  count: number;
  onClear: () => void;
  onBulkStatusChange: (status: string) => void;
  onExportCsv: () => void;
}) {
  return (
    <div className="flex items-center gap-3 p-3 mb-4 rounded-md bg-primary/5 border border-primary/20">
      <span className="font-medium">
        {count} client{count !== 1 ? "s" : ""} selected
      </span>
      <div className="flex items-center gap-2 ml-auto flex-wrap">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" data-testid="button-bulk-status">
              Change Status
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => onBulkStatusChange("active")}>
              Set Active
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onBulkStatusChange("inactive")}>
              Set Inactive
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onBulkStatusChange("prospect")}>
              Set Prospect
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="outline" size="sm" onClick={onExportCsv} data-testid="button-export-selected-csv">
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Export CSV
        </Button>
        <Button variant="ghost" size="sm" onClick={onClear} data-testid="button-clear-selection">
          Clear
        </Button>
      </div>
    </div>
  );
}

function ClientDetailSheet({
  client,
  open,
  onOpenChange,
}: {
  client: ClientWithHierarchy | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [, navigate] = useLocation();

  if (!client) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto" data-testid="sheet-client-detail">
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-primary/10 text-primary text-lg">
                {getInitials(client.companyName)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-lg truncate" data-testid="text-sheet-client-name">
                {client.companyName}
              </SheetTitle>
              {client.displayName && (
                <p className="text-sm text-muted-foreground truncate">{client.displayName}</p>
              )}
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={STAGE_TEXT_COLORS[client.stage] || ""}>
              <span className={cn("h-1.5 w-1.5 rounded-full mr-1.5 shrink-0", STAGE_COLORS[client.stage] || "bg-muted")} />
              {CLIENT_STAGE_LABELS[client.stage as ClientStageType] || client.stage}
            </Badge>
            {client.needsAttention && (
              <Badge variant="outline" className="text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-600">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Needs Attention
              </Badge>
            )}
            {client.industry && (
              <Badge variant="outline">{client.industry}</Badge>
            )}
          </div>

          <Separator />

          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-semibold">{client.projectCount}</p>
                <p className="text-xs text-muted-foreground">Projects</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-semibold">{client.openTasksCount}</p>
                <p className="text-xs text-muted-foreground">Open Tasks</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-semibold">{client.contactCount}</p>
                <p className="text-xs text-muted-foreground">Contacts</p>
              </CardContent>
            </Card>
          </div>

          {client.lastActivityAt && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Last activity {formatDistanceToNow(new Date(client.lastActivityAt), { addSuffix: true })}</span>
            </div>
          )}

          <Separator />

          <div className="space-y-2">
            <p className="font-medium">Contact Information</p>
            <div className="space-y-1.5">
              {client.email && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  <span className="truncate">{client.email}</span>
                </div>
              )}
              {client.phone && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" />
                  <span>{client.phone}</span>
                </div>
              )}
              {client.website && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Globe className="h-3.5 w-3.5" />
                  <span className="truncate">{client.website}</span>
                </div>
              )}
              {!client.email && !client.phone && !client.website && (
                <p className="text-sm text-muted-foreground/50">No contact information</p>
              )}
            </div>
          </div>

          {client.tags && client.tags.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="font-medium">Tags</p>
                <div className="flex flex-wrap gap-1">
                  {client.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}

          {client.notes && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="font-medium">Notes</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{client.notes}</p>
              </div>
            </>
          )}

          <Separator />

          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              onOpenChange(false);
              navigate(`/clients/${client.id}`);
            }}
            data-testid="button-view-full-details"
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            View Full Details
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ClientListSkeleton({
  viewMode,
  density,
}: {
  viewMode: "grid" | "table";
  density: "comfortable" | "compact";
}) {
  if (viewMode === "grid") {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex gap-4">
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-3.5 w-20" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <Card>
      <div className="divide-y">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "flex items-center gap-3",
              density === "compact" ? "px-3 py-2" : "px-4 py-3"
            )}
          >
            <Skeleton
              className={cn(
                "rounded-full shrink-0",
                density === "compact" ? "h-7 w-7" : "h-9 w-9"
              )}
            />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              {density !== "compact" && <Skeleton className="h-3 w-28" />}
            </div>
            <Skeleton className="h-5 w-16 rounded-full hidden sm:block" />
            <Skeleton className="h-3 w-20 hidden md:block" />
          </div>
        ))}
      </div>
    </Card>
  );
}

function exportClientsToCsv(clients: ClientWithHierarchy[]) {
  const headers = [
    "Company Name",
    "Display Name",
    "Status",
    "Industry",
    "Email",
    "Phone",
    "Website",
    "Projects",
    "Contacts",
    "Open Tasks",
    "Last Activity",
    "Needs Attention",
    "Tags",
  ];

  const rows = clients.map((c) => [
    c.companyName,
    c.displayName || "",
    c.status,
    c.industry || "",
    c.email || "",
    c.phone || "",
    c.website || "",
    String(c.projectCount),
    String(c.contactCount),
    String(c.openTasksCount),
    c.lastActivityAt ? new Date(c.lastActivityAt).toLocaleDateString() : "",
    c.needsAttention ? "Yes" : "No",
    c.tags?.join("; ") || "",
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      row.map((val) => `"${val.replace(/"/g, '""')}"`).join(",")
    ),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `clients-export-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

const VIRTUALIZATION_THRESHOLD = 20;

interface ClientViewProps {
  groupedClients: { parent: ClientWithHierarchy; children: ClientWithHierarchy[] }[];
  selectedIds: Set<string>;
  onSelect: (id: string) => void;
  onOpenProfile: (id: string) => void;
}

function ClientGridView({ groupedClients, selectedIds, onSelect, onOpenProfile }: ClientViewProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="client-grid">
      {groupedClients.map(({ parent, children }) => (
        <ClientGroupCard
          key={parent.id}
          parent={parent}
          children={children}
          selectedIds={selectedIds}
          onSelect={onSelect}
          showCheckbox={selectedIds.size > 0}
          onOpenProfile={onOpenProfile}
        />
      ))}
    </div>
  );
}

function ClientTableView({
  groupedClients,
  selectedIds,
  onSelect,
  onOpenProfile,
  density,
}: ClientViewProps & { density: "comfortable" | "compact" }) {
  const { virtualizationV1 } = useFeatureFlags();
  const useVirtual = virtualizationV1 && groupedClients.length > VIRTUALIZATION_THRESHOLD;

  if (useVirtual) {
    return (
      <Card>
        <TableHeader compact={density === "compact"} />
        <div style={{ height: "calc(100vh - 380px)" }} data-testid="client-table-virtualized">
          <VirtualizedList
            data={groupedClients}
            style={{ height: "100%" }}
            overscan={300}
            itemContent={(_index, { parent, children }) => (
              <ClientGroupRows
                parent={parent}
                children={children}
                selectedIds={selectedIds}
                onSelect={onSelect}
                showCheckbox={selectedIds.size > 0}
                compact={density === "compact"}
                onOpenProfile={onOpenProfile}
              />
            )}
          />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <TableHeader compact={density === "compact"} />
      {groupedClients.map(({ parent, children }) => (
        <ClientGroupRows
          key={parent.id}
          parent={parent}
          children={children}
          selectedIds={selectedIds}
          onSelect={onSelect}
          showCheckbox={selectedIds.size > 0}
          compact={density === "compact"}
          onOpenProfile={onOpenProfile}
        />
      ))}
    </Card>
  );
}

export default function ClientsPage() {
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [activeSegment, setActiveSegment] = useState<SegmentTab>("all");
  const [detailSheetClient, setDetailSheetClient] = useState<ClientWithHierarchy | null>(null);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const { toast } = useToast();

  const [viewMode, setViewMode] = useLocalStorage<"grid" | "table">(
    "clients-view-mode",
    "grid"
  );
  const [density, setDensity] = useLocalStorage<"comfortable" | "compact">(
    "clients-density",
    "comfortable"
  );
  const [filterValues, setFilterValues] = useLocalStorage<
    Record<string, string>
  >("clients-filters", {});
  const [sortValue, setSortValue] = useLocalStorage<string>(
    "clients-sort",
    "name-asc"
  );
  const { views, saveView, deleteView } = useSavedViews("clients-saved-views");
  const [, navigate] = useLocation();

  const {
    data: hierarchyClients,
    isLoading,
    error,
    refetch,
  } = useQuery<ClientWithHierarchy[]>({
    queryKey: ["/api/v1/clients/hierarchy/list"],
  });

  const { data: summary, isLoading: summaryLoading } = useQuery<ClientSummary>({
    queryKey: ["/api/v1/clients/summary"],
  });

  const { data: stageSummary, isLoading: stageSummaryLoading } = useQuery<StageSummaryItem[]>({
    queryKey: ["/api/v1/clients/stages/summary"],
  });

  const { data: clients } = useQuery<ClientWithContacts[]>({
    queryKey: ["/api/clients"],
  });

  const industries = useMemo(() => {
    if (!hierarchyClients) return [];
    const set = new Set<string>();
    hierarchyClients.forEach((c) => {
      if (c.industry) set.add(c.industry);
    });
    return Array.from(set).sort();
  }, [hierarchyClients]);

  const allTags = useMemo(() => {
    if (!hierarchyClients) return [];
    const set = new Set<string>();
    hierarchyClients.forEach((c) => {
      if (c.tags) c.tags.forEach((t) => set.add(t));
    });
    return Array.from(set).sort();
  }, [hierarchyClients]);

  const dynamicFilters = useMemo((): FilterConfig[] => {
    return [
      STAGE_FILTER,
      {
        key: "industry",
        label: "Industry",
        options: [
          { value: "all", label: "All industries" },
          ...industries.map((ind) => ({ value: ind, label: ind })),
        ],
      },
      ...(allTags.length > 0
        ? [
            {
              key: "tag",
              label: "Tag",
              options: [
                { value: "all", label: "All tags" },
                ...allTags.map((tag) => ({ value: tag, label: tag })),
              ],
            },
          ]
        : []),
    ];
  }, [industries, allTags]);

  const createClientMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/clients", data);
    },
    onMutate: async (newClient) => {
      await queryClient.cancelQueries({ queryKey: ["/api/clients"] });
      const previousClients = queryClient.getQueryData<ClientWithContacts[]>([
        "/api/clients",
      ]);
      const optimisticClient = {
        id: `temp-${Date.now()}`,
        companyName: newClient.companyName,
        displayName: newClient.displayName || null,
        legalName: null,
        status: newClient.status || "active",
        industry: newClient.industry || null,
        companySize: null,
        website: newClient.website || null,
        taxId: null,
        foundedDate: null,
        description: null,
        notes: newClient.notes || null,
        addressLine1: null,
        addressLine2: null,
        city: null,
        state: null,
        postalCode: null,
        country: null,
        phone: null,
        email: null,
        primaryContactName: null,
        primaryContactEmail: null,
        primaryContactPhone: null,
        parentClientId: null,
        tenantId: "",
        workspaceId: "",
        createdAt: new Date(),
        updatedAt: new Date(),
        contacts: [],
        projects: [],
      } as ClientWithContacts;
      queryClient.setQueryData<ClientWithContacts[]>(
        ["/api/clients"],
        (old) => (old ? [optimisticClient, ...old] : [optimisticClient])
      );
      return { previousClients };
    },
    onError: (err: any, _newClient, context) => {
      if (context?.previousClients) {
        queryClient.setQueryData(["/api/clients"], context.previousClients);
      }
      const errorMessage = err?.message || err?.error || "Unknown error";
      console.error("Failed to create client:", err);
      toast({
        title: "Failed to create client",
        description:
          typeof errorMessage === "string"
            ? errorMessage
            : JSON.stringify(errorMessage),
        variant: "destructive",
      });
    },
    onSuccess: () => {
      toast({ title: "Client created successfully" });
      setCreateDrawerOpen(false);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/v1/clients/hierarchy/list"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/v1/clients/summary"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/v1/clients/stages/summary"],
      });
    },
  });

  const bulkStatusMutation = useMutation({
    mutationFn: async ({
      ids,
      status,
    }: {
      ids: string[];
      status: string;
    }) => {
      await Promise.all(
        ids.map((id) => apiRequest("PATCH", `/api/clients/${id}`, { status }))
      );
    },
    onSuccess: () => {
      toast({ title: "Clients updated successfully" });
      setSelectedIds(new Set());
    },
    onError: () => {
      toast({ title: "Failed to update some clients", variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/v1/clients/hierarchy/list"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/v1/clients/summary"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/v1/clients/stages/summary"],
      });
    },
  });

  const handleCreateClient = async (data: any) => {
    await createClientMutation.mutateAsync(data);
  };

  const handleFilterChange = useCallback(
    (key: string, value: string) => {
      setFilterValues((prev) => ({ ...prev, [key]: value }));
    },
    [setFilterValues]
  );

  const handleClearFilters = useCallback(() => {
    setFilterValues({});
  }, [setFilterValues]);

  const handleSelectClient = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleBulkStatusChange = useCallback(
    (status: string) => {
      bulkStatusMutation.mutate({
        ids: Array.from(selectedIds),
        status,
      });
    },
    [selectedIds, bulkStatusMutation]
  );

  const handleApplyView = useCallback(
    (view: SavedView) => {
      setFilterValues(view.filters);
      setSortValue(view.sortValue);
      setViewMode(view.viewMode);
      setDensity(view.density);
      toast({ title: `Applied view "${view.name}"` });
    },
    [setFilterValues, setSortValue, setViewMode, setDensity, toast]
  );

  const handleSaveView = useCallback(() => {
    if (!newViewName.trim()) return;
    saveView({
      name: newViewName.trim(),
      filters: filterValues,
      sortValue,
      viewMode,
      density,
    });
    setNewViewName("");
    setSaveViewOpen(false);
    toast({ title: "View saved" });
  }, [
    newViewName,
    saveView,
    filterValues,
    sortValue,
    viewMode,
    density,
    toast,
  ]);

  const handleOpenClientSheet = useCallback((clientId: string) => {
    navigate(`/clients/${clientId}`);
  }, [navigate]);

  const handleExportCsv = useCallback(() => {
    if (!hierarchyClients) return;
    if (selectedIds.size > 0) {
      const selected = hierarchyClients.filter((c) => selectedIds.has(c.id));
      exportClientsToCsv(selected);
    }
    toast({ title: "CSV exported" });
  }, [hierarchyClients, selectedIds, toast]);

  const filteredAndSortedClients = useMemo(() => {
    if (!hierarchyClients) return [];

    let result = hierarchyClients.filter((client) => {
      if (activeSegment !== "all" && activeSegment !== "needs-attention") {
        if (client.stage !== activeSegment) return false;
      }
      if (activeSegment === "needs-attention" && !client.needsAttention) return false;

      const matchesSearch =
        !searchQuery ||
        client.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        client.displayName
          ?.toLowerCase()
          .includes(searchQuery.toLowerCase()) ||
        client.parentName?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStage =
        !filterValues.stage ||
        filterValues.stage === "all" ||
        client.stage === filterValues.stage;

      const matchesIndustry =
        !filterValues.industry ||
        filterValues.industry === "all" ||
        client.industry === filterValues.industry;

      const matchesTag =
        !filterValues.tag ||
        filterValues.tag === "all" ||
        (client.tags && client.tags.includes(filterValues.tag));

      return matchesSearch && matchesStage && matchesIndustry && matchesTag;
    });

    result.sort((a, b) => {
      switch (sortValue) {
        case "name-asc":
          return a.companyName.localeCompare(b.companyName);
        case "name-desc":
          return b.companyName.localeCompare(a.companyName);
        case "projects-desc":
          return b.projectCount - a.projectCount;
        case "projects-asc":
          return a.projectCount - b.projectCount;
        case "contacts-desc":
          return b.contactCount - a.contactCount;
        case "contacts-asc":
          return a.contactCount - b.contactCount;
        case "tasks-desc":
          return b.openTasksCount - a.openTasksCount;
        case "tasks-asc":
          return a.openTasksCount - b.openTasksCount;
        case "newest":
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        case "oldest":
          return (
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        default:
          return 0;
      }
    });

    return result;
  }, [hierarchyClients, searchQuery, filterValues, sortValue, activeSegment]);

  const vipClients = useMemo(() => {
    if (!filteredAndSortedClients) return [];
    return filteredAndSortedClients.filter(
      (c) => c.tags && c.tags.some((t) => t.toLowerCase() === "vip")
    );
  }, [filteredAndSortedClients]);

  const vipClientIds = useMemo(() => new Set(vipClients.map((c) => c.id)), [vipClients]);

  const groupedClients = useMemo(() => {
    const nonVipClients = filteredAndSortedClients.filter((c) => !vipClientIds.has(c.id));
    const groups: { parent: ClientWithHierarchy; children: ClientWithHierarchy[] }[] = [];
    const clientMap = new Map<string, ClientWithHierarchy>();
    const childrenByParent = new Map<string, ClientWithHierarchy[]>();

    for (const client of nonVipClients) {
      clientMap.set(client.id, client);
    }

    const findRoot = (client: ClientWithHierarchy): string => {
      if (!client.parentClientId) return client.id;
      const parent = clientMap.get(client.parentClientId);
      if (parent) return findRoot(parent);
      return client.id;
    };

    for (const client of nonVipClients) {
      if (!client.parentClientId) continue;
      const rootId = findRoot(client);
      if (rootId === client.id) continue;
      if (!childrenByParent.has(rootId)) {
        childrenByParent.set(rootId, []);
      }
      childrenByParent.get(rootId)!.push(client);
    }

    const assignedIds = new Set<string>();
    for (const children of childrenByParent.values()) {
      for (const child of children) {
        assignedIds.add(child.id);
      }
    }

    for (const client of nonVipClients) {
      if (assignedIds.has(client.id)) continue;
      groups.push({
        parent: client,
        children: childrenByParent.get(client.id) || [],
      });
    }

    return groups;
  }, [filteredAndSortedClients, vipClientIds]);

  const hasActiveFilters = Object.values(filterValues).some(
    (v) => v && v !== "all"
  );

  if (isLoading) {
    return (
      <PageShell>
        <PageHeader
          title="Clients"
          subtitle="Manage your clients and their projects"
          icon={<Building2 className="h-6 w-6" />}
        />
        <KPIStrip isLoading={true} />
        <ClientListSkeleton viewMode={viewMode} density={density} />
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell>
        <PageHeader
          title="Clients"
          subtitle="Manage your clients and their projects"
          icon={<Building2 className="h-6 w-6" />}
        />
        <ErrorState
          error={error as Error}
          title="Failed to load clients"
          onRetry={() => refetch()}
        />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="Clients"
        subtitle="Manage your clients and their projects"
        icon={<Building2 className="h-6 w-6" />}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              onClick={() => setCreateDrawerOpen(true)}
              data-testid="button-add-client"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Client
            </Button>
          </div>
        }
      />

      <KPIStrip summary={summary} isLoading={summaryLoading} />

      <PipelineBar
        activeStage={activeSegment}
        onStageChange={setActiveSegment}
        stageSummary={stageSummary}
        totalClients={summary?.total ?? 0}
        needsAttentionCount={summary?.needsAttention ?? 0}
        isLoading={stageSummaryLoading}
      />

      <DataToolbar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search clients..."
        filters={dynamicFilters}
        filterValues={filterValues}
        onFilterChange={handleFilterChange}
        onClearFilters={handleClearFilters}
        sortOptions={SORT_OPTIONS}
        sortValue={sortValue}
        onSortChange={setSortValue}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center border rounded-md">
              <Button
                variant={density === "comfortable" ? "secondary" : "ghost"}
                size="icon"
                className="rounded-r-none"
                onClick={() => setDensity("comfortable")}
                aria-label="Comfortable view"
                data-testid="button-density-comfortable"
                title="Comfortable"
              >
                <AlignJustify className="h-4 w-4" />
              </Button>
              <Button
                variant={density === "compact" ? "secondary" : "ghost"}
                size="icon"
                className="rounded-l-none"
                onClick={() => setDensity("compact")}
                aria-label="Compact view"
                data-testid="button-density-compact"
                title="Compact"
              >
                <AlignCenter className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center border rounded-md">
              <Button
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                size="icon"
                className="rounded-r-none"
                onClick={() => setViewMode("grid")}
                aria-label="Grid view"
                data-testid="button-view-grid"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "table" ? "secondary" : "ghost"}
                size="icon"
                className="rounded-l-none"
                onClick={() => setViewMode("table")}
                aria-label="Table view"
                data-testid="button-view-table"
              >
                <Rows3 className="h-4 w-4" />
              </Button>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Saved views"
                  data-testid="button-saved-views"
                  title="Saved views"
                >
                  <Bookmark className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {views.length > 0 ? (
                  <>
                    {views.map((view) => (
                      <DropdownMenuItem
                        key={view.id}
                        className="flex items-center justify-between gap-2"
                        data-testid={`menu-saved-view-${view.id}`}
                      >
                        <span
                          className="flex-1 truncate cursor-pointer"
                          onClick={() => handleApplyView(view)}
                        >
                          <BookmarkCheck className="h-3.5 w-3.5 inline mr-2" />
                          {view.name}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0"
                          aria-label="Delete view"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteView(view.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                  </>
                ) : (
                  <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                    No saved views yet
                  </div>
                )}
                <DropdownMenuItem
                  onClick={() => setSaveViewOpen(true)}
                  data-testid="button-save-current-view"
                >
                  <Plus className="h-3.5 w-3.5 mr-2" />
                  Save current view
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      {selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          onClear={() => setSelectedIds(new Set())}
          onBulkStatusChange={handleBulkStatusChange}
          onExportCsv={handleExportCsv}
        />
      )}

      {vipClients.length > 0 && (
        <div className="mb-6 rounded-lg border border-border/60 bg-muted/30 p-4" style={{ borderColor: 'hsl(var(--primary) / 0.15)', backgroundColor: 'hsl(var(--primary) / 0.04)' }} data-testid="vip-clients-section">
          <div className="flex items-center gap-2 mb-3">
            <Star className="h-4 w-4 text-primary fill-primary" />
            <h3 className="font-medium text-foreground">VIP Clients</h3>
            <Badge variant="secondary" className="text-xs" style={{ backgroundColor: 'hsl(var(--primary) / 0.12)', color: 'hsl(var(--primary))' }}>{vipClients.length}</Badge>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {vipClients.map((client) => (
              <Card
                key={client.id}
                className="cursor-pointer hover-elevate"
                style={{ borderColor: 'hsl(var(--primary) / 0.15)' }}
                onClick={() => handleOpenClientSheet(client.id)}
                data-testid={`vip-card-${client.id}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarFallback style={{ backgroundColor: 'hsl(var(--primary) / 0.12)', color: 'hsl(var(--primary))' }}>
                        {getInitials(client.companyName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 min-w-0">
                        <CardTitle className="text-base truncate min-w-0">
                          {client.companyName}
                        </CardTitle>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {client.needsAttention && (
                            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                          )}
                        </div>
                      </div>
                      {client.parentName ? (
                        <p className="text-xs text-muted-foreground truncate">
                          Sub-client of {client.parentName}
                        </p>
                      ) : (
                        client.displayName && (
                          <p className="text-xs text-muted-foreground truncate">
                            {client.displayName}
                          </p>
                        )
                      )}
                      <div className="mt-1.5">
                        <Badge variant="outline" className={cn("text-xs", STAGE_TEXT_COLORS[client.stage] || "")}>
                          <span className={cn("h-1.5 w-1.5 rounded-full mr-1.5 shrink-0", STAGE_COLORS[client.stage] || "bg-muted")} />
                          {CLIENT_STAGE_LABELS[client.stage as ClientStageType] || client.stage}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <FolderKanban className="h-3.5 w-3.5 shrink-0" />
                      <span>{client.projectCount} projects</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <User className="h-3.5 w-3.5 shrink-0" />
                      <span>{client.contactCount} contacts</span>
                    </div>
                    {client.openTasksCount > 0 && (
                      <div className="flex items-center gap-1">
                        <ListChecks className="h-3.5 w-3.5 shrink-0" />
                        <span>{client.openTasksCount} tasks</span>
                      </div>
                    )}
                  </div>
                  {client.lastActivityAt && (
                    <p className="text-xs text-muted-foreground mt-1.5 truncate">
                      Last activity {formatDistanceToNow(new Date(client.lastActivityAt), { addSuffix: true })}
                    </p>
                  )}
                  {client.industry && (
                    <p className="text-xs text-muted-foreground mt-2 truncate">
                      {client.industry}
                    </p>
                  )}
                  {client.tags && client.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {client.tags.slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                      {client.tags.length > 3 && (
                        <span className="text-xs text-muted-foreground">+{client.tags.length - 3}</span>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {groupedClients.length > 0 ? (
        viewMode === "grid" ? (
          <ClientGridView
            groupedClients={groupedClients}
            selectedIds={selectedIds}
            onSelect={handleSelectClient}
            onOpenProfile={handleOpenClientSheet}
          />
        ) : (
          <ClientTableView
            groupedClients={groupedClients}
            selectedIds={selectedIds}
            onSelect={handleSelectClient}
            onOpenProfile={handleOpenClientSheet}
            density={density}
          />
        )
      ) : vipClients.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-16 w-16" />}
          title={
            hasActiveFilters || searchQuery || activeSegment !== "all"
              ? "No matching clients"
              : "No clients yet"
          }
          description={
            hasActiveFilters || searchQuery || activeSegment !== "all"
              ? "Try adjusting your filters or search query."
              : "Start by adding your first client to organize projects and manage relationships."
          }
          action={
            hasActiveFilters || searchQuery || activeSegment !== "all" ? (
              <Button
                variant="outline"
                onClick={() => {
                  handleClearFilters();
                  setSearchQuery("");
                  setActiveSegment("all");
                }}
                data-testid="button-clear-all-filters"
              >
                Clear filters
              </Button>
            ) : (
              <Button
                onClick={() => setCreateDrawerOpen(true)}
                data-testid="button-add-first-client"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Client
              </Button>
            )
          }
        />
      ) : null}

      <ClientDetailSheet
        client={detailSheetClient}
        open={detailSheetOpen}
        onOpenChange={setDetailSheetOpen}
      />

      <ClientDrawer
        open={createDrawerOpen}
        onOpenChange={setCreateDrawerOpen}
        onSubmit={handleCreateClient}
        isLoading={createClientMutation.isPending}
        mode="create"
      />

      <Dialog open={saveViewOpen} onOpenChange={setSaveViewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Current View</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="View name..."
            value={newViewName}
            onChange={(e) => setNewViewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSaveView()}
            data-testid="input-view-name"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSaveViewOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveView}
              disabled={!newViewName.trim()}
              data-testid="button-confirm-save-view"
            >
              Save View
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
