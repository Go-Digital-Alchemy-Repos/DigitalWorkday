import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ApiError } from "@/lib/queryClient";
import { FullScreenDrawer } from "@/components/ui/full-screen-drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Building2, 
  Users, 
  Palette, 
  HardDrive, 
  FileText, 
  Settings, 
  Save, 
  Loader2, 
  Check, 
  X, 
  Mail,
  Clock,
  CheckCircle,
  AlertTriangle,
  PlayCircle,
  PauseCircle,
  Power,
  Copy,
  UserPlus,
  Briefcase,
  MessageSquare,
  FileSpreadsheet,
  Heart,
  FolderKanban,
} from "lucide-react";
import { DataImportWizard as DataImportWizardComponent } from "@/components/super-admin/data-import-wizard";
import { AsanaImportWizard } from "@/components/super-admin/asana-import-wizard";
import { ColorPicker } from "@/components/ui/color-picker";
import { Download } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import type { Tenant } from "@shared/schema";

import {
  TenantDrawerOverview,
  TenantDrawerOnboarding,
  TenantDrawerWorkspaces,
  TenantDrawerUsers,
  TenantDrawerClients,
  TenantDrawerProjects,
  TenantDrawerBranding,
  TenantDrawerIntegrations,
  TenantDrawerNotes,
  IntegrationStatusBadge,
  getStatusBadge,
} from "./tenant-drawer/index";
import type { TenantWithDetails, TenantSettings, OnboardingProgress, IntegrationStatus } from "./tenant-drawer/types";

interface TenantDrawerProps {
  tenant: TenantWithDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTenantUpdated?: () => void;
  mode?: "create" | "edit";
  onTenantCreated?: (tenant: TenantWithDetails) => void;
}

type WizardStep = "basics" | "workspace" | "branding" | "integrations" | "invite" | "review";

const WIZARD_STEPS: { id: WizardStep; title: string; description: string }[] = [
  { id: "basics", title: "Tenant Basics", description: "Organization name and URL" },
  { id: "workspace", title: "Primary Workspace", description: "Auto-created workspace" },
  { id: "branding", title: "Branding", description: "Logo and colors (optional)" },
  { id: "integrations", title: "Integrations", description: "Email and storage (optional)" },
  { id: "invite", title: "Invite Admin", description: "Invite tenant administrator" },
  { id: "review", title: "Review & Finish", description: "Summary and completion" },
];

