import { useState, useEffect, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import {
  setActingTenantId,
  clearTenantScopedCaches,
  queryClient,
} from "@/lib/queryClient";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, BarChart3, Globe, MessageSquareText } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageSkeleton } from "@/components/skeletons/page-skeleton";
import { cn } from "@/lib/utils";

const ReportsPage = lazy(() => import("@/pages/reports"));
const SuperAdminPlatformReports = lazy(() => import("@/pages/super-admin-platform-reports"));
const SuperAdminChatPage = lazy(() => import("@/pages/super-chat-monitoring"));

interface Tenant {
  id: string;
  name: string;
  status: string;
}

function NoTenantSelected() {
  return (
    <div className="flex flex-col items-center justify-center h-full py-24 text-center">
      <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
        <Building2 className="h-7 w-7 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold mb-1">Select a tenant</h3>
      <p className="text-sm text-muted-foreground max-w-xs">
        Choose a tenant from the dropdown above to view their full reports and analytics, exactly as a tenant admin would see them.
      </p>
    </div>
  );
}

export default function SuperAdminReportsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"platform" | "tenant" | "chat">("platform");
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);

  if (user?.role !== "super_user") {
    return <Redirect to="/" />;
  }

  const { data: rawTenants, isLoading: tenantsLoading } = useQuery<any>({
    queryKey: ["/api/v1/super/tenants-detail"],
    staleTime: 5 * 60_000,
  });

  const tenants: Tenant[] = Array.isArray(rawTenants)
    ? rawTenants
    : Array.isArray(rawTenants?.tenants)
    ? rawTenants.tenants
    : [];

  const selectedTenant = tenants.find((t) => t.id === selectedTenantId) ?? null;

  const handleTenantSelect = (tenantId: string) => {
    setActingTenantId(tenantId);
    clearTenantScopedCaches();
    queryClient.invalidateQueries({ queryKey: ["/api/features/flags"] });
    setSelectedTenantId(tenantId);
  };

  useEffect(() => {
    return () => {
      setActingTenantId(null);
      clearTenantScopedCaches();
      queryClient.invalidateQueries({ queryKey: ["/api/features/flags"] });
    };
  }, []);

  useEffect(() => {
    if (activeTab !== "tenant") {
      setActingTenantId(null);
    } else if (selectedTenantId) {
      setActingTenantId(selectedTenantId);
    }
  }, [activeTab, selectedTenantId]);

  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => setActiveTab(v as "platform" | "tenant" | "chat")}
      className="flex flex-col h-full overflow-hidden"
    >
      {/* Page header + tab list */}
      <div className="shrink-0 px-4 sm:px-6 pt-4 border-b">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold leading-tight">Reports</h1>
            <p className="text-xs text-muted-foreground">Platform analytics, messaging, and per-tenant reporting</p>
          </div>
        </div>

        <TabsList className="h-9 rounded-none bg-transparent border-none gap-0 p-0 -mb-px">
          <TabsTrigger
            value="platform"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 h-9 text-sm gap-1.5"
            data-testid="tab-platform-reports"
          >
            <Globe className="h-3.5 w-3.5" />
            Platform Overview
          </TabsTrigger>
          <TabsTrigger
            value="chat"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 h-9 text-sm gap-1.5"
            data-testid="tab-chat-system"
          >
            <MessageSquareText className="h-3.5 w-3.5" />
            Chat System
          </TabsTrigger>
          <TabsTrigger
            value="tenant"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 h-9 text-sm gap-1.5"
            data-testid="tab-tenant-reports"
          >
            <Building2 className="h-3.5 w-3.5" />
            Tenant Reports
          </TabsTrigger>
        </TabsList>
      </div>

      {/* Platform Overview tab */}
      <TabsContent
        value="platform"
        className={cn(
          "flex-1 overflow-hidden mt-0",
          activeTab !== "platform" && "hidden"
        )}
      >
        <div className="h-full overflow-auto">
          <Suspense fallback={<PageSkeleton />}>
            <SuperAdminPlatformReports />
          </Suspense>
        </div>
      </TabsContent>

      {/* Chat System tab */}
      <TabsContent
        value="chat"
        className={cn(
          "flex-1 overflow-hidden mt-0",
          activeTab !== "chat" && "hidden"
        )}
      >
        <div className="h-full overflow-auto">
          <Suspense fallback={<PageSkeleton />}>
            <SuperAdminChatPage />
          </Suspense>
        </div>
      </TabsContent>

      {/* Tenant Reports tab */}
      <TabsContent
        value="tenant"
        className={cn(
          "flex-1 overflow-hidden mt-0 flex flex-col",
          activeTab !== "tenant" && "hidden"
        )}
      >
        {/* Tenant picker bar */}
        <div className="shrink-0 px-4 sm:px-6 py-3 border-b bg-muted/30 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
            <Building2 className="h-4 w-4" />
            <span>Select tenant:</span>
          </div>
          {tenantsLoading ? (
            <Skeleton className="h-9 w-64 rounded-md" />
          ) : (
            <Select value={selectedTenantId || ""} onValueChange={handleTenantSelect}>
              <SelectTrigger className="w-64 h-9" data-testid="select-tenant-reports">
                <SelectValue placeholder="Choose a tenant…" />
              </SelectTrigger>
              <SelectContent>
                {tenants.map((t) => (
                  <SelectItem key={t.id} value={t.id} data-testid={`option-tenant-${t.id}`}>
                    <div className="flex items-center gap-2">
                      <span>{t.name}</span>
                      <Badge
                        variant={t.status === "active" ? "secondary" : "outline"}
                        className="text-[10px] px-1.5 py-0 h-4 capitalize"
                      >
                        {t.status}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {selectedTenant && (
            <span className="text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-2 py-1 rounded-md">
              Viewing as: {selectedTenant.name}
            </span>
          )}
        </div>

        {/* Report content area */}
        <div className="flex-1 overflow-hidden">
          {selectedTenantId && selectedTenant ? (
            <Suspense fallback={<PageSkeleton />}>
              <ReportsPage key={selectedTenantId} />
            </Suspense>
          ) : (
            <NoTenantSelected />
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
}
