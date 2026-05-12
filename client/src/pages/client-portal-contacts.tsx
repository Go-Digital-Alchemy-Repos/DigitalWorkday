import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ContactRound, Loader2, Pencil, Plus, Star, Trash2 } from "lucide-react";

interface ClientInfo {
  id: string;
  companyName: string;
  displayName: string | null;
  accessLevel: string;
}

interface PortalProfileData {
  clients: ClientInfo[];
}

interface ClientContact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  notes: string | null;
}

function canEdit(accessLevel?: string) {
  return Boolean(accessLevel);
}

const emptyContactForm = {
  firstName: "",
  lastName: "",
  title: "",
  email: "",
  phone: "",
  isPrimary: false,
  notes: "",
};

export default function ClientPortalContactsPage() {
  const { toast } = useToast();
  const [clientId, setClientId] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<ClientContact | null>(null);
  const [form, setForm] = useState(emptyContactForm);

  const { data, isLoading } = useQuery<PortalProfileData>({
    queryKey: ["/api/client-portal/profile"],
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
      setEditingContact(null);
      setForm(emptyContactForm);
    },
    onError: (error: Error) => {
      toast({ title: "Unable to add contact", description: error.message, variant: "destructive" });
    },
  });

  const updateContact = useMutation({
    mutationFn: async () => {
      if (!editingContact) return null;
      const res = await apiRequest("PATCH", `/api/client-portal/clients/${clientId}/contacts/${editingContact.id}`, form);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Contact updated" });
      queryClient.invalidateQueries({ queryKey: contactsQueryKey });
      setDialogOpen(false);
      setEditingContact(null);
      setForm(emptyContactForm);
    },
    onError: (error: Error) => {
      toast({ title: "Unable to update contact", description: error.message, variant: "destructive" });
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

  const openCreateDialog = () => {
    setEditingContact(null);
    setForm(emptyContactForm);
    setDialogOpen(true);
  };

  const openEditDialog = (contact: ClientContact) => {
    setEditingContact(contact);
    setForm({
      firstName: contact.firstName || "",
      lastName: contact.lastName || "",
      title: contact.title || "",
      email: contact.email || "",
      phone: contact.phone || "",
      isPrimary: Boolean(contact.isPrimary),
      notes: contact.notes || "",
    });
    setDialogOpen(true);
  };

  const closeDialog = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditingContact(null);
      setForm(emptyContactForm);
    }
  };

  const savePending = createContact.isPending || updateContact.isPending;
  const handleSave = () => {
    if (editingContact) {
      updateContact.mutate();
    } else {
      createContact.mutate();
    }
  };

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
            <Button onClick={openCreateDialog}>
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
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {[contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email || "Unnamed contact"}
                      </span>
                      {contact.isPrimary && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          <Star className="h-3 w-3" />
                          Primary
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground truncate">
                      {[contact.title, contact.email, contact.phone].filter(Boolean).join(" - ")}
                    </div>
                    {contact.notes && (
                      <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {contact.notes}
                      </div>
                    )}
                  </div>
                  {canEdit(selectedClient?.accessLevel) && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(contact)}
                        aria-label="Edit contact"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteContact.mutate(contact.id)}
                        disabled={deleteContact.isPending}
                        aria-label="Delete contact"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="py-10 text-center text-muted-foreground">No contacts yet.</div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingContact ? "Edit Contact" : "Add Contact"}</DialogTitle>
            <DialogDescription>
              {editingContact ? "Update this client contact." : "Add a contact for this client account."}
            </DialogDescription>
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
              <Label>Title / Department</Label>
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
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={event => setForm(prev => ({ ...prev, notes: event.target.value }))}
                rows={3}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.isPrimary}
                onCheckedChange={checked => setForm(prev => ({ ...prev, isPrimary: checked === true }))}
              />
              Primary contact
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => closeDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={savePending}>
              {savePending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingContact ? "Save Contact" : "Add Contact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
