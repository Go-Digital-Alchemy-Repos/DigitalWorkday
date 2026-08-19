import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { queryKeys } from "@/lib/queryKeys";
import { getPreviewText, toPlainText } from "@/components/richtext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  FolderKanban,
  Search,
  AlertCircle,
  ArrowRight,
  CheckSquare,
  Plus,
} from "lucide-react";
import { useState, useMemo } from "react";

interface ProjectInfo {
  id: string;
  name: string;
  description: string | null;
  status: string;
  clientId: string;
}

interface ClientInfo {
  id: string;
  companyName: string;
  displayName: string | null;
  accessLevel: string;
  capabilities?: { manageProjects?: boolean };
}

interface DashboardData {
  clients: ClientInfo[];
  projects: ProjectInfo[];
  tasks: any[];
}

function getStatusColor(status: string) {
  switch (status) {
    case "completed":
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "in_progress":
    case "active":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    case "on_hold":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "cancelled":
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export default function ClientPortalProjects() {
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newProject, setNewProject] = useState({ name: "", description: "", clientId: "" });
  const { toast } = useToast();
  
  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: queryKeys.portal.dashboard,
  });

  const filteredProjects = useMemo(() => {
    if (!data?.projects) return [];
    if (!searchQuery.trim()) return data.projects;
    
    const query = searchQuery.toLowerCase();
    return data.projects.filter(
      (project) =>
        project.name.toLowerCase().includes(query) ||
        toPlainText(project.description).toLowerCase().includes(query)
    );
  }, [data?.projects, searchQuery]);

  const getClientName = (clientId: string) => {
    const client = data?.clients.find((c) => c.id === clientId);
    return client?.displayName || client?.companyName || "Unknown";
  };
  const adminClients = data?.clients.filter((client) => client.capabilities?.manageProjects) || [];
  const createProject = useMutation({
    mutationFn: async () => {
      const clientId = newProject.clientId || adminClients[0]?.id;
      return (await apiRequest("POST", `/api/client-portal/clients/${clientId}/projects`, { name: newProject.name, description: newProject.description || null })).json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: queryKeys.portal.dashboard }); setShowCreate(false); setNewProject({ name: "", description: "", clientId: "" }); toast({ title: "Project created" }); },
    onError: (error: Error) => toast({ title: "Unable to create project", description: error.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="p-6 overflow-y-auto h-full">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-muted-foreground">View all your projects</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Error Loading Projects
            </CardTitle>
            <CardDescription>
              There was a problem loading your projects. Please try again.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-projects-title">Projects</h1>
          <p className="text-muted-foreground">
            View and track all your projects
          </p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
        {adminClients.length > 0 && <Button onClick={() => setShowCreate(!showCreate)}><Plus className="h-4 w-4 mr-2" />New project</Button>}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-projects"
          />
        </div>
        </div>
      </div>

      {showCreate && <Card className="mb-5"><CardHeader><CardTitle className="text-base">Create project</CardTitle></CardHeader><CardContent className="grid sm:grid-cols-3 gap-3"><Input placeholder="Project name" value={newProject.name} onChange={(event) => setNewProject((draft) => ({ ...draft, name: event.target.value }))} /><Input placeholder="Description" value={newProject.description} onChange={(event) => setNewProject((draft) => ({ ...draft, description: event.target.value }))} />{adminClients.length > 1 ? <select className="h-10 rounded-md border bg-background px-3" value={newProject.clientId} onChange={(event) => setNewProject((draft) => ({ ...draft, clientId: event.target.value }))}><option value="">Select Client</option>{adminClients.map((client) => <option key={client.id} value={client.id}>{client.displayName || client.companyName}</option>)}</select> : <Button onClick={() => createProject.mutate()} disabled={!newProject.name.trim() || createProject.isPending}>Create</Button>}{adminClients.length > 1 && <Button onClick={() => createProject.mutate()} disabled={!newProject.name.trim() || !newProject.clientId || createProject.isPending}>Create</Button>}</CardContent></Card>}

      {filteredProjects.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map((project) => (
            <Link
              key={project.id}
              href={`/portal/projects/${project.id}`}
              data-testid={`project-card-${project.id}`}
            >
              <Card className="h-full hover-elevate cursor-pointer">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base line-clamp-2">
                      {project.name}
                    </CardTitle>
                    <Badge variant="outline" className={getStatusColor(project.status)}>
                      {project.status.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs">
                    {getClientName(project.clientId)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {project.description ? (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {getPreviewText(project.description)}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      No description
                    </p>
                  )}
                  <div className="flex items-center gap-1 mt-3 text-sm text-primary">
                    View Details <ArrowRight className="h-3 w-3" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <FolderKanban className="h-12 w-12 mb-4 opacity-50" />
          {searchQuery ? (
            <>
              <p className="text-lg font-medium">No projects found</p>
              <p className="text-sm">Try adjusting your search query</p>
            </>
          ) : (
            <>
              <p className="text-lg font-medium">No projects yet</p>
              <p className="text-sm">Projects will appear here when created</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
