import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import type { TenancyHealth } from "./types";

interface TenantHealthSectionProps {
  tenancyHealth: TenancyHealth | undefined;
  tenancyLoading: boolean;
  refetchTenancy: () => void;
}

export function TenantHealthSection({ tenancyHealth, tenancyLoading, refetchTenancy }: TenantHealthSectionProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Tenant Health Overview</CardTitle>
          <CardDescription>Multi-tenancy system status and warnings</CardDescription>
        </div>
        <Button 
          variant="outline" 
          onClick={() => refetchTenancy()}
          disabled={tenancyLoading}
          data-testid="button-refresh-tenancy"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${tenancyLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {tenancyLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : tenancyHealth ? (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground">Tenancy Mode</div>
                <div className="text-xl font-bold">{tenancyHealth.currentMode}</div>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground">Active Tenants</div>
                <div className="text-xl font-bold">{tenancyHealth.activeTenantCount}</div>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground">Missing Tenant IDs</div>
                <div className="text-xl font-bold">{tenancyHealth.totalMissing}</div>
              </div>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="text-sm font-medium mb-3">Warning Statistics</div>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <div className="text-sm text-muted-foreground">Last 24 Hours</div>
                  <div className="font-medium">{tenancyHealth.warningStats.last24Hours}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Last 7 Days</div>
                  <div className="font-medium">{tenancyHealth.warningStats.last7Days}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Total</div>
                  <div className="font-medium">{tenancyHealth.warningStats.total}</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Unable to fetch tenant health status
          </div>
        )}
      </CardContent>
    </Card>
  );
}
