import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

type Option = { id: string; name: string; color?: string | null };
type SectionOption = { id: string; name: string };

interface PortalTaskCreateDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  projectId: string;
  sections: SectionOption[];
  defaultSectionId?: string | null;
  onCreated: () => void;
}

export function PortalTaskCreateDrawer({ open, onOpenChange, clientId, projectId, sections, defaultSectionId, onCreated }: PortalTaskCreateDrawerProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [status, setStatus] = useState("todo");
  const [sectionId, setSectionId] = useState<string>(defaultSectionId || "unsectioned");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [estimateMinutes, setEstimateMinutes] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);

  useEffect(() => { if (open) setSectionId(defaultSectionId || "unsectioned"); }, [defaultSectionId, open]);
  const assignees = useQuery<Option[]>({ queryKey: queryKeys.portal.projectAssignees(clientId, projectId), enabled: open, queryFn: async () => (await apiRequest("GET", `/api/client-portal/clients/${clientId}/projects/${projectId}/assignees`)).json() });
  const tags = useQuery<Option[]>({ queryKey: queryKeys.portal.projectTags(clientId, projectId), enabled: open, queryFn: async () => (await apiRequest("GET", `/api/client-portal/clients/${clientId}/projects/${projectId}/tags`)).json() });
  const createTask = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/client-portal/clients/${clientId}/projects/${projectId}/tasks`, {
      title: title.trim(), description: description || null, priority, status,
      sectionId: sectionId === "unsectioned" ? null : sectionId,
      startDate: startDate || null, dueDate: dueDate || null,
      estimateMinutes: estimateMinutes ? Number(estimateMinutes) : null,
      assigneeIds, tagIds,
    })).json(),
    onSuccess: () => {
      setTitle(""); setDescription(""); setPriority("medium"); setStatus("todo"); setStartDate(""); setDueDate(""); setEstimateMinutes(""); setAssigneeIds([]); setTagIds([]);
      onOpenChange(false); onCreated(); toast({ title: "Task created" });
    },
    onError: (error: Error) => toast({ title: "Unable to create task", description: error.message, variant: "destructive" }),
  });

  const toggle = (id: string, checked: boolean, setter: React.Dispatch<React.SetStateAction<string[]>>) => setter((current) => checked ? [...new Set([...current, id])] : current.filter((value) => value !== id));

  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="w-full overflow-y-auto sm:max-w-xl">
    <SheetHeader><SheetTitle>Create task</SheetTitle><SheetDescription>Add a client-visible task using the same project fields available in the workspace.</SheetDescription></SheetHeader>
    <div className="space-y-5 py-6">
      <div className="space-y-2"><Label>Task name</Label><Input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What needs to be done?" /></div>
      <div className="space-y-2"><Label>Description</Label><Textarea rows={5} value={description} onChange={(event) => setDescription(event.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>Status</Label><Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todo">To do</SelectItem><SelectItem value="in_progress">In progress</SelectItem><SelectItem value="in_review">In review</SelectItem><SelectItem value="completed">Completed</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Priority</Label><Select value={priority} onValueChange={setPriority}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select></div></div>
      <div className="space-y-2"><Label>Section</Label><Select value={sectionId} onValueChange={setSectionId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unsectioned">Unsectioned</SelectItem>{sections.filter((item) => item.id !== "unsectioned").map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>Start date</Label><Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></div><div className="space-y-2"><Label>Due date</Label><Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></div></div>
      <div className="space-y-2"><Label>Estimate (minutes)</Label><Input type="number" min="0" value={estimateMinutes} onChange={(event) => setEstimateMinutes(event.target.value)} /></div>
      <OptionList title="Assignees" items={assignees.data || []} selected={assigneeIds} onToggle={(id, checked) => toggle(id, checked, setAssigneeIds)} />
      <OptionList title="Tags" items={tags.data || []} selected={tagIds} onToggle={(id, checked) => toggle(id, checked, setTagIds)} showColor />
    </div>
    <SheetFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => createTask.mutate()} disabled={!title.trim() || createTask.isPending}>{createTask.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Create task</Button></SheetFooter>
  </SheetContent></Sheet>;
}

function OptionList({ title, items, selected, onToggle, showColor = false }: { title: string; items: Option[]; selected: string[]; onToggle: (id: string, checked: boolean) => void; showColor?: boolean }) {
  return <div className="space-y-2"><Label>{title}</Label><div className="max-h-36 space-y-2 overflow-y-auto rounded-xl border p-3">{items.map((item) => <label key={item.id} className="flex cursor-pointer items-center gap-2 text-sm"><Checkbox checked={selected.includes(item.id)} onCheckedChange={(value) => onToggle(item.id, value === true)} />{showColor && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color || "#6B7280" }} />}{item.name}</label>)}{items.length === 0 && <p className="text-sm text-muted-foreground">No options available</p>}</div></div>;
}
