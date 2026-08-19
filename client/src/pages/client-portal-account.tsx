import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";
import { usePortalClient } from "@/hooks/use-portal-client";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Layers, Plus, ShieldCheck, Users } from "lucide-react";

type Account = { id: string; overview: Record<string, string | null>; accessLevel: string; capabilities: Record<string, boolean> };
type Contact = { id: string; firstName: string | null; lastName: string | null; title: string | null; email: string | null; phone: string | null; isPrimary: boolean };
type Division = { id: string; name: string; description: string | null; color: string | null };
type PortalUser = { userId: string; name: string | null; email: string; accessLevel: "collaborator" | "client_admin"; status: "active" | "suspended" };

const overviewInputs = [
  ["companyName", "Company name"], ["displayName", "Display name"], ["legalName", "Legal name"],
  ["website", "Website"], ["industry", "Industry"], ["companySize", "Company size"],
  ["phone", "Phone"], ["email", "Email"], ["addressLine1", "Address"], ["addressLine2", "Address line 2"],
  ["city", "City"], ["state", "State"], ["postalCode", "Postal code"], ["country", "Country"],
  ["primaryContactName", "Primary contact"], ["primaryContactEmail", "Primary contact email"], ["primaryContactPhone", "Primary contact phone"],
] as const;

function ClientPicker() {
  const { clients, clientId, setClientId } = usePortalClient();
  if (clients.length <= 1) return null;
  return <Select value={clientId} onValueChange={setClientId}><SelectTrigger className="w-full sm:w-72"><SelectValue /></SelectTrigger><SelectContent>{clients.map((client) => <SelectItem key={client.id} value={client.id}>{client.displayName || client.companyName}</SelectItem>)}</SelectContent></Select>;
}

