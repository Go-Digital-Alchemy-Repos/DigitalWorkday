import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Calendar, Clock, FolderKanban, LockKeyhole, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RichTextRenderer } from "@/components/richtext";
import { getStorageUrl } from "@/lib/storageUrl";

type PreviewResponse = {
  task: {
    id: string; title: string; description: string | null; status: string; priority: string;
    startDate: string | null; dueDate: string | null; completedAt: string | null; archivedAt: string | null;
    createdAt: string; updatedAt: string; projectName: string | null;
  };
  assignees: Array<{ id: string; name: string | null; email: string; avatarUrl: string | null }>;
  history: Array<{ id: string; action: string; metadata: Record<string, unknown> | null; createdAt: string }>;
};

function prettyAction(action: string): string {
  return action.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

export default function SuperAdminTaskPreview() {
  const { taskId } = useParams<{ taskId: string }>();
  const query = useQuery<PreviewResponse>({
    queryKey: ["/api/v1/super/tasks", taskId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/super/tasks/${taskId}`, { credentials: "include" });
      if (!response.ok) throw new Error(response.status === 404 ? "This task no longer exists." : "Task preview could not be loaded.");
      return response.json();
    },
  });

  if (query.isLoading) return <div className="mx-auto w-full max-w-5xl space-y-4 p-6"><Skeleton className="h-10 w-72" /><Skeleton className="h-72 w-full" /></div>;
  if (query.isError || !query.data) return (
    <div className="mx-auto max-w-xl p-8 text-center">
      <LockKeyhole className="mx-auto h-10 w-10 text-muted-foreground" />
      <h1 className="mt-4 text-xl font-semibold">Read-only task preview unavailable</h1>
      <p className="mt-2 text-sm text-muted-foreground">{query.error instanceof Error ? query.error.message : "Task preview could not be loaded."}</p>
      <Button className="mt-5" variant="outline" onClick={() => window.close()}>Close tab</Button>
    </div>
  );

  const { task, assignees, history } = query.data;
  return (
    <div className="mx-auto h-full w-full max-w-6xl space-y-5 overflow-y-auto p-4 sm:p-6 lg:p-8" data-testid="page-super-task-preview">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" className="-ml-3 mb-2" onClick={() => window.close()}><ArrowLeft className="mr-2 h-4 w-4" />Close preview</Button>
          <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary"><LockKeyhole className="mr-1 h-3 w-3" />Read-only</Badge><Badge variant="outline">{task.status.replaceAll("_", " ")}</Badge><Badge variant="outline">{task.priority} priority</Badge></div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{task.title}</h1>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle className="text-base">Task context</CardTitle></CardHeader>
            <CardContent>{task.description ? <RichTextRenderer value={task.description} /> : <p className="text-sm text-muted-foreground">No description provided.</p>}</CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">History</CardTitle></CardHeader>
            <CardContent>
              {history.length === 0 ? <p className="text-sm text-muted-foreground">No recorded history.</p> : (
                <div className="divide-y">
                  {history.map((item) => (
                    <div key={item.id} className="py-3">
                      <div className="flex items-start justify-between gap-3"><p className="text-sm font-medium">{prettyAction(item.action)}</p><time className="shrink-0 text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</time></div>
                      {typeof item.metadata?.actorName === "string" && <p className="mt-1 text-xs text-muted-foreground">by {item.metadata.actorName}</p>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
          <CardContent className="space-y-5 text-sm">
            <div className="flex gap-3"><FolderKanban className="mt-0.5 h-4 w-4 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">Project</p><p>{task.projectName || "Personal task"}</p></div></div>
            <div className="flex gap-3"><Calendar className="mt-0.5 h-4 w-4 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">Due</p><p>{task.dueDate ? new Date(task.dueDate).toLocaleString() : "No due date"}</p></div></div>
            <div className="flex gap-3"><Clock className="mt-0.5 h-4 w-4 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">Updated</p><p>{new Date(task.updatedAt).toLocaleString()}</p></div></div>
            <div className="flex gap-3"><UserRound className="mt-0.5 h-4 w-4 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">Assignees</p>{assignees.length === 0 ? <p>Unassigned</p> : <div className="mt-2 space-y-2">{assignees.map((user) => <div key={user.id} className="flex items-center gap-2"><Avatar className="h-7 w-7"><AvatarImage src={getStorageUrl(user.avatarUrl)} /><AvatarFallback>{(user.name || user.email).slice(0, 2).toUpperCase()}</AvatarFallback></Avatar><span className="truncate">{user.name || user.email}</span></div>)}</div>}</div></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
