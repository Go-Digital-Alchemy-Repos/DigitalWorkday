import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCrmFlags } from "@/hooks/use-crm-flags";
import { formatErrorForToast } from "@/lib/parseApiError";
import { formatDistanceToNow, format } from "date-fns";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  EmptyState,
  LoadingState,
} from "@/components/layout";
import { DataToolbar } from "@/components/layout/data-toolbar";
import {
  FolderKanban,
  Users,
  StickyNote,
  Activity,
  Plus,
  Mail,
  Phone,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Star,
  MoreHorizontal,
  Pencil,
  Trash2,
  Send,
  Upload,
  MessageSquare,
  Loader2,
  User,
  Target,
  UserPlus,
  ArrowLeft,
} from "lucide-react";
import { ClipboardCheck, UserCheck, Eye, EyeOff, AlertTriangle, ShieldAlert, SlidersHorizontal, X, Search, XCircle, RotateCcw, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RichTextEditor, RichTextViewer } from "@/components/ui/rich-text-editor";
import { RequestApprovalDialog } from "@/components/request-approval-dialog";
import { useAuth } from "@/lib/auth";

export interface CrmSummary {
  client: {
    id: string;
    companyName: string;
    displayName: string | null;
    email: string | null;
    phone: string | null;
    status: string;
    industry: string | null;
  };
  crm: {
    clientId: string;
    tenantId: string;
    status: string;
    ownerUserId: string | null;
    tags: string[] | null;
    lastContactAt: string | null;
    nextFollowUpAt: string | null;
    followUpNotes: string | null;
  } | null;
  ownerName?: string | null;
  counts: {
    projects: number;
    openTasks: number;
    totalHours: number;
    billableHours: number;
  };
}

export interface CrmContact {
  id: string;
  clientId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  isPrimary: boolean;
  notes: string | null;
  createdAt: string;
}

export interface CrmNote {
  id: string;
  clientId: string;
  body: any;
  category: string;
  authorUserId: string;
  authorName: string | null;
  authorEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

export const contactFormSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  title: z.string().optional(),
  isPrimary: z.boolean().default(false),
  notes: z.string().optional(),
});

export type ContactFormValues = z.infer<typeof contactFormSchema>;

export const CRM_STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  lead: { label: "Lead", variant: "outline" },
  prospect: { label: "Prospect", variant: "secondary" },
  active: { label: "Active", variant: "default" },
  past: { label: "Past", variant: "outline" },
  on_hold: { label: "On Hold", variant: "secondary" },
};

