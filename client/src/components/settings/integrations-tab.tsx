import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Mail, Save, Loader2, CheckCircle2, XCircle, 
  AlertTriangle, TestTube, Eye, EyeOff, RefreshCw, Webhook, Send, Sparkles, HardDrive
} from "lucide-react";
import { SiSlack, SiZapier, SiGooglecalendar, SiCloudflare, SiOpenai } from "react-icons/si";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

interface SecretMaskedInfo {
  apiKeyMasked?: string | null;
  accessKeyIdMasked?: string | null;
  secretAccessKeyMasked?: string | null;
}

interface Integration {
  provider: string;
  status: "not_configured" | "configured" | "error";
  publicConfig: Record<string, any> | null;
  secretConfigured: boolean;
  lastTestedAt: string | null;
  secretMasked?: SecretMaskedInfo;
}

interface IntegrationsListResponse {
  integrations: Integration[];
}

export function IntegrationsTab() {
  const { toast } = useToast();
  const [showMailgunKey, setShowMailgunKey] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState("");
  const [showTestEmailDialog, setShowTestEmailDialog] = useState(false);

  const [mailgunForm, setMailgunForm] = useState({
    domain: "",
    fromEmail: "",
    replyTo: "",
    apiKey: "",
  });

  const [r2Form, setR2Form] = useState({
    bucketName: "",
    accountId: "",
    keyPrefixTemplate: "",
    accessKeyId: "",
    secretAccessKey: "",
  });

  const [openaiForm, setOpenaiForm] = useState({
    enabled: true,
    model: "gpt-4o-mini",
    maxTokens: 2000,
    temperature: "0.7",
    apiKey: "",
  });

  const [showR2Keys, setShowR2Keys] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);

  const { data, isLoading, error, refetch } = useQuery<IntegrationsListResponse>({
    queryKey: ["/api/v1/tenant/integrations"],
  });

  const mailgunIntegration = data?.integrations?.find(i => i.provider === "mailgun");
  const r2Integration = data?.integrations?.find(i => i.provider === "r2");
  const openaiIntegration = data?.integrations?.find(i => i.provider === "openai");

  useEffect(() => {
    if (mailgunIntegration?.publicConfig) {
      setMailgunForm({
        domain: mailgunIntegration.publicConfig.domain || "",
        fromEmail: mailgunIntegration.publicConfig.fromEmail || "",
        replyTo: mailgunIntegration.publicConfig.replyTo || "",
        apiKey: "",
      });
    }
    if (r2Integration?.publicConfig) {
      setR2Form({
        bucketName: r2Integration.publicConfig.bucketName || "",
        accountId: r2Integration.publicConfig.accountId || "",
        keyPrefixTemplate: r2Integration.publicConfig.keyPrefixTemplate || "",
        accessKeyId: "",
        secretAccessKey: "",
      });
    }
    if (openaiIntegration?.publicConfig) {
      setOpenaiForm({
        enabled: openaiIntegration.publicConfig.enabled ?? true,
        model: openaiIntegration.publicConfig.model || "gpt-4o-mini",
        maxTokens: openaiIntegration.publicConfig.maxTokens || 2000,
        temperature: openaiIntegration.publicConfig.temperature || "0.7",
        apiKey: "",
      });
    }
  }, [mailgunIntegration, r2Integration, openaiIntegration]);

  const saveMailgunMutation = useMutation({
    mutationFn: async (formData: typeof mailgunForm) => {
      const payload: any = {
        domain: formData.domain || undefined,
        fromEmail: formData.fromEmail || undefined,
        replyTo: formData.replyTo || undefined,
      };
      if (formData.apiKey) {
        payload.apiKey = formData.apiKey;
      }
      return apiRequest("PUT", "/api/v1/tenant/integrations/mailgun", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/tenant/integrations"] });
      setMailgunForm(prev => ({ ...prev, apiKey: "" }));
      toast({ title: "Mailgun settings saved successfully" });
    },
    onError: (err: any) => {
      const message = err?.message || "Failed to save Mailgun settings";
      toast({ title: message, variant: "destructive" });
    },
  });

  const testMailgunMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/v1/tenant/integrations/mailgun/test", {});
      return await res.json();
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/tenant/integrations"] });
      if (response.success) {
        toast({ title: "Mailgun test successful" });
      } else {
        toast({ title: response.message || "Mailgun test failed", variant: "destructive" });
      }
    },
    onError: () => {
      toast({ title: "Failed to test Mailgun", variant: "destructive" });
    },
  });

  const sendTestEmailMutation = useMutation({
    mutationFn: async (toEmail: string) => {
      return apiRequest("POST", "/api/v1/tenant/integrations/mailgun/send-test-email", { toEmail });
    },
    onSuccess: () => {
      setShowTestEmailDialog(false);
      setTestEmailAddress("");
      queryClient.invalidateQueries({ queryKey: ["/api/v1/tenant/integrations"] });
      toast({ title: "Test email sent successfully", description: "Check your inbox for the test email." });
    },
    onError: (err: any) => {
      const errorMessage = err?.data?.error?.message || err?.message || "Unknown error";
      toast({ 
        title: "Failed to send test email", 
        description: errorMessage, 
        variant: "destructive" 
      });
    },
  });

  const saveR2Mutation = useMutation({
    mutationFn: async (formData: typeof r2Form) => {
      const payload: any = {
        bucketName: formData.bucketName || undefined,
        accountId: formData.accountId || undefined,
        keyPrefixTemplate: formData.keyPrefixTemplate || undefined,
      };
      if (formData.accessKeyId) {
        payload.accessKeyId = formData.accessKeyId;
      }
      if (formData.secretAccessKey) {
        payload.secretAccessKey = formData.secretAccessKey;
      }
      return apiRequest("PUT", "/api/v1/tenant/integrations/r2", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/tenant/integrations"] });
      setR2Form(prev => ({ ...prev, accessKeyId: "", secretAccessKey: "" }));
      toast({ title: "Cloudflare R2 settings saved successfully" });
    },
    onError: (err: any) => {
      const message = err?.message || "Failed to save R2 settings";
      toast({ title: message, variant: "destructive" });
    },
  });

  const testR2Mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/v1/tenant/integrations/r2/test", {});
      return await res.json();
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/tenant/integrations"] });
      if (response.success) {
        toast({ title: "Cloudflare R2 test successful" });
      } else {
        toast({ title: response.message || "R2 test failed", variant: "destructive" });
      }
    },
    onError: () => {
      toast({ title: "Failed to test R2", variant: "destructive" });
    },
  });

  const saveOpenAIMutation = useMutation({
    mutationFn: async (formData: typeof openaiForm) => {
      const payload: any = {
        enabled: formData.enabled,
        model: formData.model,
        maxTokens: formData.maxTokens,
        temperature: formData.temperature,
      };
      if (formData.apiKey) {
        payload.apiKey = formData.apiKey;
      }
      return apiRequest("PUT", "/api/v1/tenant/integrations/openai", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/tenant/integrations"] });
      setOpenaiForm(prev => ({ ...prev, apiKey: "" }));
      toast({ title: "OpenAI settings saved successfully" });
    },
    onError: (err: any) => {
      const message = err?.message || "Failed to save OpenAI settings";
      toast({ title: message, variant: "destructive" });
    },
  });

  const testOpenAIMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/v1/tenant/integrations/openai/test", {});
      return await res.json();
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/tenant/integrations"] });
      if (response.success) {
        toast({ title: response.message || "OpenAI test successful" });
      } else {
        toast({ title: response.message || "OpenAI test failed", variant: "destructive" });
      }
    },
    onError: () => {
      toast({ title: "Failed to test OpenAI", variant: "destructive" });
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "configured":
        return (
          <Badge variant="default" className="gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Configured
          </Badge>
        );
      case "error":
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            Error
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            Not Configured
          </Badge>
        );
    }
  };

  const futureIntegrations = [
    {
      name: "Slack",
      description: "Get notifications in Slack channels",
      icon: SiSlack,
      status: "coming-soon",
    },
    {
      name: "Zapier",
      description: "Connect with 5,000+ apps",
      icon: SiZapier,
      status: "coming-soon",
    },
    {
      name: "Google Calendar",
      description: "Sync tasks with your calendar",
      icon: SiGooglecalendar,
      status: "coming-soon",
    },
    {
      name: "Webhooks",
      description: "Send events to external systems",
      icon: Webhook,
      status: "coming-soon",
    },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center">
            <p className="text-muted-foreground mb-4">Failed to load integrations.</p>
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Mailgun Email Integration</CardTitle>
            </div>
            {getStatusBadge(mailgunIntegration?.status || "not_configured")}
          </div>
          <CardDescription>
            Configure Mailgun to send emails from your domain
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="mailgun-domain">Domain</Label>
              <Input
                id="mailgun-domain"
                placeholder="mg.yourdomain.com"
                value={mailgunForm.domain}
                onChange={(e) => setMailgunForm({ ...mailgunForm, domain: e.target.value })}
                data-testid="input-mailgun-domain"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mailgun-fromEmail">From Email</Label>
              <Input
                id="mailgun-fromEmail"
                type="email"
                placeholder="noreply@yourdomain.com"
                value={mailgunForm.fromEmail}
                onChange={(e) => setMailgunForm({ ...mailgunForm, fromEmail: e.target.value })}
                data-testid="input-mailgun-from-email"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="mailgun-replyTo">Reply-To Email (Optional)</Label>
              <Input
                id="mailgun-replyTo"
                type="email"
                placeholder="support@yourdomain.com"
                value={mailgunForm.replyTo}
                onChange={(e) => setMailgunForm({ ...mailgunForm, replyTo: e.target.value })}
                data-testid="input-mailgun-reply-to"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mailgun-apiKey">
                API Key {mailgunIntegration?.secretMasked?.apiKeyMasked && (
                  <span className="text-muted-foreground font-normal">({mailgunIntegration.secretMasked.apiKeyMasked})</span>
                )}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="mailgun-apiKey"
                  type={showMailgunKey ? "text" : "password"}
                  placeholder={mailgunIntegration?.secretConfigured ? "Enter new key to replace" : "Enter API key"}
                  value={mailgunForm.apiKey}
                  onChange={(e) => setMailgunForm({ ...mailgunForm, apiKey: e.target.value })}
                  data-testid="input-mailgun-api-key"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowMailgunKey(!showMailgunKey)}
                >
                  {showMailgunKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Leave blank to keep existing key
              </p>
            </div>
          </div>

          {mailgunIntegration?.lastTestedAt && (
            <p className="text-xs text-muted-foreground">
              Last tested: {new Date(mailgunIntegration.lastTestedAt).toLocaleString()}
            </p>
          )}

          <div className="flex justify-end gap-2 flex-wrap">
            <Button
              type="button"
              variant="outline"
              onClick={() => testMailgunMutation.mutate()}
              disabled={testMailgunMutation.isPending || mailgunIntegration?.status !== "configured"}
              data-testid="button-test-mailgun"
            >
              {testMailgunMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <TestTube className="h-4 w-4 mr-2" />
                  Test Connection
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowTestEmailDialog(true)}
              disabled={mailgunIntegration?.status !== "configured"}
              data-testid="button-send-test-email"
            >
              <Send className="h-4 w-4 mr-2" />
              Send Test Email
            </Button>
            <Button
              type="button"
              onClick={() => saveMailgunMutation.mutate(mailgunForm)}
              disabled={saveMailgunMutation.isPending}
              data-testid="button-save-mailgun"
            >
              {saveMailgunMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Mailgun
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showTestEmailDialog} onOpenChange={setShowTestEmailDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Test Email</DialogTitle>
            <DialogDescription>
              Send a test email to verify your Mailgun configuration is working correctly.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="test-email-address">Recipient Email Address</Label>
              <Input
                id="test-email-address"
                type="email"
                placeholder="you@example.com"
                value={testEmailAddress}
                onChange={(e) => setTestEmailAddress(e.target.value)}
                data-testid="input-test-email-address"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowTestEmailDialog(false);
                setTestEmailAddress("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => sendTestEmailMutation.mutate(testEmailAddress)}
              disabled={sendTestEmailMutation.isPending || !testEmailAddress || !testEmailAddress.includes("@")}
              data-testid="button-confirm-send-test-email"
            >
              {sendTestEmailMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Email
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <SiCloudflare className="h-5 w-5 text-orange-500" />
              <CardTitle className="text-lg">Cloudflare R2 Storage</CardTitle>
            </div>
            {getStatusBadge(r2Integration?.status || "not_configured")}
          </div>
          <CardDescription>
            Configure Cloudflare R2 for S3-compatible object storage
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="r2-bucket">Bucket Name</Label>
              <Input
                id="r2-bucket"
                placeholder="my-r2-bucket"
                value={r2Form.bucketName}
                onChange={(e) => setR2Form({ ...r2Form, bucketName: e.target.value })}
                data-testid="input-r2-bucket"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r2-account">Account ID</Label>
              <Input
                id="r2-account"
                placeholder="abc123def456"
                value={r2Form.accountId}
                onChange={(e) => setR2Form({ ...r2Form, accountId: e.target.value })}
                data-testid="input-r2-account"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="r2-prefix">Key Prefix Template</Label>
            <Input
              id="r2-prefix"
              placeholder="tenants/{tenantId}/"
              value={r2Form.keyPrefixTemplate}
              onChange={(e) => setR2Form({ ...r2Form, keyPrefixTemplate: e.target.value })}
              data-testid="input-r2-prefix"
            />
            <p className="text-xs text-muted-foreground">
              Prefix for all uploaded files. Use {"{tenantId}"} as placeholder.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="r2-accessKey">
                Access Key ID {r2Integration?.secretMasked?.accessKeyIdMasked && (
                  <span className="text-muted-foreground font-normal">({r2Integration.secretMasked.accessKeyIdMasked})</span>
                )}
              </Label>
              <Input
                id="r2-accessKey"
                type={showR2Keys ? "text" : "password"}
                placeholder={r2Integration?.secretConfigured ? "Enter new key to replace" : "Enter access key"}
                value={r2Form.accessKeyId}
                onChange={(e) => setR2Form({ ...r2Form, accessKeyId: e.target.value })}
                data-testid="input-r2-access-key"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r2-secretKey">
                Secret Access Key {r2Integration?.secretMasked?.secretAccessKeyMasked && (
                  <span className="text-muted-foreground font-normal">({r2Integration.secretMasked.secretAccessKeyMasked})</span>
                )}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="r2-secretKey"
                  type={showR2Keys ? "text" : "password"}
                  placeholder={r2Integration?.secretConfigured ? "Enter new key to replace" : "Enter secret key"}
                  value={r2Form.secretAccessKey}
                  onChange={(e) => setR2Form({ ...r2Form, secretAccessKey: e.target.value })}
                  data-testid="input-r2-secret-key"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowR2Keys(!showR2Keys)}
                  data-testid="button-toggle-r2-keys"
                >
                  {showR2Keys ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Leave blank to keep existing credentials
              </p>
            </div>
          </div>

          {r2Integration?.lastTestedAt && (
            <p className="text-xs text-muted-foreground">
              Last tested: {new Date(r2Integration.lastTestedAt).toLocaleString()}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => testR2Mutation.mutate()}
              disabled={testR2Mutation.isPending || r2Integration?.status !== "configured"}
              data-testid="button-test-r2"
            >
              {testR2Mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <TestTube className="h-4 w-4 mr-2" />
                  Test Connection
                </>
              )}
            </Button>
            <Button
              type="button"
              onClick={() => saveR2Mutation.mutate(r2Form)}
              disabled={saveR2Mutation.isPending}
              data-testid="button-save-r2"
            >
              {saveR2Mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save R2
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <SiOpenai className="h-5 w-5" />
              <CardTitle className="text-lg">OpenAI Integration</CardTitle>
            </div>
            {getStatusBadge(openaiIntegration?.status || "not_configured")}
          </div>
          <CardDescription>
            Configure OpenAI for AI-powered assistance features. If not configured, the system will use the default settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="openai-enabled">Enable AI Features</Label>
              <p className="text-xs text-muted-foreground">
                Turn on AI-powered suggestions and assistance
              </p>
            </div>
            <Switch
              id="openai-enabled"
              checked={openaiForm.enabled}
              onCheckedChange={(checked) => setOpenaiForm({ ...openaiForm, enabled: checked })}
              data-testid="switch-openai-enabled"
            />
          </div>
          
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="openai-model">Model</Label>
              <Select
                value={openaiForm.model}
                onValueChange={(value) => setOpenaiForm({ ...openaiForm, model: value })}
              >
                <SelectTrigger id="openai-model" data-testid="select-openai-model">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-4o-mini">GPT-4o Mini (Fast, Economical)</SelectItem>
                  <SelectItem value="gpt-4o">GPT-4o (Powerful)</SelectItem>
                  <SelectItem value="gpt-4.1">GPT-4.1 (Latest)</SelectItem>
                  <SelectItem value="gpt-4.1-mini">GPT-4.1 Mini</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="openai-max-tokens">Max Tokens</Label>
              <Input
                id="openai-max-tokens"
                type="number"
                placeholder="2000"
                value={openaiForm.maxTokens}
                onChange={(e) => setOpenaiForm({ ...openaiForm, maxTokens: parseInt(e.target.value) || 2000 })}
                data-testid="input-openai-max-tokens"
              />
            </div>
          </div>
          
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="openai-temperature">Temperature</Label>
              <Select
                value={openaiForm.temperature}
                onValueChange={(value) => setOpenaiForm({ ...openaiForm, temperature: value })}
              >
                <SelectTrigger id="openai-temperature" data-testid="select-openai-temperature">
                  <SelectValue placeholder="Select temperature" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0.2">0.2 (More Focused)</SelectItem>
                  <SelectItem value="0.5">0.5 (Balanced)</SelectItem>
                  <SelectItem value="0.7">0.7 (Default)</SelectItem>
                  <SelectItem value="1.0">1.0 (More Creative)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="openai-apikey">
                API Key {openaiIntegration?.secretMasked?.apiKeyMasked && (
                  <span className="text-muted-foreground font-normal">({openaiIntegration.secretMasked.apiKeyMasked})</span>
                )}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="openai-apikey"
                  type={showOpenaiKey ? "text" : "password"}
                  placeholder={openaiIntegration?.secretConfigured ? "Enter new key to replace" : "sk-..."}
                  value={openaiForm.apiKey}
                  onChange={(e) => setOpenaiForm({ ...openaiForm, apiKey: e.target.value })}
                  data-testid="input-openai-api-key"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                  data-testid="button-toggle-openai-key"
                >
                  {showOpenaiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {openaiIntegration?.secretConfigured 
                  ? "Leave blank to keep existing API key" 
                  : "Enter your OpenAI API key. If not configured, system default will be used."
                }
              </p>
            </div>
          </div>

          {openaiIntegration?.lastTestedAt && (
            <p className="text-xs text-muted-foreground">
              Last tested: {new Date(openaiIntegration.lastTestedAt).toLocaleString()}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => testOpenAIMutation.mutate()}
              disabled={testOpenAIMutation.isPending || !openaiIntegration?.secretConfigured}
              data-testid="button-test-openai"
            >
              {testOpenAIMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <TestTube className="h-4 w-4 mr-2" />
                  Test Connection
                </>
              )}
            </Button>
            <Button
              type="button"
              onClick={() => saveOpenAIMutation.mutate(openaiForm)}
              disabled={saveOpenAIMutation.isPending}
              data-testid="button-save-openai"
            >
              {saveOpenAIMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save OpenAI
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Coming Soon</CardTitle>
          <CardDescription>Future integrations we're working on</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {futureIntegrations.map((integration) => (
              <div
                key={integration.name}
                className="flex items-center gap-4 p-4 rounded-lg border border-dashed opacity-60"
              >
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                  <integration.icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <div className="font-medium">{integration.name}</div>
                  <div className="text-sm text-muted-foreground">{integration.description}</div>
                </div>
                <Badge variant="outline">Coming Soon</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
