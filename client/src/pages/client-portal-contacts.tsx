import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ContactRound, Loader2, Plus, Trash2 } from "lucide-react";

interface ClientInfo {
  id: string;
  companyName: string;
  displayName: string | null;
  accessLevel: string;
}

interface DashboardData {
  clients: ClientInfo[];
}

interface ClientContact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
}

function canEdit(accessLevel?: string) {
  return Boolean(accessLevel);
}

export default function ClientPortalContactsPage() {
  const { toast } = useToast();
  const [clientId, setClientId] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", title: "", email: "", phone: "" });

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/client-portal/dashboard"],
  });
  const clients = data?.clients || [];
  const selectedClient = clients.find(client => client.id === clientId);

  useEffect(() => {
    if (!clientId && clients.length > 0) {
      setClientId(clients[0].id);
    }
  }, [clientId, clients]);

  const contactsQueryKey = ["/api/client-portal/clients", clientId, "contacts"];
  const { data: contacts = [], isLoading: contactsLoading } = useQuery<ClientContact[]>({
    queryKey: contactsQueryKey,
    enabled: Boolean(clientId),
  });

  const createContact = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/client-portal/clients/${clientId}/contacts`, form);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Contact added" });
      queryClient.invalidateQueries({ queryKey: contactsQueryKey });
      setDialogOpen(false);
      setForm({ firstName: "", lastName: "", title: "", email: "", phone: "" });
    },
    onError: (error: Error) => {
      toast({ title: "Unable to add contact", description: error.message, variant: "destructive" });
    },
  });

  const deleteContact = useMutation({
    mutationFn: async (contactId: string) => {
      await apiRequest("DELETE", `/api/client-portal/clients/${clientId}/contacts/${contactId}`);
    },
    onSuccess: () => {
      toast({ title: "Contact deleted" });
      queryClient.invalidateQueries({ queryKey: contactsQueryKey });
    },
    onError: (error: Error) => {
      toast({ title: "Unable to delete contact", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 overflow-y-auto h-full">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 overflow-y-auto h-full space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ContactRound className="h-6 w-6 text-primary" />
            Contacts
          </h1>
          <p className="text-muted-foreground">View and manage contacts for your client account.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {clients.length > 1 && (
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger className="w-full sm:w-72">
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {clients.map(client => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.displayName || client.companyName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {canEdit(selectedClient?.accessLevel) && (
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Contact
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Client Contacts</CardTitle>
        </CardHeader>
        <CardContent>
          {contactsLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : contacts.length > 0 ? (
            <div className="divide-y">
              {contacts.map(contact => (
                <div key={contact.id} className="flex items-center justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <div className="font-medium">
                      {[contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email || "Unnamed contact"}
                    </div>
                    <div className="text-sm text-muted-foreground truncate">
                      {[contact.title, contact.email, contact.phone].filter(Boolean).join(" - ")}
                    </div>
                  </div>
                  {canEdit(selectedClient?.accessLevel) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteContact.mutate(contact.id)}
                      disabled={deleteContact.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="py-10 text-center text-muted-foreground">No contacts yet.</div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Contact</DialogTitle>
            <DialogDescription>Add a contact for this client account.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>First Name</Label>
                <Input value={form.firstName} onChange={event => setForm(prev => ({ ...prev, firstName: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input value={form.lastName} onChange={event => setForm(prev => ({ ...prev, lastName: event.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={form.title} onChange={event => setForm(prev => ({ ...prev, title: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={event => setForm(prev => ({ ...prev, email: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={event => setForm(prev => ({ ...prev, phone: event.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => createContact.mutate()} disabled={createContact.isPending}>
              {createContact.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Contact
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
