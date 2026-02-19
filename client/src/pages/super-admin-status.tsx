import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { Loader2, Activity, Database, Building2, Wrench, ExternalLink, Mail, AlertCircle, KeyRound, Shield, MessageSquare, Server, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { HealthCheck, TenancyHealth } from "@/components/super-admin/status/types";
import { SystemHealthSection } from "@/components/super-admin/status/system-health-section";
import { TenantHealthSection } from "@/components/super-admin/status/tenant-health-section";
import { ErrorLogPanel } from "@/components/super-admin/status/error-log-panel";
import { SuperEmailLogsPanel } from "@/components/super-admin/status/email-logs-panel";
import { AuthDiagnosticsPanel } from "@/components/super-admin/status/auth-diagnostics-panel";
import { DebugToolsPanel } from "@/components/super-admin/status/debug-tools-panel";
import { TenantHealthRepairPanel } from "@/components/super-admin/status/tenant-health-repair-panel";
import { ChatDebugPanel } from "@/components/super-admin/status/chat-debug-panel";
import { DbIntrospectPanel } from "@/components/super-admin/status/db-introspect-panel";

export default function SuperAdminStatusPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("health");
  const [toolsSubTab, setToolsSubTab] = useState("auth");
  const [logsSubTab, setLogsSubTab] = useState("app");
  const [confirmDialog, setConfirmDialog] = useState<{ action: string; title: string; description: string } | null>(null);
  const [confirmPhrase, setConfirmPhrase] = useState("");

  if (user?.role !== "super_user") {
    return <Redirect to="/" />;
  }

  const { data: healthData, isLoading: healthLoading, refetch: refetchHealth } = useQuery<HealthCheck>({
    queryKey: ["/api/v1/super/status/health"],
    refetchInterval: 30000,
  });

  const { data: tenancyHealth, isLoading: tenancyLoading, refetch: refetchTenancy } = useQuery<TenancyHealth>({
    queryKey: ["/api/v1/super/tenancy/health"],
    enabled: activeTab === "tenant-health",
  });

  const runCheckMutation = useMutation({
    mutationFn: async (checkType: string) => {
      return apiRequest("POST", `/api/v1/super/status/checks/${checkType}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/status/health"] });
      toast({ title: "Check completed successfully" });
      setConfirmDialog(null);
      setConfirmPhrase("");
    },
    onError: (error: any) => {
      toast({ title: "Check failed", description: error.message, variant: "destructive" });
    },
  });

  const handleDebugAction = (action: string) => {
    if (confirmPhrase !== "CONFIRM") {
      toast({ title: "Please type CONFIRM to proceed", variant: "destructive" });
      return;
    }
    runCheckMutation.mutate(action);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-6 border-b shrink-0">
        <h1 className="text-2xl font-bold">System Health</h1>
        <p className="text-muted-foreground mt-1">Health checks, logs, and debugging tools</p>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6" data-testid="status-tabs">
            <TabsTrigger value="health" data-testid="tab-health">
              <Activity className="h-4 w-4 mr-2" />
              System Health
            </TabsTrigger>
            <TabsTrigger value="tenant-health" data-testid="tab-tenant-health">
              <Building2 className="h-4 w-4 mr-2" />
              Tenant Health
            </TabsTrigger>
            <TabsTrigger value="logs" data-testid="tab-logs">
              <ExternalLink className="h-4 w-4 mr-2" />
              Logs
            </TabsTrigger>
            <TabsTrigger value="tools" data-testid="tab-tools">
              <Wrench className="h-4 w-4 mr-2" />
              Tools & Diagnostics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="health">
            <SystemHealthSection
              healthData={healthData}
              healthLoading={healthLoading}
              refetchHealth={() => refetchHealth()}
            />
          </TabsContent>

          <TabsContent value="tenant-health">
            <TenantHealthSection
              tenancyHealth={tenancyHealth}
              tenancyLoading={tenancyLoading}
              refetchTenancy={() => refetchTenancy()}
            />
          </TabsContent>

          <TabsContent value="logs">
            <div className="space-y-4">
              <Tabs value={logsSubTab} onValueChange={setLogsSubTab}>
                <TabsList data-testid="logs-sub-tabs">
                  <TabsTrigger value="app" data-testid="tab-logs-app">
                    <Server className="h-4 w-4 mr-2" />
                    Application Logs
                  </TabsTrigger>
                  <TabsTrigger value="email" data-testid="tab-logs-email">
                    <Mail className="h-4 w-4 mr-2" />
                    Email Logs
                  </TabsTrigger>
                  <TabsTrigger value="error" data-testid="tab-logs-error">
                    <AlertCircle className="h-4 w-4 mr-2" />
                    Error Logs
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="app" className="mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Application Logs</CardTitle>
                      <CardDescription>View application logs for debugging and monitoring</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="text-center py-12">
                        <ExternalLink className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <h3 className="text-lg font-medium mb-2">External Logging</h3>
                        <p className="text-muted-foreground mb-4">
                          Application logs are available through your hosting provider's dashboard.
                        </p>
                        <p className="text-sm text-muted-foreground">
                          For Railway deployments, access logs via the Railway dashboard under your project's "Logs" tab.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="email" className="mt-4">
                  <SuperEmailLogsPanel />
                </TabsContent>

                <TabsContent value="error" className="mt-4">
                  <ErrorLogPanel />
                </TabsContent>
              </Tabs>
            </div>
          </TabsContent>

          <TabsContent value="tools">
            <div className="space-y-4">
              <Tabs value={toolsSubTab} onValueChange={setToolsSubTab}>
                <TabsList data-testid="tools-sub-tabs">
                  <TabsTrigger value="auth" data-testid="tab-tools-auth">
                    <KeyRound className="h-4 w-4 mr-2" />
                    Auth Diagnostics
                  </TabsTrigger>
                  <TabsTrigger value="debug" data-testid="tab-tools-debug">
                    <Wrench className="h-4 w-4 mr-2" />
                    Debug Tools
                  </TabsTrigger>
                  <TabsTrigger value="repair" data-testid="tab-tools-repair">
                    <Shield className="h-4 w-4 mr-2" />
                    Repair Tools
                  </TabsTrigger>
                  <TabsTrigger value="chat" data-testid="tab-tools-chat">
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Chat Debug
                  </TabsTrigger>
                  <TabsTrigger value="db" data-testid="tab-tools-db">
                    <Database className="h-4 w-4 mr-2" />
                    DB Introspect
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="auth" className="mt-4">
                  <AuthDiagnosticsPanel />
                </TabsContent>

                <TabsContent value="debug" className="mt-4">
                  <DebugToolsPanel />
                </TabsContent>

                <TabsContent value="repair" className="mt-4">
                  <TenantHealthRepairPanel />
                </TabsContent>

                <TabsContent value="chat" className="mt-4">
                  <ChatDebugPanel />
                </TabsContent>

                <TabsContent value="db" className="mt-4">
                  <DbIntrospectPanel onNavigateTab={setActiveTab} onNavigateLogsSubTab={setLogsSubTab} />
                </TabsContent>
              </Tabs>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={!!confirmDialog} onOpenChange={() => { setConfirmDialog(null); setConfirmPhrase(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmDialog?.title}</DialogTitle>
            <DialogDescription>{confirmDialog?.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="confirm-phrase">Type CONFIRM to proceed</Label>
              <Input
                id="confirm-phrase"
                value={confirmPhrase}
                onChange={(e) => setConfirmPhrase(e.target.value)}
                placeholder="CONFIRM"
                data-testid="input-confirm-phrase"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConfirmDialog(null); setConfirmPhrase(""); }}>
              Cancel
            </Button>
            <Button 
              onClick={() => handleDebugAction(confirmDialog?.action || "")}
              disabled={confirmPhrase !== "CONFIRM" || runCheckMutation.isPending}
              data-testid="button-confirm-action"
            >
              {runCheckMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Execute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
