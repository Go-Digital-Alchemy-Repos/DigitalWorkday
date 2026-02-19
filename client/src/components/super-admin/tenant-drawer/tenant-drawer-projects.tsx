import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Plus,
  Loader2,
  Search,
  Trash2,
  FileText,
  Upload,
  X,
} from "lucide-react";
import { CsvImportPanel } from "@/components/common/csv-import-panel";
import type { TenantWithDetails, TenantProject, TenantClient } from "./types";

interface TenantDrawerProjectsProps {
  activeTenant: TenantWithDetails;
  open: boolean;
}

export function TenantDrawerProjects({ activeTenant, open }: TenantDrawerProjectsProps) {
  const { toast } = useToast();
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectClientId, setNewProjectClientId] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [selectedProjectForTasks, setSelectedProjectForTasks] = useState<TenantProject | null>(null);
  const [showTaskImportPanel, setShowTaskImportPanel] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState("");

  const { data: allClientsResponse } = useQuery<{ clients: TenantClient[] }>({
    queryKey: ["/api/v1/super/tenants", activeTenant.id, "clients-all"],
    queryFn: () => fetch(`/api/v1/super/tenants/${activeTenant.id}/clients?limit=500`, { credentials: "include" }).then(r => r.json()),
    enabled: !!activeTenant.id && open,
  });

  const { data: projectsResponse, isLoading: projectsLoading } = useQuery<{ projects: TenantProject[]; total: number }>({
    queryKey: ["/api/v1/super/tenants", activeTenant.id, "projects", projectSearch],
    queryFn: () => fetch(`/api/v1/super/tenants/${activeTenant.id}/projects?search=${encodeURIComponent(projectSearch)}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!activeTenant.id && open,
  });

  const createProjectMutation = useMutation({
    mutationFn: async ({ name, clientId }: { name: string; clientId?: string }) => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${activeTenant.id}/projects`, { name, clientId: clientId || undefined });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant.id, "projects", projectSearch] });
      setNewProjectName("");
      setNewProjectClientId("");
      setShowCreateProject(false);
      toast({ title: "Project created" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create project", description: error.message, variant: "destructive" });
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/v1/super/tenants/${activeTenant.id}/projects/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant.id, "projects", projectSearch] });
      toast({ title: "Project deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete project", description: error.message, variant: "destructive" });
    },
  });

  const bulkProjectsImportMutation = useMutation({
    mutationFn: async (data: { projects: any[]; options: Record<string, any> }) => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${activeTenant.id}/projects/bulk-import`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant.id, "projects", projectSearch] });
    },
    onError: (error: any) => {
      toast({ title: "Bulk import failed", description: error.message, variant: "destructive" });
    },
  });

  const applyTaskTemplateMutation = useMutation({
    mutationFn: async ({ projectId, templateKey }: { projectId: string; templateKey: string }) => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${activeTenant.id}/projects/${projectId}/apply-template`, { templateKey });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant.id, "projects", projectSearch] });
      toast({ title: "Template applied", description: `Created ${data.created?.sections || 0} sections and ${data.created?.tasks || 0} tasks` });
      setSelectedProjectForTasks(null);
      setSelectedTemplate("");
    },
    onError: (error: any) => {
      toast({ title: "Failed to apply template", description: error.message, variant: "destructive" });
    },
  });

  const bulkTasksImportMutation = useMutation({
    mutationFn: async (data: { projectId: string; rows: any[]; options: Record<string, any> }) => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${activeTenant.id}/projects/${data.projectId}/tasks/bulk-import`, { rows: data.rows, options: data.options });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant.id, "projects", projectSearch] });
    },
    onError: (error: any) => {
      toast({ title: "Task import failed", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6 mt-6">
      {showCreateProject && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Create Project</CardTitle>
                <CardDescription>Add a new project for this tenant</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowCreateProject(false)} data-testid="button-close-create-project">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="new-project-name">Project Name</Label>
                <Input id="new-project-name" value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} placeholder="Project name" data-testid="input-new-project-name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-project-client">Client (Optional)</Label>
                <Select value={newProjectClientId} onValueChange={setNewProjectClientId}>
                  <SelectTrigger data-testid="select-project-client"><SelectValue placeholder="Select a client" /></SelectTrigger>
                  <SelectContent>
                    {allClientsResponse?.clients?.map((client) => (
                      <SelectItem key={client.id} value={client.id}>{client.companyName}</SelectItem>
                    ))}
                    {(!allClientsResponse?.clients || allClientsResponse.clients.length === 0) && (
                      <SelectItem value="_no_clients" disabled>No clients available - create a client first</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() => createProjectMutation.mutate({ name: newProjectName, clientId: newProjectClientId || undefined })}
                disabled={!newProjectName.trim() || !newProjectClientId || createProjectMutation.isPending}
                data-testid="button-create-project"
              >
                {createProjectMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Project
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Projects</CardTitle>
              <CardDescription>Manage projects for this tenant</CardDescription>
            </div>
            {!showCreateProject && (
              <Button size="sm" onClick={() => setShowCreateProject(true)} data-testid="button-show-create-project">
                <Plus className="h-4 w-4 mr-2" />
                Add Project
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search projects..." value={projectSearch} onChange={(e) => setProjectSearch(e.target.value)} className="pl-9" data-testid="input-project-search" />
            </div>
          </div>

          {projectsLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : projectsResponse?.projects && projectsResponse.projects.length > 0 ? (
            <div className="border rounded-md max-h-64 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background border-b">
                  <tr>
                    <th className="text-left p-2">Project Name</th>
                    <th className="text-left p-2">Client</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Created</th>
                    <th className="text-left p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {projectsResponse.projects.map((project) => (
                    <tr key={project.id} className="border-b last:border-0 hover:bg-muted/50" data-testid={`project-row-${project.id}`}>
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: project.color || "#3B82F6" }} />
                          <span className="font-medium">{project.name}</span>
                        </div>
                      </td>
                      <td className="p-2 text-muted-foreground">{project.clientName || "-"}</td>
                      <td className="p-2"><Badge variant={project.status === "active" ? "default" : "secondary"}>{project.status}</Badge></td>
                      <td className="p-2 text-muted-foreground text-xs">{new Date(project.createdAt).toLocaleDateString()}</td>
                      <td className="p-2">
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => { setSelectedProjectForTasks(project); setShowTaskImportPanel(false); }} data-testid={`button-template-${project.id}`}>
                            <FileText className="h-3 w-3 mr-1" />Template
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setSelectedProjectForTasks(project); setShowTaskImportPanel(true); }} data-testid={`button-import-tasks-${project.id}`}>
                            <Upload className="h-3 w-3 mr-1" />Import
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => deleteProjectMutation.mutate(project.id)} disabled={deleteProjectMutation.isPending} data-testid={`button-delete-project-${project.id}`}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">No projects found. Create one above or import projects below.</div>
          )}
        </CardContent>
      </Card>

      <CsvImportPanel
        title="Bulk Import Projects"
        description="Import multiple projects from a CSV file"
        columns={[
          { key: "projectName", label: "Project Name", required: true },
          { key: "clientCompanyName", label: "Client Company Name" },
          { key: "description", label: "Description" },
          { key: "status", label: "Status" },
          { key: "color", label: "Color" },
          { key: "startDate", label: "Start Date" },
          { key: "dueDate", label: "Due Date" },
        ]}
        templateFilename="projects_template.csv"
        onImport={async (rows, options) => {
          const result = await bulkProjectsImportMutation.mutateAsync({
            projects: rows,
            options: { autoCreateMissingClients: options.autoCreateMissingClients || false },
          });
          return {
            created: result.created,
            skipped: result.skipped,
            errors: result.errors,
            results: result.results.map((r: any) => ({
              name: r.projectName,
              status: r.status,
              reason: r.reason,
              id: r.projectId,
            })),
          };
        }}
        isImporting={bulkProjectsImportMutation.isPending}
        options={[{ key: "autoCreateMissingClients", label: "Auto-create missing clients", defaultValue: false }]}
        nameField="projectName"
      />

      {selectedProjectForTasks && !showTaskImportPanel && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Apply Task Template</CardTitle>
                <CardDescription>Apply a template to "{selectedProjectForTasks.name}" to create sections and tasks</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedProjectForTasks(null)} data-testid="button-close-template-panel">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { key: "client_onboarding", name: "Client Onboarding", description: "Kickoff, Discovery, and Delivery phases" },
                { key: "website_build", name: "Website Build", description: "Planning, Design, Development, and Launch" },
                { key: "general_setup", name: "General Setup", description: "Basic To Do, In Progress, Review, Done workflow" },
              ].map((template) => (
                <div
                  key={template.key}
                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${selectedTemplate === template.key ? "border-primary bg-primary/5" : "hover:border-muted-foreground/50"}`}
                  onClick={() => setSelectedTemplate(template.key)}
                  data-testid={`template-option-${template.key}`}
                >
                  <div className="font-medium text-sm">{template.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">{template.description}</div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setSelectedProjectForTasks(null); setSelectedTemplate(""); }} data-testid="button-cancel-template">Cancel</Button>
              <Button
                onClick={() => { if (selectedTemplate && selectedProjectForTasks) { applyTaskTemplateMutation.mutate({ projectId: selectedProjectForTasks.id, templateKey: selectedTemplate }); } }}
                disabled={!selectedTemplate || applyTaskTemplateMutation.isPending}
                data-testid="button-apply-template"
              >
                {applyTaskTemplateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Apply Template
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {selectedProjectForTasks && showTaskImportPanel && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Bulk Import Tasks</CardTitle>
                <CardDescription>Import tasks from CSV into "{selectedProjectForTasks.name}"</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setSelectedProjectForTasks(null); setShowTaskImportPanel(false); }} data-testid="button-close-task-import-panel">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <CsvImportPanel
              title=""
              description=""
              columns={[
                { key: "sectionName", label: "Section Name", required: true },
                { key: "taskTitle", label: "Task Title", required: true },
                { key: "description", label: "Description" },
                { key: "status", label: "Status" },
                { key: "priority", label: "Priority" },
                { key: "dueDate", label: "Due Date (YYYY-MM-DD)" },
                { key: "assigneeEmails", label: "Assignee Emails (comma-separated)" },
                { key: "parentTaskTitle", label: "Parent Task Title (for subtasks)" },
              ]}
              templateFilename="tasks_template.csv"
              onImport={async (rows, options) => {
                const result = await bulkTasksImportMutation.mutateAsync({
                  projectId: selectedProjectForTasks.id,
                  rows,
                  options: {
                    createMissingSections: options.createMissingSections !== false,
                    allowUnknownAssignees: options.allowUnknownAssignees || false,
                  },
                });
                return {
                  created: result.createdTasks + result.createdSubtasks,
                  skipped: result.skipped,
                  errors: result.errors,
                  results: result.results.map((r: any) => ({
                    name: rows[r.rowIndex]?.taskTitle || `Row ${r.rowIndex}`,
                    status: r.status,
                    reason: r.reason,
                    id: r.taskId || r.parentTaskId,
                  })),
                };
              }}
              isImporting={bulkTasksImportMutation.isPending}
              options={[
                { key: "createMissingSections", label: "Create missing sections", defaultValue: true },
                { key: "allowUnknownAssignees", label: "Allow unknown assignees", defaultValue: false },
              ]}
              nameField="taskTitle"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
