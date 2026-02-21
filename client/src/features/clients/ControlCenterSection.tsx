import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  Settings2,
  Activity,
  BarChart3,
  Globe,
  Layers,
  HeartPulse,
  AlertTriangle,
  Clock,
  MessageSquare,
  FolderOpen,
  FolderKanban,
  GripVertical,
  Pin,
  PinOff,
  ChevronUp,
  ChevronDown,
  Plus,
  TicketCheck,
  Upload,
  Send,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  WIDGET_CATALOG,
  WIDGET_MAP,
  MAX_PINNED_WIDGETS,
  getDefaultLayout,
  filterLayoutByRole,
  type WidgetLayoutItem,
  type WidgetDefinition,
} from "@shared/controlCenterWidgets";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";

const WIDGET_ICONS: Record<string, LucideIcon> = {
  tiles_activity: Activity,
  tiles_reports: BarChart3,
  tiles_portal_users: Globe,
  tiles_divisions: Layers,
  stats_health_snapshot: HeartPulse,
  stats_operational_alerts: AlertTriangle,
  feed_recent_activity: Clock,
  feed_recent_messages: MessageSquare,
  stats_assets_summary: FolderOpen,
  stats_projects_summary: FolderKanban,
};

interface ControlCenterSectionProps {
  clientId: string;
  onNavigateTab: (tabId: string) => void;
}

interface LayoutResponse {
  layout: WidgetLayoutItem[];
  isDefault: boolean;
}

function useWidgetLayout() {
  return useQuery<LayoutResponse>({
    queryKey: ["/api/v1/control-center/widgets/layout"],
    staleTime: 60_000,
  });
}

function useIsAdmin() {
  const { user } = useAuth();
  return user?.role === "admin" || user?.role === "super_user" || user?.role === "tenant_admin";
}

export function ControlCenterSection({ clientId, onNavigateTab }: ControlCenterSectionProps) {
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const { data: layoutData, isLoading } = useWidgetLayout();
  const featureFlags = useFeatureFlags();
  const isAdmin = useIsAdmin();
  const { user } = useAuth();

  const canDeleteClient = user?.role === "super_user" || user?.role === "tenant_admin" || user?.role === "admin";
  const role = isAdmin ? "admin" : "employee";
  const layout = useMemo(() => {
    if (!layoutData) return getDefaultLayout(role);
    return filterLayoutByRole(layoutData.layout, role);
  }, [layoutData, role]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6" data-testid="control-center-loading">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="control-center-section">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-indigo-500" />
            Control Center
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Quick overview and shortcuts for this client
          </p>
        </div>
        {isAdmin && featureFlags.clientControlCenterPinnedWidgets && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCustomizeOpen(true)}
            data-testid="button-customize-widgets"
          >
            <Settings2 className="h-4 w-4 mr-1.5" />
            Customize
          </Button>
        )}
      </div>

      <div className="bg-muted/30 rounded-lg p-4 border border-border/50">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-1">Quick Actions</h3>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigateTab("activity")}
            data-testid="shortcut-activity"
            className="bg-background hover:bg-muted"
          >
            <Activity className="h-4 w-4 mr-1.5 text-blue-500" />
            View Activity
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigateTab("projects")}
            data-testid="shortcut-projects"
            className="bg-background hover:bg-muted"
          >
            <FolderKanban className="h-4 w-4 mr-1.5 text-purple-500" />
            View Projects
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigateTab("messages")}
            data-testid="shortcut-new-message"
            className="bg-background hover:bg-muted"
          >
            <Send className="h-4 w-4 mr-1.5 text-violet-500" />
            New Message
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigateTab("asset-library")}
            data-testid="shortcut-upload-asset"
            className="bg-background hover:bg-muted"
          >
            <Upload className="h-4 w-4 mr-1.5 text-cyan-500" />
            Upload Asset
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {layout.map((item) => {
          const def = WIDGET_MAP.get(item.id);
          if (!def) return null;
          const sizeClass =
            item.size === "lg"
              ? "md:col-span-2 xl:col-span-3"
              : item.size === "md"
                ? "md:col-span-2 xl:col-span-2"
                : "";
          return (
            <div key={item.id} className={sizeClass}>
              <WidgetRenderer
                widgetId={item.id}
                def={def}
                clientId={clientId}
                onNavigateTab={onNavigateTab}
              />
            </div>
          );
        })}
      </div>

      {canDeleteClient && (
        <DangerZoneCard clientId={clientId} />
      )}

      {customizeOpen && (
        <CustomizeSheet
          open={customizeOpen}
          onOpenChange={setCustomizeOpen}
          currentLayout={layout}
          role={role}
        />
      )}
    </div>
  );
}

