import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
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

interface FormField {
  key: string;
  label: string;
  type: "text" | "textarea" | "select" | "number" | "date" | "checkbox";
  required?: boolean;
  options?: string[];
  placeholder?: string;
}

interface FormSchemaData {
  id: string;
  category: string;
  schemaJson: FormField[];
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
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({});

  const { data: dashboardData } = useQuery<DashboardData>({
    queryKey: ["/api/client-portal/dashboard"],
  });

  const { data: formSchema } = useQuery<FormSchemaData | null>({
    queryKey: ["/api/v1/portal/support/form-schemas", category],
    enabled: !!category,
  });

  useEffect(() => {
    setCustomFields({});
  }, [category]);

  const clients = dashboardData?.clients || [];
  const dynamicFields: FormField[] = formSchema?.schemaJson || [];

  const createMutation = useMutation({
    mutationFn: async () => {
      const selectedClient = clientId || (clients.length === 1 ? clients[0].id : "");
      if (!selectedClient) throw new Error("Please select a client");

      const metadataJson = dynamicFields.length > 0 ? customFields : null;

      return apiRequest("POST", "/api/v1/portal/support/tickets", {
        clientId: selectedClient,
        title,
        description: description || null,
        category,
        priority,
        metadataJson,
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
    for (const field of dynamicFields) {
      if (field.required && (customFields[field.key] === undefined || customFields[field.key] === null || customFields[field.key] === "")) {
        toast({ title: "Missing required field", description: `Please fill in "${field.label}"`, variant: "destructive" });
        return;
      }
    }
    createMutation.mutate();
  };

  const updateCustomField = (key: string, value: unknown) => {
    setCustomFields((prev) => ({ ...prev, [key]: value }));
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

              {dynamicFields.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-4" data-testid="section-custom-fields">
                    <Label className="text-sm font-medium">Additional Information</Label>
                    {dynamicFields.map((field) => (
                      <div key={field.key} className="space-y-2" data-testid={`custom-field-${field.key}`}>
                        <Label htmlFor={`custom-${field.key}`} className="text-sm">
                          {field.label}
                          {field.required && <span className="text-destructive ml-0.5">*</span>}
                        </Label>

                        {field.type === "text" && (
                          <Input
                            id={`custom-${field.key}`}
                            placeholder={field.placeholder || ""}
                            value={(customFields[field.key] as string) || ""}
                            onChange={(e) => updateCustomField(field.key, e.target.value)}
                            required={field.required}
                            data-testid={`input-custom-${field.key}`}
                          />
                        )}

                        {field.type === "textarea" && (
                          <Textarea
                            id={`custom-${field.key}`}
                            placeholder={field.placeholder || ""}
                            value={(customFields[field.key] as string) || ""}
                            onChange={(e) => updateCustomField(field.key, e.target.value)}
                            className="min-h-[80px]"
                            data-testid={`input-custom-${field.key}`}
                          />
                        )}

                        {field.type === "number" && (
                          <Input
                            id={`custom-${field.key}`}
                            type="number"
                            placeholder={field.placeholder || ""}
                            value={(customFields[field.key] as string) || ""}
                            onChange={(e) => updateCustomField(field.key, e.target.value)}
                            required={field.required}
                            data-testid={`input-custom-${field.key}`}
                          />
                        )}

                        {field.type === "date" && (
                          <Input
                            id={`custom-${field.key}`}
                            type="date"
                            value={(customFields[field.key] as string) || ""}
                            onChange={(e) => updateCustomField(field.key, e.target.value)}
                            required={field.required}
                            data-testid={`input-custom-${field.key}`}
                          />
                        )}

                        {field.type === "select" && field.options && (
                          <Select
                            value={(customFields[field.key] as string) || ""}
                            onValueChange={(v) => updateCustomField(field.key, v)}
                          >
                            <SelectTrigger data-testid={`select-custom-${field.key}`}>
                              <SelectValue placeholder={field.placeholder || "Select..."} />
                            </SelectTrigger>
                            <SelectContent>
                              {field.options.map((opt) => (
                                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}

                        {field.type === "checkbox" && (
                          <div className="flex items-center gap-2">
                            <Switch
                              id={`custom-${field.key}`}
                              checked={!!customFields[field.key]}
                              onCheckedChange={(c) => updateCustomField(field.key, c)}
                              data-testid={`switch-custom-${field.key}`}
                            />
                            <Label htmlFor={`custom-${field.key}`} className="text-sm cursor-pointer">
                              {field.placeholder || "Yes"}
                            </Label>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}

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
