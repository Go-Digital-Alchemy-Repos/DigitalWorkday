import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { 
  Loader2, 
  Database, 
  History, 
  Settings, 
  Play, 
  CheckCircle2, 
  AlertTriangle,
  FileText,
  MessageSquare,
  Search,
  Building2,
  ChevronRight,
  RefreshCw,
  Info
} from "lucide-react";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle,
  CardFooter 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DataRetentionPolicy } from "@shared/schema";

interface RetentionAuditSummary {
  tenantId: string;
  tenantName: string;
  policies: DataRetentionPolicy[];
  tasks: {
    total: number;
    eligibleForArchive: number;
    alreadyArchived: number;
  };
  chatMessages: {
    total: number;
    eligibleForArchive: number;
    alreadyArchived: number;
  };
}

export default function SuperAdminRetentionPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedTenant, setSelectedTenant] = useState<RetentionAuditSummary | null>(null);

  if (user?.role !== "super_user") {
    return <Redirect to="/" />;
  }

  const { data: auditData, isLoading, refetch } = useQuery<RetentionAuditSummary[]>({
    queryKey: ["/api/v1/super/retention/audit"],
  });

  const runMutation = useMutation({
    mutationFn: async (tenantId: string) => {
      const res = await apiRequest("POST", `/api/v1/super/retention/run/${tenantId}`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Archive run completed",
        description: `Archived ${data.tasksArchived ?? 0} tasks and ${data.messagesArchived ?? 0} messages.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/retention/audit"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Archive run failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updatePolicyMutation = useMutation({
    mutationFn: async ({ tenantId, policy }: { tenantId: string; policy: any }) => {
      const res = await apiRequest("POST", `/api/v1/super/retention/policies/${tenantId}`, policy);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Policy updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/retention/audit"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update policy",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const filteredData = auditData?.filter(item => 
    item.tenantName.toLowerCase().includes(search.toLowerCase()) ||
    item.tenantId.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      <div className="p-6 border-b shrink-0 bg-card/50">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Database className="h-6 w-6 text-primary" />
              Data Retention Management
            </h1>
            <p className="text-muted-foreground mt-1">
              Audit, configure, and execute data archiving policies across all tenants.
            </p>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetch()} 
            disabled={isLoading}
            className="hover-elevate"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh Audit
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Total Eligible for Archiving
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {auditData?.reduce((acc, curr) => acc + curr.tasks.eligibleForArchive + curr.chatMessages.eligibleForArchive, 0) ?? 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Across all tenants</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <History className="h-4 w-4 text-blue-500" />
                Already Archived
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {auditData?.reduce((acc, curr) => acc + curr.tasks.alreadyArchived + curr.chatMessages.alreadyArchived, 0) ?? 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Soft-archived items</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Settings className="h-4 w-4 text-orange-500" />
                Active Policies
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {auditData?.reduce((acc, curr) => acc + curr.policies.filter(p => p.isEnabled).length, 0) ?? 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Enabled retention rules</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center gap-4 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by tenant name or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-tenant-search"
            />
          </div>
        </div>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Policies</TableHead>
                <TableHead>Eligible Tasks</TableHead>
                <TableHead>Eligible Messages</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                    <p className="mt-2 text-muted-foreground">Loading audit data...</p>
                  </TableCell>
                </TableRow>
              ) : filteredData?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    No tenants found matching search.
                  </TableCell>
                </TableRow>
              ) : (
                filteredData?.map((tenant) => (
                  <TableRow key={tenant.tenantId} className="hover:bg-muted/50">
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{tenant.tenantName}</span>
                        <span className="text-xs text-muted-foreground font-mono">{tenant.tenantId}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {tenant.policies.length === 0 ? (
                          <Badge variant="outline" className="text-muted-foreground">No Policies</Badge>
                        ) : (
                          tenant.policies.map(p => (
                            <Badge 
                              key={p.id} 
                              variant={p.isEnabled ? "default" : "secondary"}
                              className="text-[10px]"
                            >
                              {p.entityType === 'tasks' ? 'Tasks' : 'Chat'}: {p.retentionDays}d
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className={tenant.tasks.eligibleForArchive > 0 ? "text-orange-600 font-bold" : ""}>
                          {tenant.tasks.eligibleForArchive}
                        </span>
                        <span className="text-xs text-muted-foreground">/ {tenant.tasks.total} total</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className={tenant.chatMessages.eligibleForArchive > 0 ? "text-orange-600 font-bold" : ""}>
                          {tenant.chatMessages.eligibleForArchive}
                        </span>
                        <span className="text-xs text-muted-foreground">/ {tenant.chatMessages.total} total</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="hover-elevate"
                              onClick={() => setSelectedTenant(tenant)}
                              data-testid={`button-configure-${tenant.tenantId}`}
                            >
                              <Settings className="h-3.5 w-3.5 mr-1" />
                              Configure
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl">
                            <DialogHeader>
                              <DialogTitle>Retention Policy: {tenant.tenantName}</DialogTitle>
                              <DialogDescription>
                                Configure how long data should be kept before being soft-archived.
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-6 py-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <PolicyForm 
                                  entityType="tasks" 
                                  tenantId={tenant.tenantId} 
                                  existingPolicy={tenant.policies.find(p => p.entityType === 'tasks')}
                                  onSave={(p) => updatePolicyMutation.mutate({ tenantId: tenant.tenantId, policy: p })}
                                  isPending={updatePolicyMutation.isPending}
                                />
                                <PolicyForm 
                                  entityType="chat_messages" 
                                  tenantId={tenant.tenantId} 
                                  existingPolicy={tenant.policies.find(p => p.entityType === 'chat_messages')}
                                  onSave={(p) => updatePolicyMutation.mutate({ tenantId: tenant.tenantId, policy: p })}
                                  isPending={updatePolicyMutation.isPending}
                                />
                              </div>

                              <div className="bg-muted p-4 rounded-md">
                                <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                                  <Info className="h-4 w-4 text-primary" />
                                  What happens during archiving?
                                </h4>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                  <strong>Soft Archive:</strong> Data is not deleted. It is marked with an <code>archivedAt</code> timestamp.
                                  Archived data is hidden from regular users but remains available for Super Admins.
                                  Tasks must be in 'done' status for at least the retention period to be eligible.
                                </p>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>

                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="hover-elevate text-primary"
                          onClick={() => runMutation.mutate(tenant.tenantId)}
                          disabled={runMutation.isPending || (tenant.tasks.eligibleForArchive === 0 && tenant.chatMessages.eligibleForArchive === 0)}
                          data-testid={`button-run-${tenant.tenantId}`}
                        >
                          {runMutation.isPending && runMutation.variables === tenant.tenantId ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          ) : (
                            <Play className="h-3.5 w-3.5 mr-1" />
                          )}
                          Run Now
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}

function PolicyForm({ 
  entityType, 
  tenantId, 
  existingPolicy, 
  onSave,
  isPending 
}: { 
  entityType: string; 
  tenantId: string; 
  existingPolicy?: DataRetentionPolicy;
  onSave: (policy: any) => void;
  isPending: boolean;
}) {
  const [days, setDays] = useState(existingPolicy?.retentionDays?.toString() || "365");
  const [enabled, setEnabled] = useState(existingPolicy?.isEnabled || false);

  return (
    <Card className="border-border">
      <CardHeader className="pb-3 pt-4 px-4">
        <CardTitle className="text-base flex items-center gap-2">
          {entityType === 'tasks' ? <FileText className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
          {entityType === 'tasks' ? 'Task Retention' : 'Chat Retention'}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor={`${entityType}-enabled`} className="text-sm">Policy Enabled</Label>
          <Switch 
            id={`${entityType}-enabled`} 
            checked={enabled} 
            onCheckedChange={setEnabled}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${entityType}-days`} className="text-sm">Retention (Days)</Label>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger id={`${entityType}-days`}>
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">30 Days</SelectItem>
              <SelectItem value="90">90 Days</SelectItem>
              <SelectItem value="180">180 Days</SelectItem>
              <SelectItem value="365">1 Year</SelectItem>
              <SelectItem value="730">2 Years</SelectItem>
              <SelectItem value="1825">5 Years</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
      <CardFooter className="px-4 pb-4 pt-0">
        <Button 
          className="w-full" 
          size="sm"
          onClick={() => onSave({
            entityType,
            isEnabled: enabled,
            retentionDays: parseInt(days),
            archiveMode: 'soft'
          })}
          disabled={isPending}
        >
          {isPending ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : null}
          Save Policy
        </Button>
      </CardFooter>
    </Card>
  );
}
