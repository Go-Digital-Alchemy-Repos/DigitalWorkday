import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { Activity, AlertCircle, AlertTriangle, Calendar as CalendarIcon, ChevronRight, LayoutGrid, List, MoreHorizontal, Plus, Settings, Users } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { RichTextRenderer } from "@/components/richtext";
import { SectionColumn } from "@/features/tasks/section-column";
import { ListSectionDroppable } from "@/features/tasks/list-section-droppable";
import { TaskCard } from "@/features/tasks/task-card";
import { ProjectCalendar } from "@/features/projects/project-calendar";
import { PortalTaskCreateDrawer } from "@/features/client-portal/portal-task-create-drawer";
import { PortalTaskDrawer } from "@/features/client-portal/portal-task-drawer";
import type { SectionWithTasks, Tag, TaskWithRelations } from "@shared/schema";

type ViewType = "board" | "list" | "calendar";
type ProjectData = {
  id: string; name: string; description: string | null; status: string; color?: string | null; clientId: string; clientName: string | null;
  tasks: TaskWithRelations[]; sections: SectionWithTasks[]; taskCount: number; completedCount: number;
  capabilities: { manageProjects?: boolean; manageTasks?: boolean };
};
const isDone = (status?: string | null) => status === "done" || status === "completed";

