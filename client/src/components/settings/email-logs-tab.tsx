import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Mail, RefreshCw, Send, AlertCircle, CheckCircle2, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface EmailLog {
  id: string;
  tenantId: string | null;
  messageType: string;
  toEmail: string;
  subject: string;
  status: string;
  providerMessageId: string | null;
  lastError: string | null;
  requestId: string | null;
  resendCount: number | null;
  lastResendAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface EmailStats {
  total: number;
  sent: number;
  failed: number;
  queued: number;
  last24Hours: number;
  last7Days: number;
}

const STATUS_ICONS = {
  sent: CheckCircle2,
  failed: AlertCircle,
  queued: Clock,
} as const;

const STATUS_COLORS = {
  sent: "bg-success/10 text-success dark:bg-success/15",
  failed: "bg-destructive/10 text-destructive dark:bg-destructive/15",
  queued: "bg-warning/10 text-warning dark:bg-warning/15",
} as const;

const MESSAGE_TYPE_LABELS: Record<string, string> = {
  invitation: "Invitation",
  mention_notification: "Mention",
  forgot_password: "Password Reset",
  test_email: "Test Email",
  other: "Other",
};

export function EmailLogsTab() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const limit = 20;

  const statsQuery = useQuery<{ ok: boolean; data: EmailStats }>({
    queryKey: ["/api/v1/tenant/email-logs/stats"],
  });

  const logsQuery = useQuery<{ ok: boolean; data: EmailLog[]; total: number }>({
    queryKey: [
      "/api/v1/tenant/email-logs",
      { status: statusFilter !== "all" ? statusFilter : undefined, messageType: typeFilter !== "all" ? typeFilter : undefined, limit, offset: page * limit },
    ],
  });

  const resendMutation = useMutation({
    mutationFn: async (emailId: string) => {
      return apiRequest("POST", `/api/v1/tenant/email-logs/${emailId}/resend`);
    },
    onSuccess: () => {
      toast({ title: "Email queued for resend" });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/tenant/email-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/tenant/email-logs/stats"] });
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

  const canResend = (email: EmailLog) => {
    const resendableTypes = ["invitation", "forgot_password"];
    return email.status === "failed" && resendableTypes.includes(email.messageType) && (email.resendCount || 0) < 3;
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/v1/tenant/email-logs"] });
    queryClient.invalidateQueries({ queryKey: ["/api/v1/tenant/email-logs/stats"] });
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
                Email Logs
              </CardTitle>
              <CardDescription>View outgoing email history and resend failed messages</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleRefresh} data-testid="button-refresh-email-logs">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-row gap-4 mb-4">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40" data-testid="select-status-filter">
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
              <SelectTrigger className="w-48" data-testid="select-type-filter">
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
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Sent At</TableHead>
                      <TableHead className="w-24">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((email) => {
                      const StatusIcon = STATUS_ICONS[email.status as keyof typeof STATUS_ICONS] || Clock;
                      return (
                        <TableRow key={email.id} data-testid={`row-email-${email.id}`}>
                          <TableCell>
                            <Badge className={STATUS_COLORS[email.status as keyof typeof STATUS_COLORS] || ""}>
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {email.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">{MESSAGE_TYPE_LABELS[email.messageType] || email.messageType}</span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">{email.toEmail}</span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm truncate max-w-[200px] block">{email.subject}</span>
                            {email.lastError && (
                              <span className="text-xs text-red-500 block mt-1 truncate max-w-[200px]">{email.lastError}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {format(new Date(email.createdAt), "MMM d, HH:mm")}
                            </span>
                          </TableCell>
                          <TableCell>
                            {canResend(email) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => resendMutation.mutate(email.id)}
                                disabled={resendMutation.isPending}
                                data-testid={`button-resend-${email.id}`}
                              >
                                <Send className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
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
                    data-testid="button-prev-page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page >= totalPages - 1}
                    data-testid="button-next-page"
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
