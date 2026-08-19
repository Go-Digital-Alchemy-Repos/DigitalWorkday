import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BriefcaseBusiness, File, Layers, Paperclip, Plus, Upload, UserRound } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FullScreenDrawer, FullScreenDrawerFooter } from "@/components/ui/full-screen-drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RichTextEditor } from "@/components/richtext";
import { PrioritySelector, StatusSelector, type PriorityLevel, type TaskStatus } from "@/components/forms";

type Option = { id: string; name: string; color?: string | null };
type SectionOption = { id: string; name: string };
type ProjectOption = { id: string; name: string; clientId: string; status: string };
type ProjectDetail = { sections: SectionOption[] };

interface PortalTaskCreateDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  projectId?: string;
  projects?: ProjectOption[];
  sections?: SectionOption[];
  defaultSectionId?: string | null;
  allowTaskAssociation?: boolean;
  onCreated: () => void;
}

export function PortalTaskCreateDrawer({ open, onOpenChange, clientId, projectId, projects = [], sections = [], defaultSectionId, allowTaskAssociation = false, onCreated }: PortalTaskCreateDrawerProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [context, setContext] = useState<"personal" | "project">(projectId ? "project" : "personal");
  const [selectedProjectId, setSelectedProjectId] = useState(projectId || "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<PriorityLevel>("medium");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [sectionId, setSectionId] = useState(defaultSectionId || "unsectioned");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [estimateMinutes, setEstimateMinutes] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [subtaskTitles, setSubtaskTitles] = useState<string[]>([]);
  const [files, setFiles] = useState<globalThis.File[]>([]);
  const activeProjects = useMemo(() => projects.filter((item) => item.clientId === clientId && item.status === "active"), [clientId, projects]);
  const effectiveProjectId = projectId || selectedProjectId;

  useEffect(() => {
    if (!open) return;
    setContext(projectId ? "project" : "personal");
    setSelectedProjectId(projectId || "");
    setSectionId(defaultSectionId || "unsectioned");
  }, [defaultSectionId, open, projectId]);

  const projectDetail = useQuery<ProjectDetail>({
    queryKey: ["portal-project-create-context", effectiveProjectId],
    enabled: open && context === "project" && !!effectiveProjectId && !projectId,
    queryFn: async () => (await apiRequest("GET", `/api/client-portal/projects/${effectiveProjectId}`)).json(),
  });
  const availableSections = projectId ? sections : (projectDetail.data?.sections || []);
  const assignees = useQuery<Option[]>({
    queryKey: effectiveProjectId ? queryKeys.portal.projectAssignees(clientId, effectiveProjectId) : ["portal-assignees", "disabled"],
    enabled: open && context === "project" && !!effectiveProjectId,
    queryFn: async () => (await apiRequest("GET", `/api/client-portal/clients/${clientId}/projects/${effectiveProjectId}/assignees`)).json(),
  });
  const tags = useQuery<Option[]>({
    queryKey: effectiveProjectId ? queryKeys.portal.projectTags(clientId, effectiveProjectId) : ["portal-tags", "disabled"],
    enabled: open && context === "project" && !!effectiveProjectId,
    queryFn: async () => (await apiRequest("GET", `/api/client-portal/clients/${clientId}/projects/${effectiveProjectId}/tags`)).json(),
  });

  const reset = () => {
    setTitle(""); setDescription(""); setPriority("medium"); setStatus("todo"); setStartDate(""); setDueDate(""); setEstimateMinutes("");
    setAssigneeIds([]); setTagIds([]); setSubtaskTitles([]); setSubtaskTitle(""); setFiles([]); setSectionId("unsectioned");
  };
  const createTask = useMutation({
    mutationFn: async () => {
      const common = { title: title.trim(), description: description || null, priority, status, startDate: startDate || null, dueDate: dueDate || null, estimateMinutes: estimateMinutes ? Number(estimateMinutes) : null };
      if (context === "personal") return (await apiRequest("POST", `/api/client-portal/clients/${clientId}/tasks/personal`, { ...common, subtaskTitles })).json();
      if (!effectiveProjectId) throw new Error("Choose an active project");
      const task = await (await apiRequest("POST", `/api/client-portal/clients/${clientId}/projects/${effectiveProjectId}/tasks`, { ...common, sectionId: sectionId === "unsectioned" ? null : sectionId, assigneeIds, tagIds })).json();
      for (const subtask of subtaskTitles) await apiRequest("POST", `/api/client-portal/clients/${clientId}/tasks/${task.id}/subtasks`, { title: subtask });
      for (const file of files) {
        const body = new FormData(); body.append("file", file);
        const response = await fetch(`/api/client-portal/clients/${clientId}/projects/${effectiveProjectId}/tasks/${task.id}/attachments/upload`, { method: "POST", credentials: "include", body });
        if (!response.ok) throw new Error((await response.json().catch(() => null))?.message || `Unable to upload ${file.name}`);
      }
      return task;
    },
    onSuccess: () => { reset(); onOpenChange(false); onCreated(); toast({ title: "Task created" }); },
    onError: (error: Error) => toast({ title: "Unable to create task", description: error.message, variant: "destructive" }),
  });
  const addSubtask = () => { const value = subtaskTitle.trim(); if (value) { setSubtaskTitles((current) => [...current, value]); setSubtaskTitle(""); } };
  const projectReady = context === "personal" || !!effectiveProjectId;

  return <FullScreenDrawer open={open} onOpenChange={onOpenChange} width="2xl" title="Create Task" description="Add a personal task or assign work within an active Client project." footer={<FullScreenDrawerFooter onCancel={() => onOpenChange(false)} onSave={() => createTask.mutate()} isLoading={createTask.isPending} saveLabel="Create Task" saveDisabled={!title.trim() || !projectReady} />}>
    <div className="space-y-6 pb-8" data-testid="portal-task-create-drawer">
      {allowTaskAssociation && <div className="grid grid-cols-2 gap-3 rounded-2xl bg-muted/60 p-1.5">
        <Button type="button" variant={context === "personal" ? "default" : "ghost"} className="h-auto justify-start gap-3 rounded-xl px-4 py-3" onClick={() => { setContext("personal"); setAssigneeIds([]); setTagIds([]); setFiles([]); }}><UserRound className="h-5 w-5" /><span className="text-left"><span className="block">Personal</span><span className="block text-xs font-normal opacity-75">Visible only to you in this Client</span></span></Button>
        <Button type="button" variant={context === "project" ? "default" : "ghost"} className="h-auto justify-start gap-3 rounded-xl px-4 py-3" onClick={() => setContext("project")}><BriefcaseBusiness className="h-5 w-5" /><span className="text-left"><span className="block">Client / Project</span><span className="block text-xs font-normal opacity-75">Client-visible and assignable</span></span></Button>
      </div>}

      <Field label="Title"><Input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Enter task title..." /></Field>
      <Field label="Description"><RichTextEditor value={description} onChange={setDescription} users={(assignees.data || []) as any} placeholder="Provide context and details for this task" minHeight="180px" /></Field>

      {context === "project" && !projectId && <Field label="Open Project"><Select value={selectedProjectId} onValueChange={(value) => { setSelectedProjectId(value); setSectionId("unsectioned"); setAssigneeIds([]); setTagIds([]); }}><SelectTrigger><SelectValue placeholder="Select an active project" /></SelectTrigger><SelectContent>{activeProjects.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>{activeProjects.length === 0 && <p className="text-sm text-muted-foreground">There are no active projects in this Client account.</p>}</Field>}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {context === "project" && <Field label="Section"><Select value={sectionId} onValueChange={setSectionId} disabled={!effectiveProjectId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unsectioned">Unsectioned</SelectItem>{availableSections.filter((item) => item.id !== "unsectioned").map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></Field>}
        <Field label="Priority"><PrioritySelector value={priority} onChange={setPriority} /></Field>
        <Field label="Status"><StatusSelector value={status} onChange={setStatus} /></Field>
        <Field label="Start Date"><Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></Field>
        <Field label="Due Date"><Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></Field>
        <Field label="Estimate (minutes)"><Input type="number" min="0" value={estimateMinutes} onChange={(event) => setEstimateMinutes(event.target.value)} placeholder="0" /></Field>
      </div>

      {context === "project" && effectiveProjectId && <><OptionList title="Assignees" items={assignees.data || []} selected={assigneeIds} onChange={setAssigneeIds} /><OptionList title="Tags" items={tags.data || []} selected={tagIds} onChange={setTagIds} showColor /></>}

      {context === "project" && <section className="rounded-xl border border-[#d6d2ff] bg-[#edebff4d] p-4"><div className="flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 font-medium"><Paperclip className="h-4 w-4" />Attachments</h3><Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}><Upload className="mr-2 h-4 w-4" />Add File</Button><input ref={fileInputRef} type="file" multiple className="hidden" onChange={(event) => { setFiles((current) => [...current, ...Array.from(event.target.files || [])]); event.target.value = ""; }} /></div>{files.length ? <div className="mt-3 space-y-2">{files.map((file, index) => <div key={`${file.name}-${index}`} className="flex items-center justify-between rounded-lg border bg-background p-2 text-sm"><span className="flex min-w-0 items-center gap-2"><File className="h-4 w-4" /><span className="truncate">{file.name}</span></span><button type="button" onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button></div>)}</div> : <p className="mt-3 text-sm text-muted-foreground">Files will be uploaded when the task is created.</p>}</section>}

      <section className="space-y-3 rounded-xl border bg-muted/20 p-4"><h3 className="flex items-center gap-2 font-medium"><Layers className="h-4 w-4" />Subtasks</h3><div className="flex gap-2"><Input value={subtaskTitle} onChange={(event) => setSubtaskTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addSubtask(); } }} placeholder="Add a subtask..." /><Button type="button" variant="outline" onClick={addSubtask} disabled={!subtaskTitle.trim()}><Plus className="mr-2 h-4 w-4" />Add</Button></div>{subtaskTitles.map((item, index) => <div key={`${item}-${index}`} className="flex items-center justify-between rounded-lg border bg-background p-3 text-sm"><span>{item}</span><button type="button" onClick={() => setSubtaskTitles((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button></div>)}</section>
    </div>
  </FullScreenDrawer>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }

function OptionList({ title, items, selected, onChange, showColor = false }: { title: string; items: Option[]; selected: string[]; onChange: (ids: string[]) => void; showColor?: boolean }) {
  return <div className="space-y-2"><Label>{title}</Label><div className="max-h-40 space-y-2 overflow-y-auto rounded-xl border p-3">{items.map((item) => <label key={item.id} className="flex cursor-pointer items-center gap-2 text-sm"><Checkbox checked={selected.includes(item.id)} onCheckedChange={(checked) => onChange(checked ? [...new Set([...selected, item.id])] : selected.filter((id) => id !== item.id))} />{showColor && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color || "#6b7280" }} />}{item.name}</label>)}{items.length === 0 && <p className="text-sm text-muted-foreground">No options available</p>}</div></div>;
}
