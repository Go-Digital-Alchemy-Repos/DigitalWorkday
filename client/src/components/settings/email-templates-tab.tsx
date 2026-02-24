import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Loader2, Save, RotateCcw, Eye, Mail, Code, FileText, Variable, Copy, Check
} from "lucide-react";

interface TemplateVariable {
  name: string;
  description: string;
  example: string;
}

interface EmailTemplateItem {
  id: string;
  tenantId: string | null;
  templateKey: string;
  name: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  variables: TemplateVariable[] | null;
  isActive: boolean;
  isCustomized: boolean;
  availableVariables: TemplateVariable[];
  createdAt: string;
  updatedAt: string;
}

interface PreviewResult {
  rendered: {
    subject: string;
    htmlBody: string;
    textBody: string;
  };
  sampleVariables: Record<string, string>;
}

const TEMPLATE_ICONS: Record<string, string> = {
  forgot_password: "🔑",
  mention_notification: "💬",
  invitation: "✉️",
  task_assignment: "📋",
  welcome_email: "👋",
  admin_password_reset: "🔐",
  platform_admin_invite: "🛡️",
  user_provision: "👤",
  task_due_reminder: "⏰",
  support_ticket_created: "🎫",
  support_ticket_assigned: "📌",
};

const TEMPLATE_DESCRIPTIONS: Record<string, string> = {
  forgot_password: "Sent when a user requests a password reset",
  mention_notification: "Sent when a user is @mentioned in a comment",
  invitation: "Sent when a user is invited to join the platform",
  task_assignment: "Sent when a task is assigned to a user",
  welcome_email: "Sent to new users after account creation",
  admin_password_reset: "Sent when a super admin resets a user's password",
  platform_admin_invite: "Sent when inviting a new platform administrator",
  user_provision: "Sent when a new user account is provisioned by an admin",
  task_due_reminder: "Sent to remind assignees about upcoming task deadlines",
  support_ticket_created: "Sent to confirm a support ticket has been created",
  support_ticket_assigned: "Sent when a support ticket is assigned to an agent",
};

