import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { usePortalClient } from "@/hooks/use-portal-client";
import { Card, CardContent } from "@/components/ui/card";
import { Activity } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type ActivityRow = { id: string; entityType: string; action: string; actorName: string; createdAt: string; details: { entityTitle?: string; from?: string; to?: string } };

export default function ClientPortalActivity() {
  const { client, clientId } = usePortalClient();
  const { data = [], isLoading } = useQuery<ActivityRow[]>({ queryKey: queryKeys.portal.clientActivity(clientId), enabled: !!clientId && !!client?.capabilities.viewActivity });
  if (!client?.capabilities.viewActivity) return <div className="p-6"><Card><CardContent className="p-6">Client Admin access is required to view Activity.</CardContent></Card></div>;
  return <div className="p-3 sm:p-6 overflow-y-auto h-full"><h1 className="text-2xl font-bold">Activity</h1><p className="text-muted-foreground mb-5">Client-visible account activity</p>{isLoading ? <p>Loading…</p> : <div className="space-y-2">{data.map((row) => <Card key={row.id}><CardContent className="p-4 flex gap-3"><Activity className="h-5 w-5 text-muted-foreground" /><div><p className="text-sm"><span className="font-medium">{row.actorName}</span> {row.action.replace(/_/g, " ")} {row.details.entityTitle && <span className="font-medium">{row.details.entityTitle}</span>}</p><p className="text-xs text-muted-foreground">{row.entityType} · {formatDistanceToNow(new Date(row.createdAt), { addSuffix: true })}</p></div></CardContent></Card>)}</div>}</div>;
}
