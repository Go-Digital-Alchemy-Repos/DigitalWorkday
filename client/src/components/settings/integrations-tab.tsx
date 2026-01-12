import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Mail, Send, Check, X, Lock, Slack, Calendar, Zap, Webhook } from "lucide-react";
import { SiSlack, SiZapier, SiGooglecalendar } from "react-icons/si";

interface MailgunSettings {
  configured: boolean;
  domain?: string;
  fromEmail?: string;
  replyTo?: string;
}

export function IntegrationsTab() {
  const [mailgunDomain, setMailgunDomain] = useState("");
  const [mailgunApiKey, setMailgunApiKey] = useState("");
  const [mailgunFromEmail, setMailgunFromEmail] = useState("");
  const [mailgunReplyTo, setMailgunReplyTo] = useState("");
  const { toast } = useToast();

  const { data: mailgunSettings, isLoading } = useQuery<MailgunSettings>({
    queryKey: ["/api/settings/mailgun"],
  });

  const saveMailgunMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("PUT", "/api/settings/mailgun", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/mailgun"] });
      toast({ title: "Mailgun settings saved" });
      setMailgunApiKey("");
    },
    onError: () => {
      toast({ title: "Failed to save settings", variant: "destructive" });
    },
  });

  const testMailgunMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/settings/mailgun/test");
    },
    onSuccess: () => {
      toast({ title: "Test email sent successfully" });
    },
    onError: () => {
      toast({ title: "Failed to send test email", variant: "destructive" });
    },
  });

  const handleSaveMailgun = (e: React.FormEvent) => {
    e.preventDefault();
    saveMailgunMutation.mutate({
      domain: mailgunDomain || mailgunSettings?.domain,
      apiKey: mailgunApiKey || undefined,
      fromEmail: mailgunFromEmail || mailgunSettings?.fromEmail,
      replyTo: mailgunReplyTo || mailgunSettings?.replyTo,
    });
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <Mail className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <CardTitle className="text-lg">Mailgun</CardTitle>
                <CardDescription>Email notifications and invitations</CardDescription>
              </div>
            </div>
            <Badge variant={mailgunSettings?.configured ? "default" : "secondary"}>
              {mailgunSettings?.configured ? (
                <><Check className="h-3 w-3 mr-1" /> Configured</>
              ) : (
                <><X className="h-3 w-3 mr-1" /> Not Configured</>
              )}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveMailgun} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="mailgun-domain">Domain</Label>
                <Input
                  id="mailgun-domain"
                  placeholder="mg.yourdomain.com"
                  value={mailgunDomain || mailgunSettings?.domain || ""}
                  onChange={(e) => setMailgunDomain(e.target.value)}
                  data-testid="input-mailgun-domain"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mailgun-api-key">
                  API Key
                  {mailgunSettings?.configured && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      <Lock className="h-3 w-3 inline mr-1" />
                      (hidden for security)
                    </span>
                  )}
                </Label>
                <Input
                  id="mailgun-api-key"
                  type="password"
                  placeholder={mailgunSettings?.configured ? "••••••••••••" : "key-xxxxxxxxxx"}
                  value={mailgunApiKey}
                  onChange={(e) => setMailgunApiKey(e.target.value)}
                  data-testid="input-mailgun-api-key"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mailgun-from">From Email</Label>
                <Input
                  id="mailgun-from"
                  type="email"
                  placeholder="noreply@yourdomain.com"
                  value={mailgunFromEmail || mailgunSettings?.fromEmail || ""}
                  onChange={(e) => setMailgunFromEmail(e.target.value)}
                  data-testid="input-mailgun-from"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mailgun-reply-to">Reply-To (optional)</Label>
                <Input
                  id="mailgun-reply-to"
                  type="email"
                  placeholder="support@yourdomain.com"
                  value={mailgunReplyTo || mailgunSettings?.replyTo || ""}
                  onChange={(e) => setMailgunReplyTo(e.target.value)}
                  data-testid="input-mailgun-reply-to"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Button type="submit" disabled={saveMailgunMutation.isPending} data-testid="button-save-mailgun">
                {saveMailgunMutation.isPending ? "Saving..." : "Save Settings"}
              </Button>
              {mailgunSettings?.configured && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => testMailgunMutation.mutate()}
                  disabled={testMailgunMutation.isPending}
                  data-testid="button-test-mailgun"
                >
                  <Send className="h-4 w-4 mr-2" />
                  {testMailgunMutation.isPending ? "Sending..." : "Send Test Email"}
                </Button>
              )}
            </div>
          </form>
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
