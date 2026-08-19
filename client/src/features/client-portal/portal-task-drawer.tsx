import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckSquare, ExternalLink, Loader2, MessageSquare, Plus, Save } from "lucide-react";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

type TaskDetail = { id: string; title: string; description: string | null; status: string; priority: string; dueDate: string | null; startDate?: string | null; estimateMinutes?: number | null; clientId: string; projectId: string; subtasks: Array<{ id: string; title: string; status: string; completed: boolean }>; comments: Array<{ id: string; body: string; createdAt: string; user: { name: string | null } | null }> };

export function PortalTaskDrawer({ taskId, open, onOpenChange, onUpdated }: { taskId: string | null; open: boolean; onOpenChange: (open: boolean) => void; onUpdated: () => void }) {
  const { toast } = useToast();
  const queryKey = queryKeys.portal.taskDetail(taskId || "disabled");
  const taskQuery = useQuery<TaskDetail>({ queryKey, enabled: open && !!taskId });
  const task = taskQuery.data;
  const [details, setDetails] = useState({ title: "", description: "", startDate: "", dueDate: "", estimateMinutes: "" });
  const [comment, setComment] = useState("");
  const [subtaskTitle, setSubtaskTitle] = useState("");
  useEffect(() => { if (task) setDetails({ title: task.title, description: task.description || "", startDate: task.startDate?.slice(0, 10) || "", dueDate: task.dueDate?.slice(0, 10) || "", estimateMinutes: task.estimateMinutes == null ? "" : String(task.estimateMinutes) }); }, [task]);
  const refresh = () => { queryClient.invalidateQueries({ queryKey }); onUpdated(); };
  const update = useMutation({ mutationFn: async (body: Record<string, unknown>) => (await apiRequest("PATCH", `/api/client-portal/clients/${task!.clientId}/tasks/${task!.id}`, body)).json(), onSuccess: refresh, onError: (error: Error) => toast({ title: "Unable to update task", description: error.message, variant: "destructive" }) });
  const addComment = useMutation({ mutationFn: async () => (await apiRequest("POST", `/api/client-portal/tasks/${task!.id}/comments`, { body: comment })).json(), onSuccess: () => { setComment(""); refresh(); } });
  const addSubtask = useMutation({ mutationFn: async () => (await apiRequest("POST", `/api/client-portal/clients/${task!.clientId}/tasks/${task!.id}/subtasks`, { title: subtaskTitle })).json(), onSuccess: () => { setSubtaskTitle(""); refresh(); } });
  const updateSubtask = useMutation({ mutationFn: async ({ id, status }: { id: string; status: string }) => (await apiRequest("PATCH", `/api/client-portal/clients/${task!.clientId}/subtasks/${id}`, { status })).json(), onSuccess: refresh });

  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="w-full overflow-y-auto p-0 sm:max-w-2xl">
    {!task ? <div className="flex h-full items-center justify-center">{taskQuery.isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : "Task unavailable"}</div> : <>
      <SheetHeader className="border-b px-6 py-5"><div className="flex items-center justify-between gap-4 pr-8"><SheetTitle className="flex items-center gap-2"><CheckSquare className="h-5 w-5" />{task.title}</SheetTitle><Button variant="ghost" size="sm" asChild><Link href={`/portal/tasks/${task.id}`}><ExternalLink className="mr-2 h-4 w-4" />Full details</Link></Button></div></SheetHeader>
      <div className="space-y-7 p-6">
        <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>Status</Label><Select value={task.status} onValueChange={(status) => update.mutate({ status })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todo">To do</SelectItem><SelectItem value="in_progress">In progress</SelectItem><SelectItem value="in_review">In review</SelectItem><SelectItem value="completed">Completed</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Priority</Label><Select value={task.priority} onValueChange={(priority) => update.mutate({ priority })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select></div></div>
        <div className="space-y-3"><div className="space-y-2"><Label>Task name</Label><Input value={details.title} onChange={(event) => setDetails((value) => ({ ...value, title: event.target.value }))} /></div><div className="space-y-2"><Label>Description</Label><Textarea rows={6} value={details.description} onChange={(event) => setDetails((value) => ({ ...value, description: event.target.value }))} /></div><div className="grid grid-cols-3 gap-3"><Input type="date" value={details.startDate} onChange={(event) => setDetails((value) => ({ ...value, startDate: event.target.value }))} /><Input type="date" value={details.dueDate} onChange={(event) => setDetails((value) => ({ ...value, dueDate: event.target.value }))} /><Input type="number" min="0" placeholder="Estimate" value={details.estimateMinutes} onChange={(event) => setDetails((value) => ({ ...value, estimateMinutes: event.target.value }))} /></div><Button onClick={() => update.mutate({ title: details.title, description: details.description || null, startDate: details.startDate || null, dueDate: details.dueDate || null, estimateMinutes: details.estimateMinutes ? Number(details.estimateMinutes) : null })} disabled={!details.title.trim()}><Save className="mr-2 h-4 w-4" />Save changes</Button></div>
        <section className="space-y-3"><h3 className="font-semibold">Subtasks</h3><div className="flex gap-2"><Input value={subtaskTitle} onChange={(event) => setSubtaskTitle(event.target.value)} placeholder="Add a subtask" /><Button size="icon" onClick={() => addSubtask.mutate()} disabled={!subtaskTitle.trim()}><Plus className="h-4 w-4" /></Button></div>{task.subtasks.map((item) => <div key={item.id} className="flex items-center justify-between rounded-xl border p-3"><span className={item.completed ? "line-through text-muted-foreground" : ""}>{item.title}</span><Select value={item.status === "done" ? "completed" : item.status} onValueChange={(status) => updateSubtask.mutate({ id: item.id, status })}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todo">To do</SelectItem><SelectItem value="in_progress">In progress</SelectItem><SelectItem value="completed">Completed</SelectItem></SelectContent></Select></div>)}</section>
        <section className="space-y-3"><h3 className="flex items-center gap-2 font-semibold"><MessageSquare className="h-4 w-4" />Comments</h3><Textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Leave a client-visible comment" /><Button variant="outline" onClick={() => addComment.mutate()} disabled={!comment.trim()}>Post comment</Button>{task.comments.map((item) => <div key={item.id} className="rounded-xl border p-3"><div className="mb-1 flex items-center gap-2 text-sm font-medium">{item.user?.name || "Portal user"}<Badge variant="outline">Client visible</Badge></div><p className="whitespace-pre-wrap text-sm text-muted-foreground">{item.body}</p></div>)}</section>
      </div>
    </>}
  </SheetContent></Sheet>;
}
