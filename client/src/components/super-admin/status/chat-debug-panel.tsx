import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, AlertCircle, RefreshCw, Copy, MessageSquare, Users } from "lucide-react";
import type { ChatDebugStatus, ChatDebugMetrics, ChatDebugEvent, ChatDebugSocket } from "./types";

export function ChatDebugPanel() {
  const { toast } = useToast();
  const [autoRefresh, setAutoRefresh] = useState(true);

  const { data: statusData } = useQuery<{ success: boolean; data: ChatDebugStatus }>({
    queryKey: ["/api/v1/super/debug/chat/status"],
  });

  const isEnabled = statusData?.data?.enabled ?? false;

  const { data: metricsData, isLoading: metricsLoading, refetch: refetchMetrics } = useQuery<{ success: boolean; data: ChatDebugMetrics }>({
    queryKey: ["/api/v1/super/debug/chat/metrics"],
    enabled: isEnabled,
    refetchInterval: autoRefresh ? 5000 : false,
  });

  const { data: eventsData, isLoading: eventsLoading, refetch: refetchEvents } = useQuery<{ success: boolean; data: ChatDebugEvent[]; count: number }>({
    queryKey: ["/api/v1/super/debug/chat/events"],
    enabled: isEnabled,
    refetchInterval: autoRefresh ? 5000 : false,
  });

  const { data: socketsData, isLoading: socketsLoading, refetch: refetchSockets } = useQuery<{ success: boolean; data: ChatDebugSocket[] }>({
    queryKey: ["/api/v1/super/debug/chat/sockets"],
    enabled: isEnabled,
    refetchInterval: autoRefresh ? 10000 : false,
  });

  const metrics = metricsData?.data;
  const events = eventsData?.data || [];
  const sockets = socketsData?.data || [];

  const handleCopySnapshot = () => {
    const snapshot = {
      timestamp: new Date().toISOString(),
      metrics,
      events: events.slice(0, 50),
      activeSockets: sockets.length,
    };
    navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
    toast({ title: "Diagnostics snapshot copied to clipboard" });
  };

  if (!isEnabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Chat Debug
          </CardTitle>
          <CardDescription>
            Chat debugging is disabled. Set CHAT_DEBUG=true to enable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 p-4 bg-muted rounded-md">
            <AlertCircle className="h-5 w-5 text-muted-foreground" />
            <span className="text-muted-foreground">
              To enable chat debugging, add CHAT_DEBUG=true to your environment variables on Railway.
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-green-600 border-green-600">
            Debug Enabled
          </Badge>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
              data-testid="checkbox-auto-refresh"
            />
            Auto-refresh (5s)
          </label>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchMetrics();
              refetchEvents();
              refetchSockets();
            }}
            data-testid="button-refresh-chat-debug"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopySnapshot}
            data-testid="button-copy-snapshot"
          >
            <Copy className="h-4 w-4 mr-2" />
            Copy Snapshot
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Sockets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="metric-active-sockets">
              {metricsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : metrics?.activeSockets ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Rooms Joined</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="metric-rooms-joined">
              {metricsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : metrics?.roomsJoined ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Messages (5m)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="metric-messages">
              {metricsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : metrics?.messagesLast5Min ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Disconnects (5m)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="metric-disconnects">
              {metricsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : metrics?.disconnectsLast5Min ?? 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {metrics?.lastErrors && metrics.lastErrors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Errors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {metrics.lastErrors.map((err, i) => (
                <div key={i} className="flex items-center justify-between p-2 bg-muted rounded-md">
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive">{err.code}</Badge>
                    <span className="text-sm text-muted-foreground">x{err.count}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(err.lastOccurred).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Active Connections ({sockets.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {socketsLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : sockets.length === 0 ? (
            <p className="text-muted-foreground text-sm">No active socket connections</p>
          ) : (
            <ScrollArea className="h-[200px]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2">Socket ID</th>
                    <th className="text-left py-2 px-2">User ID</th>
                    <th className="text-left py-2 px-2">Tenant</th>
                    <th className="text-left py-2 px-2">Rooms</th>
                    <th className="text-left py-2 px-2">Connected</th>
                  </tr>
                </thead>
                <tbody>
                  {sockets.map((s) => (
                    <tr key={s.socketId} className="border-b last:border-0">
                      <td className="py-2 px-2 text-xs">{s.socketId.slice(0, 12)}...</td>
                      <td className="py-2 px-2 text-xs">{s.userId?.slice(0, 8) || '-'}...</td>
                      <td className="py-2 px-2 text-xs">{s.tenantId?.slice(0, 8) || '-'}...</td>
                      <td className="py-2 px-2">{s.roomsCount}</td>
                      <td className="py-2 px-2 text-xs">{new Date(s.connectedAt).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Events ({events.length})</CardTitle>
          <CardDescription>Last 50 chat events (IDs only, no message content)</CardDescription>
        </CardHeader>
        <CardContent>
          {eventsLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : events.length === 0 ? (
            <p className="text-muted-foreground text-sm">No events recorded yet</p>
          ) : (
            <ScrollArea className="h-[400px]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2">Time</th>
                    <th className="text-left py-2 px-2">Event</th>
                    <th className="text-left py-2 px-2">User</th>
                    <th className="text-left py-2 px-2">Conversation</th>
                    <th className="text-left py-2 px-2">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {events.slice(0, 50).map((e) => (
                    <tr key={e.id} className="border-b last:border-0">
                      <td className="py-2 px-2 text-xs text-muted-foreground">
                        {new Date(e.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="py-2 px-2">
                        <Badge variant={
                          e.eventType.includes('error') || e.eventType.includes('denied') 
                            ? 'destructive' 
                            : e.eventType.includes('disconnect') 
                              ? 'secondary' 
                              : 'outline'
                        }>
                          {e.eventType}
                        </Badge>
                      </td>
                      <td className="py-2 px-2 text-xs">
                        {e.userId?.slice(0, 8) || '-'}
                      </td>
                      <td className="py-2 px-2 text-xs">
                        {e.conversationId || e.roomName || '-'}
                      </td>
                      <td className="py-2 px-2 text-xs text-muted-foreground">
                        {e.errorCode && <span className="text-red-500">{e.errorCode}</span>}
                        {e.disconnectReason && <span>{e.disconnectReason}</span>}
                        {e.payloadSize !== undefined && <span>{e.payloadSize} chars</span>}
                        {e.requestId && (
                          <span title="Request ID">
                            req:{e.requestId.slice(0, 8)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
