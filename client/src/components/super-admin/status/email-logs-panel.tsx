import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Mail, CheckCircle, XCircle, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { SuperEmailLog, SuperEmailStats } from "./types";

export function SuperEmailLogsPanel() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [tenantFilter, setTenantFilter] = useState<string>("");
  const [page, setPage] = useState(0);
  const limit = 20;

  const buildQueryString = () => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (typeFilter !== "all") params.set("messageType", typeFilter);
    if (tenantFilter) params.set("tenantId", tenantFilter);
    params.set("limit", limit.toString());
    params.set("offset", (page * limit).toString());
    return params.toString();
  };

  const statsQuery = useQuery<{ ok: boolean; data: SuperEmailStats }>({
    queryKey: ["/api/v1/super/email-logs/stats", tenantFilter],
    queryFn: async () => {
      const url = tenantFilter 
        ? `/api/v1/super/email-logs/stats?tenantId=${tenantFilter}`
        : "/api/v1/super/email-logs/stats";
      const res = await fetch(url, { credentials: "include" });
      return res.json();
    },
  });

  const logsQuery = useQuery<{ ok: boolean; data: SuperEmailLog[]; total: number }>({
    queryKey: ["/api/v1/super/email-logs", statusFilter, typeFilter, tenantFilter, page],
    queryFn: async () => {
      const res = await fetch(`/api/v1/super/email-logs?${buildQueryString()}`, { credentials: "include" });
      return res.json();
    },
  });

  const resendMutation = useMutation({
    mutationFn: async (emailId: string) => {
      return apiRequest("POST", `/api/v1/super/email-logs/${emailId}/resend`);
    },
    onSuccess: () => {
      toast({ title: "Email queued for resend" });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/email-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/email-logs/stats"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to resend",
        description: error.message || "Could not resend email",
        variant: "destructive",
      });
    },
  });

  const stats = statsQuery.data?.data;
  const logs = logsQuery.data?.data || [];
  const total = logsQuery.data?.total || 0;
  const totalPages = Math.ceil(total / limit);

  const canResend = (email: SuperEmailLog) => {
    const resendableTypes = ["invitation", "forgot_password"];
    return email.status === "failed" && resendableTypes.includes(email.messageType) && (email.resendCount || 0) < 3;
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/v1/super/email-logs"] });
    queryClient.invalidateQueries({ queryKey: ["/api/v1/super/email-logs/stats"] });
  };

  const MESSAGE_TYPE_LABELS: Record<string, string> = {
    invitation: "Invitation",
    mention_notification: "Mention",
    forgot_password: "Password Reset",
    test_email: "Test Email",
    other: "Other",
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Emails</CardDescription>
            <CardTitle className="text-2xl">{stats?.total ?? "-"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Sent</CardDescription>
            <CardTitle className="text-2xl text-green-600">{stats?.sent ?? "-"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Failed</CardDescription>
            <CardTitle className="text-2xl text-red-600">{stats?.failed ?? "-"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Last 24 Hours</CardDescription>
            <CardTitle className="text-2xl">{stats?.last24Hours ?? "-"}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                All Email Logs
              </CardTitle>
              <CardDescription>Cross-tenant email history and resend controls</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleRefresh} data-testid="button-refresh-super-email-logs">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-row gap-4 mb-4 flex-wrap">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40" data-testid="select-super-status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="queued">Queued</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-48" data-testid="select-super-type-filter">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="invitation">Invitation</SelectItem>
                <SelectItem value="mention_notification">Mention</SelectItem>
                <SelectItem value="forgot_password">Password Reset</SelectItem>
                <SelectItem value="test_email">Test Email</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Tenant ID filter..."
              value={tenantFilter}
              onChange={(e) => setTenantFilter(e.target.value)}
              className="w-64"
              data-testid="input-tenant-filter"
            />
          </div>

          {logsQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Mail className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No email logs found</p>
            </div>
          ) : (
            <>
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Status</th>
                      <th className="px-4 py-3 text-left font-medium">Type</th>
                      <th className="px-4 py-3 text-left font-medium">Tenant</th>
                      <th className="px-4 py-3 text-left font-medium">Recipient</th>
                      <th className="px-4 py-3 text-left font-medium">Subject</th>
                      <th className="px-4 py-3 text-left font-medium">Sent At</th>
                      <th className="px-4 py-3 w-24 text-left font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((email) => (
                      <tr key={email.id} className="border-t" data-testid={`row-super-email-${email.id}`}>
                        <td className="px-4 py-3">
                          <Badge
                            className={
                              email.status === "sent"
                                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                                : email.status === "failed"
                                ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"
                                : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300"
                            }
                          >
                            {email.status === "sent" && <CheckCircle className="h-3 w-3 mr-1" />}
                            {email.status === "failed" && <XCircle className="h-3 w-3 mr-1" />}
                            {email.status === "queued" && <Loader2 className="h-3 w-3 mr-1" />}
                            {email.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">{MESSAGE_TYPE_LABELS[email.messageType] || email.messageType}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs truncate max-w-[100px] block">{email.tenantId || "-"}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs">{email.toEmail}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="truncate max-w-[200px] block">{email.subject}</span>
                          {email.lastError && (
                            <span className="text-xs text-red-500 block mt-1 truncate max-w-[200px]">{email.lastError}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(email.createdAt)}</td>
                        <td className="px-4 py-3">
                          {canResend(email) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => resendMutation.mutate(email.id)}
                              disabled={resendMutation.isPending}
                              data-testid={`button-super-resend-${email.id}`}
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between mt-4">
                <span className="text-sm text-muted-foreground">
                  Showing {page * limit + 1} - {Math.min((page + 1) * limit, total)} of {total}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    data-testid="button-super-prev-page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page >= totalPages - 1}
                    data-testid="button-super-next-page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
