import { useState, useMemo, useEffect } from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { getPreviewText } from "@/components/richtext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft,
  Plus,
  Building2,
  Mail,
  Phone,
  Globe,
  MapPin,
  FolderKanban,
  User,
  MoreHorizontal,
  Pencil,
  Trash2,
  Send,
  FileText,
  Link as LinkIcon,
  Search,
  Play,
  Users,
  Calendar,
  Briefcase,
  Save,
  Loader2,
  ArrowRight,
  GitBranch,
  X,
  Tag,
  UserPlus,
  Layers,
  Activity,
  BarChart3,
  ClipboardCheck,
  MessageSquare,
} from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useCrmFlags } from "@/hooks/use-crm-flags";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
import { AssetLibraryPanel } from "@/features/assetLibrary/AssetLibraryPanel";
import { StartTimerDrawer } from "@/features/timer/start-timer-drawer";
import { DivisionDrawer, ClientSectionSwitcher, getVisibleSections, CONTROL_CENTER_CHILD_IDS, useClientProfileSection, ClientCommandPalette, ClientCommandPaletteMobileTrigger, useClientCommandPaletteState, ControlCenterSection } from "@/features/clients";
import { ClientPortalUsersTab } from "@/components/client-portal-users-tab";
import { ClientNotesTab } from "@/components/client-notes-tab";
import { ClientDocumentsPanel } from "@/components/client-documents-panel";
import { CrmOverviewSection, NotesTab as Crm360NotesTab, ActivityTab, ApprovalsTab, MessagesTab, type CrmSummary } from "@/components/client-360-tabs";
import { ClientReportsTab } from "@/components/client-reports-tab";
import { useToast } from "@/hooks/use-toast";
import type { ClientWithContacts, Project, ClientContact, ClientDivision } from "@shared/schema";
import { CLIENT_STAGES_ORDERED, CLIENT_STAGE_LABELS, type ClientStageType } from "@shared/schema";

interface DivisionWithCounts extends ClientDivision {
  memberCount: number;
  projectCount: number;
}

const createContactSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  title: z.string().optional(),
  isPrimary: z.boolean().default(false),
  notes: z.string().optional(),
});

type CreateContactForm = z.infer<typeof createContactSchema>;

const updateClientSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  displayName: z.string().optional(),
  legalName: z.string().optional(),
  status: z.enum(["active", "inactive", "prospect"]),
  industry: z.string().optional(),
  companySize: z.string().optional(),
  website: z.string().optional(),
  taxId: z.string().optional(),
  foundedDate: z.string().optional(),
  description: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  mailingAddressLine1: z.string().optional(),
  mailingAddressLine2: z.string().optional(),
  mailingCity: z.string().optional(),
  mailingState: z.string().optional(),
  mailingPostalCode: z.string().optional(),
  mailingCountry: z.string().optional(),
  primaryContactName: z.string().optional(),
  primaryContactEmail: z.string().optional(),
  primaryContactPhone: z.string().optional(),
  notes: z.string().optional(),
  parentClientId: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
});

type UpdateClientForm = z.infer<typeof updateClientSchema>;

const createProjectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  description: z.string().optional(),
  color: z.string().default("#3B82F6"),
});

type CreateProjectForm = z.infer<typeof createProjectSchema>;