export default function ClientPortalAccount() {
  const { client, clientId, isLoading } = usePortalClient();
  const { toast } = useToast();
  const [overviewDraft, setOverviewDraft] = useState<Record<string, string>>( {} );
  const [editingOverview, setEditingOverview] = useState(false);
  const [contactDraft, setContactDraft] = useState({ firstName: "", lastName: "", title: "", email: "", phone: "", isPrimary: false });
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [inviteDraft, setInviteDraft] = useState({ firstName: "", lastName: "", email: "", accessLevel: "collaborator" });

  const accountQuery = useQuery<Account>({ queryKey: queryKeys.portal.clientAccount(clientId), enabled: !!clientId });
  const contactsQuery = useQuery<Contact[]>({ queryKey: queryKeys.portal.clientContacts(clientId), enabled: !!clientId });
  const divisionsQuery = useQuery<Division[]>({ queryKey: queryKeys.portal.clientDivisions(clientId), enabled: !!clientId });
  const usersQuery = useQuery<PortalUser[]>({ queryKey: queryKeys.portal.clientUsers(clientId), enabled: !!clientId && !!client?.capabilities.managePortalUsers });

  useEffect(() => {
    if (accountQuery.data) setOverviewDraft(Object.fromEntries(Object.entries(accountQuery.data.overview).map(([key, value]) => [key, value || ""])));
  }, [accountQuery.data]);

  const saveOverview = useMutation({
    mutationFn: async () => (await apiRequest("PATCH", `/api/client-portal/clients/${clientId}/overview`, overviewDraft)).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: queryKeys.portal.clientAccount(clientId) }); setEditingOverview(false); toast({ title: "Overview updated" }); },
    onError: (error: Error) => toast({ title: "Unable to update overview", description: error.message, variant: "destructive" }),
  });
  const addContact = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/client-portal/clients/${clientId}/contacts`, contactDraft)).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: queryKeys.portal.clientContacts(clientId) }); setContactDraft({ firstName: "", lastName: "", title: "", email: "", phone: "", isPrimary: false }); toast({ title: "Contact added" }); },
    onError: (error: Error) => toast({ title: "Unable to add contact", description: error.message, variant: "destructive" }),
  });
  const updateContact = useMutation({
    mutationFn: async () => (await apiRequest("PATCH", `/api/client-portal/clients/${clientId}/contacts/${editingContactId}`, contactDraft)).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: queryKeys.portal.clientContacts(clientId) }); setEditingContactId(null); setContactDraft({ firstName: "", lastName: "", title: "", email: "", phone: "", isPrimary: false }); toast({ title: "Contact updated" }); },
    onError: (error: Error) => toast({ title: "Unable to update contact", description: error.message, variant: "destructive" }),
  });
  const updateMembership = useMutation({
    mutationFn: async ({ userId, body }: { userId: string; body: Record<string, string> }) => (await apiRequest("PATCH", `/api/client-portal/clients/${clientId}/users/${userId}`, body)).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.portal.clientUsers(clientId) }),
    onError: (error: Error) => toast({ title: "Unable to update portal user", description: error.message, variant: "destructive" }),
  });
  const resetPassword = useMutation({
    mutationFn: async (userId: string) => (await apiRequest("POST", `/api/client-portal/clients/${clientId}/users/${userId}/password-reset`, {})).json(),
    onSuccess: () => toast({ title: "Password reset email sent" }),
    onError: (error: Error) => toast({ title: "Unable to send reset email", description: error.message, variant: "destructive" }),
  });
  const inviteUser = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/client-portal/clients/${clientId}/users/invite`, inviteDraft)).json(),
    onSuccess: () => { setInviteDraft({ firstName: "", lastName: "", email: "", accessLevel: "collaborator" }); queryClient.invalidateQueries({ queryKey: queryKeys.portal.clientUsers(clientId) }); toast({ title: "Portal invitation created" }); },
    onError: (error: Error) => toast({ title: "Unable to invite portal user", description: error.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="p-6">Loading account…</div>;
  if (!client) return <div className="p-6"><Card><CardContent className="p-6">Your portal account has no active Client assignments. Contact your administrator.</CardContent></Card></div>;
  const canAdmin = client.accessLevel === "client_admin";

  return <div className="p-3 sm:p-6 overflow-y-auto h-full space-y-5">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><h1 className="text-2xl font-bold">Client Account</h1><p className="text-muted-foreground">{client.displayName || client.companyName}</p></div><ClientPicker /></div>
    <Tabs defaultValue="overview">
      <TabsList className="overflow-x-auto max-w-full justify-start"><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="contacts">Contacts</TabsTrigger><TabsTrigger value="divisions">Divisions</TabsTrigger>{canAdmin && <TabsTrigger value="users">Portal Users</TabsTrigger>}</TabsList>
      <TabsContent value="overview" className="mt-4"><Card><CardHeader className="flex-row items-center justify-between"><CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />Organization</CardTitle>{canAdmin && <Button variant={editingOverview ? "outline" : "default"} onClick={() => setEditingOverview(!editingOverview)}>{editingOverview ? "Cancel" : "Edit"}</Button>}</CardHeader><CardContent className="grid sm:grid-cols-2 gap-4">
        {overviewInputs.map(([key, label]) => <div key={key} className="space-y-1"><Label>{label}</Label>{editingOverview ? <Input value={overviewDraft[key] || ""} onChange={(event) => setOverviewDraft((draft) => ({ ...draft, [key]: event.target.value }))} /> : <p className="min-h-9 py-2 text-sm">{accountQuery.data?.overview[key] || "—"}</p>}</div>)}
        <div className="sm:col-span-2 space-y-1"><Label>Description</Label>{editingOverview ? <Textarea value={overviewDraft.description || ""} onChange={(event) => setOverviewDraft((draft) => ({ ...draft, description: event.target.value }))} /> : <p className="text-sm whitespace-pre-wrap">{accountQuery.data?.overview.description || "—"}</p>}</div>
        {editingOverview && <div className="sm:col-span-2 flex justify-end"><Button onClick={() => saveOverview.mutate()} disabled={saveOverview.isPending}>Save overview</Button></div>}
      </CardContent></Card></TabsContent>
      <TabsContent value="contacts" className="mt-4 space-y-4">
        {canAdmin && <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Plus className="h-4 w-4" />{editingContactId ? "Edit contact" : "Add contact"}</CardTitle></CardHeader><CardContent className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{(["firstName", "lastName", "title", "email", "phone"] as const).map((key) => <Input key={key} placeholder={key.replace(/([A-Z])/g, " $1")} value={contactDraft[key]} onChange={(event) => setContactDraft((draft) => ({ ...draft, [key]: event.target.value }))} />)}<Button onClick={() => editingContactId ? updateContact.mutate() : addContact.mutate()} disabled={!contactDraft.email || addContact.isPending || updateContact.isPending}>{editingContactId ? "Save contact" : "Add contact"}</Button>{editingContactId && <Button variant="outline" onClick={() => { setEditingContactId(null); setContactDraft({ firstName: "", lastName: "", title: "", email: "", phone: "", isPrimary: false }); }}>Cancel</Button>}</CardContent></Card>}
        <div className="grid md:grid-cols-2 gap-3">{contactsQuery.data?.map((contact) => <Card key={contact.id}><CardContent className="p-4"><div className="flex justify-between gap-2"><div><p className="font-medium">{[contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email}</p><p className="text-sm text-muted-foreground">{contact.title || "Contact"}</p></div><div className="flex gap-2">{contact.isPrimary && <Badge>Primary</Badge>}{canAdmin && <Button size="sm" variant="outline" onClick={() => { setEditingContactId(contact.id); setContactDraft({ firstName: contact.firstName || "", lastName: contact.lastName || "", title: contact.title || "", email: contact.email || "", phone: contact.phone || "", isPrimary: contact.isPrimary }); }}>Edit</Button>}</div></div><div className="mt-3 text-sm"><p>{contact.email}</p><p>{contact.phone}</p></div></CardContent></Card>)}</div>
      </TabsContent>
      <TabsContent value="divisions" className="mt-4"><div className="grid md:grid-cols-2 gap-3">{divisionsQuery.data?.map((division) => <Card key={division.id}><CardContent className="p-4 flex gap-3"><Layers className="h-5 w-5" style={{ color: division.color || undefined }} /><div><p className="font-medium">{division.name}</p><p className="text-sm text-muted-foreground">{division.description || "No description"}</p></div></CardContent></Card>)}</div></TabsContent>
      {canAdmin && <TabsContent value="users" className="mt-4 space-y-3"><Card><CardHeader><CardTitle className="text-base">Invite portal user</CardTitle></CardHeader><CardContent className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3"><Input placeholder="First name" value={inviteDraft.firstName} onChange={(event) => setInviteDraft((draft) => ({ ...draft, firstName: event.target.value }))} /><Input placeholder="Last name" value={inviteDraft.lastName} onChange={(event) => setInviteDraft((draft) => ({ ...draft, lastName: event.target.value }))} /><Input type="email" placeholder="Email" value={inviteDraft.email} onChange={(event) => setInviteDraft((draft) => ({ ...draft, email: event.target.value }))} /><Select value={inviteDraft.accessLevel} onValueChange={(accessLevel) => setInviteDraft((draft) => ({ ...draft, accessLevel }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="collaborator">Collaborator</SelectItem><SelectItem value="client_admin">Client Admin</SelectItem></SelectContent></Select><Button className="lg:col-start-4" onClick={() => inviteUser.mutate()} disabled={!inviteDraft.firstName || !inviteDraft.email || inviteUser.isPending}>Send invitation</Button></CardContent></Card>{usersQuery.data?.map((portalUser) => <Card key={portalUser.userId}><CardContent className="p-4 flex flex-col lg:flex-row lg:items-center gap-3"><Users className="h-5 w-5" /><div className="flex-1"><p className="font-medium">{portalUser.name || portalUser.email}</p><p className="text-sm text-muted-foreground">{portalUser.email}</p></div><Select value={portalUser.accessLevel} onValueChange={(accessLevel) => updateMembership.mutate({ userId: portalUser.userId, body: { accessLevel } })}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="collaborator">Collaborator</SelectItem><SelectItem value="client_admin">Client Admin</SelectItem></SelectContent></Select><Button variant="outline" onClick={() => updateMembership.mutate({ userId: portalUser.userId, body: { status: portalUser.status === "active" ? "suspended" : "active" } })}>{portalUser.status === "active" ? "Suspend" : "Reactivate"}</Button><Button variant="outline" onClick={() => resetPassword.mutate(portalUser.userId)}>Send reset link</Button><ShieldCheck className="h-4 w-4 text-muted-foreground" /></CardContent></Card>)}</TabsContent>}
    </Tabs>
  </div>;
}
