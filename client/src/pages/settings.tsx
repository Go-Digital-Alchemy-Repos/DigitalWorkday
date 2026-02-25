import { useLocation, useRoute, Redirect } from "wouter";
import { useAuth } from "@/lib/auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings as SettingsIcon, Puzzle, FileText, Mail, MessageSquare, Zap, FileArchive, Bell, Newspaper } from "lucide-react";
import { IntegrationsTab } from "@/components/settings/integrations-tab";
import { AgreementTab } from "@/components/settings/agreement-tab";
import { EmailLogsTab } from "@/components/settings/email-logs-tab";
import { MessagesTab } from "@/components/settings/messages-tab";
import { PipelineAutomationTab } from "@/components/settings/pipeline-automation-tab";
import { DefaultTenantDocumentsManager } from "@/features/tenantDefaultDocs";
import AlertRulesPage from "@/pages/settings-alerts";
import DigestConfigPage from "@/pages/settings-digest";
import { useFeatureFlags } from "@/hooks/use-feature-flags";

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

  if (user?.role !== "admin" && user?.role !== "super_user") {
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
    <div className="h-full overflow-auto">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 lg:px-6 py-4 md:py-6">
        <div className="flex items-center gap-3 mb-4 md:mb-6">
          <SettingsIcon className="h-7 w-7 md:h-8 md:w-8 text-primary" />
          <div>
            <h1 className="text-xl md:text-2xl font-bold">System Settings</h1>
            <p className="text-muted-foreground text-sm">
              Manage integrations and system configuration
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList className="flex flex-wrap w-full h-auto p-1 gap-1">
            {SETTINGS_TABS.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="flex items-center gap-1.5 sm:gap-2 py-2.5 text-xs sm:text-sm"
                data-testid={`tab-settings-${tab.id}`}
              >
                <tab.icon className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="integrations" className="mt-6">
            <IntegrationsTab />
          </TabsContent>

          <TabsContent value="messages" className="mt-6">
            <MessagesTab />
          </TabsContent>

          <TabsContent value="email-logs" className="mt-6">
            <EmailLogsTab />
          </TabsContent>

          <TabsContent value="automation" className="mt-6">
            <PipelineAutomationTab />
          </TabsContent>

          <TabsContent value="agreement" className="mt-6">
            <AgreementTab />
          </TabsContent>

          <TabsContent value="default-docs" className="mt-6">
            {user?.tenantId ? (
              <DefaultTenantDocumentsManager tenantId={user.tenantId} mode="tenantAdmin" />
            ) : (
              <p className="text-muted-foreground">No tenant context available.</p>
            )}
          </TabsContent>

          {flags.enableAlertAutomation && (
            <TabsContent value="alerts" className="mt-6">
              <AlertRulesPage />
            </TabsContent>
          )}

          {flags.enableWeeklyOpsDigest && (
            <TabsContent value="digest" className="mt-6">
              <DigestConfigPage />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
