import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, XCircle, AlertCircle, CheckCircle, RefreshCw, Copy, KeyRound, Globe, Server, Lock, Database, Info } from "lucide-react";
import { DiagnosticIcon, WarningIcon } from "./shared-components";
import type { AuthDiagnosticsData } from "./types";

export function AuthDiagnosticsPanel() {
  const { toast } = useToast();
  
  const { data: authData, isLoading, error, refetch } = useQuery<AuthDiagnosticsData>({
    queryKey: ["/api/v1/super/status/auth-diagnostics"],
  });
  
  const copyDiagnostics = () => {
    if (!authData) return;
    const summary = JSON.stringify(authData, null, 2);
    navigator.clipboard.writeText(summary);
    toast({ title: "Copied to clipboard", description: "Diagnostics summary copied" });
  };
  
  if (error) {
    const requestId = (error as any)?.requestId || "unknown";
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-red-500 flex items-center gap-2">
            <XCircle className="h-5 w-5" />
            Auth Diagnostics Error
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-2">
            Failed to load auth diagnostics. This may indicate a configuration issue.
          </p>
          <p className="text-sm text-muted-foreground">Request ID: {requestId}</p>
          <Button variant="outline" onClick={() => refetch()} className="mt-4" data-testid="button-retry-auth-diagnostics">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }
  
  if (isLoading || !authData) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  const statusColors = {
    healthy: "bg-green-100 border-green-200 text-green-800 dark:bg-green-900/30 dark:border-green-800 dark:text-green-300",
    warning: "bg-yellow-100 border-yellow-200 text-yellow-800 dark:bg-yellow-900/30 dark:border-yellow-800 dark:text-yellow-300",
    error: "bg-red-100 border-red-200 text-red-800 dark:bg-red-900/30 dark:border-red-800 dark:text-red-300",
  };
  
  const statusMessages = {
    healthy: "Cookie-based auth appears healthy",
    warning: "Potential misconfiguration detected",
    error: "Auth misconfiguration – login may fail",
  };
  
  const statusIcons = {
    healthy: <CheckCircle className="h-5 w-5" />,
    warning: <AlertCircle className="h-5 w-5" />,
    error: <XCircle className="h-5 w-5" />,
  };
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start gap-4 flex-wrap">
        <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${statusColors[authData.overallStatus]}`}>
          {statusIcons[authData.overallStatus]}
          <span className="font-medium">{statusMessages[authData.overallStatus]}</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()} data-testid="button-refresh-auth">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" onClick={copyDiagnostics} data-testid="button-copy-diagnostics">
            <Copy className="h-4 w-4 mr-2" />
            Copy Summary
          </Button>
        </div>
      </div>
      
      {authData.issues.length > 0 && (
        <Card className="border-red-200 dark:border-red-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-600 dark:text-red-400 flex items-center gap-2">
              <XCircle className="h-4 w-4" />
              Critical Issues
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {authData.issues.map((issue, i) => (
                <li key={i} className="text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
                  <span className="shrink-0 mt-0.5">•</span>
                  {issue}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      
      {authData.warnings.length > 0 && (
        <Card className="border-yellow-200 dark:border-yellow-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-yellow-600 dark:text-yellow-400 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Warnings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {authData.warnings.map((warning, i) => (
                <li key={i} className="text-sm text-yellow-700 dark:text-yellow-300 flex items-start gap-2">
                  <span className="shrink-0 mt-0.5">•</span>
                  {warning}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Auth Mode</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Type</span>
              <Badge variant="outline">{authData.authType}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Session Store</span>
              <Badge variant="outline">{authData.session.storeType}</Badge>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Cookie Configuration</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">HttpOnly</span>
              <div className="flex items-center gap-1">
                <DiagnosticIcon ok={authData.cookies.httpOnly} />
                <span className="text-sm">{authData.cookies.httpOnly ? "Yes" : "No"}</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Secure</span>
              <div className="flex items-center gap-1">
                <DiagnosticIcon ok={authData.cookies.secure || authData.runtime.nodeEnv !== "production"} />
                <span className="text-sm">{authData.cookies.secure ? "Yes" : "No"}</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">SameSite</span>
              <Badge variant="outline">{authData.cookies.sameSite}</Badge>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Max Age</span>
              <span className="text-sm">{authData.cookies.maxAgeDays} days</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">CORS Configuration</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Credentials Enabled</span>
              <div className="flex items-center gap-1">
                <DiagnosticIcon ok={authData.cors.credentialsEnabled} />
                <span className="text-sm">{authData.cors.credentialsEnabled ? "Yes" : "No"}</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Origin Configured</span>
              <div className="flex items-center gap-1">
                {authData.cors.allowedOriginConfigured ? (
                  <DiagnosticIcon ok={true} />
                ) : (
                  <WarningIcon />
                )}
                <span className="text-sm">{authData.cors.allowedOriginConfigured ? "Yes" : "No"}</span>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <div className="flex items-center gap-2">
              <Server className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Proxy / Railway</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Trust Proxy</span>
              <div className="flex items-center gap-1">
                <DiagnosticIcon ok={authData.proxy.trustProxyEnabled} />
                <span className="text-sm">{authData.proxy.trustProxyEnabled ? "Enabled" : "Disabled"}</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Environment</span>
              <Badge variant={authData.runtime.nodeEnv === "production" ? "default" : "outline"}>
                {authData.runtime.nodeEnv}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Railway</span>
              <span className="text-sm">{authData.runtime.isRailway ? "Detected" : "No"}</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Session Store</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Session Enabled</span>
              <div className="flex items-center gap-1">
                <DiagnosticIcon ok={authData.session.enabled} />
                <span className="text-sm">{authData.session.enabled ? "Yes" : "No"}</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Secret Configured</span>
              <div className="flex items-center gap-1">
                <DiagnosticIcon ok={authData.session.secretConfigured} />
                <span className="text-sm">{authData.session.secretConfigured ? "Yes" : "No"}</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Database Connected</span>
              <div className="flex items-center gap-1">
                <DiagnosticIcon ok={authData.runtime.databaseConfigured} />
                <span className="text-sm">{authData.runtime.databaseConfigured ? "Yes" : "No"}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {authData.commonFixes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Info className="h-4 w-4" />
              Common Fixes
            </CardTitle>
            <CardDescription>
              Troubleshooting tips based on your configuration
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {authData.commonFixes.map((fix, i) => (
                <li key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <span className="text-sm">{fix.tip}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      
      <div className="text-xs text-muted-foreground text-right">
        Last checked: {new Date(authData.lastAuthCheck).toLocaleString()}
      </div>
    </div>
  );
}
