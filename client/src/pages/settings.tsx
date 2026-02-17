import { useLocation, useRoute, Redirect } from "wouter";
import { useAuth } from "@/lib/auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings as SettingsIcon, Puzzle, FileText, Mail, UserCircle } from "lucide-react";
import { ProfileTab } from "@/components/settings/profile-tab";
import { IntegrationsTab } from "@/components/settings/integrations-tab";
import { AgreementTab } from "@/components/settings/agreement-tab";
import { EmailLogsTab } from "@/components/settings/email-logs-tab";

const SETTINGS_TABS = [
  { id: "profile", label: "Profile", icon: UserCircle },
  { id: "integrations", label: "Integrations", icon: Puzzle },
  { id: "email-logs", label: "Email Logs", icon: Mail },
  { id: "agreement", label: "Agreement", icon: FileText },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const [, params] = useRoute("/settings/:tab");

  // Only allow admin or super_user roles to access settings
  if (user?.role !== "admin" && user?.role !== "super_user") {
    return <Redirect to="/" />;
  }

  const activeTab = params?.tab || "profile";

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
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto p-1 gap-1">
            {SETTINGS_TABS.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="flex items-center gap-2 py-2.5"
                data-testid={`tab-settings-${tab.id}`}
              >
                <tab.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="profile" className="mt-6">
            <ProfileTab />
          </TabsContent>

          <TabsContent value="integrations" className="mt-6">
            <IntegrationsTab />
          </TabsContent>

          <TabsContent value="email-logs" className="mt-6">
            <EmailLogsTab />
          </TabsContent>

          <TabsContent value="agreement" className="mt-6">
            <AgreementTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
