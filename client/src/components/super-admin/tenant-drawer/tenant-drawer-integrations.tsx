import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Save,
  Loader2,
  Mail,
  HardDrive,
  TestTube,
  Eye,
  EyeOff,
  Lock,
} from "lucide-react";
import { IntegrationStatusBadge } from "./shared-components";
import type { TenantWithDetails, IntegrationSummary, IntegrationStatus, MailgunConfig, S3Config } from "./types";

interface TenantDrawerIntegrationsProps {
  activeTenant: TenantWithDetails;
  open: boolean;
}

export function TenantDrawerIntegrations({ activeTenant, open }: TenantDrawerIntegrationsProps) {
  const { toast } = useToast();
  const [showApiKey, setShowApiKey] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [mailgunData, setMailgunData] = useState<MailgunConfig>({});
  const [s3Data, setS3Data] = useState<S3Config>({});

  const { data: integrationsResponse } = useQuery<{ integrations: IntegrationSummary[] }>({
    queryKey: ["/api/v1/super/tenants", activeTenant.id, "integrations"],
    queryFn: () => fetch(`/api/v1/super/tenants/${activeTenant.id}/integrations`, { credentials: "include" }).then(r => r.json()),
    enabled: !!activeTenant.id && open,
  });

  const mailgunIntegration = integrationsResponse?.integrations?.find(i => i.provider === "mailgun");
  const s3Integration = integrationsResponse?.integrations?.find(i => i.provider === "s3");

  const getIntegrationStatus = (provider: string): IntegrationStatus => {
    const integration = integrationsResponse?.integrations?.find(i => i.provider === provider);
    return integration?.status || "not_configured";
  };

  useEffect(() => {
    if (mailgunIntegration) {
      setMailgunData({
        domain: (mailgunIntegration as any).domain || "",
        fromEmail: (mailgunIntegration as any).fromEmail || "",
        replyTo: (mailgunIntegration as any).replyTo || "",
      });
    }
    if (s3Integration) {
      setS3Data({
        bucketName: (s3Integration as any).bucketName || "",
        region: (s3Integration as any).region || "",
        keyPrefixTemplate: (s3Integration as any).keyPrefixTemplate || "",
      });
    }
  }, [integrationsResponse]);

  const saveMailgunMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PUT", `/api/v1/super/tenants/${activeTenant.id}/integrations/mailgun`, mailgunData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant.id, "integrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant.id, "health"] });
      toast({ title: "Mailgun settings saved" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to save Mailgun settings", description: error.message, variant: "destructive" });
    },
  });

  const testMailgunMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${activeTenant.id}/integrations/mailgun/test`);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Mailgun test successful", description: "Test email sent successfully" });
      } else {
        toast({ title: "Mailgun test failed", description: data.error || "Test failed", variant: "destructive" });
      }
    },
    onError: (error: any) => {
      toast({ title: "Mailgun test failed", description: error.message, variant: "destructive" });
    },
  });

  const saveS3Mutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PUT", `/api/v1/super/tenants/${activeTenant.id}/integrations/s3`, s3Data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant.id, "integrations"] });
      toast({ title: "S3 settings saved" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to save S3 settings", description: error.message, variant: "destructive" });
    },
  });

  const testS3Mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${activeTenant.id}/integrations/s3/test`);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "S3 test successful", description: "Connection and permissions verified" });
      } else {
        toast({ title: "S3 test failed", description: data.error || "Test failed", variant: "destructive" });
      }
    },
    onError: (error: any) => {
      toast({ title: "S3 test failed", description: error.message, variant: "destructive" });
    },
  });

  const handleSaveMailgun = (e: React.FormEvent) => {
    e.preventDefault();
    saveMailgunMutation.mutate();
  };

  const handleSaveS3 = (e: React.FormEvent) => {
    e.preventDefault();
    saveS3Mutation.mutate();
  };

  return (
    <div className="space-y-6 mt-6">
      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Mailgun</CardTitle>
            </div>
            <IntegrationStatusBadge status={getIntegrationStatus("mailgun")} />
          </div>
          <CardDescription>Configure email sending for this tenant</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveMailgun} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="mg-domain" className="text-xs">Domain</Label>
                <Input id="mg-domain" placeholder="mg.example.com" value={mailgunData.domain || ""} onChange={(e) => setMailgunData(prev => ({ ...prev, domain: e.target.value }))} className="h-8" data-testid="input-mailgun-domain" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="mg-from" className="text-xs">From Email</Label>
                <Input id="mg-from" type="email" placeholder="noreply@example.com" value={mailgunData.fromEmail || ""} onChange={(e) => setMailgunData(prev => ({ ...prev, fromEmail: e.target.value }))} className="h-8" data-testid="input-mailgun-from" />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="mg-reply" className="text-xs">Reply-To</Label>
                <Input id="mg-reply" type="email" value={mailgunData.replyTo || ""} onChange={(e) => setMailgunData(prev => ({ ...prev, replyTo: e.target.value }))} className="h-8" data-testid="input-mailgun-reply" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="mg-key" className="text-xs">
                  API Key
                  {mailgunIntegration?.secretConfigured && (<Lock className="h-3 w-3 inline ml-1 text-muted-foreground" />)}
                </Label>
                <div className="relative">
                  <Input id="mg-key" type={showApiKey ? "text" : "password"} placeholder={mailgunIntegration?.secretConfigured ? "••••••••" : "key-xxx..."} value={mailgunData.apiKey || ""} onChange={(e) => setMailgunData(prev => ({ ...prev, apiKey: e.target.value }))} className="h-8 pr-8" data-testid="input-mailgun-key" />
                  <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-8 w-8" onClick={() => setShowApiKey(!showApiKey)}>
                    {showApiKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </Button>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => testMailgunMutation.mutate()} disabled={testMailgunMutation.isPending || getIntegrationStatus("mailgun") === "not_configured"} data-testid="button-test-mailgun">
                {testMailgunMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <TestTube className="h-3 w-3 mr-1" />}
                Test
              </Button>
              <Button type="submit" size="sm" disabled={saveMailgunMutation.isPending} data-testid="button-save-mailgun">
                {saveMailgunMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                Save
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">S3 Storage</CardTitle>
            </div>
            <IntegrationStatusBadge status={getIntegrationStatus("s3")} />
          </div>
          <CardDescription>Configure file storage for this tenant</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveS3} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="s3-bucket" className="text-xs">Bucket Name</Label>
                <Input id="s3-bucket" placeholder="my-bucket" value={s3Data.bucketName || ""} onChange={(e) => setS3Data(prev => ({ ...prev, bucketName: e.target.value }))} className="h-8" data-testid="input-s3-bucket" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="s3-region" className="text-xs">Region</Label>
                <Input id="s3-region" placeholder="us-east-1" value={s3Data.region || ""} onChange={(e) => setS3Data(prev => ({ ...prev, region: e.target.value }))} className="h-8" data-testid="input-s3-region" />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="s3-prefix" className="text-xs">Key Prefix</Label>
              <Input id="s3-prefix" placeholder="tenants/{tenantId}/" value={s3Data.keyPrefixTemplate || ""} onChange={(e) => setS3Data(prev => ({ ...prev, keyPrefixTemplate: e.target.value }))} className="h-8" data-testid="input-s3-prefix" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="s3-access" className="text-xs">
                  Access Key ID
                  {s3Integration?.secretConfigured && (<Lock className="h-3 w-3 inline ml-1 text-muted-foreground" />)}
                </Label>
                <Input id="s3-access" placeholder={s3Integration?.secretConfigured ? "••••••••" : "AKIA..."} value={s3Data.accessKeyId || ""} onChange={(e) => setS3Data(prev => ({ ...prev, accessKeyId: e.target.value }))} className="h-8" data-testid="input-s3-access" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="s3-secret" className="text-xs">Secret Access Key</Label>
                <div className="relative">
                  <Input id="s3-secret" type={showSecretKey ? "text" : "password"} placeholder={s3Integration?.secretConfigured ? "••••••••" : "Secret..."} value={s3Data.secretAccessKey || ""} onChange={(e) => setS3Data(prev => ({ ...prev, secretAccessKey: e.target.value }))} className="h-8 pr-8" data-testid="input-s3-secret" />
                  <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-8 w-8" onClick={() => setShowSecretKey(!showSecretKey)}>
                    {showSecretKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </Button>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => testS3Mutation.mutate()} disabled={testS3Mutation.isPending || getIntegrationStatus("s3") === "not_configured"} data-testid="button-test-s3">
                {testS3Mutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <TestTube className="h-3 w-3 mr-1" />}
                Test
              </Button>
              <Button type="submit" size="sm" disabled={saveS3Mutation.isPending} data-testid="button-save-s3">
                {saveS3Mutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                Save
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
