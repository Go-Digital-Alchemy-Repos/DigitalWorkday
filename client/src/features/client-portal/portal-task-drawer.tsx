import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Calendar, CheckSquare, Download, File, Layers, Loader2, MessageSquare, Paperclip, Plus, Tag, Upload, Users } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FullScreenDrawer, FullScreenDrawerFooter } from "@/components/ui/full-screen-drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor, RichTextRenderer } from "@/components/richtext";
import { PrioritySelector, StatusSelector, type PriorityLevel, type TaskStatus } from "@/components/forms";

type Option = { id: string; name: string; color?: string | null; avatarUrl?: string | null };
type SectionOption = { id: string; name: string };
type PortalTag = { id?: string; name?: string; color?: string | null; tagId?: string; tag?: Option };
type PortalAttachment = { id: string; originalFileName: string; mimeType: string; fileSizeBytes: number; createdAt: string; uploadedByName?: string | null };
type TaskDetail = {
  id: string; title: string; description: string | null; status: string; priority: string;
  dueDate: string | null; estimateMinutes?: number | null; createdAt?: string; clientId: string;
  projectId: string; projectName?: string; sectionId?: string | null; assignees: Option[]; tags: PortalTag[];
  subtasks: Array<{ id: string; title: string; status: string; completed: boolean }>;
  comments: Array<{ id: string; body: string; createdAt: string; user: { name: string | null } | null }>;
};

interface PortalTaskDrawerProps {
  taskId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
  sections?: SectionOption[];
}

