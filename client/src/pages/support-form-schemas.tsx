import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, ArrowLeft, Loader2, FileText, GripVertical, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";

interface FormField {
  key: string;
  label: string;
  type: "text" | "textarea" | "select" | "number" | "date" | "checkbox";
  required?: boolean;
  options?: string[];
  placeholder?: string;
}

interface TicketFormSchema {
  id: string;
  tenantId: string;
  workspaceId: string | null;
  category: string;
  schemaJson: FormField[];
  createdAt: string;
  updatedAt: string;
}

const categoryLabels: Record<string, string> = {
  support: "Support",
  work_order: "Work Order",
  billing: "Billing",
  bug: "Bug Report",
  feature_request: "Feature Request",
};

const fieldTypeLabels: Record<string, string> = {
  text: "Text",
  textarea: "Long Text",
  select: "Dropdown",
  number: "Number",
  date: "Date",
  checkbox: "Checkbox",
};

function FieldEditor({ field, onChange, onRemove }: { field: FormField; onChange: (f: FormField) => void; onRemove: () => void }) {
  const [optionsText, setOptionsText] = useState(field.options?.join(", ") || "");

  return (
    <Card className="relative" data-testid={`field-editor-${field.key}`}>
      <CardContent className="py-3 space-y-3">
        <div className="flex items-start gap-2">
          <GripVertical className="h-4 w-4 mt-2 text-muted-foreground flex-shrink-0 cursor-grab" />
          <div className="flex-1 grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Field Key</Label>
              <Input
                value={field.key}
                onChange={(e) => onChange({ ...field, key: e.target.value.replace(/\s/g, "_").toLowerCase() })}
                placeholder="field_name"
                data-testid={`input-field-key-${field.key}`}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Label</Label>
              <Input
                value={field.label}
                onChange={(e) => onChange({ ...field, label: e.target.value })}
                placeholder="Display Label"
                data-testid={`input-field-label-${field.key}`}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select value={field.type} onValueChange={(v) => onChange({ ...field, type: v as FormField["type"] })}>
                <SelectTrigger data-testid={`trigger-field-type-${field.key}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(fieldTypeLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="flex-shrink-0 mt-5"
            onClick={onRemove}
            data-testid={`button-remove-field-${field.key}`}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-4 ml-6 flex-wrap">
          <div className="flex items-center gap-2">
            <Switch
              checked={field.required || false}
              onCheckedChange={(c) => onChange({ ...field, required: c })}
              data-testid={`switch-required-${field.key}`}
            />
            <Label className="text-xs">Required</Label>
          </div>
          <div className="flex-1 min-w-[200px] space-y-1">
            <Label className="text-xs">Placeholder</Label>
            <Input
              value={field.placeholder || ""}
              onChange={(e) => onChange({ ...field, placeholder: e.target.value })}
              placeholder="Placeholder text"
              data-testid={`input-placeholder-${field.key}`}
            />
          </div>
        </div>

        {field.type === "select" && (
          <div className="ml-6 space-y-1">
            <Label className="text-xs">Options (comma-separated)</Label>
            <Input
              value={optionsText}
              onChange={(e) => {
                setOptionsText(e.target.value);
                onChange({ ...field, options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) });
              }}
              placeholder="Option A, Option B, Option C"
              data-testid={`input-options-${field.key}`}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FormSchemaEditor({ schema, onClose, onSaved }: { schema?: TicketFormSchema; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [category, setCategory] = useState(schema?.category || "support");
  const [fields, setFields] = useState<FormField[]>(schema?.schemaJson || []);

  const mutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/v1/support/form-schemas", {
        category,
        schemaJson: fields,
      });
    },
    onSuccess: () => {
      toast({ title: schema ? "Form schema updated" : "Form schema created" });
      onSaved();
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const addField = () => {
    const key = `field_${fields.length + 1}`;
    setFields([...fields, { key, label: "", type: "text", required: false }]);
  };

  const updateField = (index: number, field: FormField) => {
    const updated = [...fields];
    updated[index] = field;
    setFields(updated);
  };

  const removeField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Category</Label>
        <Select value={category} onValueChange={setCategory} disabled={!!schema} data-testid="select-form-category">
          <SelectTrigger data-testid="trigger-form-category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(categoryLabels).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Custom Fields</Label>
          <Button variant="outline" size="sm" onClick={addField} data-testid="button-add-field">
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Field
          </Button>
        </div>

        {fields.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No custom fields yet. Add fields that will appear when creating tickets in this category.
          </p>
        )}

        <div className="space-y-2">
          {fields.map((field, index) => (
            <FieldEditor
              key={index}
              field={field}
              onChange={(f) => updateField(index, f)}
              onRemove={() => removeField(index)}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onClose} data-testid="button-cancel-form">Cancel</Button>
        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !category}
          data-testid="button-save-form-schema"
        >
          {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {schema ? "Update" : "Save"}
        </Button>
      </div>
    </div>
  );
}

export default function SupportFormSchemas() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingSchema, setEditingSchema] = useState<TicketFormSchema | undefined>();
  const [showEditor, setShowEditor] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<TicketFormSchema | null>(null);

  const { data: schemas, isLoading } = useQuery<TicketFormSchema[]>({
    queryKey: ["/api/v1/support/form-schemas"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/v1/support/form-schemas/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/support/form-schemas"] });
      toast({ title: "Form schema deleted" });
      setDeleteConfirm(null);
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSaved = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/v1/support/form-schemas"] });
    setShowEditor(false);
    setEditingSchema(undefined);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => navigate("/support")} data-testid="button-back-support">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Ticket Form Schemas</h1>
          <p className="text-sm text-muted-foreground">Define custom fields for each ticket category</p>
        </div>
        <Button onClick={() => { setEditingSchema(undefined); setShowEditor(true); }} data-testid="button-add-form-schema">
          <Plus className="h-4 w-4 mr-2" />
          Add Schema
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : !schemas?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground" data-testid="text-empty-state">No form schemas defined yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create schemas to add custom fields when portal users create tickets in specific categories
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {schemas.map((schema) => (
            <Card key={schema.id} className="hover-elevate" data-testid={`card-form-schema-${schema.id}`}>
              <CardContent className="py-4 flex items-center gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" data-testid={`badge-category-${schema.id}`}>
                      {categoryLabels[schema.category] || schema.category}
                    </Badge>
                    <span className="text-sm text-muted-foreground" data-testid={`text-field-count-${schema.id}`}>
                      {schema.schemaJson.length} field{schema.schemaJson.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {schema.schemaJson.length > 0 && (
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      {schema.schemaJson.slice(0, 4).map((f: FormField) => (
                        <Badge key={f.key} variant="secondary" className="text-xs">
                          {f.label || f.key}
                        </Badge>
                      ))}
                      {schema.schemaJson.length > 4 && (
                        <span className="text-xs text-muted-foreground">+{schema.schemaJson.length - 4} more</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => { setEditingSchema(schema); setShowEditor(true); }}
                    data-testid={`button-edit-schema-${schema.id}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteConfirm(schema)}
                    data-testid={`button-delete-schema-${schema.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showEditor} onOpenChange={(open) => { if (!open) { setShowEditor(false); setEditingSchema(undefined); } }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="dialog-form-editor">
          <DialogHeader>
            <DialogTitle>{editingSchema ? "Edit Form Schema" : "New Form Schema"}</DialogTitle>
            <DialogDescription>
              {editingSchema
                ? "Update the custom fields for this ticket category"
                : "Define custom fields that will appear when creating tickets in a category"}
            </DialogDescription>
          </DialogHeader>
          <FormSchemaEditor
            schema={editingSchema}
            onClose={() => { setShowEditor(false); setEditingSchema(undefined); }}
            onSaved={handleSaved}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent data-testid="dialog-confirm-delete">
          <DialogHeader>
            <DialogTitle>Delete Form Schema</DialogTitle>
            <DialogDescription>
              This will remove the custom fields configuration for this category. Existing ticket data won't be affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} data-testid="button-cancel-delete">Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
