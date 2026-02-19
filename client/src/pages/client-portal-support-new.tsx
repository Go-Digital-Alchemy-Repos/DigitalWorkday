import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ClientInfo {
  id: string;
  companyName: string;
  displayName: string | null;
  accessLevel: string;
}

interface DashboardData {
  clients: ClientInfo[];
  projects: any[];
  tasks: any[];
  upcomingDeadlines: any[];
}

export default function ClientPortalSupportNew() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("support");
  const [priority, setPriority] = useState("normal");
  const [clientId, setClientId] = useState("");

  const { data: dashboardData } = useQuery<DashboardData>({
    queryKey: ["/api/client-portal/dashboard"],
  });

  const clients = dashboardData?.clients || [];

  const createMutation = useMutation({
    mutationFn: async () => {
      const selectedClient = clientId || (clients.length === 1 ? clients[0].id : "");
      if (!selectedClient) throw new Error("Please select a client");

      return apiRequest("POST", "/api/v1/portal/support/tickets", {
        clientId: selectedClient,
        title,
        description: description || null,
        category,
        priority,
      });
    },
    onSuccess: async (res) => {
      const ticket = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/v1/portal/support/tickets"] });
      toast({ title: "Ticket created", description: "Your support ticket has been submitted." });
      navigate(`/portal/support/${ticket.id}`);
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    createMutation.mutate();
  };

  const effectiveClientId = clientId || (clients.length === 1 ? clients[0].id : "");

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/portal/support")} data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-semibold" data-testid="text-new-ticket-title">New Support Ticket</h1>
        </div>

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {clients.length > 1 && (
                <div className="space-y-2">
                  <Label htmlFor="client">Organization</Label>
                  <Select value={clientId} onValueChange={setClientId}>
                    <SelectTrigger data-testid="select-client">
                      <SelectValue placeholder="Select organization" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.displayName || c.companyName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="title">Subject</Label>
                <Input
                  id="title"
                  placeholder="Brief summary of your request"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  data-testid="input-ticket-title"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Provide details about your request..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="min-h-[120px]"
                  data-testid="input-ticket-description"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger data-testid="select-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="support">Support</SelectItem>
                      <SelectItem value="work_order">Work Order</SelectItem>
                      <SelectItem value="billing">Billing</SelectItem>
                      <SelectItem value="bug">Bug Report</SelectItem>
                      <SelectItem value="feature_request">Feature Request</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="priority">Priority</Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger data-testid="select-priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => navigate("/portal/support")} data-testid="button-cancel">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!title.trim() || !effectiveClientId || createMutation.isPending}
                  data-testid="button-submit-ticket"
                >
                  {createMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Submit Ticket
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
