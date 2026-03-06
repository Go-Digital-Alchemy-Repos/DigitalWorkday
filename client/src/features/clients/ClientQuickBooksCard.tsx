import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, XCircle, AlertTriangle, ExternalLink, Link2 } from "lucide-react";
import { SiQuickbooks } from "react-icons/si";
import { useAuth } from "@/lib/auth";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
import { useLocation } from "wouter";

interface ClientMapping {
  mappingStatus: string;
  quickbooksDisplayName?: string | null;
  quickbooksCustomerId?: string | null;
  lastSyncedAt?: string | null;
  lastSyncStatus?: string | null;
  lastSyncError?: string | null;
  isLocked?: boolean;
}

export function ClientQuickBooksCard({ clientId }: { clientId: string }) {
  const { user } = useAuth();
  const flags = useFeatureFlags();
  const [, setLocation] = useLocation();

  const isAdmin = user?.role === "admin" || user?.role === "tenant_owner" || user?.role === "super_user";

  if (!flags.enableQuickbooksClientMapping || !isAdmin) return null;

  const { data: mapping, isLoading } = useQuery<ClientMapping>({
    queryKey: ["/api/integrations/quickbooks/client-mappings", clientId],
    enabled: flags.enableQuickbooksClientMapping && isAdmin,
  });

  if (isLoading) {
    return (
      <Card data-testid="card-client-qb-loading">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-4 w-32" />
        </CardContent>
      </Card>
    );
  }

  const isMapped = mapping?.mappingStatus === "mapped";
  const hasError = mapping?.mappingStatus === "sync_error";

  return (
    <Card data-testid="card-client-qb-status">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <SiQuickbooks className="h-4 w-4 text-green-600" />
            QuickBooks Sync
          </CardTitle>
          {isMapped ? (
            <Badge variant="default" className="bg-green-600 text-white text-xs" data-testid="badge-client-qb-mapped">
              <CheckCircle2 className="h-3 w-3 mr-1" />Linked
            </Badge>
          ) : hasError ? (
            <Badge variant="destructive" className="text-xs" data-testid="badge-client-qb-error">
              <XCircle className="h-3 w-3 mr-1" />Error
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs text-muted-foreground" data-testid="badge-client-qb-unmapped">
              <AlertTriangle className="h-3 w-3 mr-1" />Not Linked
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {isMapped && mapping?.quickbooksDisplayName && (
          <div className="text-sm">
            <span className="text-muted-foreground">QBO Customer: </span>
            <span className="font-medium" data-testid="text-client-qb-customer">{mapping.quickbooksDisplayName}</span>
          </div>
        )}
        {isMapped && mapping?.lastSyncedAt && (
          <div className="text-xs text-muted-foreground" data-testid="text-client-qb-last-sync">
            Last synced: {new Date(mapping.lastSyncedAt).toLocaleDateString()}
          </div>
        )}
        {hasError && mapping?.lastSyncError && (
          <div className="text-xs text-red-600" data-testid="text-client-qb-sync-error">
            {mapping.lastSyncError}
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setLocation("/settings/quickbooks")}
          data-testid="button-client-qb-manage"
        >
          {isMapped ? (
            <><ExternalLink className="h-3.5 w-3.5 mr-1.5" />Manage Mapping</>
          ) : (
            <><Link2 className="h-3.5 w-3.5 mr-1.5" />Link to QuickBooks</>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