export default function ClientPortalProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [view, setView] = useState<ViewType>("board");
  const [localSections, setLocalSections] = useState<SectionWithTasks[] | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(() => new URLSearchParams(window.location.search).get("task"));
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [defaultSectionId, setDefaultSectionId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor));

  const projectQuery = useQuery<ProjectData>({ queryKey: queryKeys.portal.projectDetail(id), enabled: !!id });
  const project = projectQuery.data;
  useEffect(() => setLocalSections(null), [project]);
  const sections = localSections || project?.sections || [];
  const tasks = useMemo(() => sections.flatMap((section) => section.tasks || []), [sections]);
  const activeTask = tasks.find((task) => task.id === activeTaskId);
  const canManageProject = !!project?.capabilities?.manageProjects;
  const readOnly = project?.status === "archived" || project?.status === "completed";

  const refreshProject = useCallback(() => {
    setLocalSections(null);
    queryClient.invalidateQueries({ queryKey: queryKeys.portal.projectDetail(id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.portal.dashboard });
    queryClient.invalidateQueries({ queryKey: queryKeys.portal.tasks });
  }, [id]);

  const updateTask = useMutation({ mutationFn: async ({ taskId, body }: { taskId: string; body: Record<string, unknown> }) => (await apiRequest("PATCH", `/api/client-portal/clients/${project!.clientId}/tasks/${taskId}`, body)).json(), onSuccess: refreshProject, onError: (error: Error) => toast({ title: "Unable to update task", description: error.message, variant: "destructive" }) });
  const moveTask = useMutation({ mutationFn: async ({ taskId, sectionId, targetIndex }: { taskId: string; sectionId: string | null; targetIndex: number }) => (await apiRequest("PATCH", `/api/client-portal/clients/${project!.clientId}/tasks/${taskId}/move`, { sectionId, targetIndex })).json(), onSuccess: refreshProject, onError: () => { refreshProject(); toast({ title: "Unable to move task", variant: "destructive" }); } });
  const updateProject = useMutation({ mutationFn: async (body: Record<string, unknown>) => (await apiRequest("PATCH", `/api/client-portal/clients/${project!.clientId}/projects/${id}`, body)).json(), onSuccess: refreshProject, onError: (error: Error) => toast({ title: "Unable to update project", description: error.message, variant: "destructive" }) });
  const createSection = useMutation({ mutationFn: async (name: string) => (await apiRequest("POST", `/api/client-portal/clients/${project!.clientId}/projects/${id}/sections`, { name })).json(), onSuccess: refreshProject });
  const updateSection = useMutation({ mutationFn: async ({ sectionId, name }: { sectionId: string; name: string }) => (await apiRequest("PATCH", `/api/client-portal/clients/${project!.clientId}/projects/${id}/sections/${sectionId}`, { name })).json(), onSuccess: refreshProject });
  const archiveSection = useMutation({ mutationFn: async (sectionId: string) => (await apiRequest("POST", `/api/client-portal/clients/${project!.clientId}/projects/${id}/sections/${sectionId}/archive`)).json(), onSuccess: refreshProject });

  const openTask = (task: TaskWithRelations) => { setSelectedTaskId(task.id); const url = new URL(window.location.href); url.searchParams.set("task", task.id); window.history.replaceState({}, "", `${url.pathname}${url.search}`); };
  const closeTask = () => { setSelectedTaskId(null); const url = new URL(window.location.href); url.searchParams.delete("task"); window.history.replaceState({}, "", `${url.pathname}${url.search}`); };
  const openCreateTask = (sectionId?: string | null) => { setDefaultSectionId(sectionId === "unsectioned" ? null : sectionId || null); setCreateTaskOpen(true); };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTaskId(null);
    if (!event.over) return;
    const activeData = event.active.data.current as { type?: string; task?: TaskWithRelations } | undefined;
    const overData = event.over.data.current as { type?: string; task?: TaskWithRelations; section?: SectionWithTasks } | undefined;
    if (activeData?.type !== "task" || !activeData.task) return;
    const active = activeData.task;
    const targetKey = overData?.type === "section" ? String(event.over.id) : overData?.task?.sectionId || "unsectioned";
    const target = sections.find((section) => section.id === targetKey);
    const source = sections.find((section) => section.id === (active.sectionId || "unsectioned"));
    if (!target || !source) return;
    const sourceIndex = (source.tasks || []).findIndex((task) => task.id === active.id);
    const targetIndex = overData?.type === "task" ? Math.max(0, (target.tasks || []).findIndex((task) => task.id === event.over!.id)) : (target.tasks || []).length;
    if (source.id === target.id) {
      if (sourceIndex === targetIndex) return;
      setLocalSections(sections.map((section) => section.id === source.id ? { ...section, tasks: arrayMove(section.tasks || [], sourceIndex, targetIndex) } : section));
    } else {
      const moving = { ...active, sectionId: target.id === "unsectioned" ? null : target.id };
      setLocalSections(sections.map((section) => {
        if (section.id === source.id) return { ...section, tasks: (section.tasks || []).filter((task) => task.id !== active.id) };
        if (section.id === target.id) { const next = [...(section.tasks || [])]; next.splice(targetIndex, 0, moving); return { ...section, tasks: next }; }
        return section;
      }));
    }
    moveTask.mutate({ taskId: active.id, sectionId: target.id === "unsectioned" ? null : target.id, targetIndex });
  };

  if (projectQuery.isLoading) return <div className="space-y-5 p-6"><Skeleton className="h-28 w-full rounded-2xl" /><Skeleton className="h-20 w-full rounded-2xl" /><Skeleton className="h-[480px] w-full rounded-2xl" /></div>;
  if (!project) return <div className="flex h-full items-center justify-center p-6"><div className="rounded-2xl border p-8 text-center"><AlertCircle className="mx-auto mb-3 h-8 w-8 text-destructive" /><h1 className="font-semibold">Project unavailable</h1><Button variant="outline" asChild className="mt-4"><Link href="/portal/projects">Back to projects</Link></Button></div></div>;

  const total = tasks.length;
  const completed = tasks.filter((task) => isDone(task.status)).length;
  const progress = total ? Math.round(completed / total * 100) : 0;
  const openCount = total - completed;
  const overdue = tasks.filter((task) => !isDone(task.status) && task.dueDate && new Date(task.dueDate) < new Date()).length;
  const contributorIds = new Set(tasks.flatMap((task) => (task.assignees || []).map((item) => item.user?.id).filter(Boolean)));
  const allTags = [...tasks.flatMap((task) => task.tags || []).reduce((tagMap, item) => {
    if (item.tag?.id) tagMap.set(item.tag.id, item.tag);
    return tagMap;
  }, new Map<string, Tag>()).values()];

  return <div className="flex h-full min-w-0 flex-col overflow-hidden bg-background">
    <div className="shrink-0 border-b bg-background">
      <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground sm:px-5 lg:px-8"><Link href="/portal/projects" className="hover:text-foreground">Projects</Link><ChevronRight className="h-4 w-4" /><span>{project.clientName || "Client"}</span><ChevronRight className="h-4 w-4" /><span className="text-foreground">{project.name}</span></div>
      <div className="px-4 pb-4 sm:px-5 lg:px-8"><div className="flex items-start justify-between gap-4 rounded-2xl border border-border/70 bg-card/85 px-4 py-4 shadow-[var(--shadow-soft)] md:px-5"><div className="flex min-w-0 items-center gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-base font-semibold text-white" style={{ backgroundColor: project.color || "#3B82F6" }}>{project.name.charAt(0).toUpperCase()}</div><div className="min-w-0"><h1 className="truncate text-xl font-semibold tracking-tight md:text-[1.7rem]">{project.name}</h1>{project.description && <RichTextRenderer value={project.description} className="mt-1 hidden max-h-12 overflow-hidden text-sm text-muted-foreground md:block [&>*]:m-0" />}</div></div><div className="flex items-center gap-2"><Badge variant="outline" className="hidden rounded-full px-3 py-1 lg:flex">{readOnly ? "Read-only" : "Active workspace"}</Badge>{canManageProject && <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="rounded-xl"><Settings className="mr-2 h-4 w-4" />Manage</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => { const name = window.prompt("Project name", project.name); if (name?.trim()) updateProject.mutate({ name: name.trim() }); }}>Rename project</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onClick={() => updateProject.mutate({ status: "active" })}>Mark active</DropdownMenuItem><DropdownMenuItem onClick={() => updateProject.mutate({ status: "on_hold" })}>Put on hold</DropdownMenuItem><DropdownMenuItem onClick={() => updateProject.mutate({ status: "completed" })}>Complete project</DropdownMenuItem><DropdownMenuItem onClick={() => updateProject.mutate({ status: "archived" })}>Archive project</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}</div></div></div>
      <div className="grid grid-cols-2 border-y md:grid-cols-4"><Metric icon={<Activity className="h-5 w-5" />} label="Progress" value={`${progress}%`} /><Metric icon={<List className="h-5 w-5" />} label="Open tasks" value={String(openCount)} /><Metric icon={<AlertTriangle className="h-5 w-5" />} label="Overdue" value={String(overdue)} /><Metric icon={<Users className="h-5 w-5" />} label="Contributors" value={String(contributorIds.size)} /></div>
      <div className="px-4 py-4 sm:px-5 lg:px-8"><div className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/90 px-3 py-3 shadow-[var(--shadow-soft)]"><Tabs value={view} onValueChange={(value) => setView(value as ViewType)}><TabsList className="h-10 rounded-2xl border bg-muted/60 p-1"><TabsTrigger value="board" className="gap-1.5"><LayoutGrid className="h-4 w-4" /><span className="hidden sm:inline">Board</span></TabsTrigger><TabsTrigger value="list" className="gap-1.5"><List className="h-4 w-4" /><span className="hidden sm:inline">List</span></TabsTrigger><TabsTrigger value="calendar" className="gap-1.5"><CalendarIcon className="h-4 w-4" /><span className="hidden sm:inline">Calendar</span></TabsTrigger></TabsList></Tabs><div className="flex items-center gap-2">{canManageProject && !readOnly && <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => { const name = window.prompt("Section name"); if (name?.trim()) createSection.mutate(name.trim()); }} title="Add section"><MoreHorizontal className="h-4 w-4" /></Button>}<Button className="rounded-xl" onClick={() => openCreateTask()} disabled={readOnly}><Plus className="mr-2 h-4 w-4" />Add Task</Button></div></div></div>
    </div>
    <div className="min-h-0 flex-1 overflow-hidden">
      {view === "board" && <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={(event: DragStartEvent) => setActiveTaskId(String(event.active.id))} onDragEnd={handleDragEnd}><div className="flex h-full gap-4 overflow-x-auto px-4 py-5 sm:px-5 lg:px-8">{sections.map((section) => <SectionColumn key={section.id} section={section} portalMode onAddTask={readOnly ? undefined : () => openCreateTask(section.id)} onTaskSelect={openTask} onTaskStatusChange={readOnly ? undefined : (taskId, checked) => updateTask.mutate({ taskId, body: { status: checked ? "completed" : "todo" } })} onEditSection={canManageProject && section.id !== "unsectioned" ? (sectionId, name) => updateSection.mutate({ sectionId, name }) : undefined} onArchiveSection={canManageProject && section.id !== "unsectioned" ? (sectionId) => archiveSection.mutate(sectionId) : undefined} />)}{canManageProject && !readOnly && <div className="min-w-[280px]"><Button variant="outline" className="h-14 w-full rounded-2xl border-dashed" onClick={() => { const name = window.prompt("Section name"); if (name?.trim()) createSection.mutate(name.trim()); }}><Plus className="mr-2 h-4 w-4" />Add Section</Button></div>}</div><DragOverlay>{activeTask && <TaskCard task={activeTask} view="board" isDragging portalMode />}</DragOverlay></DndContext>}
      {view === "list" && <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={(event: DragStartEvent) => setActiveTaskId(String(event.active.id))} onDragEnd={handleDragEnd}><div className="h-full overflow-y-auto px-4 py-5 sm:px-5 lg:px-8">{sections.map((section) => <ListSectionDroppable key={section.id} section={section} portalMode onAddTask={readOnly ? undefined : () => openCreateTask(section.id)} onTaskSelect={openTask} onTaskStatusChange={readOnly ? undefined : (taskId, checked) => updateTask.mutate({ taskId, body: { status: checked ? "completed" : "todo" } })} />)}</div></DndContext>}
      {view === "calendar" && <ProjectCalendar projectId={id} sections={sections} portalMode tasksOverride={tasks} tagsOverride={allTags} onTaskSelect={openTask} onDateClick={readOnly ? undefined : () => openCreateTask()} onTaskDateChange={readOnly ? undefined : async (taskId, dueDate) => { await updateTask.mutateAsync({ taskId, body: { dueDate } }); }} />}
    </div>
    <PortalTaskCreateDrawer open={createTaskOpen} onOpenChange={setCreateTaskOpen} clientId={project.clientId} projectId={id} sections={sections} defaultSectionId={defaultSectionId} onCreated={refreshProject} />
    <PortalTaskDrawer taskId={selectedTaskId} open={!!selectedTaskId} onOpenChange={(drawerOpen) => { if (!drawerOpen) closeTask(); }} onUpdated={refreshProject} />
  </div>;
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="flex items-center gap-3 border-r px-5 py-4 last:border-r-0"><span className="text-muted-foreground">{icon}</span><div><div className="text-sm text-muted-foreground">{label}</div><div className="text-xl font-semibold">{value}</div></div></div>;
}
