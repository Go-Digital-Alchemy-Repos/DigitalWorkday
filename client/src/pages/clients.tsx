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
import { ClientDrawer } from "@/features/clients";
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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  PageShell,
  PageHeader,
  DataToolbar,
  EmptyState,
  LoadingState,
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
import { useLocalStorage, useSavedViews } from "@/hooks/use-local-storage";
import type { SavedView } from "@/hooks/use-local-storage";
import type { ClientWithContacts, Client } from "@shared/schema";
import { cn } from "@/lib/utils";

interface ClientWithHierarchy extends Client {
  depth: number;
  parentName?: string;
  contactCount: number;
  projectCount: number;
}

const STATUS_FILTERS: FilterConfig[] = [
  {
    key: "status",
    label: "Status",
    options: [
      { value: "all", label: "All statuses" },
      { value: "active", label: "Active" },
      { value: "inactive", label: "Inactive" },
      { value: "prospect", label: "Prospect" },
    ],
  },
  {
    key: "industry",
    label: "Industry",
    options: [
      { value: "all", label: "All industries" },
    ],
  },
];

const SORT_OPTIONS: SortOption[] = [
  { value: "name-asc", label: "Name (A-Z)" },
  { value: "name-desc", label: "Name (Z-A)" },
  { value: "projects-desc", label: "Most projects" },
  { value: "projects-asc", label: "Fewest projects" },
  { value: "contacts-desc", label: "Most contacts" },
  { value: "contacts-asc", label: "Fewest contacts" },
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
            "cursor-pointer transition-colors hover-elevate",
            isSelected && "ring-2 ring-primary"
          )}
          data-testid={`card-client-${client.id}`}
        >
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                {client.depth > 0 && (
                  <div
                    className="flex items-center text-muted-foreground shrink-0"
                    style={{ paddingLeft: `${(client.depth - 1) * 12}px` }}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </div>
                )}
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {getInitials(client.companyName)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-base truncate">
                    {client.companyName}
                  </CardTitle>
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
                </div>
              </div>
              <Badge className={getStatusColor(client.status)}>
                {client.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <FolderKanban className="h-3.5 w-3.5" />
                <span>{client.projectCount} projects</span>
              </div>
              <div className="flex items-center gap-1">
                <User className="h-3.5 w-3.5" />
                <span>{client.contactCount} contacts</span>
              </div>
            </div>
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
          "transition-colors",
          selectedIds.has(parent.id) && "ring-2 ring-primary"
        )}
        data-testid={`card-client-group-${parent.id}`}
      >
        <div
          onClick={() => onOpenProfile(parent.id)}
          className="cursor-pointer overflow-visible hover-elevate rounded-t-md"
        >
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {getInitials(parent.companyName)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-base truncate">
                    {parent.companyName}
                  </CardTitle>
                  {parent.displayName && (
                    <p className="text-xs text-muted-foreground truncate">
                      {parent.displayName}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={getStatusColor(parent.status)}>
                  {parent.status}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 pb-3">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <FolderKanban className="h-3.5 w-3.5" />
                <span>{parent.projectCount} projects</span>
              </div>
              <div className="flex items-center gap-1">
                <User className="h-3.5 w-3.5" />
                <span>{parent.contactCount} contacts</span>
              </div>
            </div>
            {parent.industry && (
              <p className="text-xs text-muted-foreground mt-2 truncate">
                {parent.industry}
              </p>
            )}
            {parent.tags && parent.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {parent.tags.slice(0, 3).map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
                {parent.tags.length > 3 && (
                  <span className="text-xs text-muted-foreground">+{parent.tags.length - 3}</span>
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
                  "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover-elevate",
                  selectedIds.has(child.id) && "ring-1 ring-primary"
                )}
                data-testid={`card-child-client-${child.id}`}
              >
                {showCheckbox && (
                  <div
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
                <Avatar className="h-6 w-6">
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
                <Badge
                  className={cn(getStatusColor(child.status), "text-xs")}
                >
                  {child.status}
                </Badge>
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
            <p
              className={cn(
                "font-medium truncate",
                compact ? "text-sm" : "text-sm"
              )}
              data-testid={`text-client-name-${client.id}`}
            >
              {client.companyName}
            </p>
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

        <div className="hidden sm:flex items-center gap-2 w-24 shrink-0 justify-end">
          <Badge
            className={cn(getStatusColor(client.status), compact && "text-xs")}
          >
            {client.status}
          </Badge>
        </div>

        <div className="hidden md:flex items-center gap-1 text-sm text-muted-foreground w-24 shrink-0 justify-end">
          {client.industry ? (
            <span className="truncate text-xs">{client.industry}</span>
          ) : (
            <span className="text-xs text-muted-foreground/50">--</span>
          )}
        </div>

        <div className="hidden lg:flex items-center gap-4 text-sm text-muted-foreground w-40 shrink-0 justify-end">
          <div className="flex items-center gap-1">
            <FolderKanban className="h-3.5 w-3.5" />
            <span>{client.projectCount}</span>
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
      <div className="hidden sm:block w-24 text-right">Status</div>
      <div className="hidden md:block w-24 text-right">Industry</div>
      <div className="hidden lg:block w-40 text-right">Stats</div>
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
}: {
  count: number;
  onClear: () => void;
  onBulkStatusChange: (status: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 p-3 mb-4 rounded-md bg-primary/5 border border-primary/20">
      <span className="text-sm font-medium">
        {count} client{count !== 1 ? "s" : ""} selected
      </span>
      <div className="flex items-center gap-2 ml-auto">
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
        <Button variant="ghost" size="sm" onClick={onClear} data-testid="button-clear-selection">
          Clear
        </Button>
      </div>
    </div>
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

export default function ClientsPage() {
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [newViewName, setNewViewName] = useState("");
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
      STATUS_FILTERS[0],
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

  const filteredAndSortedClients = useMemo(() => {
    if (!hierarchyClients) return [];

    let result = hierarchyClients.filter((client) => {
      const matchesSearch =
        !searchQuery ||
        client.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        client.displayName
          ?.toLowerCase()
          .includes(searchQuery.toLowerCase()) ||
        client.parentName?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        !filterValues.status ||
        filterValues.status === "all" ||
        client.status === filterValues.status;

      const matchesIndustry =
        !filterValues.industry ||
        filterValues.industry === "all" ||
        client.industry === filterValues.industry;

      const matchesTag =
        !filterValues.tag ||
        filterValues.tag === "all" ||
        (client.tags && client.tags.includes(filterValues.tag));

      return matchesSearch && matchesStatus && matchesIndustry && matchesTag;
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
  }, [hierarchyClients, searchQuery, filterValues, sortValue]);

  const groupedClients = useMemo(() => {
    const groups: { parent: ClientWithHierarchy; children: ClientWithHierarchy[] }[] = [];
    const clientMap = new Map<string, ClientWithHierarchy>();
    const childrenByParent = new Map<string, ClientWithHierarchy[]>();

    for (const client of filteredAndSortedClients) {
      clientMap.set(client.id, client);
    }

    const findRoot = (client: ClientWithHierarchy): string => {
      if (!client.parentClientId) return client.id;
      const parent = clientMap.get(client.parentClientId);
      if (parent) return findRoot(parent);
      return client.id;
    };

    for (const client of filteredAndSortedClients) {
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

    for (const client of filteredAndSortedClients) {
      if (assignedIds.has(client.id)) continue;
      groups.push({
        parent: client,
        children: childrenByParent.get(client.id) || [],
      });
    }

    return groups;
  }, [filteredAndSortedClients]);

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
                data-testid="button-view-grid"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "table" ? "secondary" : "ghost"}
                size="icon"
                className="rounded-l-none"
                onClick={() => setViewMode("table")}
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
        />
      )}

      {filteredAndSortedClients.length > 0 ? (
        viewMode === "grid" ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groupedClients.map(({ parent, children }) => (
              <ClientGroupCard
                key={parent.id}
                parent={parent}
                children={children}
                selectedIds={selectedIds}
                onSelect={handleSelectClient}
                showCheckbox={selectedIds.size > 0}
                onOpenProfile={(id) => navigate(`/clients/${id}`)}
              />
            ))}
          </div>
        ) : (
          <Card>
            <TableHeader compact={density === "compact"} />
            {groupedClients.map(({ parent, children }) => (
              <ClientGroupRows
                key={parent.id}
                parent={parent}
                children={children}
                selectedIds={selectedIds}
                onSelect={handleSelectClient}
                showCheckbox={selectedIds.size > 0}
                compact={density === "compact"}
                onOpenProfile={(id) => navigate(`/clients/${id}`)}
              />
            ))}
          </Card>
        )
      ) : (
        <EmptyState
          icon={<Building2 className="h-16 w-16" />}
          title={
            hasActiveFilters || searchQuery
              ? "No matching clients"
              : "No clients yet"
          }
          description={
            hasActiveFilters || searchQuery
              ? "Try adjusting your filters or search query."
              : "Start by adding your first client to organize projects and manage relationships."
          }
          action={
            hasActiveFilters || searchQuery ? (
              <Button
                variant="outline"
                onClick={() => {
                  handleClearFilters();
                  setSearchQuery("");
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
      )}

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