export function EmailTemplatesTab() {
  const { toast } = useToast();
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplateItem | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [copiedVar, setCopiedVar] = useState<string | null>(null);

  const [editForm, setEditForm] = useState({
    name: "",
    subject: "",
    htmlBody: "",
    textBody: "",
  });

  const { data: templatesData, isLoading } = useQuery<{ templates: EmailTemplateItem[] }>({
    queryKey: ["/api/v1/system/email-templates"],
  });

  const saveMutation = useMutation({
    mutationFn: async ({ templateKey, data }: { templateKey: string; data: typeof editForm }) => {
      return apiRequest("PUT", `/api/v1/system/email-templates/${templateKey}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/system/email-templates"] });
      toast({ title: "Template saved successfully" });
      setEditorOpen(false);
    },
    onError: () => {
      toast({ title: "Failed to save template", variant: "destructive" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async (templateKey: string) => {
      return apiRequest("POST", `/api/v1/system/email-templates/${templateKey}/reset`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/system/email-templates"] });
      toast({ title: "Template reset to default" });
      setEditorOpen(false);
    },
    onError: () => {
      toast({ title: "Failed to reset template", variant: "destructive" });
    },
  });

  const previewMutation = useMutation({
    mutationFn: async (data: { templateKey: string; subject: string; htmlBody: string; textBody: string }) => {
      const response = await apiRequest("POST", "/api/v1/system/email-templates/preview", data);
      return response.json() as Promise<PreviewResult>;
    },
    onSuccess: (result) => {
      setPreviewResult(result);
      setPreviewOpen(true);
    },
    onError: () => {
      toast({ title: "Failed to generate preview", variant: "destructive" });
    },
  });

  function openEditor(template: EmailTemplateItem) {
    setSelectedTemplate(template);
    setEditForm({
      name: template.name,
      subject: template.subject,
      htmlBody: template.htmlBody,
      textBody: template.textBody,
    });
    setEditorOpen(true);
  }

  function handlePreview() {
    if (!selectedTemplate) return;
    previewMutation.mutate({
      templateKey: selectedTemplate.templateKey,
      subject: editForm.subject,
      htmlBody: editForm.htmlBody,
      textBody: editForm.textBody,
    });
  }

  function handleSave() {
    if (!selectedTemplate) return;
    saveMutation.mutate({
      templateKey: selectedTemplate.templateKey,
      data: editForm,
    });
  }

  function handleReset() {
    if (!selectedTemplate) return;
    resetMutation.mutate(selectedTemplate.templateKey);
  }

  function copyVariable(varName: string) {
    navigator.clipboard.writeText(`{{${varName}}}`);
    setCopiedVar(varName);
    setTimeout(() => setCopiedVar(null), 1500);
  }

  const templates = templatesData?.templates || [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Templates
          </CardTitle>
          <CardDescription>
            Customize the content and appearance of system emails. These templates are used as defaults for all tenants unless they configure their own.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : templates.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No email templates found. They will be created automatically on next server restart.</p>
          ) : (
            <div className="grid gap-3">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 cursor-pointer transition-colors"
                  onClick={() => openEditor(template)}
                  data-testid={`email-template-${template.templateKey}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{TEMPLATE_ICONS[template.templateKey] || "📧"}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{template.name}</span>
                        {template.isCustomized && (
                          <Badge variant="outline" className="text-xs">Customized</Badge>
                        )}
                        {!template.isCustomized && (
                          <Badge variant="secondary" className="text-xs">Default</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {TEMPLATE_DESCRIPTIONS[template.templateKey] || template.templateKey}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" data-testid={`button-edit-template-${template.templateKey}`}>
                    Edit
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-xl">{selectedTemplate ? TEMPLATE_ICONS[selectedTemplate.templateKey] || "📧" : ""}</span>
              Edit: {editForm.name}
            </DialogTitle>
            <DialogDescription>
              {selectedTemplate ? TEMPLATE_DESCRIPTIONS[selectedTemplate.templateKey] : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="template-name">Template Name</Label>
              <Input
                id="template-name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                data-testid="input-template-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="template-subject">Subject Line</Label>
              <Input
                id="template-subject"
                value={editForm.subject}
                onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })}
                placeholder="Email subject with {{variables}}"
                data-testid="input-template-subject"
              />
              <p className="text-xs text-muted-foreground">
                Use {"{{variableName}}"} syntax for dynamic content
              </p>
            </div>

            {selectedTemplate?.availableVariables && selectedTemplate.availableVariables.length > 0 && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Variable className="h-4 w-4" />
                  Available Variables
                </Label>
                <div className="border rounded-lg p-3 bg-muted/30">
                  <div className="grid gap-1.5">
                    {selectedTemplate.availableVariables.map((v) => (
                      <div key={v.name} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => copyVariable(v.name)}
                            className="font-mono text-xs px-1.5 py-0.5 bg-background border rounded hover:bg-accent transition-colors cursor-pointer flex items-center gap-1"
                            data-testid={`button-copy-var-${v.name}`}
                          >
                            {`{{${v.name}}}`}
                            {copiedVar === v.name ? (
                              <Check className="h-3 w-3 text-green-500" />
                            ) : (
                              <Copy className="h-3 w-3 text-muted-foreground" />
                            )}
                          </button>
                          <span className="text-muted-foreground">{v.description}</span>
                        </div>
                        <span className="text-xs text-muted-foreground italic">{v.example}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <Tabs defaultValue="html" className="w-full">
              <TabsList>
                <TabsTrigger value="html" data-testid="tab-html-body">
                  <Code className="h-4 w-4 mr-1" />
                  HTML Body
                </TabsTrigger>
                <TabsTrigger value="text" data-testid="tab-text-body">
                  <FileText className="h-4 w-4 mr-1" />
                  Plain Text
                </TabsTrigger>
              </TabsList>
              <TabsContent value="html" className="space-y-2">
                <Textarea
                  value={editForm.htmlBody}
                  onChange={(e) => setEditForm({ ...editForm, htmlBody: e.target.value })}
                  className="min-h-[300px] font-mono text-sm"
                  placeholder="HTML email body..."
                  data-testid="textarea-html-body"
                />
              </TabsContent>
              <TabsContent value="text" className="space-y-2">
                <Textarea
                  value={editForm.textBody}
                  onChange={(e) => setEditForm({ ...editForm, textBody: e.target.value })}
                  className="min-h-[300px] font-mono text-sm"
                  placeholder="Plain text email body..."
                  data-testid="textarea-text-body"
                />
              </TabsContent>
            </Tabs>
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between">
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={resetMutation.isPending}
              data-testid="button-reset-template"
            >
              {resetMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RotateCcw className="h-4 w-4 mr-2" />}
              Reset to Default
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handlePreview}
                disabled={previewMutation.isPending}
                data-testid="button-preview-template"
              >
                {previewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                Preview
              </Button>
              <Button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                data-testid="button-save-template"
              >
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Save Template
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Email Preview</DialogTitle>
            <DialogDescription>
              Preview with sample data. Variables have been replaced with example values.
            </DialogDescription>
          </DialogHeader>

          {previewResult && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Subject</Label>
                <div className="p-3 border rounded-lg bg-muted/30 font-medium">
                  {previewResult.rendered.subject}
                </div>
              </div>

              <Separator />

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">HTML Preview</Label>
                <div className="border rounded-lg overflow-hidden bg-white">
                  <iframe
                    srcDoc={previewResult.rendered.htmlBody}
                    title="Email Preview"
                    className="w-full min-h-[400px] border-0"
                    sandbox="allow-same-origin"
                    data-testid="iframe-email-preview"
                  />
                </div>
              </div>

              {previewResult.sampleVariables && Object.keys(previewResult.sampleVariables).length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Sample Variables Used</Label>
                  <div className="p-3 border rounded-lg bg-muted/30 text-sm">
                    <div className="grid grid-cols-2 gap-1">
                      {Object.entries(previewResult.sampleVariables).map(([key, value]) => (
                        <div key={key} className="flex gap-2">
                          <span className="font-mono text-xs text-muted-foreground">{`{{${key}}}`}</span>
                          <span className="text-xs">= {value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
