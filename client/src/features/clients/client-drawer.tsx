import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FullScreenDrawer, FullScreenDrawerFooter } from "@/components/ui/full-screen-drawer";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/richtext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2 } from "lucide-react";
import type { Client } from "@shared/schema";

const clientSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  displayName: z.string().optional(),
  parentClientId: z.string().optional(),
  status: z.enum(["active", "inactive", "prospect"]).default("active"),
  industry: z.string().optional(),
  website: z.string().optional(),
  notes: z.string().optional(),
});

type ClientFormData = z.infer<typeof clientSchema>;

interface ClientDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: ClientFormData) => Promise<void>;
  client?: Client | null;
  isLoading?: boolean;
  mode: "create" | "edit";
}

export function ClientDrawer({
  open,
  onOpenChange,
  onSubmit,
  client,
  isLoading = false,
  mode,
}: ClientDrawerProps) {
  const [hasChanges, setHasChanges] = useState(false);

  const { data: potentialParents } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
    enabled: open,
    staleTime: 60 * 1000,
  });

  const topLevelClients = potentialParents?.filter(
    (c) => !c.parentClientId && c.status === "active" && c.id !== client?.id
  ) || [];

  const form = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    mode: "onChange",
    defaultValues: {
      companyName: "",
      displayName: "",
      parentClientId: "",
      status: "active",
      industry: "",
      website: "https://",
      notes: "",
    },
  });

  useEffect(() => {
    if (open && client && mode === "edit") {
      form.reset({
        companyName: client.companyName,
        displayName: client.displayName || "",
        parentClientId: client.parentClientId || "",
        status: client.status as "active" | "inactive" | "prospect",
        industry: client.industry || "",
        website: client.website || "https://",
        notes: client.notes || "",
      });
    } else if (open && mode === "create") {
      form.reset({
        companyName: "",
        displayName: "",
        parentClientId: "",
        status: "active",
        industry: "",
        website: "https://",
        notes: "",
      });
    }
  }, [open, client, mode, form]);

  useEffect(() => {
    const subscription = form.watch(() => {
      setHasChanges(form.formState.isDirty);
    });
    return () => subscription.unsubscribe();
  }, [form]);

  const handleSubmit = async (data: ClientFormData) => {
    try {
      await onSubmit(data);
      form.reset();
      setHasChanges(false);
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save client:", error);
    }
  };

  const handleClose = () => {
    form.reset();
    setHasChanges(false);
    onOpenChange(false);
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <FullScreenDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={mode === "create" ? "Add New Client" : "Edit Client"}
      description={mode === "create" ? "Create a new client for your organization" : "Update client information"}
      hasUnsavedChanges={hasChanges}
      onConfirmClose={handleClose}
      width="xl"
      footer={
        <FullScreenDrawerFooter
          onCancel={handleCancel}
          onSave={form.handleSubmit(handleSubmit)}
          isLoading={isLoading}
          saveLabel={mode === "create" ? "Create Client" : "Save Changes"}
          saveDisabled={!form.formState.isValid}
        />
      }
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField
              control={form.control}
              name="companyName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Company Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Acme Inc."
                      {...field}
                      data-testid="input-company-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Short name or alias"
                      {...field}
                      data-testid="input-display-name"
                    />
                  </FormControl>
                  <FormDescription>
                    A shorter name for quick reference
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {topLevelClients.length > 0 && (
            <FormField
              control={form.control}
              name="parentClientId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Parent Client</FormLabel>
                  <Select 
                    onValueChange={(value) => field.onChange(value === "_none_" ? "" : value)} 
                    value={field.value || "_none_"}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-parent-client">
                        <SelectValue placeholder="None (Top-level client)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="_none_">
                        <span className="text-muted-foreground">None (Top-level client)</span>
                      </SelectItem>
                      {topLevelClients.map((parent) => (
                        <SelectItem key={parent.id} value={parent.id}>
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            {parent.companyName}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Select a parent to make this a sub-client (division)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField
              control={form.control}
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
              control={form.control}
              name="industry"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Industry</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Technology, Finance, etc."
                      {...field}
                      data-testid="input-industry"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="website"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Website</FormLabel>
                <FormControl>
                  <Input
                    placeholder="https://example.com"
                    {...field}
                    data-testid="input-website"
                  />
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
                  <RichTextEditor
                    value={field.value || ""}
                    onChange={field.onChange}
                    placeholder="Additional notes about this client..."
                    minHeight="120px"
                    data-testid="textarea-notes"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>
    </FullScreenDrawer>
  );
}