function DangerZoneCard({ clientId }: { clientId: string }) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: client } = useQuery<{ companyName: string }>({
    queryKey: ["/api/clients", clientId],
    enabled: !!clientId,
  });

  const deleteClientMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/clients/${clientId}`);
    },
    onSuccess: () => {
      toast({ title: "Client deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      navigate("/clients");
    },
    onError: () => {
      toast({ title: "Failed to delete client", variant: "destructive" });
    },
  });

  return (
    <div className="border-t pt-6">
      <Card className="border-destructive/50 bg-destructive/5" data-testid="danger-zone-card">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-destructive/10">
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </div>
            <CardTitle className="text-sm font-medium text-destructive">Danger Zone</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Delete this client</p>
              <p className="text-xs text-muted-foreground">
                Permanently remove this client and all associated data. This cannot be undone.
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteOpen(true)}
              data-testid="button-delete-client"
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Delete Client
            </Button>
          </div>
          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Client</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete "{client?.companyName}"? This action cannot be undone.
                  All associated data will be removed, and any projects linked to this client will be unlinked.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-cancel-delete-client">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteClientMutation.mutate()}
                  disabled={deleteClientMutation.isPending}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  data-testid="button-confirm-delete-client"
                >
                  {deleteClientMutation.isPending ? "Deleting..." : "Delete Client"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}

interface WidgetRendererProps {
  widgetId: string;
  def: WidgetDefinition;
  clientId: string;
  onNavigateTab: (tabId: string) => void;
}

function WidgetRenderer({ widgetId, def, clientId, onNavigateTab }: WidgetRendererProps) {
  const Icon = WIDGET_ICONS[widgetId] || Settings2;
  const colorClass = WIDGET_ICON_COLORS[widgetId];

  const tabMap: Record<string, string> = {
    tiles_activity: "activity",
    tiles_reports: "reports",
    tiles_portal_users: "portal",
    tiles_divisions: "divisions",
    feed_recent_activity: "activity",
    feed_recent_messages: "messages",
    stats_assets_summary: "asset-library",
    stats_projects_summary: "projects",
  };

  const navigateTo = tabMap[widgetId];

  switch (widgetId) {
    case "tiles_activity":
      return (
        <TileCard
          icon={Icon}
          title="Activity"
          description="Recent client activity"
          onClick={navigateTo ? () => onNavigateTab(navigateTo) : undefined}
          testId="widget-tiles-activity"
          iconColorClass={colorClass}
        >
          <ActivityTileContent clientId={clientId} />
        </TileCard>
      );
    case "tiles_reports":
      return (
        <TileCard
          icon={Icon}
          title="Reports"
          description="Client reporting metrics"
          onClick={navigateTo ? () => onNavigateTab(navigateTo) : undefined}
          badge="Admin"
          testId="widget-tiles-reports"
          iconColorClass={colorClass}
        >
          <ReportsTileContent clientId={clientId} />
        </TileCard>
      );
    case "tiles_portal_users":
      return (
        <TileCard
          icon={Icon}
          title="Portal Users"
          description="Client portal access"
          onClick={navigateTo ? () => onNavigateTab(navigateTo) : undefined}
          badge="Admin"
          testId="widget-tiles-portal-users"
          iconColorClass={colorClass}
        >
          <PortalUsersTileContent clientId={clientId} />
        </TileCard>
      );
    case "tiles_divisions":
      return (
        <TileCard
          icon={Icon}
          title="Divisions"
          description="Client division structure"
          onClick={navigateTo ? () => onNavigateTab(navigateTo) : undefined}
          testId="widget-tiles-divisions"
          iconColorClass={colorClass}
        >
          <DivisionsTileContent clientId={clientId} />
        </TileCard>
      );
    case "stats_health_snapshot":
      return (
        <TileCard
          icon={Icon}
          title="Health Snapshot"
          description="Key health indicators"
          testId="widget-health-snapshot"
          iconColorClass={colorClass}
        >
          <HealthSnapshotContent clientId={clientId} />
        </TileCard>
      );
    case "stats_operational_alerts":
      return (
        <TileCard
          icon={Icon}
          title="Operational Alerts"
          description="Issues requiring attention"
          testId="widget-operational-alerts"
          iconColorClass={colorClass}
        >
          <OperationalAlertsContent clientId={clientId} />
        </TileCard>
      );
    case "stats_assets_summary":
      return (
        <TileCard
          icon={Icon}
          title="Assets Summary"
          description="Files and storage overview"
          onClick={navigateTo ? () => onNavigateTab(navigateTo) : undefined}
          testId="widget-assets-summary"
          iconColorClass={colorClass}
        >
          <AssetsSummaryContent clientId={clientId} />
        </TileCard>
      );
    case "stats_projects_summary":
      return (
        <TileCard
          icon={Icon}
          title="Projects Summary"
          description="Active projects overview"
          onClick={navigateTo ? () => onNavigateTab(navigateTo) : undefined}
          testId="widget-projects-summary"
          iconColorClass={colorClass}
        >
          <ProjectsSummaryContent clientId={clientId} />
        </TileCard>
      );
    case "feed_recent_activity":
      return (
        <TileCard
          icon={Icon}
          title="Recent Activity"
          description="Latest updates for this client"
          onClick={navigateTo ? () => onNavigateTab(navigateTo) : undefined}
          testId="widget-feed-recent-activity"
          iconColorClass={colorClass}
        >
          <RecentActivityContent clientId={clientId} />
        </TileCard>
      );
    case "feed_recent_messages":
      return (
        <TileCard
          icon={Icon}
          title="Recent Messages"
          description="Latest conversations"
          onClick={navigateTo ? () => onNavigateTab(navigateTo) : undefined}
          testId="widget-feed-recent-messages"
          iconColorClass={colorClass}
        >
          <RecentMessagesContent />
        </TileCard>
      );
    default:
      return (
        <TileCard icon={Icon} title={def.title} description={def.description} testId={`widget-${widgetId}`} iconColorClass={colorClass}>
          <p className="text-sm text-muted-foreground">Widget coming soon</p>
        </TileCard>
      );
  }
}

const WIDGET_ICON_COLORS: Record<string, string> = {
  tiles_activity: "text-blue-500 bg-blue-500/10",
  tiles_reports: "text-amber-500 bg-amber-500/10",
  tiles_portal_users: "text-emerald-500 bg-emerald-500/10",
  tiles_divisions: "text-indigo-500 bg-indigo-500/10",
  stats_health_snapshot: "text-rose-500 bg-rose-500/10",
  stats_operational_alerts: "text-orange-500 bg-orange-500/10",
  feed_recent_activity: "text-sky-500 bg-sky-500/10",
  feed_recent_messages: "text-violet-500 bg-violet-500/10",
  stats_assets_summary: "text-cyan-500 bg-cyan-500/10",
  stats_projects_summary: "text-purple-500 bg-purple-500/10",
};

interface TileCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick?: () => void;
  badge?: string;
  testId: string;
  children: React.ReactNode;
  iconColorClass?: string;
}

function TileCard({ icon: Icon, title, description, onClick, badge, testId, children, iconColorClass }: TileCardProps) {
  return (
    <Card
      className={cn(
        "transition-all duration-200",
        onClick && "cursor-pointer hover:bg-muted/50",
      )}
      onClick={onClick}
      data-testid={testId}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
          <div className={cn("p-1.5 rounded-md", iconColorClass || "bg-muted")}>
            <Icon className={cn("h-4 w-4", !iconColorClass && "text-muted-foreground")} />
          </div>
            <CardTitle className="tracking-tight font-medium text-[16px]">{title}</CardTitle>
          </div>
          {badge && (
            <Badge variant="secondary" className="text-[10px]">
              {badge}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}

function StatValue({ label, value, trend }: { label: string; value: string | number; trend?: "up" | "down" | "neutral" }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function ActivityTileContent({ clientId }: { clientId: string }) {
  const { data, isLoading } = useQuery<any[]>({
    queryKey: ["/api/activity-log", "client", clientId],
    enabled: !!clientId,
  });
  if (isLoading) return <Skeleton className="h-12 w-full" />;
  const count = data?.length ?? 0;
  return (
    <div className="flex items-center gap-4">
      <StatValue label="Recent Items" value={count} />
      <p className="text-xs text-muted-foreground ml-auto">
        {count > 0 ? "View all activity →" : "No recent activity"}
      </p>
    </div>
  );
}

function ReportsTileContent({ clientId }: { clientId: string }) {
  return (
    <div className="flex items-center gap-4">
      <StatValue label="Reports" value="—" />
      <p className="text-xs text-muted-foreground ml-auto">View reports →</p>
    </div>
  );
}

function PortalUsersTileContent({ clientId }: { clientId: string }) {
  return (
    <div className="flex items-center gap-4">
      <StatValue label="Portal Users" value="—" />
      <p className="text-xs text-muted-foreground ml-auto">Manage access →</p>
    </div>
  );
}

function DivisionsTileContent({ clientId }: { clientId: string }) {
  const { data = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/v1/clients", clientId, "divisions"],
    enabled: !!clientId,
  });
  if (isLoading) return <Skeleton className="h-12 w-full" />;
  return (
    <div className="flex items-center gap-4">
      <StatValue label="Divisions" value={data.length} />
      <p className="text-xs text-muted-foreground ml-auto">
        {data.length > 0 ? "View all →" : "No divisions"}
      </p>
    </div>
  );
}

function HealthSnapshotContent({ clientId }: { clientId: string }) {
  const { data: projects = [] } = useQuery<any[]>({
    queryKey: ["/api/projects", { clientId }],
    enabled: !!clientId,
  });
  const active = projects.filter((p: any) => p.status === "active" || p.status === "in_progress").length;
  const completed = projects.filter((p: any) => p.status === "completed" || p.status === "done").length;
  return (
    <div className="grid grid-cols-3 gap-3">
      <StatValue label="Total Projects" value={projects.length} />
      <StatValue label="Active" value={active} />
      <StatValue label="Completed" value={completed} />
    </div>
  );
}

function OperationalAlertsContent({ clientId }: { clientId: string }) {
  const { data: rawTickets } = useQuery<any>({
    queryKey: ["/api/v1/support/tickets", { clientId }],
    enabled: !!clientId,
  });
  const tickets: any[] = Array.isArray(rawTickets) ? rawTickets : Array.isArray(rawTickets?.tickets) ? rawTickets.tickets : [];
  const openTickets = tickets.filter(
    (t: any) => t.status === "open" || t.status === "in_progress",
  ).length;
  const urgentTickets = tickets.filter(
    (t: any) => t.priority === "urgent" || t.priority === "high",
  ).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground flex items-center gap-1.5">
          <TicketCheck className="h-3.5 w-3.5" />
          Open Tickets
        </span>
        <Badge variant={openTickets > 0 ? "destructive" : "secondary"} className="text-xs">
          {openTickets}
        </Badge>
      </div>
      {urgentTickets > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />
            High/Urgent Priority
          </span>
          <Badge variant="destructive" className="text-xs">
            {urgentTickets}
          </Badge>
        </div>
      )}
      {openTickets === 0 && (
        <p className="text-xs text-muted-foreground">No open issues — all clear!</p>
      )}
    </div>
  );
}

function RecentActivityContent({ clientId }: { clientId: string }) {
  const { data = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/activity-log", "client", clientId],
    enabled: !!clientId,
  });
  if (isLoading) return <Skeleton className="h-20 w-full" />;
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No recent activity</p>;
  }
  return (
    <div className="space-y-2">
      {data.slice(0, 4).map((item: any, idx: number) => (
        <div key={item.id || idx} className="flex items-start gap-2 text-sm">
          <Clock className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground line-clamp-1">
            {item.description || item.action || "Activity event"}
          </span>
        </div>
      ))}
    </div>
  );
}

function RecentMessagesContent() {
  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">View latest conversations</p>
      <p className="text-xs text-muted-foreground">Navigate to Messages tab →</p>
    </div>
  );
}

function AssetsSummaryContent({ clientId }: { clientId: string }) {
  return (
    <div className="flex items-center gap-4">
      <StatValue label="Assets" value="—" />
      <p className="text-xs text-muted-foreground ml-auto">Manage files →</p>
    </div>
  );
}

function ProjectsSummaryContent({ clientId }: { clientId: string }) {
  const { data: projects = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/projects", { clientId }],
    enabled: !!clientId,
  });
  if (isLoading) return <Skeleton className="h-12 w-full" />;
  const active = projects.filter((p: any) => p.status === "active" || p.status === "in_progress").length;
  return (
    <div className="flex items-center gap-4">
      <StatValue label="Total" value={projects.length} />
      <StatValue label="Active" value={active} />
      <p className="text-xs text-muted-foreground ml-auto">View all →</p>
    </div>
  );
}

interface CustomizeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentLayout: WidgetLayoutItem[];
  role: "admin" | "employee";
}

function CustomizeSheet({ open, onOpenChange, currentLayout, role }: CustomizeSheetProps) {
  const [pinnedItems, setPinnedItems] = useState<WidgetLayoutItem[]>(
    () => [...currentLayout].sort((a, b) => a.order - b.order),
  );
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setPinnedItems([...currentLayout].sort((a, b) => a.order - b.order));
    }
  }, [open, currentLayout]);

  const pinnedIds = useMemo(() => new Set(pinnedItems.map((i) => i.id)), [pinnedItems]);

  const availableWidgets = useMemo(
    () =>
      WIDGET_CATALOG.filter((w) => {
        if (pinnedIds.has(w.id)) return false;
        if (role !== "admin" && w.minRole === "admin") return false;
        return true;
      }),
    [pinnedIds, role],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const saveMutation = useMutation({
    mutationFn: async (layout: WidgetLayoutItem[]) => {
      return apiRequest("PUT", "/api/v1/control-center/widgets/layout", { layout });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/control-center/widgets/layout"] });
      toast({ title: "Control Center updated", description: "Your widget layout has been saved." });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save layout.", variant: "destructive" });
    },
  });

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setPinnedItems((items) => {
      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return items;
      const updated = [...items];
      const [moved] = updated.splice(oldIndex, 1);
      updated.splice(newIndex, 0, moved);
      return updated.map((item, i) => ({ ...item, order: i }));
    });
  }, []);

  const pinWidget = useCallback((widgetId: string) => {
    const def = WIDGET_MAP.get(widgetId);
    if (!def) return;
    setPinnedItems((items) => {
      if (items.length >= MAX_PINNED_WIDGETS) return items;
      return [...items, { id: widgetId, order: items.length, size: def.defaultSize }];
    });
  }, []);

  const unpinWidget = useCallback((widgetId: string) => {
    setPinnedItems((items) =>
      items.filter((i) => i.id !== widgetId).map((item, i) => ({ ...item, order: i })),
    );
  }, []);

  const moveUp = useCallback((widgetId: string) => {
    setPinnedItems((items) => {
      const idx = items.findIndex((i) => i.id === widgetId);
      if (idx <= 0) return items;
      const updated = [...items];
      [updated[idx - 1], updated[idx]] = [updated[idx], updated[idx - 1]];
      return updated.map((item, i) => ({ ...item, order: i }));
    });
  }, []);

  const moveDown = useCallback((widgetId: string) => {
    setPinnedItems((items) => {
      const idx = items.findIndex((i) => i.id === widgetId);
      if (idx === -1 || idx >= items.length - 1) return items;
      const updated = [...items];
      [updated[idx], updated[idx + 1]] = [updated[idx + 1], updated[idx]];
      return updated.map((item, i) => ({ ...item, order: i }));
    });
  }, []);

  const handleSave = () => {
    saveMutation.mutate(pinnedItems);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto" data-testid="customize-widgets-sheet">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Customize Control Center
          </SheetTitle>
          <SheetDescription>
            Drag to reorder, pin or unpin widgets. Max {MAX_PINNED_WIDGETS} widgets.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          <div>
            <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
              <Pin className="h-3.5 w-3.5" />
              Pinned Widgets ({pinnedItems.length}/{MAX_PINNED_WIDGETS})
            </h3>
            {pinnedItems.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-lg">
                No widgets pinned. Add widgets from below.
              </p>
            )}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
              modifiers={[restrictToVerticalAxis]}
            >
              <SortableContext
                items={pinnedItems.map((i) => i.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-1.5">
                  {pinnedItems.map((item, idx) => {
                    const def = WIDGET_MAP.get(item.id);
                    if (!def) return null;
                    return (
                      <SortableWidgetItem
                        key={item.id}
                        item={item}
                        def={def}
                        index={idx}
                        total={pinnedItems.length}
                        onUnpin={unpinWidget}
                        onMoveUp={moveUp}
                        onMoveDown={moveDown}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          </div>

          {availableWidgets.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Available Widgets
              </h3>
              <div className="space-y-1.5">
                {availableWidgets.map((def) => {
                  const Icon = WIDGET_ICONS[def.id] || Settings2;
                  return (
                    <div
                      key={def.id}
                      className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                      data-testid={`available-widget-${def.id}`}
                    >
                      <div className="p-1.5 rounded-md bg-muted">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{def.title}</p>
                        <p className="text-xs text-muted-foreground">{def.description}</p>
                      </div>
                      {def.minRole === "admin" && (
                        <Badge variant="secondary" className="text-[10px] shrink-0">Admin</Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => pinWidget(def.id)}
                        disabled={pinnedItems.length >= MAX_PINNED_WIDGETS}
                        data-testid={`button-pin-${def.id}`}
                      >
                        <Pin className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-4 border-t sticky bottom-0 bg-background pb-4">
            <Button
              className="flex-1"
              onClick={handleSave}
              disabled={saveMutation.isPending}
              data-testid="button-save-layout"
            >
              {saveMutation.isPending ? "Saving..." : "Save Layout"}
            </Button>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="button-cancel-customize"
            >
              Cancel
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface SortableWidgetItemProps {
  item: WidgetLayoutItem;
  def: WidgetDefinition;
  index: number;
  total: number;
  onUnpin: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
}

function SortableWidgetItem({
  item,
  def,
  index,
  total,
  onUnpin,
  onMoveUp,
  onMoveDown,
}: SortableWidgetItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  const Icon = WIDGET_ICONS[item.id] || Settings2;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg border bg-card",
        isDragging && "shadow-lg opacity-90 ring-2 ring-primary/20",
      )}
      data-testid={`pinned-widget-${item.id}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none p-1"
        data-testid={`drag-handle-${item.id}`}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>
      <div className="p-1.5 rounded-md bg-muted">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{def.title}</p>
        <p className="text-xs text-muted-foreground">{def.description}</p>
      </div>
      {def.minRole === "admin" && (
        <Badge variant="secondary" className="text-[10px] shrink-0">Admin</Badge>
      )}
      <div className="flex items-center gap-0.5 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onMoveUp(item.id)}
          disabled={index === 0}
          data-testid={`button-move-up-${item.id}`}
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onMoveDown(item.id)}
          disabled={index >= total - 1}
          data-testid={`button-move-down-${item.id}`}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive"
          onClick={() => onUnpin(item.id)}
          data-testid={`button-unpin-${item.id}`}
        >
          <PinOff className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
