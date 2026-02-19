import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Check,
  X,
  Clock,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Loader2,
} from "lucide-react";
import type { IntegrationStatus, FixTenantIdsResult, FixClientTenantIdsResult } from "./types";

export function IntegrationStatusBadge({ status }: { status: IntegrationStatus }) {
  if (status === "configured") {
    return (
      <Badge variant="default" className="bg-green-600">
        <Check className="h-3 w-3 mr-1" />
        Configured
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge variant="destructive">
        <X className="h-3 w-3 mr-1" />
        Error
      </Badge>
    );
  }
  return <Badge variant="secondary">Not Configured</Badge>;
}

export function getStatusBadge(status: string) {
  if (status === "active") {
    return (
      <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-500/20">
        <CheckCircle className="h-3 w-3 mr-1" />
        Active
      </Badge>
    );
  } else if (status === "suspended") {
    return (
      <Badge variant="destructive">
        <AlertTriangle className="h-3 w-3 mr-1" />
        Suspended
      </Badge>
    );
  } else {
    return (
      <Badge variant="secondary">
        <Clock className="h-3 w-3 mr-1" />
        Pending Onboarding
      </Badge>
    );
  }
}

export function FixTenantIdsCard({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const { toast } = useToast();
  const [lastResult, setLastResult] = useState<FixTenantIdsResult | null>(null);
  
  const fixMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${tenantId}/users/fix-tenant-ids`, {});
      return res.json() as Promise<FixTenantIdsResult>;
    },
    onSuccess: (data) => {
      setLastResult(data);
      if (data.fixed > 0) {
        toast({
          title: "Users Fixed",
          description: `Fixed ${data.fixed} user(s) with missing tenant assignment.`,
        });
        queryClient.invalidateQueries({ queryKey: [`/api/v1/super/tenants/${tenantId}/users`] });
      } else {
        toast({
          title: "No Issues Found",
          description: "All users already have correct tenant assignments.",
        });
      }
    },
    onError: async (error: any) => {
      let details = error.message || "Failed to fix tenant IDs";
      try {
        const errorData = error?.response ? await error.response.json() : null;
        if (errorData?.details) {
          details = `${errorData.error}: ${errorData.details}`;
        }
      } catch { /* ignore */ }
      toast({
        title: "Fix Failed",
        description: details,
        variant: "destructive",
      });
    },
  });
  
  return (
    <Card className="border-amber-500/20 bg-amber-500/5">
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h4 className="font-medium flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-amber-600" />
              Fix User Tenant Assignments
            </h4>
            <p className="text-sm text-muted-foreground">
              Scan for users associated with {tenantName} who are missing their tenant assignment 
              and fix them automatically. Use this if users are getting "Unable to Load Tenant" errors.
            </p>
            {lastResult && (
              <p className="text-xs text-muted-foreground mt-2">
                Last run: Fixed {lastResult.fixed} user(s)
              </p>
            )}
          </div>
          <Button 
            variant="outline"
            onClick={() => fixMutation.mutate()}
            disabled={fixMutation.isPending}
            data-testid="button-fix-tenant-ids"
          >
            {fixMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {fixMutation.isPending ? "Scanning..." : "Fix Tenant IDs"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function FixClientTenantIdsCard({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const { toast } = useToast();
  const [lastResult, setLastResult] = useState<FixClientTenantIdsResult | null>(null);
  
  const fixMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${tenantId}/clients/fix-tenant-ids`, {});
      return res.json() as Promise<FixClientTenantIdsResult>;
    },
    onSuccess: (data) => {
      setLastResult(data);
      if (data.fixed > 0) {
        toast({
          title: "Clients Fixed",
          description: `Fixed ${data.fixed} client(s) with missing tenant assignment.`,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", tenantId, "clients"] });
      } else {
        toast({
          title: "No Issues Found",
          description: "All clients already have correct tenant assignments.",
        });
      }
    },
    onError: async (error: any) => {
      let details = error.message || "Failed to fix client tenant IDs";
      try {
        const errorData = error?.response ? await error.response.json() : null;
        if (errorData?.details) {
          details = `${errorData.error}: ${errorData.details}`;
        }
      } catch { /* ignore */ }
      toast({
        title: "Fix Failed",
        description: details,
        variant: "destructive",
      });
    },
  });
  
  return (
    <Card className="border-amber-500/20 bg-amber-500/5">
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h4 className="font-medium flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-amber-600" />
              Fix Client Tenant Assignments
            </h4>
            <p className="text-sm text-muted-foreground">
              Scan for clients that are missing their tenant assignment and fix them automatically. 
              Use this if clients created by super admin are not visible to tenant users.
            </p>
            {lastResult && (
              <p className="text-xs text-muted-foreground mt-2">
                Last run: Fixed {lastResult.fixed} client(s)
                {lastResult.fixedClients.length > 0 && (
                  <span className="block">
                    {lastResult.fixedClients.map(c => c.companyName).join(", ")}
                  </span>
                )}
              </p>
            )}
          </div>
          <Button 
            variant="outline"
            onClick={() => fixMutation.mutate()}
            disabled={fixMutation.isPending}
            data-testid="button-fix-client-tenant-ids"
          >
            {fixMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {fixMutation.isPending ? "Scanning..." : "Fix Client IDs"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface OnboardingStepItemProps {
  step: number;
  title: string;
  description: string;
  completed: boolean;
  active: boolean;
  action?: () => void;
}

export function OnboardingStepItem({ step, title, description, completed, active, action }: OnboardingStepItemProps) {
  return (
    <div 
      className={`flex items-start gap-4 p-3 rounded-lg border ${
        completed ? "bg-green-500/5 border-green-500/20" : 
        active ? "bg-primary/5 border-primary/20" : 
        "opacity-60"
      }`}
      data-testid={`onboarding-step-${step}`}
    >
      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
        completed ? "bg-green-500 text-white" : 
        active ? "bg-primary text-primary-foreground" : 
        "bg-secondary text-muted-foreground"
      }`}>
        {completed ? <Check className="h-4 w-4" /> : step}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium">{title}</div>
        <div className="text-sm text-muted-foreground">{description}</div>
      </div>
      {active && action && (
        <Button size="sm" variant="outline" onClick={action} data-testid={`button-step-${step}-action`}>
          Configure
        </Button>
      )}
    </div>
  );
}

export function TabLoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-48 mt-1" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="h-6 w-16" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
