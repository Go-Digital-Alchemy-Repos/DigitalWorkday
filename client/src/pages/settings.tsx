import { useLocation, useRoute, Redirect } from "wouter";
import { useAuth } from "@/lib/auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings as SettingsIcon, Puzzle, FileText, Mail, MessageSquare, Zap, FileArchive, Bell, Newspaper } from "lucide-react";
import { PageHeader, PageShell, SurfacePanel } from "@/components/layout";
import { cn } from "@/lib/utils";
import { IntegrationsTab } from "@/components/settings/integrations-tab";
import { AgreementTab } from "@/components/settings/agreement-tab";
import { EmailLogsTab } from "@/components/settings/email-logs-tab";
import { MessagesTab } from "@/components/settings/messages-tab";
import { PipelineAutomationTab } from "@/components/settings/pipeline-automation-tab";
import { DefaultTenantDocumentsManager } from "@/features/tenantDefaultDocs";
import AlertRulesPage from "@/pages/settings-alerts";
import DigestConfigPage from "@/pages/settings-digest";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
import { hasTenantAdminAccess } from "@shared/roles";

const BASE_SETTINGS_TABS = [
  { id: "integrations", label: "Integrations", icon: Puzzle, flag: null },
  { id: "messages", label: "Messages", icon: MessageSquare, flag: null },
  { id: "email-logs", label: "Email Logs", icon: Mail, flag: null },
  { id: "automation", label: "Automation", icon: Zap, flag: null },
  { id: "agreement", label: "Agreement", icon: FileText, flag: null },
  { id: "default-docs", label: "Default Docs", icon: FileArchive, flag: null },
  { id: "alerts", label: "Alerts", icon: Bell, flag: "enableAlertAutomation" as const },
  { id: "digest", label: "Ops Digest", icon: Newspaper, flag: "enableWeeklyOpsDigest" as const },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const [, params] = useRoute("/settings/:tab");
  const flags = useFeatureFlags();

  if (!hasTenantAdminAccess(user?.role)) {
    return <Redirect to="/" />;
  }

  const SETTINGS_TABS = BASE_SETTINGS_TABS.filter((tab) => {
    if (!tab.flag) return true;
    return flags[tab.flag];
  });

  const activeTab = params?.tab || "integrations";

  const handleTabChange = (value: string) => {
    setLocation(`/settings/${value}`);
  };

  return (
    <PageShell className="bg-[radial-gradient(circle_at_top,_hsl(var(--surface-2))_0%,_transparent_40%)]">
      <PageHeader
        title="System Settings"
        subtitle="Manage integrations, automation, messaging, and tenant defaults."
        icon={<SettingsIcon className="h-6 w-6" />}
      />

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <SurfacePanel radius="3xl" padding="sm">
          <TabsList className="flex h-auto w-full flex-wrap gap-1 rounded-2xl border border-border/70 bg-background/80 p-1 shadow-[inset_0_1px_0_hsl(var(--background)/0.7)]">
            {SETTINGS_TABS.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-xs sm:gap-2 sm:text-sm",
                  "data-[state=active]:shadow-[var(--shadow-soft)]"
                )}
                data-testid={`tab-settings-${tab.id}`}
              >
                <tab.icon className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </SurfacePanel>

        <TabsContent value="integrations" className="mt-0">
          <IntegrationsTab />
        </TabsContent>

        <TabsContent value="messages" className="mt-0">
          <MessagesTab />
        </TabsContent>

        <TabsContent value="email-logs" className="mt-0">
          <EmailLogsTab />
        </TabsContent>

        <TabsContent value="automation" className="mt-0">
          <PipelineAutomationTab />
        </TabsContent>

        <TabsContent value="agreement" className="mt-0">
          <AgreementTab />
        </TabsContent>

        <TabsContent value="default-docs" className="mt-0">
          {user?.tenantId ? (
            <DefaultTenantDocumentsManager tenantId={user.tenantId} mode="tenantAdmin" />
          ) : (
            <SurfacePanel radius="3xl" padding="lg" className="text-sm text-muted-foreground">
              No tenant context available.
            </SurfacePanel>
          )}
        </TabsContent>

        {flags.enableAlertAutomation && (
          <TabsContent value="alerts" className="mt-0">
            <AlertRulesPage />
          </TabsContent>
        )}

        {flags.enableWeeklyOpsDigest && (
          <TabsContent value="digest" className="mt-0">
            <DigestConfigPage />
          </TabsContent>
        )}
      </Tabs>
    </PageShell>
  );
}