const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
const fileSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export function PortalTaskDrawer({ taskId, open, onOpenChange, onUpdated, sections = [] }: PortalTaskDrawerProps) {
  const { toast } = useToast();
  const queryKey = queryKeys.portal.taskDetail(taskId || "disabled");
  const taskQuery = useQuery<TaskDetail>({ queryKey, enabled: open && !!taskId });
  const task = taskQuery.data;
  const [details, setDetails] = useState({ title: "", description: "", dueDate: "", estimateMinutes: "", sectionId: "unsectioned" });
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [subtaskTitle, setSubtaskTitle] = useState("");

  const assignees = useQuery<Option[]>({
    queryKey: task ? queryKeys.portal.projectAssignees(task.clientId, task.projectId) : ["portal-assignees", "disabled"],
    enabled: open && !!task,
    queryFn: async () => (await apiRequest("GET", `/api/client-portal/clients/${task!.clientId}/projects/${task!.projectId}/assignees`)).json(),
  });
  const tags = useQuery<Option[]>({
    queryKey: task ? queryKeys.portal.projectTags(task.clientId, task.projectId) : ["portal-tags", "disabled"],
    enabled: open && !!task,
    queryFn: async () => (await apiRequest("GET", `/api/client-portal/clients/${task!.clientId}/projects/${task!.projectId}/tags`)).json(),
  });

  useEffect(() => {
    if (!task) return;
    setDetails({ title: task.title, description: task.description || "", dueDate: task.dueDate?.slice(0, 10) || "", estimateMinutes: task.estimateMinutes == null ? "" : String(task.estimateMinutes), sectionId: task.sectionId || "unsectioned" });
    setAssigneeIds((task.assignees || []).map((item) => item.id));
    setTagIds((task.tags || []).map((item) => item.tag?.id || item.id || item.tagId).filter(Boolean) as string[]);
  }, [task]);

  const refresh = () => { queryClient.invalidateQueries({ queryKey }); onUpdated(); };
  const update = useMutation({
    mutationFn: async (body: Record<string, unknown>) => (await apiRequest("PATCH", `/api/client-portal/clients/${task!.clientId}/tasks/${task!.id}`, body)).json(),
    onSuccess: () => { refresh(); toast({ title: "Task updated" }); },
    onError: (error: Error) => toast({ title: "Unable to update task", description: error.message, variant: "destructive" }),
  });
  const addComment = useMutation({ mutationFn: async () => (await apiRequest("POST", `/api/client-portal/tasks/${task!.id}/comments`, { body: comment })).json(), onSuccess: () => { setComment(""); refresh(); }, onError: (error: Error) => toast({ title: "Unable to post comment", description: error.message, variant: "destructive" }) });
  const addSubtask = useMutation({ mutationFn: async () => (await apiRequest("POST", `/api/client-portal/clients/${task!.clientId}/tasks/${task!.id}/subtasks`, { title: subtaskTitle })).json(), onSuccess: () => { setSubtaskTitle(""); refresh(); }, onError: (error: Error) => toast({ title: "Unable to add subtask", description: error.message, variant: "destructive" }) });
  const updateSubtask = useMutation({ mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => (await apiRequest("PATCH", `/api/client-portal/clients/${task!.clientId}/subtasks/${id}`, body)).json(), onSuccess: refresh });

  const save = () => update.mutate({ title: details.title.trim(), description: details.description || null, dueDate: details.dueDate || null, estimateMinutes: details.estimateMinutes ? Number(details.estimateMinutes) : null, sectionId: details.sectionId === "unsectioned" ? null : details.sectionId, assigneeIds, tagIds });

  if (!task && open) return <FullScreenDrawer open={open} onOpenChange={onOpenChange} title="Task details" description="Loading client-visible task details" width="2xl"><div className="flex min-h-[50vh] items-center justify-center">{taskQuery.isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : "Task unavailable"}</div></FullScreenDrawer>;
  if (!task) return null;

  return <FullScreenDrawer open={open} onOpenChange={onOpenChange} width="2xl" title={<span className="flex items-center gap-2"><CheckSquare className="h-5 w-5" />{task.title}</span>} description={`${task.projectName || "Project"} · Client-visible task`} footer={<FullScreenDrawerFooter onCancel={() => onOpenChange(false)} onSave={save} isLoading={update.isPending} saveLabel="Save Changes" saveDisabled={!details.title.trim()} />}>
    <div className="space-y-6" data-testid="portal-task-drawer">
      <Field label="Title"><Input value={details.title} onChange={(event) => setDetails((value) => ({ ...value, title: event.target.value }))} data-testid="input-portal-task-title" /></Field>
      <Field label="Description"><RichTextEditor value={details.description} onChange={(description) => setDetails((value) => ({ ...value, description }))} users={(assignees.data || []) as any} placeholder="Add a detailed description... Type @ to mention someone" minHeight="140px" data-testid="editor-portal-task-description" /><p className="text-sm text-muted-foreground">Provide context and details for this task</p></Field>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Field label="Section"><Select value={details.sectionId} onValueChange={(sectionId) => setDetails((value) => ({ ...value, sectionId }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unsectioned">Unsectioned</SelectItem>{sections.filter((item) => item.id !== "unsectioned").map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Priority"><PrioritySelector value={task.priority as PriorityLevel} onChange={(priority) => update.mutate({ priority })} /></Field>
        <Field label="Status"><StatusSelector value={task.status as TaskStatus} onChange={(status) => update.mutate({ status })} /></Field>
        <Field label="Due Date"><div className="relative"><Calendar className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" type="date" value={details.dueDate} onChange={(event) => setDetails((value) => ({ ...value, dueDate: event.target.value }))} /></div></Field>
        <Field label="Estimate (minutes)"><Input type="number" min="0" placeholder="0" value={details.estimateMinutes} onChange={(event) => setDetails((value) => ({ ...value, estimateMinutes: event.target.value }))} /></Field>
      </div>

      <MultiOption label="Assignees" icon={<Users className="h-4 w-4" />} items={assignees.data || []} selected={assigneeIds} onChange={setAssigneeIds} />
      <MultiOption label="Tags" icon={<Tag className="h-4 w-4" />} items={tags.data || []} selected={tagIds} onChange={setTagIds} tags />
      <PortalTaskAttachments task={task} />

      <section className="space-y-3 rounded-xl border bg-muted/20 p-4"><h3 className="flex items-center gap-2 font-medium"><Layers className="h-4 w-4" />Subtasks</h3><div className="flex gap-2"><Input value={subtaskTitle} onChange={(event) => setSubtaskTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && subtaskTitle.trim()) addSubtask.mutate(); }} placeholder="Add a subtask..." /><Button variant="outline" onClick={() => addSubtask.mutate()} disabled={!subtaskTitle.trim() || addSubtask.isPending}><Plus className="mr-2 h-4 w-4" />Add</Button></div>{task.subtasks.map((item) => <div key={item.id} className="grid gap-2 rounded-lg border bg-background p-3 sm:grid-cols-[1fr_160px]"><Input defaultValue={item.title} className={item.completed ? "line-through text-muted-foreground" : ""} onBlur={(event) => { const title = event.target.value.trim(); if (title && title !== item.title) updateSubtask.mutate({ id: item.id, body: { title } }); }} /><StatusSelector value={item.status as TaskStatus} onChange={(status) => updateSubtask.mutate({ id: item.id, body: { status } })} /></div>)}</section>

      <section className="space-y-3 rounded-xl border p-4"><h3 className="flex items-center gap-2 font-medium"><MessageSquare className="h-4 w-4" />Comments</h3><Textarea rows={4} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Leave a client-visible comment" /><Button variant="outline" onClick={() => addComment.mutate()} disabled={!comment.trim() || addComment.isPending}>Post Comment</Button>{task.comments.map((item) => <div key={item.id} className="rounded-lg border bg-muted/20 p-3"><div className="mb-1 flex flex-wrap items-center gap-2 text-sm font-medium"><span>{item.user?.name || "Portal user"}</span><Badge variant="outline">Client visible</Badge><span className="font-normal text-muted-foreground">{format(new Date(item.createdAt), "MMM d, yyyy")}</span></div><RichTextRenderer value={item.body} className="text-sm text-muted-foreground" /></div>)}</section>
    </div>
  </FullScreenDrawer>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }

function MultiOption({ label, icon, items, selected, onChange, tags = false }: { label: string; icon: React.ReactNode; items: Option[]; selected: string[]; onChange: (ids: string[]) => void; tags?: boolean }) {
  const available = items.filter((item) => !selected.includes(item.id));
  return <div className="space-y-3"><Label className="flex items-center gap-2">{icon}{label}</Label><div className="flex flex-wrap gap-2">{selected.map((id) => { const item = items.find((value) => value.id === id); if (!item) return null; return <Badge key={id} variant="secondary" className="gap-2 py-1" style={tags ? { backgroundColor: item.color ? `${item.color}20` : undefined } : undefined}>{!tags && <Avatar className="h-5 w-5"><AvatarFallback className="text-[10px]">{initials(item.name)}</AvatarFallback></Avatar>}{tags && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color || "#6b7280" }} />}{item.name}<button type="button" aria-label={`Remove ${item.name}`} onClick={() => onChange(selected.filter((value) => value !== id))}>×</button></Badge>; })}{selected.length === 0 && <span className="text-sm text-muted-foreground">No {label.toLowerCase()}</span>}</div><Select value="" onValueChange={(id) => id && onChange([...selected, id])}><SelectTrigger><SelectValue placeholder={`Add ${label.toLowerCase().replace(/s$/, "")}...`} /></SelectTrigger><SelectContent>{available.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>;
}

