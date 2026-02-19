import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, AlertCircle, CheckCircle, RefreshCw, Copy, ChevronLeft, ChevronRight } from "lucide-react";
import type { ErrorLogEntry, ErrorLogsResponse } from "./types";

export function ErrorLogPanel() {
  const { toast } = useToast();
  const [selectedLog, setSelectedLog] = useState<ErrorLogEntry | null>(null);
  const [filters, setFilters] = useState({
    status: "",
    pathContains: "",
    resolved: "all",
  });
  const [page, setPage] = useState(0);
  const limit = 20;

  const { data: logsData, isLoading, refetch } = useQuery<ErrorLogsResponse>({
    queryKey: ["/api/v1/super/status/error-logs", { 
      status: filters.status || undefined, 
      pathContains: filters.pathContains || undefined,
      resolved: filters.resolved === "all" ? undefined : filters.resolved === "true",
      limit,
      offset: page * limit,
    }],
  });

  const logs = logsData?.logs || [];
  const total = logsData?.total || 0;
  const totalPages = Math.ceil(total / limit);

  const copyRequestId = (requestId: string) => {
    navigator.clipboard.writeText(requestId);
    toast({ title: "Request ID copied" });
  };

  const copyFullLog = (log: ErrorLogEntry) => {
    const redacted = { ...log, stack: log.stack ? "[REDACTED FOR COPY]" : null };
    navigator.clipboard.writeText(JSON.stringify(redacted, null, 2));
    toast({ title: "Error log copied (redacted)" });
  };

  const getStatusBadge = (status: number) => {
    if (status >= 500) return <Badge variant="destructive">{status}</Badge>;
    if (status >= 400) return <Badge variant="secondary">{status}</Badge>;
    return <Badge variant="outline">{status}</Badge>;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Error Logs
          </CardTitle>
          <CardDescription>
            Centralized error log for debugging production issues. Errors are captured with requestId for correlation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 mb-4">
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="path-filter" className="text-xs">Path Contains</Label>
              <Input
                id="path-filter"
                placeholder="e.g. /api/tasks"
                value={filters.pathContains}
                onChange={(e) => setFilters({ ...filters, pathContains: e.target.value })}
                data-testid="input-error-path-filter"
              />
            </div>
            <div className="w-[120px]">
              <Label htmlFor="status-filter" className="text-xs">Status</Label>
              <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v })}>
                <SelectTrigger data-testid="select-error-status">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="500">500</SelectItem>
                  <SelectItem value="501">501</SelectItem>
                  <SelectItem value="502">502</SelectItem>
                  <SelectItem value="503">503</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-[120px]">
              <Label htmlFor="resolved-filter" className="text-xs">Resolved</Label>
              <Select value={filters.resolved} onValueChange={(v) => setFilters({ ...filters, resolved: v })}>
                <SelectTrigger data-testid="select-error-resolved">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="false">Unresolved</SelectItem>
                  <SelectItem value="true">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={() => refetch()} data-testid="button-refresh-errors">
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No errors found</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b">
                    <th className="text-left py-2 px-2">Time</th>
                    <th className="text-left py-2 px-2">Status</th>
                    <th className="text-left py-2 px-2">Method</th>
                    <th className="text-left py-2 px-2">Path</th>
                    <th className="text-left py-2 px-2">Message</th>
                    <th className="text-left py-2 px-2">Request ID</th>
                    <th className="text-left py-2 px-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b last:border-0 hover-elevate cursor-pointer" onClick={() => setSelectedLog(log)}>
                      <td className="py-2 px-2 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2 px-2">{getStatusBadge(log.status)}</td>
                      <td className="py-2 px-2">
                        <Badge variant="outline">{log.method}</Badge>
                      </td>
                      <td className="py-2 px-2 text-xs max-w-[200px] truncate" title={log.path}>
                        {log.path}
                      </td>
                      <td className="py-2 px-2 max-w-[200px] truncate" title={log.message}>
                        {log.message}
                      </td>
                      <td className="py-2 px-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); copyRequestId(log.requestId); }}
                          data-testid={`button-copy-request-id-${log.id}`}
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          {log.requestId.slice(0, 8)}...
                        </Button>
                      </td>
                      <td className="py-2 px-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); copyFullLog(log); }}
                          data-testid={`button-copy-log-${log.id}`}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages} ({total} total)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Error Details
            </DialogTitle>
            <DialogDescription>
              {selectedLog && new Date(selectedLog.createdAt).toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Request ID</Label>
                  <div className="flex items-center gap-2">
                    <code className="text-sm bg-muted px-2 py-1 rounded">{selectedLog.requestId}</code>
                    <Button variant="ghost" size="sm" onClick={() => copyRequestId(selectedLog.requestId)}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <div>{getStatusBadge(selectedLog.status)}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Method</Label>
                  <div><Badge variant="outline">{selectedLog.method}</Badge></div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Path</Label>
                  <code className="text-sm bg-muted px-2 py-1 rounded block">{selectedLog.path}</code>
                </div>
                {selectedLog.tenantId && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Tenant ID</Label>
                    <code className="text-sm bg-muted px-2 py-1 rounded block">{selectedLog.tenantId}</code>
                  </div>
                )}
                {selectedLog.userId && (
                  <div>
                    <Label className="text-xs text-muted-foreground">User ID</Label>
                    <code className="text-sm bg-muted px-2 py-1 rounded block">{selectedLog.userId}</code>
                  </div>
                )}
                {selectedLog.dbCode && (
                  <div>
                    <Label className="text-xs text-muted-foreground">DB Code</Label>
                    <code className="text-sm bg-muted px-2 py-1 rounded block">{selectedLog.dbCode}</code>
                  </div>
                )}
                {selectedLog.dbConstraint && (
                  <div>
                    <Label className="text-xs text-muted-foreground">DB Constraint</Label>
                    <code className="text-sm bg-muted px-2 py-1 rounded block">{selectedLog.dbConstraint}</code>
                  </div>
                )}
              </div>
              
              <div>
                <Label className="text-xs text-muted-foreground">Error Message</Label>
                <div className="bg-muted p-3 rounded mt-1">
                  <p className="text-sm">{selectedLog.message}</p>
                </div>
              </div>

              {selectedLog.stack && (
                <div>
                  <Label className="text-xs text-muted-foreground">Stack Trace (Server-side only)</Label>
                  <ScrollArea className="h-[200px] bg-muted p-3 rounded mt-1">
                    <pre className="text-xs whitespace-pre-wrap">{selectedLog.stack}</pre>
                  </ScrollArea>
                </div>
              )}

              {selectedLog.meta && Object.keys(selectedLog.meta).length > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground">Metadata</Label>
                  <ScrollArea className="h-[100px] bg-muted p-3 rounded mt-1">
                    <pre className="text-xs">{JSON.stringify(selectedLog.meta, null, 2)}</pre>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => selectedLog && copyFullLog(selectedLog)}>
              <Copy className="h-4 w-4 mr-2" />
              Copy (Redacted)
            </Button>
            <Button onClick={() => setSelectedLog(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