export function CrmOverviewSection({ clientId, summary, isLoading, onNavigateTab, onUpdate }: { clientId: string; summary?: CrmSummary; isLoading: boolean; onNavigateTab?: (tab: string) => void; onUpdate?: () => void }) {
  const { toast } = useToast();
  const crmFlags = useCrmFlags();
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });

  const updateOwnerMutation = useMutation({
    mutationFn: async (ownerUserId: string | null) => {
      await apiRequest("PATCH", `/api/crm/clients/${clientId}/crm`, {
        ownerUserId: ownerUserId === "__unassigned__" ? null : ownerUserId,
      });
    },
    onSuccess: () => {
      toast({ title: "Project Manager updated", description: "The client project manager has been updated successfully." });
      queryClient.invalidateQueries({ queryKey: [`/api/crm/clients/${clientId}/summary`] });
      if (onUpdate) onUpdate();
    },
    onError: (error: any) => {
      const { title, description } = formatErrorForToast(error);
      toast({ title, description, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (!summary) return null;

  const crmStatus = summary.crm?.status || "none";
  const statusInfo = CRM_STATUS_MAP[crmStatus];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card data-testid="card-crm-status">
          <CardContent className="pt-5 pb-4 px-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1 rounded-md bg-indigo-500/10">
                <Target className="h-4 w-4 text-indigo-500" />
              </div>
              <span className="text-sm text-muted-foreground">Pipeline Status</span>
            </div>
            {statusInfo ? (
              <Badge variant={statusInfo.variant} data-testid="badge-crm-status">{statusInfo.label}</Badge>
            ) : (
              <span className="text-sm text-muted-foreground" data-testid="text-crm-status-none">Not set</span>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-crm-pm">
          <CardContent className="pt-5 pb-4 px-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-md bg-emerald-500/10">
                  <User className="h-4 w-4 text-emerald-500" />
                </div>
                <span className="text-sm text-muted-foreground">Project Manager</span>
              </div>
              <Select
                value={summary.crm?.ownerUserId || "__unassigned__"}
                onValueChange={(val) => updateOwnerMutation.mutate(val)}
                disabled={updateOwnerMutation.isPending}
              >
                <SelectTrigger className="h-7 w-[130px] text-xs" data-testid="select-crm-pm">
                  <SelectValue placeholder="Select PM" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassigned__">Unassigned</SelectItem>
                  {users.map((user: any) => (
                    <SelectItem key={user.id} value={user.id.toString()}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <span className="text-sm font-medium" data-testid="text-crm-pm">
              {summary.ownerName || "Unassigned"}
            </span>
          </CardContent>
        </Card>

        <Card data-testid="card-crm-followup">
          <CardContent className="pt-5 pb-4 px-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1 rounded-md bg-amber-500/10">
                <Calendar className="h-4 w-4 text-amber-500" />
              </div>
              <span className="text-sm text-muted-foreground">Next Follow-up</span>
            </div>
            <span className="text-sm font-medium" data-testid="text-crm-followup">
              {summary.crm?.nextFollowUpAt
                ? format(new Date(summary.crm.nextFollowUpAt), "MMM d, yyyy")
                : "Not scheduled"}
            </span>
          </CardContent>
        </Card>

        <Card data-testid="card-open-projects">
          <CardContent className="pt-5 pb-4 px-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1 rounded-md bg-purple-500/10">
                <FolderKanban className="h-4 w-4 text-purple-500" />
              </div>
              <span className="text-sm text-muted-foreground">Open Projects</span>
            </div>
            <span className="text-2xl font-semibold" data-testid="text-open-projects">{summary.counts.projects}</span>
          </CardContent>
        </Card>

        <Card data-testid="card-open-tasks">
          <CardContent className="pt-5 pb-4 px-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1 rounded-md bg-blue-500/10">
                <CheckCircle2 className="h-4 w-4 text-blue-500" />
              </div>
              <span className="text-sm text-muted-foreground">Open Tasks</span>
            </div>
            <span className="text-2xl font-semibold" data-testid="text-open-tasks">{summary.counts.openTasks}</span>
          </CardContent>
        </Card>

        <Card data-testid="card-hours-tracked">
          <CardContent className="pt-5 pb-4 px-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1 rounded-md bg-rose-500/10">
                <Clock className="h-4 w-4 text-rose-500" />
              </div>
              <span className="text-sm text-muted-foreground">Hours Tracked</span>
            </div>
            <div data-testid="text-hours-tracked">
              <span className="text-2xl font-semibold">{summary.counts.totalHours.toFixed(1)}</span>
              {summary.counts.billableHours > 0 && (
                <span className="text-xs text-muted-foreground ml-1">
                  ({summary.counts.billableHours.toFixed(1)} billable)
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="bg-muted/30 rounded-lg p-4 border border-border/50">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-1">Quick Actions</h3>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => onNavigateTab?.("projects")} data-testid="button-quick-add-project" className="bg-background hover:bg-muted">
            <FolderKanban className="h-4 w-4 mr-2 text-purple-500" />
            Add Project
          </Button>
          <Button variant="outline" size="sm" onClick={() => onNavigateTab?.("contacts")} data-testid="button-quick-add-contact" className="bg-background hover:bg-muted">
            <Users className="h-4 w-4 mr-2 text-emerald-500" />
            Add Contact
          </Button>
          <Button variant="outline" size="sm" onClick={() => onNavigateTab?.("notes")} data-testid="button-quick-add-note" className="bg-background hover:bg-muted">
            <StickyNote className="h-4 w-4 mr-2 text-amber-500" />
            Add Note
          </Button>
          {crmFlags.clientMessaging && (
            <Button variant="outline" size="sm" onClick={() => onNavigateTab?.("messages")} data-testid="button-quick-message-client" className="bg-background hover:bg-muted">
              <MessageSquare className="h-4 w-4 mr-2 text-violet-500" />
              Message Client
            </Button>
          )}
          {crmFlags.files && (
            <Button variant="outline" size="sm" data-testid="button-quick-upload-file" className="bg-background hover:bg-muted">
              <Upload className="h-4 w-4 mr-2 text-cyan-500" />
              Upload File
            </Button>
          )}
          {crmFlags.approvals && (
            <Button variant="outline" size="sm" onClick={() => setShowApprovalDialog(true)} data-testid="button-quick-request-approval" className="bg-background hover:bg-muted">
              <ClipboardCheck className="h-4 w-4 mr-2 text-blue-500" />
              Request Approval
            </Button>
          )}
          {crmFlags.portal && (
            <Link href={`/clients/${clientId}`}>
              <Button variant="outline" size="sm" data-testid="button-quick-invite-client" className="bg-background hover:bg-muted">
                <UserPlus className="h-4 w-4 mr-2 text-orange-500" />
                Invite to Portal
              </Button>
            </Link>
          )}
        </div>
      </div>

      {showApprovalDialog && (
        <RequestApprovalDialog
          open={showApprovalDialog}
          onOpenChange={setShowApprovalDialog}
          clientId={clientId}
        />
      )}

      {summary.crm?.followUpNotes && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Follow-up Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground" data-testid="text-followup-notes">{summary.crm.followUpNotes}</p>
          </CardContent>
        </Card>
      )}

      {summary.crm?.tags && summary.crm.tags.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tags</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2" data-testid="container-crm-tags">
              {summary.crm.tags.map((tag) => (
                <Badge key={tag} variant="secondary">{tag}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function ContactsTab({ clientId }: { clientId: string }) {
  const { toast } = useToast();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<CrmContact | null>(null);
  const [deleteContactId, setDeleteContactId] = useState<string | null>(null);
  const [contactSearch, setContactSearch] = useState("");

  const { data: contacts = [], isLoading } = useQuery<CrmContact[]>({
    queryKey: [`/api/crm/clients/${clientId}/contacts`],
    enabled: !!clientId,
  });

  const filteredContacts = useMemo(() => {
    if (!contactSearch) return contacts;
    const q = contactSearch.toLowerCase();
    return contacts.filter((c) =>
      [c.firstName, c.lastName, c.email, c.phone, c.title]
        .filter(Boolean)
        .some((f) => f!.toLowerCase().includes(q))
    );
  }, [contacts, contactSearch]);

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
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

  const createContactMutation = useMutation({
    mutationFn: async (data: ContactFormValues) => {
      return apiRequest("POST", `/api/crm/clients/${clientId}/contacts`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/crm/clients/${clientId}/contacts`] });
      queryClient.invalidateQueries({ queryKey: [`/api/crm/clients/${clientId}/summary`] });
      setDrawerOpen(false);
      setEditingContact(null);
      form.reset();
      toast({ title: "Contact created" });
    },
    onError: (error) => {
      toast(formatErrorForToast(error));
    },
  });

  const updateContactMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ContactFormValues> }) => {
      return apiRequest("PATCH", `/api/crm/contacts/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/crm/clients/${clientId}/contacts`] });
      setDrawerOpen(false);
      setEditingContact(null);
      form.reset();
      toast({ title: "Contact updated" });
    },
    onError: (error) => {
      toast(formatErrorForToast(error));
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/crm/contacts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/crm/clients/${clientId}/contacts`] });
      queryClient.invalidateQueries({ queryKey: [`/api/crm/clients/${clientId}/summary`] });
      setDeleteContactId(null);
      toast({ title: "Contact deleted" });
    },
    onError: (error) => {
      toast(formatErrorForToast(error));
    },
  });

  const markPrimaryMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("PATCH", `/api/crm/contacts/${id}`, { isPrimary: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/crm/clients/${clientId}/contacts`] });
      toast({ title: "Primary contact updated" });
    },
    onError: (error) => {
      toast(formatErrorForToast(error));
    },
  });

  function openEditDrawer(contact: CrmContact) {
    setEditingContact(contact);
    form.reset({
      firstName: contact.firstName || "",
      lastName: contact.lastName || "",
      email: contact.email || "",
      phone: contact.phone || "",
      title: contact.title || "",
      isPrimary: contact.isPrimary || false,
      notes: contact.notes || "",
    });
    setDrawerOpen(true);
  }

  function openCreateDrawer() {
    setEditingContact(null);
    form.reset({
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      title: "",
      isPrimary: false,
      notes: "",
    });
    setDrawerOpen(true);
  }

  function handleSubmit(data: ContactFormValues) {
    if (editingContact) {
      updateContactMutation.mutate({ id: editingContact.id, data });
    } else {
      createContactMutation.mutate(data);
    }
  }

  if (isLoading) {
    return <LoadingState type="list" rows={3} />;
  }

  const isPending = createContactMutation.isPending || updateContactMutation.isPending;

  return (
    <div className="space-y-4">
      <DataToolbar
        searchValue={contactSearch}
        onSearchChange={setContactSearch}
        searchPlaceholder="Search contacts..."
        actions={
          <Button size="sm" onClick={openCreateDrawer} data-testid="button-add-contact-360">
            <Plus className="h-4 w-4 mr-2" />
            Add Contact
          </Button>
        }
      />

      {contacts.length === 0 ? (
        <EmptyState
          icon={<Users className="h-10 w-10" />}
          title="No contacts yet"
          description="Add contacts to keep track of key people at this client."
          action={
            <Button size="sm" onClick={openCreateDrawer} data-testid="button-add-first-contact-360">
              <Plus className="h-4 w-4 mr-2" />
              Add Contact
            </Button>
          }
          size="sm"
        />
      ) : filteredContacts.length === 0 ? (
        <EmptyState
          icon={<Users className="h-10 w-10" />}
          title="No matching contacts"
          description="Try a different search term."
          size="sm"
        />
      ) : (
        <div className="space-y-2">
          {filteredContacts.map((contact) => (
            <Card key={contact.id} data-testid={`card-contact-${contact.id}`}>
              <CardContent className="py-4 px-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarFallback className="text-xs">
                        {(contact.firstName?.[0] || "").toUpperCase()}{(contact.lastName?.[0] || "").toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium" data-testid={`text-contact-name-${contact.id}`}>
                          {[contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Unnamed"}
                        </span>
                        {contact.isPrimary && (
                          <Badge variant="default" className="bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border-amber-500/20 text-xs" data-testid={`badge-primary-${contact.id}`}>
                            <Star className="h-3 w-3 mr-1 fill-current" />
                            Primary
                          </Badge>
                        )}
                      </div>
                      {contact.title && (
                        <p className="text-xs text-muted-foreground">{contact.title}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        {contact.email && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {contact.email}
                          </span>
                        )}
                        {contact.phone && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {contact.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="Contact options" data-testid={`button-contact-menu-${contact.id}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditDrawer(contact)} data-testid={`button-edit-contact-${contact.id}`}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      {!contact.isPrimary && (
                        <DropdownMenuItem onClick={() => markPrimaryMutation.mutate(contact.id)} data-testid={`button-mark-primary-${contact.id}`}>
                          <Star className="h-4 w-4 mr-2" />
                          Mark as Primary
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setDeleteContactId(contact.id)}
                        data-testid={`button-delete-contact-${contact.id}`}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Sheet open={drawerOpen} onOpenChange={(open) => { if (!open) { setDrawerOpen(false); setEditingContact(null); } }}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingContact ? "Edit Contact" : "Add Contact"}</SheetTitle>
            <SheetDescription>
              {editingContact ? "Update contact details." : "Add a new contact for this client."}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name *</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-360-contact-first-name" />
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
                          <Input {...field} data-testid="input-360-contact-last-name" />
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
                        <Input type="email" {...field} data-testid="input-360-contact-email" />
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
                        <Input {...field} data-testid="input-360-contact-phone" />
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
                        <Input {...field} data-testid="input-360-contact-title" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={3} data-testid="input-360-contact-notes" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="isPrimary"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2">
                      <FormControl>
                        <input
                          type="checkbox"
                          checked={field.value}
                          onChange={field.onChange}
                          className="h-4 w-4 rounded border-border"
                          data-testid="checkbox-360-contact-primary"
                        />
                      </FormControl>
                      <FormLabel className="!mt-0">Primary Contact</FormLabel>
                    </FormItem>
                  )}
                />
                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => { setDrawerOpen(false); setEditingContact(null); }}
                    data-testid="button-cancel-contact-360"
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isPending} data-testid="button-save-contact-360">
                    {isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      editingContact ? "Save Changes" : "Add Contact"
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteContactId} onOpenChange={(open) => { if (!open) setDeleteContactId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contact</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The contact will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-contact-360">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteContactId && deleteContactMutation.mutate(deleteContactId)}
              disabled={deleteContactMutation.isPending}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete-contact-360"
            >
              {deleteContactMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function NotesTab({ clientId }: { clientId: string }) {
  const { toast } = useToast();
  const [noteBody, setNoteBody] = useState("");
  const [deleteNoteId, setDeleteNoteId] = useState<string | null>(null);

  const { data: notes = [], isLoading } = useQuery<CrmNote[]>({
    queryKey: [`/api/crm/clients/${clientId}/notes`],
    enabled: !!clientId,
  });

  const createNoteMutation = useMutation({
    mutationFn: async (body: string) => {
      return apiRequest("POST", `/api/crm/clients/${clientId}/notes`, { body });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/crm/clients/${clientId}/notes`] });
      setNoteBody("");
      toast({ title: "Note added" });
    },
    onError: (error) => {
      toast(formatErrorForToast(error));
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      return apiRequest("DELETE", `/api/crm/notes/${noteId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/crm/clients/${clientId}/notes`] });
      setDeleteNoteId(null);
      toast({ title: "Note deleted" });
    },
    onError: (error) => {
      toast(formatErrorForToast(error));
    },
  });

  function handleCreateNote() {
    if (!noteBody || noteBody.trim() === "" || noteBody === "<p></p>") return;
    createNoteMutation.mutate(noteBody);
  }

  if (isLoading) {
    return <LoadingState type="list" rows={3} />;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="space-y-3">
            <RichTextEditor
              value={noteBody}
              onChange={setNoteBody}
              placeholder="Write a note..."
              minHeight="80px"
              showToolbar={true}
              data-testid="editor-360-note"
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={handleCreateNote}
                disabled={createNoteMutation.isPending || !noteBody || noteBody.trim() === "" || noteBody === "<p></p>"}
                data-testid="button-add-note-360"
              >
                {createNoteMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Posting...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Post Note
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {notes.length === 0 ? (
        <EmptyState
          icon={<StickyNote className="h-10 w-10" />}
          title="No notes yet"
          description="Add notes to keep track of important information about this client."
          size="sm"
        />
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <Card key={note.id} data-testid={`card-note-${note.id}`}>
              <CardContent className="py-4 px-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="text-xs">
                        {(note.authorName?.[0] || note.authorEmail?.[0] || "?").toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-medium" data-testid={`text-note-author-${note.id}`}>
                          {note.authorName || note.authorEmail || "Unknown"}
                        </span>
                        <span className="text-xs text-muted-foreground" data-testid={`text-note-date-${note.id}`}>
                          {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
                        </span>
                        {note.category && note.category !== "general" && (
                          <Badge variant="secondary" className="text-xs">{note.category}</Badge>
                        )}
                      </div>
                      <div className="text-sm" data-testid={`text-note-body-${note.id}`}>
                        {typeof note.body === "string" ? (
                          <RichTextViewer content={note.body} />
                        ) : (
                          <pre className="whitespace-pre-wrap text-sm">{JSON.stringify(note.body)}</pre>
                        )}
                      </div>
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="Note options" data-testid={`button-note-menu-${note.id}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setDeleteNoteId(note.id)}
                        data-testid={`button-delete-note-${note.id}`}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteNoteId} onOpenChange={(open) => { if (!open) setDeleteNoteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Note</AlertDialogTitle>
            <AlertDialogDescription>
              This note will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-note-360">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteNoteId && deleteNoteMutation.mutate(deleteNoteId)}
              disabled={deleteNoteMutation.isPending}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete-note-360"
            >
              {deleteNoteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export interface ActivityEvent {
  id: string;
  type: string;
  entityId: string;
  summary: string;
  actorUserId: string | null;
  actorName: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export const activityTypeLabels: Record<string, { label: string; color: string }> = {
  project: { label: "Project", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  task: { label: "Task", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  time_entry: { label: "Time", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  comment: { label: "Comment", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  file: { label: "File", color: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200" },
};

export function ActivityTab({ clientId }: { clientId: string }) {
  const [typeFilter, setTypeFilter] = useState<string>("");

  const url = typeFilter
    ? `/api/crm/clients/${clientId}/activity?type=${typeFilter}`
    : `/api/crm/clients/${clientId}/activity`;

  const { data: events, isLoading } = useQuery<ActivityEvent[]>({
    queryKey: [url],
    enabled: !!clientId,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-4">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const types = ["project", "task", "time_entry", "comment", "file"];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap" data-testid="activity-type-filters">
        <Button
          size="sm"
          variant={typeFilter === "" ? "default" : "outline"}
          onClick={() => setTypeFilter("")}
          data-testid="filter-activity-all"
        >
          All
        </Button>
        {types.map((t) => (
          <Button
            key={t}
            size="sm"
            variant={typeFilter === t ? "default" : "outline"}
            onClick={() => setTypeFilter(t)}
            data-testid={`filter-activity-${t}`}
          >
            {activityTypeLabels[t]?.label || t}
          </Button>
        ))}
      </div>

      {(!events || events.length === 0) ? (
        <EmptyState
          icon={<Activity className="h-10 w-10" />}
          title="No Activity"
          description="No activity events found for this client."
          size="sm"
        />
      ) : (
        <div className="relative">
          <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />
          <div className="space-y-0">
            {events.map((event) => {
              const typeInfo = activityTypeLabels[event.type] || { label: event.type, color: "bg-muted text-muted-foreground" };
              return (
                <div
                  key={event.id}
                  className="relative flex items-start gap-4 py-3 pl-10"
                  data-testid={`activity-event-${event.id}`}
                >
                  <div className="absolute left-3 top-4 h-4 w-4 rounded-full border-2 border-background bg-muted" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className={`text-xs ${typeInfo.color}`}>
                        {typeInfo.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm mt-1">{event.summary}</p>
                    {event.actorName && (
                      <p className="text-xs text-muted-foreground mt-0.5">by {event.actorName}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface ApprovalItem {
  id: string;
  title: string;
  instructions: string | null;
  status: string;
  responseComment: string | null;
  respondedByName: string | null;
  respondedAt: string | null;
  dueAt: string | null;
  createdAt: string;
  requesterName: string;
}

export interface EffectivePermissions {
  closeThread: boolean;
  changePriority: boolean;
  viewInternalNotes: boolean;
  assignThread: boolean;
}

export function ApprovalsTab({ clientId }: { clientId: string }) {
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [approvalFilterValues, setApprovalFilterValues] = useState<Record<string, string>>({});
  const [approvalSearch, setApprovalSearch] = useState("");

  const { data: approvals = [], isLoading } = useQuery<ApprovalItem[]>({
    queryKey: ["/api/crm/clients", clientId, "approvals"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/crm/clients/${clientId}/approvals`);
      return res.json();
    },
  });

  const filteredApprovals = useMemo(() => {
    let result = approvals;
    const st = approvalFilterValues.status;
    if (st && st !== "all") {
      result = result.filter((a) => a.status === st);
    }
    if (approvalSearch) {
      const q = approvalSearch.toLowerCase();
      result = result.filter((a) =>
        a.title.toLowerCase().includes(q) || a.requesterName.toLowerCase().includes(q)
      );
    }
    return result;
  }, [approvals, approvalFilterValues, approvalSearch]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
      </div>
    );
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case "approved": return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "changes_requested": return <AlertCircle className="h-4 w-4 text-destructive" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const approvalFilters = [
    {
      key: "status",
      label: "Status",
      options: [
        { value: "all", label: "All Statuses" },
        { value: "pending", label: "Pending" },
        { value: "approved", label: "Approved" },
        { value: "changes_requested", label: "Changes Requested" },
      ],
    },
  ];

  return (
    <div className="space-y-4">
      <DataToolbar
        searchValue={approvalSearch}
        onSearchChange={setApprovalSearch}
        searchPlaceholder="Search approvals..."
        filters={approvalFilters}
        filterValues={approvalFilterValues}
        onFilterChange={(key, value) => setApprovalFilterValues((prev) => ({ ...prev, [key]: value }))}
        onClearFilters={() => setApprovalFilterValues({})}
        actions={
          <Button size="sm" onClick={() => setShowApprovalDialog(true)} data-testid="button-new-approval">
            <Plus className="h-4 w-4 mr-1" />
            New Request
          </Button>
        }
      />

      {approvals.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck className="h-10 w-10" />}
          title="No Approval Requests"
          description="Send approval requests to this client for review."
          size="md"
        />
      ) : filteredApprovals.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck className="h-10 w-10" />}
          title="No matching approvals"
          description="Try adjusting your search or filters."
          size="sm"
        />
      ) : (
        <div className="space-y-2">
          {filteredApprovals.map((a) => (
            <Card key={a.id} data-testid={`approval-item-${a.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">{statusIcon(a.status)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-medium text-sm">{a.title}</span>
                      <Badge variant={a.status === "approved" ? "default" : a.status === "changes_requested" ? "destructive" : "outline"} className="text-xs">
                        {a.status === "changes_requested" ? "Changes Requested" : a.status.charAt(0).toUpperCase() + a.status.slice(1)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      <span>By {a.requesterName}</span>
                      <span>{formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}</span>
                      {a.dueAt && <span>Due {format(new Date(a.dueAt), "MMM d")}</span>}
                    </div>
                    {a.responseComment && (
                      <p className="text-xs text-muted-foreground mt-2 border-l-2 border-border pl-2">
                        {a.responseComment}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <RequestApprovalDialog
        open={showApprovalDialog}
        onOpenChange={setShowApprovalDialog}
        clientId={clientId}
      />
    </div>
  );
}

export function MessagesTab({ clientId }: { clientId: string }) {
  const { toast } = useToast();
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.role === "admin" || authUser?.role === "super_user";

  const { data: permsData } = useQuery<{ permissions: any; effective: EffectivePermissions }>({
    queryKey: ["/api/crm/message-permissions"],
  });
  const canClose = permsData?.effective?.closeThread ?? isAdmin;
  const canChangePriority = permsData?.effective?.changePriority ?? isAdmin;
  const canViewInternal = permsData?.effective?.viewInternalNotes ?? isAdmin;
  const canAssign = permsData?.effective?.assignThread ?? isAdmin;
  const [selectedConvoId, setSelectedConvoId] = useState<string | null>(null);
  const [showNewConvo, setShowNewConvo] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [newAssignee, setNewAssignee] = useState<string>("__self__");
  const [newPriority, setNewPriority] = useState<string>("normal");
  const [newType, setNewType] = useState<string>("everyday");
  const [replyText, setReplyText] = useState("");
  const [replyVisibility, setReplyVisibility] = useState<"public" | "internal">("public");
  const [convoSearch, setConvoSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [assignedFilter, setAssignedFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("newest");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<string>("");
  const [page, setPage] = useState(1);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(convoSearch), 300);
    return () => clearTimeout(timer);
  }, [convoSearch]);

  useEffect(() => {
    setPage(1);
  }, [assignedFilter, statusFilter, priorityFilter, typeFilter, debouncedSearch, dateFrom, dateTo, sortBy]);

  const activeFilterCount = useMemo(() => {
    let c = 0;
    if (statusFilter !== "all") c++;
    if (priorityFilter !== "all") c++;
    if (typeFilter !== "all") c++;
    if (dateFrom) c++;
    if (dateTo) c++;
    if (assignedFilter !== "all") c++;
    return c;
  }, [statusFilter, priorityFilter, typeFilter, dateFrom, dateTo, assignedFilter]);

  const { data: tenantUsers = [] } = useQuery<any[]>({
    queryKey: ["/api/tenant/users"],
  });

  const staffUsers = useMemo(() =>
    tenantUsers.filter((u: any) => u.role !== "client"),
  [tenantUsers]);

  const { data: convoResponse, isLoading } = useQuery<{ conversations: any[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>({
    queryKey: ["/api/crm/clients", clientId, "conversations", assignedFilter, debouncedSearch, statusFilter, priorityFilter, typeFilter, sortBy, dateFrom, dateTo, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (assignedFilter !== "all") params.set("assigned", assignedFilter);
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (priorityFilter !== "all") params.set("priority", priorityFilter);
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (sortBy !== "newest") params.set("sort", sortBy);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      params.set("page", String(page));
      const qs = params.toString();
      const res = await apiRequest("GET", `/api/crm/clients/${clientId}/conversations${qs ? `?${qs}` : ""}`);
      return res.json();
    },
  });

  const conversations = convoResponse?.conversations || [];
  const pagination = convoResponse?.pagination;

  const { data: counts } = useQuery<{ allOpen: number; assignedToMe: number; unassigned: number; unread: number }>({
    queryKey: ["/api/crm/clients", clientId, "conversations", "counts"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/crm/clients/${clientId}/conversations/counts`);
      return res.json();
    },
  });

  const markReadMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      const res = await apiRequest("POST", `/api/crm/conversations/${conversationId}/read`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/clients", clientId, "conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/clients", clientId, "conversations", "counts"] });
    },
  });

  const handleSelectConvo = (convoId: string) => {
    setSelectedConvoId(convoId);
    markReadMutation.mutate(convoId);
  };

  const { data: threadData } = useQuery<any>({
    queryKey: ["/api/crm/conversations", selectedConvoId, "messages"],
    queryFn: async () => {
      const res = await fetch(`/api/crm/conversations/${selectedConvoId}/messages`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load messages");
      return res.json();
    },
    enabled: !!selectedConvoId,
    refetchInterval: selectedConvoId ? 10000 : false,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { subject: string; initialMessage: string; assignedToUserId?: string; priority?: string }) => {
      const res = await apiRequest("POST", `/api/crm/clients/${clientId}/conversations`, data);
      return res.json();
    },
    onSuccess: (convo: any) => {
      setShowNewConvo(false);
      setNewSubject("");
      setNewMessage("");
      setNewAssignee("__self__");
      setNewPriority("normal");
      setNewType("everyday");
      setSelectedConvoId(convo.id);
      queryClient.invalidateQueries({ queryKey: ["/api/crm/clients", clientId, "conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/clients", clientId, "conversations", "counts"] });
      toast({ title: "Conversation started" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const replyMutation = useMutation({
    mutationFn: async ({ bodyText, visibility }: { bodyText: string; visibility: "public" | "internal" }) => {
      const res = await apiRequest("POST", `/api/crm/conversations/${selectedConvoId}/messages`, { bodyText, visibility });
      return res.json();
    },
    onSuccess: () => {
      setReplyText("");
      queryClient.invalidateQueries({ queryKey: ["/api/crm/conversations", selectedConvoId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/clients", clientId, "conversations"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const assignMutation = useMutation({
    mutationFn: async ({ conversationId, assignedToUserId }: { conversationId: string; assignedToUserId: string | null }) => {
      const res = await apiRequest("PATCH", `/api/crm/conversations/${conversationId}/assign`, { assignedToUserId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/conversations", selectedConvoId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/clients", clientId, "conversations"] });
      toast({ title: "Assignee updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const priorityMutation = useMutation({
    mutationFn: async ({ conversationId, priority }: { conversationId: string; priority: string }) => {
      const res = await apiRequest("PATCH", `/api/crm/conversations/${conversationId}/priority`, { priority });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/conversations", selectedConvoId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/clients", clientId, "conversations"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const closeMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      const res = await apiRequest("POST", `/api/crm/conversations/${conversationId}/close`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/conversations", selectedConvoId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/clients", clientId, "conversations"] });
      toast({ title: "Thread closed" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const reopenMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      const res = await apiRequest("POST", `/api/crm/conversations/${conversationId}/reopen`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/conversations", selectedConvoId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/clients", clientId, "conversations"] });
      toast({ title: "Thread reopened" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const { data: mergeCandidates = [] } = useQuery<any[]>({
    queryKey: ["/api/crm/clients", clientId, "conversations/merge-candidates", selectedConvoId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/crm/clients/${clientId}/conversations/merge-candidates?exclude=${selectedConvoId}`);
      return res.json();
    },
    enabled: !!selectedConvoId && showMergeDialog,
  });

  const mergeMutation = useMutation({
    mutationFn: async ({ conversationId, targetConversationId }: { conversationId: string; targetConversationId: string }) => {
      const res = await apiRequest("POST", `/api/crm/conversations/${conversationId}/merge`, { targetConversationId });
      return res.json();
    },
    onSuccess: (data: any) => {
      setShowMergeDialog(false);
      setMergeTargetId("");
      setSelectedConvoId(data.primaryId);
      queryClient.invalidateQueries({ queryKey: ["/api/crm/clients", clientId, "conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/conversations", data.primaryId, "messages"] });
      toast({ title: "Threads merged", description: data.message });
    },
    onError: (error: Error) => {
      toast({ title: "Merge failed", description: error.message, variant: "destructive" });
    },
  });

  const handleMerge = () => {
    if (!selectedConvoId || !mergeTargetId) return;
    mergeMutation.mutate({ conversationId: selectedConvoId, targetConversationId: mergeTargetId });
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threadData?.messages]);

  const handleSendReply = () => {
    const trimmed = replyText.trim();
    if (!trimmed) return;
    replyMutation.mutate({ bodyText: trimmed, visibility: replyVisibility });
  };

  const handleCreateConvo = () => {
    if (!newSubject.trim() || !newMessage.trim()) return;
    const payload: any = { subject: newSubject.trim(), initialMessage: newMessage.trim(), priority: newPriority, type: newType };
    if (newAssignee && newAssignee !== "__self__") {
      payload.assignedToUserId = newAssignee;
    }
    createMutation.mutate(payload);
  };

  if (selectedConvoId && threadData) {
    const messages = threadData.messages || [];
    const convo = threadData.conversation;
    const isClosed = !!convo?.closedAt;

    return (
      <div className="flex flex-col h-[500px]">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <Button variant="ghost" size="icon" aria-label="Go back" onClick={() => setSelectedConvoId(null)} data-testid="button-back-convo-list">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h3 className="font-medium truncate">{convo?.subject}</h3>
            <p className="text-xs text-muted-foreground">
              {messages.length} message{messages.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {canChangePriority && (
              <Select
                value={convo?.priority || "normal"}
                onValueChange={(val) => {
                  priorityMutation.mutate({ conversationId: selectedConvoId!, priority: val });
                }}
              >
                <SelectTrigger className="w-[110px]" data-testid="select-convo-priority">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            )}
            {!canChangePriority && convo?.priority && (
              <Badge variant="outline" className="text-xs">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {convo.priority}
              </Badge>
            )}
            {canAssign && (
              <Select
                value={convo?.assignedToUserId || "__none__"}
                onValueChange={(val) => {
                  assignMutation.mutate({
                    conversationId: selectedConvoId,
                    assignedToUserId: val === "__none__" ? null : val,
                  });
                }}
              >
                <SelectTrigger className="w-[160px]" data-testid="select-convo-assignee">
                  <div className="flex items-center gap-1.5">
                    <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
                    <SelectValue placeholder="Unassigned" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Unassigned</SelectItem>
                  {staffUsers.map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {(canClose || isAdmin) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" data-testid="button-convo-actions">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {!isClosed && canClose && (
                    <DropdownMenuItem
                      onClick={() => closeMutation.mutate(selectedConvoId!)}
                      data-testid="button-close-conversation"
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Close Thread
                    </DropdownMenuItem>
                  )}
                  {isClosed && canClose && (
                    <DropdownMenuItem
                      onClick={() => reopenMutation.mutate(selectedConvoId!)}
                      data-testid="button-reopen-conversation"
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Reopen Thread
                    </DropdownMenuItem>
                  )}
                  {!isClosed && isAdmin && (
                    <DropdownMenuItem
                      onClick={() => { setMergeTargetId(""); setShowMergeDialog(true); }}
                      data-testid="button-merge-conversation"
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Merge With...
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {isClosed && <Badge variant="secondary">Closed</Badge>}
          </div>
        </div>

        {convo?.slaPolicy && !isClosed && (convo?.firstResponseBreachedAt || convo?.resolutionBreachedAt || !convo?.firstResponseAt) && (
          <div className="flex items-center gap-2 mb-3 flex-wrap" data-testid="sla-status-bar">
            {convo.firstResponseBreachedAt && (
              <Badge variant="destructive" className="text-xs">
                <ShieldAlert className="h-3 w-3 mr-1" />
                First Response SLA Breached
              </Badge>
            )}
            {convo.resolutionBreachedAt && (
              <Badge variant="destructive" className="text-xs">
                <ShieldAlert className="h-3 w-3 mr-1" />
                Resolution SLA Breached
              </Badge>
            )}
            {!convo.firstResponseAt && !convo.firstResponseBreachedAt && convo.slaPolicy && (
              <Badge variant="outline" className="text-xs">
                <Clock className="h-3 w-3 mr-1" />
                First response due in {convo.slaPolicy.firstResponseMinutes}m
              </Badge>
            )}
          </div>
        )}

        <AlertDialog open={showMergeDialog} onOpenChange={setShowMergeDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Merge Conversation</AlertDialogTitle>
              <AlertDialogDescription>
                Select a conversation to merge into this one. All messages from the selected conversation will be moved here, and the other conversation will be closed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4 space-y-2 max-h-[300px] overflow-y-auto">
              {mergeCandidates.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No other open conversations available to merge.</p>
              ) : (
                mergeCandidates.map((c: any) => (
                  <div
                    key={c.id}
                    className={`flex items-center gap-3 p-3 rounded-md cursor-pointer border transition-colors ${
                      mergeTargetId === c.id
                        ? "border-primary bg-primary/5"
                        : "border-transparent hover-elevate"
                    }`}
                    onClick={() => setMergeTargetId(c.id)}
                    data-testid={`merge-candidate-${c.id}`}
                  >
                    <input
                      type="radio"
                      checked={mergeTargetId === c.id}
                      onChange={() => setMergeTargetId(c.id)}
                      className="accent-primary"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{c.subject}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.messageCount} message{c.messageCount !== 1 ? "s" : ""} &middot; {c.status}
                        {c.lastMessage?.createdAt && (
                          <> &middot; Last activity {formatDistanceToNow(new Date(c.lastMessage.createdAt), { addSuffix: true })}</>
                        )}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-merge">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleMerge}
                disabled={!mergeTargetId || mergeMutation.isPending}
                data-testid="button-confirm-merge"
              >
                {mergeMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Merging...</>
                ) : (
                  "Merge Conversations"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="flex-1 overflow-y-auto space-y-3 mb-3 pr-1" data-testid="internal-messages-list">
          {messages.map((msg: any) => {
            const isInternal = msg.visibility === "internal";
            const isMergeSystem = msg.bodyText?.startsWith("[Thread Merged]");
            if (isMergeSystem) {
              return (
                <div
                  key={msg.id}
                  className="flex items-center gap-2 py-1.5 px-3 rounded-md bg-muted/50 text-xs text-muted-foreground"
                  data-testid={`int-message-${msg.id}`}
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                  <span>{msg.bodyText}</span>
                  <span className="ml-auto shrink-0">{formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}</span>
                </div>
              );
            }
            return (
              <div
                key={msg.id}
                className={`flex gap-2 ${isInternal ? "rounded-md border border-amber-500/30 bg-amber-500/5 p-2" : ""}`}
                data-testid={`int-message-${msg.id}`}
              >
                <Avatar className="h-7 w-7 shrink-0">
                  <AvatarFallback className={`text-xs ${isInternal ? "bg-amber-500/15" : msg.authorRole !== "client" ? "bg-primary/10" : "bg-muted"}`}>
                    {msg.authorName ? msg.authorName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2) : "?"}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium">{msg.authorName || "Unknown"}</span>
                    {isInternal && (
                      <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-600 dark:text-amber-400">
                        <EyeOff className="h-3 w-3 mr-0.5" />
                        Internal
                      </Badge>
                    )}
                    {msg.authorRole === "client" && <Badge variant="outline" className="text-xs">Client</Badge>}
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-sm mt-0.5 whitespace-pre-wrap">{msg.bodyText}</p>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {!isClosed && (
          <div className={`border-t pt-3 space-y-2 ${replyVisibility === "internal" ? "border-amber-500/30" : ""}`}>
            <div className="flex items-center gap-2">
              <Button
                variant={replyVisibility === "public" ? "default" : "outline"}
                size="sm"
                onClick={() => setReplyVisibility("public")}
                data-testid="button-reply-public"
              >
                <Eye className="h-3.5 w-3.5 mr-1" />
                Public Reply
              </Button>
              {canViewInternal && (
                <Button
                  variant={replyVisibility === "internal" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setReplyVisibility("internal")}
                  className={replyVisibility === "internal" ? "bg-amber-600 hover:bg-amber-700 border-amber-600" : ""}
                  data-testid="button-reply-internal"
                >
                  <EyeOff className="h-3.5 w-3.5 mr-1" />
                  Internal Note
                </Button>
              )}
            </div>
            {replyVisibility === "internal" && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                This note is only visible to your team. The client will not see it.
              </p>
            )}
            <div className="flex gap-2 items-end">
              <Input
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendReply(); } }}
                placeholder={replyVisibility === "internal" ? "Write an internal note..." : "Type a message..."}
                className={replyVisibility === "internal" ? "border-amber-500/30" : ""}
                data-testid="input-internal-reply"
              />
              <Button
                onClick={handleSendReply}
                disabled={!replyText.trim() || replyMutation.isPending}
                size="icon"
                aria-label={replyVisibility === "internal" ? "Add internal note" : "Send reply"}
                className={replyVisibility === "internal" ? "bg-amber-600 hover:bg-amber-700" : ""}
                data-testid="button-send-internal-reply"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DataToolbar
        searchValue={convoSearch}
        onSearchChange={setConvoSearch}
        searchPlaceholder="Search subject & messages..."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant={showFilters ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              data-testid="button-toggle-filters"
              className="toggle-elevate"
            >
              <SlidersHorizontal className="h-4 w-4 mr-1" />
              Filters
              {activeFilterCount > 0 && (
                <Badge variant="default" className="ml-1">{activeFilterCount}</Badge>
              )}
            </Button>
            <Button size="sm" onClick={() => setShowNewConvo(true)} data-testid="button-new-conversation">
              <Plus className="h-4 w-4 mr-1" />
              New Conversation
            </Button>
          </div>
        }
      />

      <div className="flex items-center gap-1 flex-wrap" data-testid="convo-quick-filter-tabs">
        {[
          { value: "all", label: "All Open", statusOverride: "open", count: counts?.allOpen },
          { value: "me", label: "Assigned to Me", statusOverride: "open", count: counts?.assignedToMe },
          { value: "unassigned", label: "Unassigned", statusOverride: "open", count: counts?.unassigned },
        ].map((tab) => (
          <Button
            key={tab.value}
            variant={assignedFilter === tab.value && statusFilter === "open" ? "secondary" : "ghost"}
            size="sm"
            className="toggle-elevate"
            onClick={() => {
              setAssignedFilter(tab.value);
              setStatusFilter(tab.statusOverride);
            }}
            data-testid={`button-quick-filter-${tab.value}`}
          >
            {tab.label}
            {tab.count != null && tab.count > 0 && (
              <Badge variant="outline" className="ml-1.5 text-xs">{tab.count}</Badge>
            )}
          </Button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[130px]" data-testid="select-convo-sort">
              <div className="flex items-center gap-1.5">
                <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="oldest">Oldest</SelectItem>
              <SelectItem value="priority">Priority</SelectItem>
              <SelectItem value="sla_breach">SLA Breach</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {showFilters && (
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={assignedFilter} onValueChange={setAssignedFilter}>
                <SelectTrigger className="w-[150px]" data-testid="select-convo-assigned-filter">
                  <SelectValue placeholder="Assignee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All assignees</SelectItem>
                  <SelectItem value="me">Assigned to me</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {staffUsers.map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[120px]" data-testid="select-convo-status-filter">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-[120px]" data-testid="select-convo-priority-filter">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All priorities</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[140px]" data-testid="select-convo-type-filter">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="everyday">Everyday</SelectItem>
                  <SelectItem value="service_request">Service Request</SelectItem>
                  <SelectItem value="support_ticket">Support Ticket</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-[140px]"
                placeholder="From date"
                data-testid="input-date-from"
              />
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-[140px]"
                placeholder="To date"
                data-testid="input-date-to"
              />
              {activeFilterCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setAssignedFilter("all");
                    setStatusFilter("all");
                    setPriorityFilter("all");
                    setTypeFilter("all");
                    setDateFrom("");
                    setDateTo("");
                  }}
                  data-testid="button-clear-filters"
                >
                  <X className="h-4 w-4 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {showNewConvo && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <Input
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
              placeholder="Subject"
              data-testid="input-new-convo-subject"
            />
            <Textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Write your message..."
              className="resize-none min-h-[80px]"
              data-testid="input-new-convo-message"
            />
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 flex-1 min-w-[160px]">
                <UserCheck className="h-4 w-4 text-muted-foreground shrink-0" />
                <Select value={newAssignee} onValueChange={setNewAssignee}>
                  <SelectTrigger className="flex-1" data-testid="select-new-convo-assignee">
                    <SelectValue placeholder="Assign to..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__self__">Assign to me</SelectItem>
                    {staffUsers.map((u: any) => (
                      <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1.5 min-w-[130px]">
                <AlertTriangle className="h-4 w-4 text-muted-foreground shrink-0" />
                <Select value={newPriority} onValueChange={setNewPriority}>
                  <SelectTrigger className="flex-1" data-testid="select-new-convo-priority">
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1.5 min-w-[130px]">
                <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                <Select value={newType} onValueChange={setNewType}>
                  <SelectTrigger className="flex-1" data-testid="select-new-convo-type">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="everyday">Everyday</SelectItem>
                    <SelectItem value="service_request">Service Request</SelectItem>
                    <SelectItem value="support_ticket">Support Ticket</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 ml-auto">
                <Button variant="outline" size="sm" onClick={() => setShowNewConvo(false)} data-testid="button-cancel-new-convo">
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreateConvo}
                  disabled={!newSubject.trim() || !newMessage.trim() || createMutation.isPending}
                  data-testid="button-send-new-convo"
                >
                  <Send className="h-4 w-4 mr-1" />
                  Send
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {conversations.length === 0 && !showNewConvo ? (
        <EmptyState
          icon={<MessageSquare className="h-10 w-10" />}
          title={(debouncedSearch || activeFilterCount > 0) ? "No matching conversations" : "No Conversations"}
          description={(debouncedSearch || activeFilterCount > 0) ? "Try adjusting your search or filters." : "Start a conversation with this client."}
          size="md"
        />
      ) : (
        <div className="space-y-2">
          {(debouncedSearch || pagination) && (
            <p className="text-xs text-muted-foreground" data-testid="text-search-results-count">
              {pagination ? `${pagination.total} conversation${pagination.total !== 1 ? "s" : ""}` : ""}
              {debouncedSearch ? ` matching "${debouncedSearch}"` : ""}
            </p>
          )}
          {conversations.map((c: any) => (
            <Card
              key={c.id}
              className="hover-elevate cursor-pointer"
              onClick={() => handleSelectConvo(c.id)}
              data-testid={`convo-item-${c.id}`}
            >
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <div className="relative shrink-0 mt-0.5">
                      {c.assigneeName ? (
                        <Avatar className="h-7 w-7" data-testid={`avatar-assignee-${c.id}`}>
                          <AvatarFallback className="text-xs">
                            {c.assigneeName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                      ) : (
                        <Avatar className="h-7 w-7 opacity-40" data-testid={`avatar-unassigned-${c.id}`}>
                          <AvatarFallback className="text-xs">
                            <UserCheck className="h-3.5 w-3.5" />
                          </AvatarFallback>
                        </Avatar>
                      )}
                      {c.hasUnread && (
                        <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-primary border-2 border-background" data-testid={`unread-dot-${c.id}`} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                    <span className={`text-sm ${c.hasUnread ? "font-semibold" : "font-medium"}`}>{c.subject}</span>
                    {c.matchingSnippet ? (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        <Search className="h-3 w-3 inline mr-0.5 align-text-bottom" />
                        {c.matchingSnippet}
                      </p>
                    ) : c.lastMessage ? (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {c.lastMessage.authorName}: {c.lastMessage.bodyText}
                      </p>
                    ) : null}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(c.updatedAt), { addSuffix: true })}
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {c.closedAt && (
                        <Badge variant="secondary" className="text-xs">Closed</Badge>
                      )}
                      {(c.firstResponseBreachedAt || c.resolutionBreachedAt) && (
                        <Badge variant="destructive" className="text-xs" data-testid={`sla-breach-badge-${c.id}`}>
                          <ShieldAlert className="h-3 w-3 mr-0.5" />
                          SLA
                        </Badge>
                      )}
                      {c.type && c.type !== "everyday" && (
                        <Badge variant="outline" className="text-xs capitalize" data-testid={`type-badge-${c.id}`}>
                          {c.type === "service_request" ? "Service" : c.type === "support_ticket" ? "Support" : c.type}
                        </Badge>
                      )}
                      {c.priority && c.priority !== "normal" && (
                        <Badge
                          variant={c.priority === "urgent" ? "destructive" : "outline"}
                          className="text-xs capitalize"
                          data-testid={`priority-badge-${c.id}`}
                        >
                          {c.priority}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs">{c.messageCount}</Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-2" data-testid="convo-pagination">
              <p className="text-xs text-muted-foreground">
                Page {pagination.page} of {pagination.totalPages}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage(p => p + 1)}
                  data-testid="button-next-page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function PlaceholderTab({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <EmptyState
      icon={icon}
      title={title}
      description={description}
      size="md"
    />
  );
}