function EditContactForm({
  contact,
  onSubmit,
  onCancel,
  isPending,
}: {
  contact: ClientContact;
  onSubmit: (data: CreateContactForm) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const form = useForm<CreateContactForm>({
    resolver: zodResolver(createContactSchema),
    defaultValues: {
      firstName: contact.firstName || "",
      lastName: contact.lastName || "",
      email: contact.email || "",
      phone: contact.phone || "",
      title: contact.title || "",
      isPrimary: contact.isPrimary || false,
      notes: contact.notes || "",
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="firstName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>First Name *</FormLabel>
                <FormControl>
                  <Input {...field} data-testid="input-edit-contact-first-name" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="lastName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Last Name</FormLabel>
                <FormControl>
                  <Input {...field} data-testid="input-edit-contact-last-name" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" {...field} data-testid="input-edit-contact-email" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Phone</FormLabel>
              <FormControl>
                <Input {...field} data-testid="input-edit-contact-phone" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Job Title</FormLabel>
              <FormControl>
                <Input {...field} data-testid="input-edit-contact-title" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending} data-testid="button-update-contact">
            {isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default function ClientDetailPage() {
  const [, params] = useRoute("/clients/:id");
  const [, navigate] = useLocation();
  const clientId = params?.id;
  const { toast } = useToast();
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [editContactOpen, setEditContactOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<ClientContact | null>(null);
  const [timerDrawerOpen, setTimerDrawerOpen] = useState(false);
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [projectView, setProjectView] = useState<"options" | "create" | "assign">("options");
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [divisionDrawerOpen, setDivisionDrawerOpen] = useState(false);
  const [editingDivision, setEditingDivision] = useState<ClientDivision | null>(null);
  const [divisionMode, setDivisionMode] = useState<"create" | "edit">("create");
  const [deleteClientOpen, setDeleteClientOpen] = useState(false);
  const [mailingSameAsPhysical, setMailingSameAsPhysical] = useState(true);
  const [portalInviteContact, setPortalInviteContact] = useState<ClientContact | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  const { user } = useAuth();
  const crmFlags = useCrmFlags();
  const featureFlags = useFeatureFlags();

  const allVisibleSections = useMemo(
    () => getVisibleSections(crmFlags, featureFlags),
    [crmFlags, featureFlags],
  );

  const hasControlCenter = allVisibleSections.some((s) => s.id === "control-center");

  const tabBarSections = useMemo(
    () =>
      hasControlCenter
        ? allVisibleSections.filter((s) => !CONTROL_CENTER_CHILD_IDS.has(s.id))
        : allVisibleSections,
    [allVisibleSections, hasControlCenter],
  );

  const visibleSections = allVisibleSections;
  const { activeSection, setActiveSection } = useClientProfileSection(visibleSections, clientId || "");
  const cmdPalette = useClientCommandPaletteState();
  const useV2Layout = featureFlags.clientProfileLayoutV2;
  const canDeleteClient = user?.role === "super_user" || user?.role === "tenant_admin" || user?.role === "admin";

  const { data: client, isLoading } = useQuery<ClientWithContacts>({
    queryKey: ["/api/clients", clientId],
    enabled: !!clientId,
  });

  const { data: divisions = [] } = useQuery<DivisionWithCounts[]>({
    queryKey: ["/api/v1/clients", clientId, "divisions"],
    enabled: !!clientId,
  });

  const { data: crmSummary, isLoading: crmSummaryLoading } = useQuery<CrmSummary>({
    queryKey: [`/api/crm/clients/${clientId}/summary`],
    enabled: !!clientId && crmFlags.client360,
  });

  // Fetch all clients for parent client selector (excluding the current client)
  const { data: allClients = [] } = useQuery<ClientWithContacts[]>({
    queryKey: ["/api/clients"],
    enabled: !!clientId,
  });

  useEffect(() => {
    if (client) {
      const hasMailingData = !!(client.mailingAddressLine1 || client.mailingCity || client.mailingState || client.mailingPostalCode || client.mailingCountry);
      setMailingSameAsPhysical(!hasMailingData);
    }
  }, [client?.id, client?.mailingAddressLine1, client?.mailingCity, client?.mailingState, client?.mailingPostalCode, client?.mailingCountry]);

  const childClients = useMemo(() => {
    if (!clientId || !allClients.length) return [];
    return allClients.filter((c) => c.parentClientId === clientId);
  }, [allClients, clientId]);

  const { data: unassignedProjects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects/unassigned", projectSearchQuery],
    enabled: addProjectOpen && projectView === "assign",
  });

  const createContactMutation = useMutation({
    mutationFn: async (data: CreateContactForm) => {
      return apiRequest("POST", `/api/clients/${clientId}/contacts`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId] });
      setAddContactOpen(false);
      contactForm.reset();
    },
  });

  const updateClientMutation = useMutation({
    mutationFn: async (data: UpdateClientForm) => {
      return apiRequest("PATCH", `/api/clients/${clientId}`, data);
    },
    onMutate: async (newData) => {
      await queryClient.cancelQueries({ queryKey: ["/api/clients", clientId] });
      const previousClient = queryClient.getQueryData<ClientWithContacts>(["/api/clients", clientId]);
      if (previousClient) {
        queryClient.setQueryData<ClientWithContacts>(["/api/clients", clientId], {
          ...previousClient,
          companyName: newData.companyName,
          displayName: newData.displayName || null,
          legalName: newData.legalName || null,
          status: newData.status,
          industry: newData.industry || null,
          companySize: newData.companySize || null,
          website: newData.website || null,
          taxId: newData.taxId || null,
          foundedDate: newData.foundedDate || null,
          description: newData.description || null,
          phone: newData.phone || null,
          email: newData.email || null,
          addressLine1: newData.addressLine1 || null,
          addressLine2: newData.addressLine2 || null,
          city: newData.city || null,
          state: newData.state || null,
          postalCode: newData.postalCode || null,
          country: newData.country || null,
          mailingAddressLine1: newData.mailingAddressLine1 || null,
          mailingAddressLine2: newData.mailingAddressLine2 || null,
          mailingCity: newData.mailingCity || null,
          mailingState: newData.mailingState || null,
          mailingPostalCode: newData.mailingPostalCode || null,
          mailingCountry: newData.mailingCountry || null,
          primaryContactName: newData.primaryContactName || null,
          primaryContactEmail: newData.primaryContactEmail || null,
          primaryContactPhone: newData.primaryContactPhone || null,
          notes: newData.notes || null,
          parentClientId: newData.parentClientId || null,
          tags: newData.tags || null,
        });
      }
      return { previousClient };
    },
    onError: (err, _newData, context) => {
      if (context?.previousClient) {
        queryClient.setQueryData(["/api/clients", clientId], context.previousClient);
      }
      toast({ title: "Failed to update client", variant: "destructive" });
    },
    onSuccess: () => {
      toast({ title: "Client updated successfully" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
    },
  });

  const updateStageMutation = useMutation({
    mutationFn: async (stage: string) => {
      return apiRequest("PATCH", `/api/v1/clients/${clientId}/stage`, { stage });
    },
    onMutate: async (newStage) => {
      await queryClient.cancelQueries({ queryKey: ["/api/clients", clientId] });
      const prev = queryClient.getQueryData<ClientWithContacts>(["/api/clients", clientId]);
      if (prev) {
        queryClient.setQueryData<ClientWithContacts>(["/api/clients", clientId], { ...prev, stage: newStage });
      }
      return { prev };
    },
    onError: (_err, _stage, context) => {
      if (context?.prev) {
        queryClient.setQueryData(["/api/clients", clientId], context.prev);
      }
      toast({ title: "Failed to update stage", variant: "destructive" });
    },
    onSuccess: () => {
      toast({ title: "Client stage updated" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/clients/hierarchy/list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/clients/stages/summary"] });
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (contactId: string) => {
      return apiRequest("DELETE", `/api/clients/${clientId}/contacts/${contactId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId] });
    },
  });

  const updateContactMutation = useMutation({
    mutationFn: async ({ contactId, data }: { contactId: string; data: CreateContactForm }) => {
      return apiRequest("PATCH", `/api/clients/${clientId}/contacts/${contactId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId] });
      setEditContactOpen(false);
      setEditingContact(null);
    },
  });

  const createProjectMutation = useMutation({
    mutationFn: async (data: CreateProjectForm) => {
      const response = await apiRequest("POST", `/api/clients/${clientId}/projects`, data);
      return response.json() as Promise<Project>;
    },
    onSuccess: (project: Project) => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/projects"] });
      setAddProjectOpen(false);
      setProjectView("options");
      projectForm.reset();
      navigate(`/projects/${project.id}`);
    },
  });

  const assignProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      return apiRequest("PATCH", `/api/projects/${projectId}/client`, { clientId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/unassigned"] });
      setAddProjectOpen(false);
      setProjectView("options");
    },
  });

  const deleteClientMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/clients/${clientId}`);
    },
    onSuccess: () => {
      toast({ title: "Client deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      navigate("/clients");
    },
    onError: () => {
      toast({ title: "Failed to delete client", variant: "destructive" });
    },
  });

  const portalInviteMutation = useMutation({
    mutationFn: async (contact: ClientContact) => {
      const res = await apiRequest("POST", `/api/clients/${clientId}/users/invite`, {
        contactId: contact.id,
        accessLevel: "viewer",
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Portal invitation sent", description: "The contact has been invited to the client portal." });
      setPortalInviteContact(null);
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "users"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to send invitation", description: error.message, variant: "destructive" });
    },
  });

  const { data: portalUsers = [], isSuccess: portalUsersLoaded } = useQuery<Array<{ userId: string; user: { email: string } }>>({
    queryKey: ["/api/clients", clientId, "users"],
    enabled: !!clientId,
  });

  const contactForm = useForm<CreateContactForm>({
    resolver: zodResolver(createContactSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      title: "",
      isPrimary: false,
      notes: "",
    },
  });

  const clientForm = useForm<UpdateClientForm>({
    resolver: zodResolver(updateClientSchema),
    values: client ? {
      companyName: client.companyName,
      displayName: client.displayName || "",
      legalName: client.legalName || "",
      status: client.status as "active" | "inactive" | "prospect",
      industry: client.industry || "",
      companySize: client.companySize || "",
      website: client.website || "https://",
      taxId: client.taxId || "",
      foundedDate: client.foundedDate || "",
      description: client.description || "",
      phone: client.phone || "",
      email: client.email || "",
      addressLine1: client.addressLine1 || "",
      addressLine2: client.addressLine2 || "",
      city: client.city || "",
      state: client.state || "",
      postalCode: client.postalCode || "",
      country: client.country || "",
      mailingAddressLine1: client.mailingAddressLine1 || "",
      mailingAddressLine2: client.mailingAddressLine2 || "",
      mailingCity: client.mailingCity || "",
      mailingState: client.mailingState || "",
      mailingPostalCode: client.mailingPostalCode || "",
      mailingCountry: client.mailingCountry || "",
      primaryContactName: client.primaryContactName || "",
      primaryContactEmail: client.primaryContactEmail || "",
      primaryContactPhone: client.primaryContactPhone || "",
      notes: client.notes || "",
      parentClientId: client.parentClientId || null,
      tags: client.tags || [],
    } : undefined,
  });

  const projectForm = useForm<CreateProjectForm>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: {
      name: "",
      description: "",
      color: "#3B82F6",
    },
  });

  const handleCreateContact = (data: CreateContactForm) => {
    createContactMutation.mutate(data);
  };

  const handleUpdateClient = (data: UpdateClientForm) => {
    updateClientMutation.mutate(data);
  };

  const handleCreateProject = (data: CreateProjectForm) => {
    createProjectMutation.mutate(data);
  };

  const handleAssignProject = (projectId: string) => {
    assignProjectMutation.mutate(projectId);
  };

  const handleCloseProjectSheet = () => {
    setAddProjectOpen(false);
    setProjectView("options");
    setProjectSearchQuery("");
    projectForm.reset();
  };

  const filteredUnassignedProjects = unassignedProjects.filter(
    (p) => p.name.toLowerCase().includes(projectSearchQuery.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500/10 text-green-600 dark:text-green-400";
      case "inactive":
        return "bg-muted text-muted-foreground";
      case "prospect":
        return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex items-center gap-4 px-4 md:px-6 py-3 md:py-4 border-b border-border shrink-0">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="flex-1 overflow-auto p-4 md:p-6">
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Building2 className="h-16 w-16 text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium mb-2">Client not found</h3>
        <Link href="/clients">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {featureFlags.clientCommandPaletteV1 && (
        <>
          <ClientCommandPalette
            clientId={clientId || ""}
            clientName={client.companyName}
            visibleSections={visibleSections}
            activeSection={activeSection}
            onSectionChange={(id) => {
              setActiveSection(id);
              setActiveTab(id);
            }}
            onNewProject={() => setAddProjectOpen(true)}
            onUploadAsset={() => {
              setActiveSection("documents");
              setActiveTab("documents");
            }}
            open={cmdPalette.open}
            onOpenChange={cmdPalette.setOpen}
          />
          <ClientCommandPaletteMobileTrigger onOpen={() => cmdPalette.setOpen(true)} />
        </>
      )}
      <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-4">
          <Link href={client.parentClientId ? `/clients/${client.parentClientId}` : "/clients"}>
            <Button variant="ghost" size="icon" aria-label="Go back" data-testid="button-back-to-clients">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-primary/10 text-primary">
                {getInitials(client.companyName)}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-xl font-semibold text-foreground" data-testid="text-client-name">
                {client.companyName}
              </h1>
              {client.displayName && (
                <p className="text-sm text-muted-foreground">{client.displayName}</p>
              )}
            </div>
            <Select
              value={client.stage}
              onValueChange={(val) => updateStageMutation.mutate(val)}
            >
              <SelectTrigger className="w-auto gap-1.5" data-testid="select-client-stage">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLIENT_STAGES_ORDERED.map((stage) => (
                  <SelectItem key={stage} value={stage} data-testid={`stage-option-${stage}`}>
                    {CLIENT_STAGE_LABELS[stage]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="default" 
            onClick={() => setTimerDrawerOpen(true)}
            data-testid="button-start-timer-client"
          >
            <Play className="h-4 w-4 mr-2" />
            Start Timer
          </Button>
          {canDeleteClient && (
            <>
              <Button
                variant="destructive"
                onClick={() => setDeleteClientOpen(true)}
                data-testid="button-delete-client"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
              <AlertDialog open={deleteClientOpen} onOpenChange={setDeleteClientOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Client</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete "{client.companyName}"? This action cannot be undone. 
                      All associated data will be removed, and any projects linked to this client will be unlinked.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="button-cancel-delete-client">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteClientMutation.mutate()}
                      disabled={deleteClientMutation.isPending}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      data-testid="button-confirm-delete-client"
                    >
                      {deleteClientMutation.isPending ? "Deleting..." : "Delete Client"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {useV2Layout && (
          <div className="px-6 py-4 border-b border-border">
            <ClientSectionSwitcher
              sections={tabBarSections}
              activeSection={CONTROL_CENTER_CHILD_IDS.has(activeSection) ? "control-center" : activeSection}
              onSectionChange={(id) => {
                setActiveSection(id);
                setActiveTab(id);
              }}
              badgeCounts={{
                contacts: client.contacts?.length || 0,
                projects: client.projects?.length || 0,
                divisions: divisions.length + childClients.length,
              }}
            />
          </div>
        )}

        {useV2Layout && activeSection === "control-center" && (
          <div className="overflow-auto">
            <ControlCenterSection
              clientId={clientId || ""}
              onNavigateTab={(tab) => {
                setActiveTab(tab);
                setActiveSection(tab);
              }}
            />
          </div>
        )}

        <Tabs value={useV2Layout ? activeSection : activeTab} onValueChange={(val) => {
          if (useV2Layout) {
            setActiveSection(val);
          }
          setActiveTab(val);
        }} className={useV2Layout && activeSection === "control-center" ? "hidden" : "h-full"}>
          {!useV2Layout && (
            <div className="px-6 py-4 border-b border-border">
              <TabsList>
                <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
                <TabsTrigger value="contacts" data-testid="tab-contacts">
                  Contacts ({client.contacts?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="projects" data-testid="tab-projects">
                  Projects ({client.projects?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="divisions" data-testid="tab-divisions">
                  Divisions ({divisions.length + childClients.length})
                </TabsTrigger>
                <TabsTrigger value="activity" data-testid="tab-activity">
                  <Activity className="h-3.5 w-3.5 mr-1" />
                  Activity
                </TabsTrigger>
                <TabsTrigger value="notes" data-testid="tab-notes">
                  Notes
                </TabsTrigger>
                <TabsTrigger value="documents" data-testid="tab-documents">
                  Documents
                </TabsTrigger>
                {crmFlags.client360 && (
                  <TabsTrigger value="reports" data-testid="tab-reports">
                    <BarChart3 className="h-3.5 w-3.5 mr-1" />
                    Reports
                  </TabsTrigger>
                )}
                {crmFlags.approvals && (
                  <TabsTrigger value="approvals" data-testid="tab-approvals">
                    <ClipboardCheck className="h-3.5 w-3.5 mr-1" />
                    Approvals
                  </TabsTrigger>
                )}
                {crmFlags.clientMessaging && (
                  <TabsTrigger value="messages" data-testid="tab-messages">
                    <MessageSquare className="h-3.5 w-3.5 mr-1" />
                    Messages
                  </TabsTrigger>
                )}
                <TabsTrigger value="portal" data-testid="tab-portal">
                  Portal Users
                </TabsTrigger>
                {featureFlags.assetLibraryV2 && (
                  <TabsTrigger value="asset-library" data-testid="tab-asset-library" className="gap-1.5">
                    Asset Library
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Beta</Badge>
                  </TabsTrigger>
                )}
              </TabsList>
            </div>
          )}

          {!useV2Layout && (
            <TabsContent value="control-center" className="overflow-auto">
              <ControlCenterSection
                clientId={clientId || ""}
                onNavigateTab={(tab) => {
                  setActiveTab(tab);
                }}
              />
            </TabsContent>
          )}

          <TabsContent value="overview" className="p-6 overflow-auto">
            {crmFlags.client360 && (
              <div className="mb-6">
                <CrmOverviewSection
                  clientId={clientId || ""}
                  summary={crmSummary}
                  isLoading={crmSummaryLoading}
                  onNavigateTab={(tab) => {
                    setActiveTab(tab);
                    if (useV2Layout) setActiveSection(tab);
                  }}
                />
              </div>
            )}
            <Form {...clientForm}>
              <form onSubmit={clientForm.handleSubmit(handleUpdateClient)} className="space-y-6">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-lg font-semibold">Client Profile</h2>
                  <Button 
                    type="submit" 
                    disabled={updateClientMutation.isPending || !clientForm.formState.isDirty}
                    data-testid="button-save-profile"
                  >
                    {updateClientMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Changes
                      </>
                    )}
                  </Button>
                </div>

                <div className="grid gap-6 md:grid-cols-3">
                  <Card className="md:col-span-2">
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        Company Information
                      </CardTitle>
                      <CardDescription>Basic company details and identification</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={clientForm.control}
                          name="companyName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Company Name *</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Company name" data-testid="input-company-name" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={clientForm.control}
                          name="displayName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Display Name</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Short name or abbreviation" data-testid="input-display-name" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={clientForm.control}
                          name="legalName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Legal Name</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Legal company name" data-testid="input-legal-name" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={clientForm.control}
                          name="industry"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Industry</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="e.g. Technology, Healthcare" data-testid="input-industry" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={clientForm.control}
                          name="companySize"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Company Size</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value || ""}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-company-size">
                                    <SelectValue placeholder="Select size" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="1-10">1-10 employees</SelectItem>
                                  <SelectItem value="11-50">11-50 employees</SelectItem>
                                  <SelectItem value="51-200">51-200 employees</SelectItem>
                                  <SelectItem value="201-500">201-500 employees</SelectItem>
                                  <SelectItem value="501-1000">501-1000 employees</SelectItem>
                                  <SelectItem value="1001+">1001+ employees</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={clientForm.control}
                          name="website"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Website</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="https://example.com" data-testid="input-website" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={clientForm.control}
                          name="taxId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Tax ID</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Tax identification number" data-testid="input-tax-id" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={clientForm.control}
                          name="foundedDate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Founded</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="e.g. 2020" data-testid="input-founded-date" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={clientForm.control}
                          name="status"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Status</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-status">
                                    <SelectValue placeholder="Select status" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="active">Active</SelectItem>
                                  <SelectItem value="inactive">Inactive</SelectItem>
                                  <SelectItem value="prospect">Prospect</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={clientForm.control}
                          name="parentClientId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Parent Client</FormLabel>
                              <Select 
                                onValueChange={(value) => field.onChange(value === "none" ? null : value)} 
                                value={field.value || "none"}
                              >
                                <FormControl>
                                  <SelectTrigger data-testid="select-parent-client">
                                    <SelectValue placeholder="No parent (top-level client)" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="none">No parent (top-level client)</SelectItem>
                                  {allClients
                                    .filter(c => c.id !== clientId)
                                    .map((c) => (
                                      <SelectItem key={c.id} value={c.id}>
                                        {c.companyName}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={clientForm.control}
                        name="description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Description</FormLabel>
                            <FormControl>
                              <Textarea {...field} placeholder="Brief description of the company" rows={3} data-testid="input-description" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={clientForm.control}
                        name="tags"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex items-center gap-1.5">
                              <Tag className="h-3.5 w-3.5" />
                              Tags
                            </FormLabel>
                            <div className="space-y-2">
                              {(field.value || []).length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {(field.value || []).map((tag, idx) => (
                                    <Badge key={`${tag}-${idx}`} variant="secondary" className="gap-1">
                                      {tag}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const updated = (field.value || []).filter((_, i) => i !== idx);
                                          field.onChange(updated);
                                        }}
                                        className="ml-0.5 rounded-full"
                                        data-testid={`button-remove-tag-${idx}`}
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </Badge>
                                  ))}
                                </div>
                              )}
                              <FormControl>
                                <Input
                                  placeholder="Type a tag and press Enter"
                                  data-testid="input-client-tag"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      const input = e.currentTarget;
                                      const val = input.value.trim();
                                      if (val && !(field.value || []).includes(val)) {
                                        field.onChange([...(field.value || []), val]);
                                        input.value = "";
                                      }
                                    }
                                  }}
                                />
                              </FormControl>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Quick Stats</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="text-center p-4 bg-muted/50 rounded-lg">
                        <p className="text-2xl font-semibold">{client.projects?.length || 0}</p>
                        <p className="text-xs text-muted-foreground">Projects</p>
                      </div>
                      <div className="text-center p-4 bg-muted/50 rounded-lg">
                        <p className="text-2xl font-semibold">{client.contacts?.length || 0}</p>
                        <p className="text-xs text-muted-foreground">Contacts</p>
                      </div>
                      <div className="text-center p-4 bg-muted/50 rounded-lg">
                        <p className="text-2xl font-semibold">{divisions.length + childClients.length}</p>
                        <p className="text-xs text-muted-foreground">Divisions</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        Physical Address
                      </CardTitle>
                      <CardDescription>Primary company location</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={clientForm.control}
                        name="addressLine1"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Address Line 1</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Street address" data-testid="input-address-1" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={clientForm.control}
                        name="addressLine2"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Address Line 2</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Suite, floor, etc." data-testid="input-address-2" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={clientForm.control}
                          name="city"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>City</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="City" data-testid="input-city" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={clientForm.control}
                          name="state"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>State / Province</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="State" data-testid="input-state" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={clientForm.control}
                          name="postalCode"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Postal Code</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="ZIP / Postal code" data-testid="input-postal-code" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={clientForm.control}
                          name="country"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Country</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Country" data-testid="input-country" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <User className="h-4 w-4" />
                        Primary Contact
                      </CardTitle>
                      <CardDescription>Main point of contact at this company</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={clientForm.control}
                        name="primaryContactName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Contact Name</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Full name" data-testid="input-primary-contact-name" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={clientForm.control}
                        name="primaryContactEmail"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Contact Email</FormLabel>
                            <FormControl>
                              <Input {...field} type="email" placeholder="email@example.com" data-testid="input-primary-contact-email" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={clientForm.control}
                        name="primaryContactPhone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Contact Phone</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="+1 (555) 000-0000" data-testid="input-primary-contact-phone" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={clientForm.control}
                          name="phone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Company Phone</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Main phone" data-testid="input-phone" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={clientForm.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Company Email</FormLabel>
                              <FormControl>
                                <Input {...field} type="email" placeholder="General email" data-testid="input-email" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          Mailing Address
                        </CardTitle>
                        <CardDescription>Separate mailing address if different from physical location</CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="mailing-same"
                          checked={mailingSameAsPhysical}
                          onCheckedChange={(checked) => {
                            setMailingSameAsPhysical(!!checked);
                            if (checked) {
                              clientForm.setValue("mailingAddressLine1", "", { shouldDirty: true });
                              clientForm.setValue("mailingAddressLine2", "", { shouldDirty: true });
                              clientForm.setValue("mailingCity", "", { shouldDirty: true });
                              clientForm.setValue("mailingState", "", { shouldDirty: true });
                              clientForm.setValue("mailingPostalCode", "", { shouldDirty: true });
                              clientForm.setValue("mailingCountry", "", { shouldDirty: true });
                            }
                          }}
                          data-testid="checkbox-mailing-same"
                        />
                        <label htmlFor="mailing-same" className="text-sm text-muted-foreground cursor-pointer select-none">
                          Same as physical address
                        </label>
                      </div>
                    </div>
                  </CardHeader>
                  {!mailingSameAsPhysical && (
                    <CardContent className="space-y-4">
                      <FormField
                        control={clientForm.control}
                        name="mailingAddressLine1"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Address Line 1</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Mailing street address" data-testid="input-mailing-address-1" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={clientForm.control}
                        name="mailingAddressLine2"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Address Line 2</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Suite, P.O. Box, etc." data-testid="input-mailing-address-2" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={clientForm.control}
                          name="mailingCity"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>City</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="City" data-testid="input-mailing-city" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={clientForm.control}
                          name="mailingState"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>State / Province</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="State" data-testid="input-mailing-state" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={clientForm.control}
                          name="mailingPostalCode"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Postal Code</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="ZIP / Postal code" data-testid="input-mailing-postal-code" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={clientForm.control}
                          name="mailingCountry"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Country</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Country" data-testid="input-mailing-country" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </CardContent>
                  )}
                </Card>

                {(divisions.length > 0 || childClients.length > 0) && (
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-2">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Layers className="h-4 w-4" />
                          Divisions
                        </CardTitle>
                        <CardDescription>Subsidiary companies and organizational divisions</CardDescription>
                      </div>
                      <Badge variant="secondary">{divisions.length + childClients.length}</Badge>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {childClients.map((child) => (
                          <Card
                            key={`child-${child.id}`}
                            className="hover-elevate cursor-pointer"
                            onClick={() => navigate(`/clients/${child.id}`)}
                            data-testid={`subsidiary-card-${child.id}`}
                          >
                            <CardContent className="p-4">
                              <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8">
                                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                    {child.companyName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium truncate">{child.companyName}</p>
                                  <p className="text-xs text-muted-foreground">Subsidiary company</p>
                                </div>
                                <Badge className="shrink-0">{child.status}</Badge>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                        {divisions.map((division) => (
                          <Card
                            key={division.id}
                            className="hover-elevate cursor-pointer"
                            onClick={() => {
                              setEditingDivision(division);
                              setDivisionMode("edit");
                              setDivisionDrawerOpen(true);
                            }}
                            data-testid={`division-card-${division.id}`}
                          >
                            <CardContent className="p-4">
                              <div className="flex items-center gap-3">
                                <div
                                  className="h-3 w-3 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: division.color || "#3B82F6" }}
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium truncate">{division.name}</p>
                                  {division.description && (
                                    <p className="text-xs text-muted-foreground truncate">{division.description}</p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Users className="h-3 w-3" />
                                  {division.memberCount} members
                                </span>
                                <span className="flex items-center gap-1">
                                  <FolderKanban className="h-3 w-3" />
                                  {division.projectCount} projects
                                </span>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </form>
            </Form>
          </TabsContent>

          <TabsContent value="contacts" className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium">Contacts</h2>
              <Dialog open={addContactOpen} onOpenChange={setAddContactOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-add-contact">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Contact
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Contact</DialogTitle>
                  </DialogHeader>
                  <Form {...contactForm}>
                    <form onSubmit={contactForm.handleSubmit(handleCreateContact)} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={contactForm.control}
                          name="firstName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>First Name *</FormLabel>
                              <FormControl>
                                <Input {...field} data-testid="input-contact-first-name" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={contactForm.control}
                          name="lastName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Last Name</FormLabel>
                              <FormControl>
                                <Input {...field} data-testid="input-contact-last-name" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={contactForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input type="email" {...field} data-testid="input-contact-email" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={contactForm.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Phone</FormLabel>
                            <FormControl>
                              <Input {...field} data-testid="input-contact-phone" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={contactForm.control}
                        name="title"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Job Title</FormLabel>
                            <FormControl>
                              <Input {...field} data-testid="input-contact-title" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex justify-end gap-2 pt-4">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setAddContactOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          disabled={createContactMutation.isPending}
                          data-testid="button-save-contact"
                        >
                          {createContactMutation.isPending ? "Adding..." : "Add Contact"}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>

            {client.contacts && client.contacts.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {client.contacts.map((contact) => (
                  <Card key={contact.id} data-testid={`card-contact-${contact.id}`}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className="bg-muted text-muted-foreground">
                              {contact.firstName?.[0]}{contact.lastName?.[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">
                              {contact.firstName} {contact.lastName}
                              {contact.isPrimary && (
                                <Badge variant="outline" className="ml-2 text-xs">Primary</Badge>
                              )}
                            </p>
                            {contact.title && (
                              <p className="text-xs text-muted-foreground">{contact.title}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => {
                              setEditingContact(contact);
                              setEditContactOpen(true);
                            }}
                            aria-label="Edit contact"
                            data-testid={`button-edit-contact-${contact.id}`}
                          >
                            <Pencil className="h-4 w-4 text-muted-foreground" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => deleteContactMutation.mutate(contact.id)}
                            aria-label="Delete contact"
                            data-testid={`button-delete-contact-${contact.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                      <div className="mt-3 space-y-2">
                        {contact.email && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Mail className="h-3.5 w-3.5" />
                            <a href={`mailto:${contact.email}`} className="hover:text-foreground">
                              {contact.email}
                            </a>
                          </div>
                        )}
                        {contact.phone && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Phone className="h-3.5 w-3.5" />
                            <span>{contact.phone}</span>
                          </div>
                        )}
                        {contact.email && portalUsersLoaded && !portalUsers.some((pu: any) => pu.user?.email === contact.email) && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2"
                            onClick={() => setPortalInviteContact(contact)}
                            data-testid={`button-invite-portal-${contact.id}`}
                          >
                            <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                            Invite to Portal
                          </Button>
                        )}
                        {contact.email && portalUsersLoaded && portalUsers.some((pu: any) => pu.user?.email === contact.email) && (
                          <Badge variant="secondary" className="mt-2">
                            Portal User
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <User className="h-12 w-12 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground mb-4">No contacts added yet</p>
                <Button onClick={() => setAddContactOpen(true)} variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Contact
                </Button>
              </div>
            )}

            <Dialog
              open={!!portalInviteContact}
              onOpenChange={(open) => { if (!open) setPortalInviteContact(null); }}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invite to Client Portal</DialogTitle>
                </DialogHeader>
                {portalInviteContact && (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Send a portal invitation to <span className="font-medium text-foreground">{portalInviteContact.firstName} {portalInviteContact.lastName}</span> at{" "}
                      <span className="font-medium text-foreground">{portalInviteContact.email}</span>?
                    </p>
                    <p className="text-sm text-muted-foreground">
                      They will receive an email with a link to set up their portal account and will be able to view project updates, approve deliverables, and communicate with your team.
                    </p>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setPortalInviteContact(null)} data-testid="button-cancel-invite">
                        Cancel
                      </Button>
                      <Button
                        onClick={() => portalInviteMutation.mutate(portalInviteContact)}
                        disabled={portalInviteMutation.isPending}
                        data-testid="button-confirm-invite"
                      >
                        {portalInviteMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          <>
                            <Send className="h-4 w-4 mr-2" />
                            Send Invitation
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>

            <Dialog 
              open={editContactOpen} 
              onOpenChange={(open) => {
                setEditContactOpen(open);
                if (!open) setEditingContact(null);
              }}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit Contact</DialogTitle>
                </DialogHeader>
                {editingContact && (
                  <EditContactForm 
                    key={editingContact.id}
                    contact={editingContact}
                    onSubmit={(data) => updateContactMutation.mutate({ contactId: editingContact.id, data })}
                    onCancel={() => {
                      setEditContactOpen(false);
                      setEditingContact(null);
                    }}
                    isPending={updateContactMutation.isPending}
                  />
                )}
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="projects" className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium">Projects</h2>
              <Button onClick={() => setAddProjectOpen(true)} data-testid="button-add-project">
                <Plus className="h-4 w-4 mr-2" />
                Add New Project
              </Button>
            </div>

            {client.projects && client.projects.length > 0 ? (
              (() => {
                const activeProjects = client.projects.filter((p: any) => p.status !== "archived");
                const archivedProjects = client.projects.filter((p: any) => p.status === "archived");
                return (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <h3 className="text-sm font-medium">Active Projects</h3>
                        <Badge variant="secondary" className="text-xs">{activeProjects.length}</Badge>
                      </div>
                      {activeProjects.length > 0 ? (
                        <div className="space-y-3">
                          {activeProjects.map((project: any) => (
                            <Link key={project.id} href={`/projects/${project.id}`}>
                              <Card className="cursor-pointer hover-elevate" data-testid={`card-project-${project.id}`}>
                                <CardHeader className="pb-2">
                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <div className="flex items-center gap-2">
                                      <div
                                        className="h-3 w-3 rounded-sm shrink-0"
                                        style={{ backgroundColor: project.color || "#3B82F6" }}
                                      />
                                      <CardTitle className="text-base">{project.name}</CardTitle>
                                    </div>
                                    <Badge variant="outline" className="text-xs capitalize shrink-0">{project.status || "active"}</Badge>
                                  </div>
                                </CardHeader>
                                <CardContent>
                                  {project.description && (
                                    <p className="text-sm text-muted-foreground line-clamp-2">
                                      {getPreviewText(project.description)}
                                    </p>
                                  )}
                                </CardContent>
                              </Card>
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-8 text-center border border-dashed rounded-md">
                          <FolderKanban className="h-8 w-8 text-muted-foreground/50 mb-2" />
                          <p className="text-sm text-muted-foreground">No active projects</p>
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <h3 className="text-sm font-medium text-muted-foreground">Archived Projects</h3>
                        <Badge variant="secondary" className="text-xs">{archivedProjects.length}</Badge>
                      </div>
                      {archivedProjects.length > 0 ? (
                        <div className="space-y-3">
                          {archivedProjects.map((project: any) => (
                            <Link key={project.id} href={`/projects/${project.id}`}>
                              <Card className="cursor-pointer hover-elevate opacity-75" data-testid={`card-project-${project.id}`}>
                                <CardHeader className="pb-2">
                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <div className="flex items-center gap-2">
                                      <div
                                        className="h-3 w-3 rounded-sm shrink-0"
                                        style={{ backgroundColor: project.color || "#3B82F6" }}
                                      />
                                      <CardTitle className="text-base">{project.name}</CardTitle>
                                    </div>
                                    <Badge variant="outline" className="text-xs capitalize shrink-0">archived</Badge>
                                  </div>
                                </CardHeader>
                                <CardContent>
                                  {project.description && (
                                    <p className="text-sm text-muted-foreground line-clamp-2">
                                      {getPreviewText(project.description)}
                                    </p>
                                  )}
                                </CardContent>
                              </Card>
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-8 text-center border border-dashed rounded-md">
                          <FolderKanban className="h-8 w-8 text-muted-foreground/50 mb-2" />
                          <p className="text-sm text-muted-foreground">No archived projects</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FolderKanban className="h-12 w-12 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground mb-4">No projects linked to this client</p>
                <Button onClick={() => setAddProjectOpen(true)} variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Project
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="divisions" className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium">Divisions</h2>
              <Button
                onClick={() => {
                  setEditingDivision(null);
                  setDivisionMode("create");
                  setDivisionDrawerOpen(true);
                }}
                data-testid="button-add-division"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Division
              </Button>
            </div>

            {childClients.length > 0 && (
              <div className="mb-6">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Subsidiary Companies ({childClients.length})
                </p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {childClients.map((child) => (
                    <Card
                      key={`child-${child.id}`}
                      className="cursor-pointer hover-elevate"
                      onClick={() => navigate(`/clients/${child.id}`)}
                      data-testid={`card-subsidiary-${child.id}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-primary/10 text-primary text-xs">
                              {child.companyName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate" data-testid={`text-subsidiary-name-${child.id}`}>
                              {child.companyName}
                            </p>
                            <p className="text-xs text-muted-foreground">Subsidiary company</p>
                          </div>
                          <Badge className="shrink-0">{child.status}</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {divisions.length > 0 && (
              <div>
                {childClients.length > 0 && (
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                    Organizational Divisions ({divisions.length})
                  </p>
                )}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {divisions.map((division) => (
                    <Card
                      key={division.id}
                      className="cursor-pointer hover-elevate"
                      onClick={() => {
                        setEditingDivision(division);
                        setDivisionMode("edit");
                        setDivisionDrawerOpen(true);
                      }}
                      data-testid={`card-division-${division.id}`}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div
                              className="h-3 w-3 rounded-sm shrink-0"
                              style={{ backgroundColor: division.color || "#3B82F6" }}
                            />
                            <CardTitle className="text-base truncate">{division.name}</CardTitle>
                          </div>
                          {!division.isActive && (
                            <Badge variant="outline" className="shrink-0">Inactive</Badge>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        {division.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                            {division.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" />
                            <span>{division.memberCount} members</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <FolderKanban className="h-3.5 w-3.5" />
                            <span>{division.projectCount} projects</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {divisions.length === 0 && childClients.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Layers className="h-12 w-12 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground mb-4">No divisions created yet</p>
                <p className="text-xs text-muted-foreground mb-4 max-w-md">
                  Divisions help you organize teams and projects within this client for better access control.
                </p>
                <Button
                  onClick={() => {
                    setEditingDivision(null);
                    setDivisionMode("create");
                    setDivisionDrawerOpen(true);
                  }}
                  variant="outline"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Division
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="portal" className="p-6">
            <ClientPortalUsersTab clientId={clientId || ""} />
          </TabsContent>

          <TabsContent value="activity" className="p-6">
            <ActivityTab clientId={clientId || ""} />
          </TabsContent>

          <TabsContent value="notes" className="p-6">
            {crmFlags.client360 ? (
              <Crm360NotesTab clientId={clientId || ""} />
            ) : (
              <ClientNotesTab clientId={clientId || ""} />
            )}
          </TabsContent>

          <TabsContent value="documents" className="p-6">
            <ClientDocumentsPanel clientId={clientId || ""} />
          </TabsContent>

          {crmFlags.client360 && (
            <TabsContent value="reports" className="p-6">
              <ClientReportsTab clientId={clientId || ""} />
            </TabsContent>
          )}

          {crmFlags.approvals && (
            <TabsContent value="approvals" className="p-6">
              <ApprovalsTab clientId={clientId || ""} />
            </TabsContent>
          )}

          {crmFlags.clientMessaging && (
            <TabsContent value="messages" className="p-6">
              <MessagesTab clientId={clientId || ""} />
            </TabsContent>
          )}

          {featureFlags.assetLibraryV2 && (
            <TabsContent value="asset-library" className="p-6 h-[calc(100%-3rem)]">
              <AssetLibraryPanel clientId={clientId || ""} />
            </TabsContent>
          )}
        </Tabs>
      </div>

      <DivisionDrawer
        open={divisionDrawerOpen}
        onOpenChange={setDivisionDrawerOpen}
        clientId={clientId || ""}
        division={editingDivision}
        mode={divisionMode}
      />

      <Sheet open={addProjectOpen} onOpenChange={handleCloseProjectSheet}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>
              {projectView === "options" && "Add Project"}
              {projectView === "create" && "Start a New Project"}
              {projectView === "assign" && "Assign Existing Project"}
            </SheetTitle>
            <SheetDescription>
              {projectView === "options" && "Create a new project or assign an existing one to this client."}
              {projectView === "create" && "Create a new project that will be automatically linked to this client."}
              {projectView === "assign" && "Select an unassigned project to link to this client."}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6">
            {projectView === "options" && (
              <div className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full justify-start h-auto p-4"
                  onClick={() => setProjectView("create")}
                  data-testid="button-create-new-project"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium">Start a New Project</p>
                      <p className="text-xs text-muted-foreground">
                        Create a fresh project for this client
                      </p>
                    </div>
                  </div>
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start h-auto p-4"
                  onClick={() => setProjectView("assign")}
                  data-testid="button-assign-existing-project"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center shrink-0">
                      <LinkIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium">Assign an Existing Project</p>
                      <p className="text-xs text-muted-foreground">
                        Link an unassigned project to this client
                      </p>
                    </div>
                  </div>
                </Button>
              </div>
            )}

            {projectView === "create" && (
              <Form {...projectForm}>
                <form onSubmit={projectForm.handleSubmit(handleCreateProject)} className="space-y-4">
                  <FormField
                    control={projectForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project Name *</FormLabel>
                        <FormControl>
                          <Input placeholder="Website Redesign" {...field} data-testid="input-project-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={projectForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Brief description of the project" 
                            {...field} 
                            data-testid="input-project-description" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={projectForm.control}
                    name="color"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Color</FormLabel>
                        <FormControl>
                          <div className="flex gap-2">
                            {["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"].map((color) => (
                              <button
                                key={color}
                                type="button"
                                className={`h-8 w-8 rounded-md border-2 ${field.value === color ? "border-foreground" : "border-transparent"}`}
                                style={{ backgroundColor: color }}
                                onClick={() => field.onChange(color)}
                                data-testid={`button-color-${color.slice(1)}`}
                              />
                            ))}
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex justify-between pt-4">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setProjectView("options")}
                    >
                      Back
                    </Button>
                    <Button
                      type="submit"
                      disabled={createProjectMutation.isPending}
                      data-testid="button-submit-create-project"
                    >
                      {createProjectMutation.isPending ? "Creating..." : "Create Project"}
                    </Button>
                  </div>
                </form>
              </Form>
            )}

            {projectView === "assign" && (
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search projects..."
                    value={projectSearchQuery}
                    onChange={(e) => setProjectSearchQuery(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-unassigned-projects"
                  />
                </div>

                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {filteredUnassignedProjects.length > 0 ? (
                    filteredUnassignedProjects.map((project) => (
                      <div
                        key={project.id}
                        className="flex items-center justify-between p-3 rounded-lg border hover-elevate cursor-pointer"
                        onClick={() => handleAssignProject(project.id)}
                        data-testid={`button-assign-project-${project.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="h-3 w-3 rounded-sm"
                            style={{ backgroundColor: project.color || "#3B82F6" }}
                          />
                          <div>
                            <p className="font-medium text-sm">{project.name}</p>
                            {project.description && (
                              <p className="text-xs text-muted-foreground line-clamp-1">
                                {getPreviewText(project.description)}
                              </p>
                            )}
                          </div>
                        </div>
                        <Plus className="h-4 w-4 text-muted-foreground" />
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8">
                      <FolderKanban className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        {projectSearchQuery ? "No matching projects found" : "No unassigned projects available"}
                      </p>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setProjectView("options")}
                  >
                    Back
                  </Button>
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <StartTimerDrawer
        open={timerDrawerOpen}
        onOpenChange={setTimerDrawerOpen}
        initialClientId={clientId}
      />
    </div>
  );
}