function DataImportExportTab({ tenantId, tenantSlug }: { tenantId: string; tenantSlug: string }) {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  
  const handleExport = async (type: "clients" | "users" | "time-entries") => {
    setIsExporting(true);
    try {
      const response = await fetch(`/api/v1/super/tenants/${tenantId}/export/${type}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Export failed");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${tenantSlug}-${type}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({
        title: "Export Complete",
        description: `${type} exported successfully.`,
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Download className="h-4 w-4" />
            Quick Export
          </CardTitle>
          <CardDescription>Download tenant data as CSV files</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
            <Button 
              variant="outline"
              onClick={() => handleExport("clients")} 
              disabled={isExporting}
              data-testid="button-export-clients"
            >
              {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Clients
            </Button>
            <Button 
              variant="outline"
              onClick={() => handleExport("users")} 
              disabled={isExporting}
              data-testid="button-export-users"
            >
              {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Team Members
            </Button>
            <Button 
              variant="outline"
              onClick={() => handleExport("time-entries")} 
              disabled={isExporting}
              data-testid="button-export-time-entries"
            >
              {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Time Entries
            </Button>
          </div>
        </CardContent>
      </Card>

      <DataImportWizardComponent tenantId={tenantId} tenantSlug={tenantSlug} />

      <Separator />

      <AsanaImportWizard tenantId={tenantId} />
    </div>
  );
}

export function TenantDrawer({ tenant, open, onOpenChange, onTenantUpdated, mode = "edit", onTenantCreated }: TenantDrawerProps) {
  const { toast } = useToast();
  
  const [drawerMode, setDrawerMode] = useState<"create" | "edit">(mode);
  const [wizardStep, setWizardStep] = useState<WizardStep>("basics");
  const [createdTenant, setCreatedTenant] = useState<TenantWithDetails | null>(null);
  
  const [createName, setCreateName] = useState("");
  const [createSlug, setCreateSlug] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  
  const activeTenant = tenant || createdTenant;
  
  useEffect(() => {
    if (open) {
      setDrawerMode(mode);
      if (mode === "create") {
        setWizardStep("basics");
        setCreatedTenant(null);
        setCreateName("");
        setCreateSlug("");
        setCreateError(null);
      }
    }
  }, [open, mode]);
  
  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();
  };
  
  const createTenantMutation = useMutation({
    mutationFn: async (data: { name: string; slug: string }) => {
      const response = await apiRequest("POST", "/api/v1/super/tenants", data);
      return (await response.json()) as TenantWithDetails;
    },
    onSuccess: (newTenant) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants-detail"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants"] });
      setCreatedTenant(newTenant);
      setWizardStep("workspace");
      setCreateError(null);
      toast({ 
        title: "Tenant created", 
        description: `${newTenant.name} has been created with primary workspace` 
      });
    },
    onError: (error: Error) => {
      const requestId = error instanceof ApiError ? error.requestId : null;
      const errorMessage = error.message || "Failed to create tenant";
      const displayMessage = requestId 
        ? `${errorMessage}\n\nRequest ID: ${requestId}` 
        : errorMessage;
      setCreateError(displayMessage);
      toast({ 
        title: "Failed to create tenant", 
        description: requestId 
          ? `${errorMessage}. Request ID: ${requestId}` 
          : errorMessage, 
        variant: "destructive" 
      });
    },
  });
  
  const handleCreateTenant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim() || !createSlug.trim()) {
      setCreateError("Name and slug are required");
      return;
    }
    createTenantMutation.mutate({ name: createName.trim(), slug: createSlug.trim() });
  };
  
  const goToStep = (step: WizardStep) => setWizardStep(step);
  const getStepIndex = (step: WizardStep) => WIZARD_STEPS.findIndex(s => s.id === step);
  const currentStepIndex = getStepIndex(wizardStep);
  const canGoNext = () => {
    if (wizardStep === "basics" && !createdTenant) return false;
    return currentStepIndex < WIZARD_STEPS.length - 1;
  };
  const canGoBack = () => currentStepIndex > 0 && wizardStep !== "basics";
  const goNext = () => { if (canGoNext()) setWizardStep(WIZARD_STEPS[currentStepIndex + 1].id); };
  const goBack = () => { if (canGoBack()) setWizardStep(WIZARD_STEPS[currentStepIndex - 1].id); };
  
  const finishWizard = () => {
    if (createdTenant) {
      toast({ title: "Setup complete", description: `${createdTenant.name} is ready to use` });
      onOpenChange(false);
      onTenantCreated?.(createdTenant);
    } else {
      onOpenChange(false);
    }
  };
  
  const getStorageKey = (tenantId: string) => `tenantDrawerTab_${tenantId}`;
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== "undefined" && activeTenant?.id) {
      return localStorage.getItem(getStorageKey(activeTenant.id)) || "onboarding";
    }
    return "onboarding";
  });
  
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFirstName, setInviteFirstName] = useState("");
  const [inviteLastName, setInviteLastName] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "employee">("admin");
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);

  const [brandingData, setBrandingData] = useState<TenantSettings>({});

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    action: "suspend" | "activate" | "reactivate" | null;
    title: string;
    description: string;
  }>({ open: false, action: null, title: "", description: "" });

  useEffect(() => {
    if (activeTenant) {
      setHasUnsavedChanges(false);
      const storedTab = localStorage.getItem(getStorageKey(activeTenant.id));
      setActiveTab(storedTab || "onboarding");
    }
  }, [activeTenant?.id]);

  useEffect(() => {
    if (activeTenant?.id && activeTab) {
      localStorage.setItem(getStorageKey(activeTenant.id), activeTab);
    }
  }, [activeTab, activeTenant?.id]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    const drawerContent = document.querySelector('[data-testid="full-screen-drawer"] > div.overflow-y-auto');
    if (drawerContent) {
      drawerContent.scrollTop = 0;
    }
  };

  const { data: settingsResponse } = useQuery<{ tenantSettings: TenantSettings | null }>({
    queryKey: ["/api/v1/super/tenants", activeTenant?.id, "settings"],
    queryFn: () => fetch(`/api/v1/super/tenants/${activeTenant?.id}/settings`, { credentials: "include" }).then(r => r.json()),
    enabled: !!activeTenant && open,
  });

  const { data: integrationsResponse } = useQuery<{ integrations: { provider: string; status: IntegrationStatus; secretConfigured: boolean; lastTestedAt: string | null }[] }>({
    queryKey: ["/api/v1/super/tenants", activeTenant?.id, "integrations"],
    queryFn: () => fetch(`/api/v1/super/tenants/${activeTenant?.id}/integrations`, { credentials: "include" }).then(r => r.json()),
    enabled: !!activeTenant && open && (activeTab === "integrations" || drawerMode === "create"),
  });

  const getIntegrationStatus = (provider: string): IntegrationStatus => {
    const integration = integrationsResponse?.integrations?.find(i => i.provider === provider);
    return integration?.status || "not_configured";
  };

  useEffect(() => {
    if (settingsResponse?.tenantSettings) {
      setBrandingData(settingsResponse.tenantSettings);
    }
  }, [settingsResponse]);

  const saveBrandingMutation = useMutation({
    mutationFn: async (settings: Partial<TenantSettings>) => {
      return apiRequest("PATCH", `/api/v1/super/tenants/${activeTenant?.id}/settings`, settings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants-detail"] });
      toast({ title: "Branding settings saved" });
    },
    onError: () => {
      toast({ title: "Failed to save settings", variant: "destructive" });
    },
  });

  const activateMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/v1/super/tenants/${activeTenant?.id}/activate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants-detail"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "health"] });
      toast({ 
        title: "Tenant activated", 
        description: `"${activeTenant?.name}" is now active and accessible to users.` 
      });
      setConfirmDialog({ open: false, action: null, title: "", description: "" });
      onTenantUpdated?.();
    },
    onError: (error: any) => {
      toast({ title: "Failed to activate tenant", description: error?.message || "An unexpected error occurred.", variant: "destructive" });
      setConfirmDialog({ open: false, action: null, title: "", description: "" });
    },
  });

  const suspendMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/v1/super/tenants/${activeTenant?.id}/suspend`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants-detail"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "health"] });
      toast({ 
        title: "Tenant suspended", 
        description: `"${activeTenant?.name}" has been suspended. Users cannot access the platform.` 
      });
      setConfirmDialog({ open: false, action: null, title: "", description: "" });
      onTenantUpdated?.();
    },
    onError: (error: any) => {
      toast({ title: "Failed to suspend tenant", description: error?.message || "An unexpected error occurred.", variant: "destructive" });
      setConfirmDialog({ open: false, action: null, title: "", description: "" });
    },
  });

  const inviteAdminMutation = useMutation({
    mutationFn: async (data: { email: string; firstName?: string; lastName?: string; role?: "admin" | "employee"; inviteType: "link" | "email" }) => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${activeTenant?.id}/invite-admin`, data);
      return res.json();
    },
    onSuccess: (data, variables) => {
      setLastInviteUrl(data.inviteUrl);
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants-detail"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "invitations"] });
      toast({ 
        title: "Invitation created", 
        description: `Invite link generated for ${variables.email}. Copy and share with the user.` 
      });
      setInviteEmail("");
      setInviteFirstName("");
      setInviteLastName("");
      setInviteRole("admin");
    },
    onError: (error: any) => {
      toast({ title: "Failed to create invitation", description: error?.message || "An unexpected error occurred.", variant: "destructive" });
    },
  });

  const openConfirmDialog = (action: "suspend" | "activate" | "reactivate") => {
    const configs = {
      suspend: {
        title: "Suspend Tenant",
        description: `Are you sure you want to suspend "${activeTenant?.name}"? Users will lose access to the platform until the tenant is reactivated.`,
      },
      activate: {
        title: "Activate Tenant",
        description: `Are you sure you want to activate "${activeTenant?.name}"? This will make the tenant live and allow users to access the platform.`,
      },
      reactivate: {
        title: "Reactivate Tenant",
        description: `Are you sure you want to reactivate "${activeTenant?.name}"? Users will regain access to the platform.`,
      },
    };
    setConfirmDialog({ open: true, action, ...configs[action] });
  };

  const handleConfirmAction = () => {
    if (confirmDialog.action === "suspend") {
      suspendMutation.mutate();
    } else if (confirmDialog.action === "activate" || confirmDialog.action === "reactivate") {
      activateMutation.mutate();
    }
  };

  const onboardingProgress: OnboardingProgress = activeTenant ? {
    workspace: true,
    branding: !!settingsResponse?.tenantSettings?.logoUrl,
    email: false,
    users: (activeTenant.userCount || 0) > 0,
    activated: activeTenant.status === "active",
  } : { workspace: false, branding: false, email: false, users: false, activated: false };

  const completedSteps = Object.values(onboardingProgress).filter(Boolean).length;
  const totalSteps = Object.keys(onboardingProgress).length;
  const progressPercent = Math.round((completedSteps / totalSteps) * 100);

  if (drawerMode === "edit" && !activeTenant) return null;

  if (drawerMode === "create" || (mode === "create" && !activeTenant)) {
    return (
      <FullScreenDrawer
        open={open}
        onOpenChange={onOpenChange}
        title={createdTenant ? createdTenant.name : "Create New Tenant"}
        description={createdTenant ? `/${createdTenant.slug}` : "Set up a new organization"}
        hasUnsavedChanges={false}
        width="3xl"
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between px-2 py-4 bg-muted/30 rounded-lg">
            {WIZARD_STEPS.map((step, index) => {
              const isCompleted = index < currentStepIndex || (createdTenant && index === 0);
              const isCurrent = step.id === wizardStep;
              const isDisabled = index > 0 && !createdTenant;
              
              return (
                <div key={step.id} className="flex items-center flex-1">
                  <div 
                    className={`flex flex-col items-center flex-1 ${isDisabled ? 'opacity-40' : ''}`}
                    onClick={() => !isDisabled && index <= currentStepIndex && goToStep(step.id)}
                    role={!isDisabled ? "button" : undefined}
                    data-testid={`wizard-step-${step.id}`}
                  >
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                      isCompleted ? 'bg-green-500 text-white' :
                      isCurrent ? 'bg-primary text-primary-foreground' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {isCompleted ? <Check className="h-4 w-4" /> : index + 1}
                    </div>
                    <div className={`text-xs mt-1 text-center ${isCurrent ? 'font-medium' : 'text-muted-foreground'}`}>
                      {step.title}
                    </div>
                  </div>
                  {index < WIZARD_STEPS.length - 1 && (
                    <div className={`h-0.5 flex-1 mx-2 ${index < currentStepIndex ? 'bg-green-500' : 'bg-muted'}`} />
                  )}
                </div>
              );
            })}
          </div>

          {wizardStep === "basics" && (
            <Card>
              <CardHeader>
                <CardTitle>Tenant Basics</CardTitle>
                <CardDescription>Enter the organization name and URL slug</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateTenant} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="create-name">Business Name *</Label>
                    <Input
                      id="create-name"
                      value={createName}
                      onChange={(e) => {
                        setCreateName(e.target.value);
                        setCreateSlug(generateSlug(e.target.value));
                      }}
                      placeholder="Acme Corporation"
                      data-testid="input-create-name"
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      This will also be used as the primary workspace name
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="create-slug">URL Slug *</Label>
                    <Input
                      id="create-slug"
                      value={createSlug}
                      onChange={(e) => setCreateSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      placeholder="acme-corp"
                      data-testid="input-create-slug"
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Lowercase letters, numbers, and hyphens only
                    </p>
                  </div>
                  {createError && (
                    <div className="text-sm text-destructive flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      {createError}
                    </div>
                  )}
                  <div className="flex justify-end pt-4">
                    <Button 
                      type="submit" 
                      disabled={createTenantMutation.isPending || !createName.trim() || !createSlug.trim()}
                      data-testid="button-create-tenant-wizard"
                    >
                      {createTenantMutation.isPending ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</>
                      ) : (
                        <>Create Tenant<Check className="h-4 w-4 ml-2" /></>
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {wizardStep === "workspace" && createdTenant && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  Primary Workspace Created
                </CardTitle>
                <CardDescription>Your primary workspace has been automatically created</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                      <HardDrive className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <div className="font-medium">{createdTenant.primaryWorkspace?.name || createdTenant.name}</div>
                      <div className="text-sm text-muted-foreground">Primary Workspace</div>
                    </div>
                    <Badge className="ml-auto bg-green-600">Primary</Badge>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  The workspace name matches the tenant business name exactly. You can create additional workspaces later.
                </p>
              </CardContent>
            </Card>
          )}

          {wizardStep === "branding" && createdTenant && (
            <Card>
              <CardHeader>
                <CardTitle>Branding (Optional)</CardTitle>
                <CardDescription>Configure display name and colors. You can skip this and configure later.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="wizard-display-name">Display Name</Label>
                  <Input
                    id="wizard-display-name"
                    value={brandingData.displayName || createdTenant.name}
                    onChange={(e) => setBrandingData(prev => ({ ...prev, displayName: e.target.value }))}
                    placeholder="Display name for the tenant"
                    data-testid="input-wizard-display-name"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <ColorPicker
                    label="Primary Color"
                    value={brandingData.primaryColor || "#83ba3b"}
                    defaultValue="#83ba3b"
                    onChange={(value) => setBrandingData(prev => ({ ...prev, primaryColor: value }))}
                    data-testid="input-wizard-primary-color"
                  />
                  <ColorPicker
                    label="Accent Color"
                    value={brandingData.accentColor || "#8b5cf6"}
                    defaultValue="#8b5cf6"
                    onChange={(value) => setBrandingData(prev => ({ ...prev, accentColor: value }))}
                    data-testid="input-wizard-accent-color"
                  />
                </div>
                <Button 
                  onClick={() => saveBrandingMutation.mutate(brandingData)}
                  disabled={saveBrandingMutation.isPending}
                  variant="outline"
                  className="w-full"
                  data-testid="button-save-wizard-branding"
                >
                  {saveBrandingMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Save Branding
                </Button>
              </CardContent>
            </Card>
          )}

          {wizardStep === "integrations" && createdTenant && (
            <Card>
              <CardHeader>
                <CardTitle>Integrations (Optional)</CardTitle>
                <CardDescription>Configure email and storage. You can skip and configure later.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center gap-3 mb-3">
                    <Mail className="h-5 w-5" />
                    <div className="font-medium">Mailgun Email</div>
                    <IntegrationStatusBadge status={getIntegrationStatus("mailgun")} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Email configuration can be done from the Integrations tab after setup.
                  </p>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center gap-3 mb-3">
                    <HardDrive className="h-5 w-5" />
                    <div className="font-medium">S3 Storage</div>
                    <IntegrationStatusBadge status={getIntegrationStatus("s3")} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Storage configuration can be done from the Integrations tab after setup.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {wizardStep === "invite" && createdTenant && (
            <Card>
              <CardHeader>
                <CardTitle>Invite User (Recommended)</CardTitle>
                <CardDescription>
                  Invite a user for this tenant. Invite acceptance is not required to finish setup.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="wizard-invite-email">Email Address *</Label>
                      <Input
                        id="wizard-invite-email"
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="user@example.com"
                        data-testid="input-wizard-invite-email"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="wizard-invite-role">Role</Label>
                      <Select value={inviteRole} onValueChange={(v: "admin" | "employee") => setInviteRole(v)}>
                        <SelectTrigger id="wizard-invite-role" data-testid="select-wizard-invite-role">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="employee">Employee</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="wizard-invite-first-name">First Name</Label>
                      <Input
                        id="wizard-invite-first-name"
                        value={inviteFirstName}
                        onChange={(e) => setInviteFirstName(e.target.value)}
                        placeholder="John"
                        data-testid="input-wizard-invite-first-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="wizard-invite-last-name">Last Name</Label>
                      <Input
                        id="wizard-invite-last-name"
                        value={inviteLastName}
                        onChange={(e) => setInviteLastName(e.target.value)}
                        placeholder="Doe"
                        data-testid="input-wizard-invite-last-name"
                      />
                    </div>
                  </div>
                  <Button
                    onClick={() => inviteAdminMutation.mutate({ email: inviteEmail, firstName: inviteFirstName || undefined, lastName: inviteLastName || undefined, role: inviteRole, inviteType: "link" })}
                    disabled={inviteAdminMutation.isPending || !inviteEmail}
                    data-testid="button-wizard-send-invite"
                  >
                    {inviteAdminMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserPlus className="h-4 w-4 mr-2" />}
                    Generate Invite Link
                  </Button>
                </div>
                {lastInviteUrl && (
                  <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-green-700 dark:text-green-400">Invite link generated</span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText(lastInviteUrl);
                          toast({ title: "Copied", description: "Invite URL copied to clipboard" });
                        }}
                        data-testid="button-copy-wizard-invite"
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 break-all">{lastInviteUrl}</p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Invite acceptance is not required to complete setup. Tenant can be used immediately.
                </p>
              </CardContent>
            </Card>
          )}

          {wizardStep === "review" && createdTenant && (
            <Card>
              <CardHeader>
                <CardTitle>Setup Complete</CardTitle>
                <CardDescription>Review your new tenant configuration</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <div>
                        <div className="font-medium">Tenant Created</div>
                        <div className="text-sm text-muted-foreground">{createdTenant.name}</div>
                      </div>
                    </div>
                    <Badge variant="secondary">/{createdTenant.slug}</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <div>
                        <div className="font-medium">Primary Workspace</div>
                        <div className="text-sm text-muted-foreground">{createdTenant.primaryWorkspace?.name || createdTenant.name}</div>
                      </div>
                    </div>
                    <Badge className="bg-green-600">Created</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      {lastInviteUrl ? <CheckCircle className="h-5 w-5 text-green-500" /> : <Clock className="h-5 w-5 text-muted-foreground" />}
                      <div>
                        <div className="font-medium">Admin Invitation</div>
                        <div className="text-sm text-muted-foreground">{lastInviteUrl ? "Invite link generated" : "No invites sent"}</div>
                      </div>
                    </div>
                    <Badge variant={lastInviteUrl ? "default" : "secondary"}>
                      {lastInviteUrl ? "Pending" : "Skipped"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Clock className="h-5 w-5 text-amber-500" />
                      <div>
                        <div className="font-medium">Tenant Status</div>
                        <div className="text-sm text-muted-foreground">Ready to activate</div>
                      </div>
                    </div>
                    {getStatusBadge(createdTenant.status)}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center justify-between pt-4 border-t">
            <Button
              variant="outline"
              onClick={goBack}
              disabled={!canGoBack()}
              data-testid="button-wizard-back"
            >
              Back
            </Button>
            <div className="flex gap-2">
              {wizardStep !== "review" && createdTenant && (
                <Button
                  variant="ghost"
                  onClick={() => goToStep("review")}
                  data-testid="button-wizard-skip"
                >
                  Skip to Finish
                </Button>
              )}
              {wizardStep === "review" ? (
                <Button onClick={finishWizard} data-testid="button-wizard-finish">
                  <Check className="h-4 w-4 mr-2" />
                  Finish Setup
                </Button>
              ) : (
                <Button
                  onClick={goNext}
                  disabled={!canGoNext()}
                  data-testid="button-wizard-next"
                >
                  Next
                </Button>
              )}
            </div>
          </div>
        </div>
      </FullScreenDrawer>
    );
  }

  if (!activeTenant) {
    return null;
  }

  return (
    <FullScreenDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={activeTenant.settings?.displayName || activeTenant.name}
      description={`/${activeTenant.slug}`}
      hasUnsavedChanges={hasUnsavedChanges}
      width="3xl"
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          {getStatusBadge(activeTenant.status)}
          <div className="flex items-center gap-2">
            {activeTenant.status === "inactive" && (
              <Button 
                size="sm" 
                onClick={() => openConfirmDialog("activate")}
                disabled={activateMutation.isPending}
                data-testid="button-activate-tenant"
              >
                <PlayCircle className="h-4 w-4 mr-2" />
                Activate
              </Button>
            )}
            {activeTenant.status === "active" && (
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => openConfirmDialog("suspend")}
                disabled={suspendMutation.isPending}
                data-testid="button-suspend-tenant"
              >
                <PauseCircle className="h-4 w-4 mr-2" />
                Suspend
              </Button>
            )}
            {activeTenant.status === "suspended" && (
              <Button 
                size="sm" 
                onClick={() => openConfirmDialog("reactivate")}
                disabled={activateMutation.isPending}
                data-testid="button-reactivate-tenant"
              >
                <Power className="h-4 w-4 mr-2" />
                Reactivate
              </Button>
            )}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="grid w-full grid-cols-10">
            <TabsTrigger value="onboarding" data-testid="tab-onboarding">
              <Settings className="h-4 w-4 mr-2" />
              Setup
            </TabsTrigger>
            <TabsTrigger value="overview" data-testid="tab-overview">
              <Building2 className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="workspaces" data-testid="tab-workspaces">
              <HardDrive className="h-4 w-4 mr-2" />
              Workspaces
            </TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users">
              <Users className="h-4 w-4 mr-2" />
              Users
            </TabsTrigger>
            <TabsTrigger value="clients" data-testid="tab-clients">
              <Briefcase className="h-4 w-4 mr-2" />
              Clients
            </TabsTrigger>
            <TabsTrigger value="projects" data-testid="tab-projects">
              <FolderKanban className="h-4 w-4 mr-2" />
              Projects
            </TabsTrigger>
            <TabsTrigger value="branding" data-testid="tab-branding">
              <Palette className="h-4 w-4 mr-2" />
              Branding
            </TabsTrigger>
            <TabsTrigger value="integrations" data-testid="tab-integrations">
              <HardDrive className="h-4 w-4 mr-2" />
              Integrations
            </TabsTrigger>
            <TabsTrigger value="data" data-testid="tab-data">
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Data
            </TabsTrigger>
            <TabsTrigger value="notes" data-testid="tab-notes">
              <MessageSquare className="h-4 w-4 mr-2" />
              Notes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="onboarding" className="space-y-6 mt-6">
            <TenantDrawerOnboarding
              activeTenant={activeTenant}
              onboardingProgress={onboardingProgress}
              setActiveTab={handleTabChange}
            />
          </TabsContent>

          <TabsContent value="overview" className="space-y-6 mt-6">
            <TenantDrawerOverview
              activeTenant={activeTenant}
              onTenantUpdated={onTenantUpdated}
              onUnsavedChangesChange={setHasUnsavedChanges}
              onboardingProgress={onboardingProgress}
              setActiveTab={handleTabChange}
            />
          </TabsContent>

          <TabsContent value="workspaces" className="space-y-6 mt-6">
            <TenantDrawerWorkspaces activeTenant={activeTenant} open={open} />
          </TabsContent>

          <TabsContent value="users" className="space-y-6 mt-6">
            <TenantDrawerUsers activeTenant={activeTenant} open={open} />
          </TabsContent>

          <TabsContent value="clients" className="space-y-6 mt-6">
            <TenantDrawerClients activeTenant={activeTenant} open={open} />
          </TabsContent>

          <TabsContent value="projects" className="space-y-6 mt-6">
            <TenantDrawerProjects activeTenant={activeTenant} open={open} />
          </TabsContent>

          <TabsContent value="branding" className="space-y-6 mt-6">
            <TenantDrawerBranding activeTenant={activeTenant} open={open} />
          </TabsContent>

          <TabsContent value="integrations" className="space-y-6 mt-6">
            <TenantDrawerIntegrations activeTenant={activeTenant} open={open} />
          </TabsContent>

          <TabsContent value="data" className="space-y-6 mt-6">
            <DataImportExportTab tenantId={activeTenant.id} tenantSlug={activeTenant.slug} />
          </TabsContent>

          <TabsContent value="notes" className="mt-6">
            <TenantDrawerNotes activeTenant={activeTenant} open={open} />
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog 
        open={confirmDialog.open} 
        onOpenChange={(open) => {
          if (!open) {
            setConfirmDialog({ open: false, action: null, title: "", description: "" });
          }
        }}
      >
        <AlertDialogContent data-testid="confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="confirm-dialog-title">
              {confirmDialog.title}
            </AlertDialogTitle>
            <AlertDialogDescription data-testid="confirm-dialog-description">
              {confirmDialog.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              disabled={activateMutation.isPending || suspendMutation.isPending}
              data-testid="confirm-dialog-cancel"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAction}
              disabled={activateMutation.isPending || suspendMutation.isPending}
              className={confirmDialog.action === "suspend" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
              data-testid="confirm-dialog-confirm"
            >
              {(activateMutation.isPending || suspendMutation.isPending) ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing...</>
              ) : (
                confirmDialog.action === "suspend" ? "Suspend Tenant" :
                confirmDialog.action === "activate" ? "Activate Tenant" :
                "Reactivate Tenant"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FullScreenDrawer>
  );
}
