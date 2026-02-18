import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Loader2,
  Link2,
  Unlink,
  RefreshCw,
  Play,
  Eye,
  History,
  FolderKanban,
  Users,
  Briefcase,
  ListTodo,
  Layers,
  Download,
} from "lucide-react";
import { SiAsana } from "react-icons/si";

interface AsanaImportWizardProps {
  tenantId: string;
}

type WizardStep = "connect" | "workspace" | "projects" | "options" | "validate" | "execute" | "summary" | "history";

interface AsanaWorkspace {
  gid: string;
  name: string;
}

interface AsanaProject {
  gid: string;
  name: string;
  archived?: boolean;
  team?: { gid: string; name: string } | null;
}

interface LocalWorkspace {
  id: string;
  name: string;
}

interface LocalClient {
  id: string;
  companyName: string;
}

interface ImportCounts {
  users: { create: number; update: number; skip: number; error: number };
  clients: { create: number; update: number; skip: number; error: number };
  projects: { create: number; update: number; skip: number; error: number };
  sections: { create: number; update: number; skip: number; error: number };
  tasks: { create: number; update: number; skip: number; error: number };
  subtasks: { create: number; update: number; skip: number; error: number };
}

interface ImportError {
  entityType: string;
  asanaGid: string;
  name: string;
  message: string;
}

interface ValidationResult {
  counts: ImportCounts;
  errors: ImportError[];
  autoCreatePreview: {
    clients: string[];
    users: string[];
  };
}

interface ImportRun {
  id: string;
  status: string;
  phase?: string;
  asanaWorkspaceName?: string;
  asanaProjectGids: string[];
  executionSummary?: ImportCounts;
  errorLog?: ImportError[];
  createdAt: string;
  completedAt?: string;
}

function extractErrorMessage(error: any): string {
  const raw = error?.message || error?.body || "Unknown error";
  const m = raw.match(/^\d{3}:\s*(.*)/s);
  const body = m ? m[1] : raw;
  try {
    const parsed = JSON.parse(body);
    return parsed.error || parsed.message || body;
  } catch { }
  return body.length > 300 ? body.slice(0, 300) + "..." : body;
}

function CountRow({ label, counts }: { label: string; counts: { create: number; update: number; skip: number; error: number } }) {
  const total = counts.create + counts.update + counts.skip + counts.error;
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        {counts.create > 0 && <Badge variant="default" className="text-xs">{counts.create} create</Badge>}
        {counts.update > 0 && <Badge variant="secondary" className="text-xs">{counts.update} update</Badge>}
        {counts.skip > 0 && <Badge variant="outline" className="text-xs">{counts.skip} skip</Badge>}
        {counts.error > 0 && <Badge variant="destructive" className="text-xs">{counts.error} error</Badge>}
      </div>
    </div>
  );
}

