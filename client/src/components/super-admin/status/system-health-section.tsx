import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Activity, Database, Wifi, HardDrive, Mail, AlertTriangle, RefreshCw, Server, Lock } from "lucide-react";
import { StatusIcon, StatusBadge } from "./shared-components";
import type { HealthCheck, StatusSummary } from "./types";

interface SystemHealthSectionProps {
  healthData: HealthCheck | undefined;
  healthLoading: boolean;
  refetchHealth: () => void;
}

export function SystemHealthSection({ healthData, healthLoading, refetchHealth }: SystemHealthSectionProps) {
  const { data: statusSummary, isLoading: statusLoading, refetch: refetchStatus } = useQuery<StatusSummary>({
    queryKey: ["/api/v1/super/status/summary"],
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button 
          variant="outline" 
          onClick={() => refetchHealth()}
          disabled={healthLoading}
          data-testid="button-refresh-health"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${healthLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>
      
      {healthLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : healthData ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Database</CardTitle>
              </div>
              <StatusIcon status={healthData.database.status} />
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <StatusBadge status={healthData.database.status} />
                {healthData.database.latencyMs && (
                  <span className="text-sm text-muted-foreground">
                    {healthData.database.latencyMs}ms
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <div className="flex items-center gap-2">
                <Wifi className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">WebSocket</CardTitle>
              </div>
              <StatusIcon status={healthData.websocket.status} />
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <StatusBadge status={healthData.websocket.status} />
                {healthData.websocket.connections !== undefined && (
                  <span className="text-sm text-muted-foreground">
                    {healthData.websocket.connections} connections
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <div className="flex items-center gap-2">
                <HardDrive className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">S3 Storage</CardTitle>
              </div>
              <StatusIcon status={healthData.s3.status} />
            </CardHeader>
            <CardContent>
              <StatusBadge status={healthData.s3.status} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Mailgun</CardTitle>
              </div>
              <StatusIcon status={healthData.mailgun.status} />
            </CardHeader>
            <CardContent>
              <StatusBadge status={healthData.mailgun.status} />
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          Unable to fetch health status
        </div>
      )}

      {healthData?.app && (
        <Card>
          <CardHeader>
            <CardTitle>Application Info</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <div className="text-sm text-muted-foreground">Version</div>
                <div className="font-medium">{healthData.app.version || "Unknown"}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Environment</div>
                <div className="font-medium">{healthData.app.environment || "development"}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Uptime</div>
                <div className="font-medium">
                  {healthData.app.uptime 
                    ? `${Math.floor(healthData.app.uptime / 3600)}h ${Math.floor((healthData.app.uptime % 3600) / 60)}m`
                    : "Unknown"
                  }
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>Detailed Status Summary</CardTitle>
            <CardDescription>
              Comprehensive system diagnostics including migrations, presign tests, and orphan counts
            </CardDescription>
          </div>
          <Button
            variant="outline"
            onClick={() => refetchStatus()}
            disabled={statusLoading}
            data-testid="button-refresh-status-summary"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${statusLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {statusLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : statusSummary ? (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" data-testid="status-summary-grid">
                <div className="p-4 border rounded-lg" data-testid="status-card-db">
                  <div className="flex items-center gap-2 mb-2">
                    <Database className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Database</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <Badge 
                      variant={statusSummary.checks.db.status === "ok" ? "default" : "destructive"}
                      data-testid="badge-db-status"
                    >
                      {statusSummary.checks.db.status}
                    </Badge>
                    <span className="text-sm text-muted-foreground" data-testid="text-db-latency">
                      {statusSummary.checks.db.latencyMs}ms
                    </span>
                  </div>
                  {statusSummary.checks.db.error && (
                    <p className="text-xs text-destructive mt-2" data-testid="text-db-error">{statusSummary.checks.db.error}</p>
                  )}
                </div>

                <div className="p-4 border rounded-lg" data-testid="status-card-migrations">
                  <div className="flex items-center gap-2 mb-2">
                    <Server className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Migrations</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <Badge 
                      variant={statusSummary.checks.migrations.available ? "default" : "secondary"}
                      data-testid="badge-migrations-status"
                    >
                      {statusSummary.checks.migrations.available ? "Available" : "Unknown"}
                    </Badge>
                    <span className="text-xs text-muted-foreground" data-testid="text-migrations-version">
                      {statusSummary.checks.migrations.version || "N/A"}
                    </span>
                  </div>
                </div>

                <div className="p-4 border rounded-lg" data-testid="status-card-s3">
                  <div className="flex items-center gap-2 mb-2">
                    <HardDrive className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">S3 Storage</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant={statusSummary.checks.s3.configured ? "default" : "secondary"}
                      data-testid="badge-s3-configured"
                    >
                      {statusSummary.checks.s3.configured ? "Configured" : "Not Configured"}
                    </Badge>
                    {statusSummary.checks.s3.configured && (
                      <Badge 
                        variant={statusSummary.checks.s3.presign === "ok" ? "default" : "destructive"}
                        data-testid="badge-s3-presign"
                      >
                        Presign: {statusSummary.checks.s3.presign}
                      </Badge>
                    )}
                  </div>
                  {statusSummary.checks.s3.error && (
                    <p className="text-xs text-destructive mt-2" data-testid="text-s3-error">{statusSummary.checks.s3.error}</p>
                  )}
                </div>

                <div className="p-4 border rounded-lg" data-testid="status-card-mailgun">
                  <div className="flex items-center gap-2 mb-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Mailgun</span>
                  </div>
                  <Badge 
                    variant={statusSummary.checks.mailgun.configured ? "default" : "secondary"}
                    data-testid="badge-mailgun-configured"
                  >
                    {statusSummary.checks.mailgun.configured ? "Configured" : "Not Configured"}
                  </Badge>
                </div>

                <div className="p-4 border rounded-lg" data-testid="status-card-auth">
                  <div className="flex items-center gap-2 mb-2">
                    <Lock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Auth Config</span>
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Environment</span>
                      <span className="font-medium" data-testid="text-auth-environment">{statusSummary.checks.auth.environment}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Cookie Secure</span>
                      <Badge 
                        variant={statusSummary.checks.auth.cookieSecure ? "default" : "secondary"} 
                        className="text-xs"
                        data-testid="badge-auth-cookie-secure"
                      >
                        {statusSummary.checks.auth.cookieSecure ? "Yes" : "No"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Session Secret</span>
                      <Badge 
                        variant={statusSummary.checks.auth.sessionSecretSet ? "default" : "destructive"} 
                        className="text-xs"
                        data-testid="badge-auth-session-secret"
                      >
                        {statusSummary.checks.auth.sessionSecretSet ? "Set" : "Not Set"}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="p-4 border rounded-lg" data-testid="status-card-orphans">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Orphan Records</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Missing TenantID</span>
                      <Badge 
                        variant={statusSummary.checks.orphanCounts.totalMissing > 0 ? "destructive" : "default"}
                        data-testid="badge-orphan-count"
                      >
                        {statusSummary.checks.orphanCounts.totalMissing}
                      </Badge>
                    </div>
                    {statusSummary.checks.orphanCounts.totalMissing > 0 && (
                      <details className="text-xs" data-testid="details-orphan-breakdown">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                          View by table
                        </summary>
                        <div className="mt-2 space-y-1 pl-2 border-l">
                          {Object.entries(statusSummary.checks.orphanCounts.byTable)
                            .filter(([, count]) => count > 0)
                            .map(([table, count]) => (
                              <div key={table} className="flex justify-between" data-testid={`text-orphan-table-${table}`}>
                                <span>{table}</span>
                                <span className="font-medium">{count}</span>
                              </div>
                            ))
                          }
                        </div>
                      </details>
                    )}
                  </div>
                  {statusSummary.checks.orphanCounts.error && (
                    <p className="text-xs text-destructive mt-2" data-testid="text-orphan-error">{statusSummary.checks.orphanCounts.error}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-4" data-testid="status-summary-footer">
                <span data-testid="text-status-timestamp">Last checked: {new Date(statusSummary.timestamp).toLocaleString()}</span>
                <span data-testid="text-status-request-id">Request ID: {statusSummary.requestId}</span>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Unable to fetch status summary
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