function PortalTaskAttachments({ task }: { task: TaskDetail }) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const path = `/api/client-portal/clients/${task.clientId}/projects/${task.projectId}/tasks/${task.id}/attachments`;
  const queryKey = [path];
  const attachments = useQuery<PortalAttachment[]>({ queryKey, queryFn: async () => (await apiRequest("GET", path)).json() });
  const upload = useMutation({ mutationFn: async (file: globalThis.File) => { const body = new FormData(); body.append("file", file); const response = await fetch(`${path}/upload`, { method: "POST", credentials: "include", body }); if (!response.ok) throw new Error((await response.json().catch(() => null))?.message || "Upload failed"); return response.json(); }, onSuccess: () => queryClient.invalidateQueries({ queryKey }), onError: (error: Error) => toast({ title: "Unable to upload file", description: error.message, variant: "destructive" }) });
  const download = async (attachment: PortalAttachment) => { const result = await (await apiRequest("GET", `${path}/${attachment.id}/download?mode=download`)).json(); const link = document.createElement("a"); link.href = result.url; link.download = result.fileName || attachment.originalFileName; link.rel = "noopener noreferrer"; link.click(); };
  return <section className="rounded-xl border border-[#d6d2ff] bg-[#edebff4d] p-4 dark:border-[hsl(var(--section-attachments-border))] dark:bg-[hsl(var(--section-attachments))]"><div className="flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 font-medium"><Paperclip className="h-4 w-4" />Attachments</h3><Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={upload.isPending}>{upload.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}Add File</Button><input ref={inputRef} type="file" multiple className="hidden" onChange={(event) => { Array.from(event.target.files || []).forEach((file) => upload.mutate(file)); event.target.value = ""; }} /></div><div className="mt-3 space-y-2">{attachments.isLoading && <p className="text-sm text-muted-foreground">Loading attachments…</p>}{attachments.data?.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border bg-background/80 p-3"><div className="flex min-w-0 items-center gap-2"><File className="h-4 w-4 shrink-0 text-muted-foreground" /><div className="min-w-0"><p className="truncate text-sm font-medium">{item.originalFileName}</p><p className="text-xs text-muted-foreground">{fileSize(item.fileSizeBytes)} · {item.uploadedByName}</p></div></div><Button variant="ghost" size="icon" aria-label={`Download ${item.originalFileName}`} onClick={() => download(item)}><Download className="h-4 w-4" /></Button></div>)}{!attachments.isLoading && !attachments.data?.length && <p className="text-sm text-muted-foreground">No files attached.</p>}</div><p className="mt-3 text-xs text-muted-foreground">Portal users can upload and download client-visible files. Files cannot be deleted from the portal.</p></section>;
}