export function AsanaImportWizard({ tenantId }: AsanaImportWizardProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<WizardStep>("connect");
  const [isLoading, setIsLoading] = useState(false);

  const [pat, setPat] = useState("");
  const [connected, setConnected] = useState(false);
  const [connectedUser, setConnectedUser] = useState<{ name: string; email?: string } | null>(null);

  const [asanaWorkspaces, setAsanaWorkspaces] = useState<AsanaWorkspace[]>([]);
  const [selectedWorkspaceGid, setSelectedWorkspaceGid] = useState("");
  const [selectedWorkspaceName, setSelectedWorkspaceName] = useState("");

  const [asanaProjects, setAsanaProjects] = useState<AsanaProject[]>([]);
  const [selectedProjectGids, setSelectedProjectGids] = useState<Set<string>>(new Set());

  const [localWorkspaces, setLocalWorkspaces] = useState<LocalWorkspace[]>([]);
  const [targetWorkspaceId, setTargetWorkspaceId] = useState("");
  const [localClients, setLocalClients] = useState<LocalClient[]>([]);

  const [autoCreateClients, setAutoCreateClients] = useState(true);
  const [autoCreateProjects, setAutoCreateProjects] = useState(true);
  const [autoCreateTasks, setAutoCreateTasks] = useState(true);
  const [autoCreateUsers, setAutoCreateUsers] = useState(false);
  const [fallbackUnassigned, setFallbackUnassigned] = useState(true);
  const [clientMappingStrategy, setClientMappingStrategy] = useState<"single" | "team">("single");
  const [singleClientId, setSingleClientId] = useState("");
  const [singleClientName, setSingleClientName] = useState("");

  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

  const [runId, setRunId] = useState<string | null>(null);
  const [executionStatus, setExecutionStatus] = useState<string>("pending");
  const [executionPhase, setExecutionPhase] = useState("");
  const [executionResult, setExecutionResult] = useState<{ counts?: ImportCounts; errors?: ImportError[] } | null>(null);

  const [importHistory, setImportHistory] = useState<ImportRun[]>([]);

  useEffect(() => {
    checkConnection();
  }, [tenantId]);

  async function checkConnection() {
    try {
      const res = await fetch(`/api/v1/super/tenants/${tenantId}/asana/status`, { credentials: "include" });
      const data = await res.json();
      setConnected(data.connected);
      if (data.connected) {
        const testRes = await fetch(`/api/v1/super/tenants/${tenantId}/asana/test`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        const testData = await testRes.json();
        if (testData.ok && testData.user) {
          setConnectedUser(testData.user);
        }
      }
    } catch { }
  }

  async function handleConnect() {
    if (!pat.trim()) return;
    setIsLoading(true);
    try {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${tenantId}/asana/connect`, {
        personalAccessToken: pat.trim(),
      });
      const data = await res.json();
      setConnected(true);
      setConnectedUser(data.user);
      setPat("");
      toast({ title: "Connected to Asana", description: `Authenticated as ${data.user?.name || "user"}` });
    } catch (err: any) {
      toast({ title: "Connection failed", description: extractErrorMessage(err), variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDisconnect() {
    setIsLoading(true);
    try {
      await apiRequest("POST", `/api/v1/super/tenants/${tenantId}/asana/disconnect`);
      setConnected(false);
      setConnectedUser(null);
      toast({ title: "Disconnected from Asana" });
    } catch (err: any) {
      toast({ title: "Error", description: extractErrorMessage(err), variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  async function loadWorkspaces() {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/v1/super/tenants/${tenantId}/asana/workspaces`, { credentials: "include" });
      const data = await res.json();
      setAsanaWorkspaces(data.workspaces || []);

      const localRes = await fetch(`/api/v1/super/tenants/${tenantId}/asana/local-workspaces`, { credentials: "include" });
      const localData = await localRes.json();
      setLocalWorkspaces(localData.workspaces || []);
      if (localData.workspaces?.length > 0 && !targetWorkspaceId) {
        setTargetWorkspaceId(localData.workspaces[0].id);
      }

      const clientRes = await fetch(`/api/v1/super/tenants/${tenantId}/asana/local-clients`, { credentials: "include" });
      const clientData = await clientRes.json();
      setLocalClients(clientData.clients || []);

      setStep("workspace");
    } catch (err: any) {
      toast({ title: "Error loading workspaces", description: extractErrorMessage(err), variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  async function loadProjects() {
    if (!selectedWorkspaceGid) return;
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/v1/super/tenants/${tenantId}/asana/workspaces/${selectedWorkspaceGid}/projects`,
        { credentials: "include" }
      );
      const data = await res.json();
      setAsanaProjects(data.projects || []);
      setSelectedProjectGids(new Set());
      setStep("projects");
    } catch (err: any) {
      toast({ title: "Error loading projects", description: extractErrorMessage(err), variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleValidate() {
    setIsLoading(true);
    setValidationResult(null);
    try {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${tenantId}/asana/validate`, buildPayload());
      const data = await res.json();
      setValidationResult(data);
      setStep("validate");
    } catch (err: any) {
      toast({ title: "Validation failed", description: extractErrorMessage(err), variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleExecute() {
    setIsLoading(true);
    setExecutionStatus("running");
    setExecutionPhase("Starting...");
    setExecutionResult(null);
    try {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${tenantId}/asana/execute`, buildPayload());
      const data = await res.json();
      setRunId(data.runId);
      setStep("execute");
      pollRunStatus(data.runId);
    } catch (err: any) {
      toast({ title: "Import failed", description: extractErrorMessage(err), variant: "destructive" });
      setExecutionStatus("failed");
    } finally {
      setIsLoading(false);
    }
  }

  async function pollRunStatus(rid: string) {
    const poll = async () => {
      try {
        const res = await fetch(`/api/v1/super/tenants/${tenantId}/asana/runs/${rid}`, { credentials: "include" });
        const data = await res.json();
        setExecutionStatus(data.status);
        setExecutionPhase(data.phase || "");
        if (data.status === "completed" || data.status === "completed_with_errors" || data.status === "failed") {
          setExecutionResult({ counts: data.executionSummary, errors: data.errorLog });
          setStep("summary");
          queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", tenantId] });
          return;
        }
        setTimeout(poll, 2000);
      } catch {
        setTimeout(poll, 3000);
      }
    };
    setTimeout(poll, 2000);
  }

  async function loadHistory() {
    try {
      const res = await fetch(`/api/v1/super/tenants/${tenantId}/asana/runs`, { credentials: "include" });
      const data = await res.json();
      setImportHistory(data.runs || []);
      setStep("history");
    } catch (err: any) {
      toast({ title: "Error", description: extractErrorMessage(err), variant: "destructive" });
    }
  }

  function buildPayload() {
    return {
      asanaWorkspaceGid: selectedWorkspaceGid,
      asanaWorkspaceName: selectedWorkspaceName,
      projectGids: Array.from(selectedProjectGids),
      targetWorkspaceId,
      options: {
        autoCreateClients,
        autoCreateProjects,
        autoCreateTasks,
        autoCreateUsers,
        fallbackUnassigned,
        clientMappingStrategy,
        singleClientId: clientMappingStrategy === "single" ? singleClientId : undefined,
        singleClientName: clientMappingStrategy === "single" ? singleClientName : undefined,
      },
    };
  }

  function toggleProject(gid: string) {
    setSelectedProjectGids(prev => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid);
      else next.add(gid);
      return next;
    });
  }

  function selectAllProjects() {
    setSelectedProjectGids(new Set(asanaProjects.filter(p => !p.archived).map(p => p.gid)));
  }

  function resetWizard() {
    setStep("connect");
    setSelectedProjectGids(new Set());
    setAsanaProjects([]);
    setValidationResult(null);
    setExecutionResult(null);
    setRunId(null);
    setExecutionStatus("pending");
  }

  function downloadErrorReport(errs: ImportError[]) {
    const csv = "Entity Type,Asana GID,Name,Error Message\n" +
      errs.map(e => `"${e.entityType}","${e.asanaGid}","${e.name?.replace(/"/g, '""')}","${e.message?.replace(/"/g, '""')}"`).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "asana-import-errors.csv";
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <SiAsana className="h-4 w-4" />
          Import from Asana
        </CardTitle>
        <CardDescription>Import projects, sections, tasks, and subtasks from your Asana workspace</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {step !== "history" && (
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="ghost"
              size="sm"
              onClick={loadHistory}
              data-testid="button-asana-history"
            >
              <History className="h-4 w-4 mr-1" />
              Import History
            </Button>
          </div>
        )}

        {step === "connect" && (
          <div className="space-y-4">
            {connected ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium">Connected to Asana</span>
                  {connectedUser && (
                    <Badge variant="secondary" className="text-xs">{connectedUser.name}</Badge>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button onClick={loadWorkspaces} disabled={isLoading} data-testid="button-asana-start-import">
                    {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                    Start Import
                  </Button>
                  <Button variant="outline" onClick={handleDisconnect} disabled={isLoading} data-testid="button-asana-disconnect">
                    <Unlink className="h-4 w-4 mr-2" />
                    Disconnect
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Connect your Asana account using a Personal Access Token.
                  You can generate one from your Asana Developer Console.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="asana-pat">Personal Access Token</Label>
                  <Input
                    id="asana-pat"
                    type="password"
                    placeholder="Enter your Asana PAT..."
                    value={pat}
                    onChange={(e) => setPat(e.target.value)}
                    data-testid="input-asana-pat"
                  />
                </div>
                <Button onClick={handleConnect} disabled={isLoading || !pat.trim()} data-testid="button-asana-connect">
                  {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Link2 className="h-4 w-4 mr-2" />}
                  Connect
                </Button>
              </div>
            )}
          </div>
        )}

        {step === "workspace" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Asana Workspace</Label>
              <Select value={selectedWorkspaceGid} onValueChange={(v) => {
                setSelectedWorkspaceGid(v);
                const ws = asanaWorkspaces.find(w => w.gid === v);
                setSelectedWorkspaceName(ws?.name || "");
              }}>
                <SelectTrigger data-testid="select-asana-workspace">
                  <SelectValue placeholder="Select an Asana workspace" />
                </SelectTrigger>
                <SelectContent>
                  {asanaWorkspaces.map(w => (
                    <SelectItem key={w.gid} value={w.gid}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Target MyWorkDay Workspace</Label>
              <Select value={targetWorkspaceId} onValueChange={setTargetWorkspaceId}>
                <SelectTrigger data-testid="select-target-workspace">
                  <SelectValue placeholder="Select target workspace" />
                </SelectTrigger>
                <SelectContent>
                  {localWorkspaces.map(w => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={() => setStep("connect")} data-testid="button-asana-back-connect">
                <ArrowLeft className="h-4 w-4 mr-2" /> Back
              </Button>
              <Button onClick={loadProjects} disabled={!selectedWorkspaceGid || !targetWorkspaceId || isLoading} data-testid="button-asana-load-projects">
                {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                Load Projects
              </Button>
            </div>
          </div>
        )}

        {step === "projects" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Label>Select Asana Projects to Import ({selectedProjectGids.size} selected)</Label>
              <Button variant="ghost" size="sm" onClick={selectAllProjects} data-testid="button-asana-select-all">
                Select All
              </Button>
            </div>
            <ScrollArea className="h-60 border rounded-md p-2">
              {asanaProjects.filter(p => !p.archived).map(p => (
                <div
                  key={p.gid}
                  className="flex items-center gap-2 py-1.5 px-1 hover-elevate rounded-md cursor-pointer"
                  onClick={() => toggleProject(p.gid)}
                  data-testid={`project-row-${p.gid}`}
                >
                  <Checkbox
                    checked={selectedProjectGids.has(p.gid)}
                    onCheckedChange={() => toggleProject(p.gid)}
                    data-testid={`checkbox-project-${p.gid}`}
                  />
                  <FolderKanban className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{p.name}</span>
                  {p.team?.name && (
                    <Badge variant="outline" className="text-xs ml-auto">{p.team.name}</Badge>
                  )}
                </div>
              ))}
            </ScrollArea>

            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={() => setStep("workspace")} data-testid="button-asana-back-workspace">
                <ArrowLeft className="h-4 w-4 mr-2" /> Back
              </Button>
              <Button onClick={() => setStep("options")} disabled={selectedProjectGids.size === 0} data-testid="button-asana-to-options">
                <ArrowRight className="h-4 w-4 mr-2" /> Configure Options
              </Button>
            </div>
          </div>
        )}

        {step === "options" && (
          <div className="space-y-4">
            <div className="space-y-3">
              <Label className="text-sm font-medium">Client Mapping</Label>
              <Select value={clientMappingStrategy} onValueChange={(v) => setClientMappingStrategy(v as "single" | "team")}>
                <SelectTrigger data-testid="select-client-mapping">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single client for all imported projects</SelectItem>
                  <SelectItem value="team">Map Asana team name to client</SelectItem>
                </SelectContent>
              </Select>

              {clientMappingStrategy === "single" && (
                <div className="space-y-2 pl-2">
                  <Select value={singleClientId} onValueChange={(v) => {
                    setSingleClientId(v);
                    const cl = localClients.find(c => c.id === v);
                    setSingleClientName(cl?.companyName || "");
                  }}>
                    <SelectTrigger data-testid="select-single-client">
                      <SelectValue placeholder="Select existing client (or leave empty to create new)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No client (unlinked projects)</SelectItem>
                      {localClients.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {singleClientId === "__none__" && (
                    <Input
                      placeholder="New client name (if auto-create enabled)"
                      value={singleClientName}
                      onChange={(e) => setSingleClientName(e.target.value)}
                      data-testid="input-new-client-name"
                    />
                  )}
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-3">
              <Label className="text-sm font-medium">Auto-Create Options</Label>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="auto-clients" className="text-sm text-muted-foreground">Auto-create missing Clients</Label>
                  <Switch id="auto-clients" checked={autoCreateClients} onCheckedChange={setAutoCreateClients} data-testid="switch-auto-clients" />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="auto-projects" className="text-sm text-muted-foreground">Auto-create missing Projects</Label>
                  <Switch id="auto-projects" checked={autoCreateProjects} onCheckedChange={setAutoCreateProjects} data-testid="switch-auto-projects" />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="auto-tasks" className="text-sm text-muted-foreground">Auto-create missing Tasks/Subtasks</Label>
                  <Switch id="auto-tasks" checked={autoCreateTasks} onCheckedChange={setAutoCreateTasks} data-testid="switch-auto-tasks" />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="auto-users" className="text-sm text-muted-foreground">Auto-create missing Users (Employees)</Label>
                  <Switch id="auto-users" checked={autoCreateUsers} onCheckedChange={setAutoCreateUsers} data-testid="switch-auto-users" />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="fallback-unassigned" className="text-sm text-muted-foreground">Map unknown users to Unassigned</Label>
                  <Switch id="fallback-unassigned" checked={fallbackUnassigned} onCheckedChange={setFallbackUnassigned} data-testid="switch-fallback-unassigned" />
                </div>
              </div>
            </div>

            <Separator />

            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Duplicate prevention is always enabled (idempotent imports)</span>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={() => setStep("projects")} data-testid="button-asana-back-projects">
                <ArrowLeft className="h-4 w-4 mr-2" /> Back
              </Button>
              <Button onClick={handleValidate} disabled={isLoading} data-testid="button-asana-validate">
                {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />}
                Validate (Dry Run)
              </Button>
            </div>
          </div>
        )}

        {step === "validate" && validationResult && (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Validation Summary (Dry Run)</Label>
              <p className="text-xs text-muted-foreground">Nothing has been written yet. Review the plan below before running.</p>
            </div>

            <div className="space-y-1 border rounded-md p-3">
              <CountRow label="Users" counts={validationResult.counts.users} />
              <CountRow label="Clients" counts={validationResult.counts.clients} />
              <CountRow label="Projects" counts={validationResult.counts.projects} />
              <CountRow label="Sections" counts={validationResult.counts.sections} />
              <CountRow label="Tasks" counts={validationResult.counts.tasks} />
              <CountRow label="Subtasks" counts={validationResult.counts.subtasks} />
            </div>

            {validationResult.autoCreatePreview.clients.length > 0 && (
              <div className="border rounded-md p-3 space-y-1">
                <Label className="text-xs font-medium">Will Auto-Create Clients:</Label>
                <div className="flex gap-1 flex-wrap">
                  {validationResult.autoCreatePreview.clients.map(c => (
                    <Badge key={c} variant="outline" className="text-xs">{c}</Badge>
                  ))}
                </div>
              </div>
            )}

            {validationResult.autoCreatePreview.users.length > 0 && (
              <div className="border rounded-md p-3 space-y-1">
                <Label className="text-xs font-medium">Will Auto-Create Users:</Label>
                <div className="flex gap-1 flex-wrap">
                  {validationResult.autoCreatePreview.users.map(u => (
                    <Badge key={u} variant="outline" className="text-xs">{u}</Badge>
                  ))}
                </div>
              </div>
            )}

            {validationResult.errors.length > 0 && (
              <div className="border border-destructive/30 rounded-md p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <Label className="text-xs font-medium text-destructive">{validationResult.errors.length} Validation Errors</Label>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => downloadErrorReport(validationResult.errors)} data-testid="button-download-validation-errors">
                    <Download className="h-3 w-3 mr-1" /> Download
                  </Button>
                </div>
                <ScrollArea className="h-32">
                  {validationResult.errors.slice(0, 20).map((e, i) => (
                    <p key={i} className="text-xs text-muted-foreground py-0.5">
                      [{e.entityType}] {e.name}: {e.message}
                    </p>
                  ))}
                  {validationResult.errors.length > 20 && (
                    <p className="text-xs text-muted-foreground italic">...and {validationResult.errors.length - 20} more</p>
                  )}
                </ScrollArea>
              </div>
            )}

            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={() => setStep("options")} data-testid="button-asana-back-options">
                <ArrowLeft className="h-4 w-4 mr-2" /> Back
              </Button>
              <Button onClick={handleExecute} disabled={isLoading} data-testid="button-asana-execute">
                {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                Run Import
              </Button>
            </div>
          </div>
        )}

        {step === "execute" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm font-medium">Import in progress...</span>
            </div>
            <p className="text-sm text-muted-foreground">{executionPhase}</p>
            <Progress value={undefined} className="h-2" />
            <p className="text-xs text-muted-foreground">
              Do not close this page. The import is running in the background.
            </p>
          </div>
        )}

        {step === "summary" && executionResult && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              {executionStatus === "completed" ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : executionStatus === "completed_with_errors" ? (
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
              ) : (
                <XCircle className="h-5 w-5 text-destructive" />
              )}
              <span className="text-sm font-medium">
                {executionStatus === "completed" ? "Import Completed Successfully" :
                  executionStatus === "completed_with_errors" ? "Import Completed with Errors" :
                    "Import Failed"}
              </span>
            </div>

            {executionResult.counts && (
              <div className="space-y-1 border rounded-md p-3">
                <CountRow label="Users" counts={executionResult.counts.users} />
                <CountRow label="Clients" counts={executionResult.counts.clients} />
                <CountRow label="Projects" counts={executionResult.counts.projects} />
                <CountRow label="Sections" counts={executionResult.counts.sections} />
                <CountRow label="Tasks" counts={executionResult.counts.tasks} />
                <CountRow label="Subtasks" counts={executionResult.counts.subtasks} />
              </div>
            )}

            {executionResult.errors && executionResult.errors.length > 0 && (
              <div className="border border-destructive/30 rounded-md p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <Label className="text-xs font-medium text-destructive">{executionResult.errors.length} Errors</Label>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => downloadErrorReport(executionResult.errors!)} data-testid="button-download-exec-errors">
                    <Download className="h-3 w-3 mr-1" /> Download
                  </Button>
                </div>
                <ScrollArea className="h-32">
                  {executionResult.errors.slice(0, 20).map((e, i) => (
                    <p key={i} className="text-xs text-muted-foreground py-0.5">
                      [{e.entityType}] {e.name}: {e.message}
                    </p>
                  ))}
                </ScrollArea>
              </div>
            )}

            <div className="flex gap-2 flex-wrap">
              <Button onClick={resetWizard} data-testid="button-asana-new-import">
                <RefreshCw className="h-4 w-4 mr-2" /> New Import
              </Button>
              <Button variant="outline" onClick={loadHistory} data-testid="button-asana-view-history">
                <History className="h-4 w-4 mr-2" /> View History
              </Button>
            </div>
          </div>
        )}

        {step === "history" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Label className="text-sm font-medium">Import History</Label>
              <Button variant="outline" size="sm" onClick={resetWizard} data-testid="button-asana-back-from-history">
                <ArrowLeft className="h-4 w-4 mr-2" /> Back
              </Button>
            </div>

            {importHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No import history yet.</p>
            ) : (
              <ScrollArea className="h-64">
                <div className="space-y-2">
                  {importHistory.map(run => (
                    <div key={run.id} className="border rounded-md p-3 space-y-1">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">
                          {new Date(run.createdAt).toLocaleString()}
                        </span>
                        <Badge
                          variant={run.status === "completed" ? "default" : run.status === "completed_with_errors" ? "secondary" : run.status === "running" ? "outline" : "destructive"}
                          className="text-xs"
                        >
                          {run.status}
                        </Badge>
                      </div>
                      <p className="text-sm">
                        {run.asanaWorkspaceName || "Workspace"} — {run.asanaProjectGids?.length || 0} project(s)
                      </p>
                      {run.executionSummary && (
                        <div className="text-xs text-muted-foreground">
                          {Object.entries(run.executionSummary as ImportCounts)
                            .filter(([, v]) => (v as any).create + (v as any).update > 0)
                            .map(([k, v]) => `${k}: ${(v as any).create} created, ${(v as any).update} updated`)
                            .join(" | ")}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
