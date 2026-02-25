import { useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { Building2, Palette, CreditCard, UserCog, Layers, HardDrive } from "lucide-react";
import { ProfileTab } from "@/components/settings/profile-tab";
import { BrandingTab } from "@/components/settings/branding-tab";
import { WorkspacesTab } from "@/components/settings/workspaces-tab";
import { BillingTab } from "@/components/settings/billing-tab";
import { DataTab } from "@/components/settings/data-tab";
import { PageSkeleton } from "@/components/skeletons/page-skeleton";

const ACCOUNT_TABS = [
  { id: "profile", label: "Profile", icon: Building2 },
  { id: "workspaces", label: "Workspaces", icon: Layers },
  { id: "branding", label: "Branding", icon: Palette },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "data", label: "Data", icon: HardDrive },
];

export default function AccountPage() {
  const [location, setLocation] = useLocation();
  const { user, isLoading } = useAuth();

  const isAdmin = user?.role === "admin";
  const isSuperUser = user?.role === "super_user";

  if (isLoading) {
    return <PageSkeleton variant="compact" />;
  }

  if (!isAdmin && !isSuperUser) {
    return <Redirect to="/" />;
  }

  const currentTab = location.includes("/account/") 
    ? location.split("/account/")[1] 
    : "profile";

  const handleTabChange = (value: string) => {
    setLocation(`/account/${value}`);
  };

  return (
    <ScrollArea className="h-full">
      <div className="container max-w-5xl p-3 sm:p-4 lg:p-6">
        <div className="flex items-center gap-3 mb-4 md:mb-6">
          <UserCog className="h-7 w-7 md:h-8 md:w-8 text-primary" />
          <div>
            <h1 className="text-xl md:text-2xl font-semibold">Account</h1>
            <p className="text-muted-foreground text-sm">
              Manage your organization profile, workspaces, branding, and billing
            </p>
          </div>
        </div>

        <Tabs value={currentTab} onValueChange={handleTabChange} className="space-y-6">
          <div className="md:hidden">
            <Select value={currentTab} onValueChange={handleTabChange}>
              <SelectTrigger className="w-full" data-testid="mobile-account-tab-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_TABS.map((tab) => (
                  <SelectItem key={tab.id} value={tab.id} data-testid={`mobile-tab-${tab.id}`}>
                    {tab.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <TabsList className="hidden md:inline-grid grid-cols-5 w-auto">
            {ACCOUNT_TABS.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} className="gap-2" data-testid={`tab-${tab.id}`}>
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="profile" className="mt-6">
            <ProfileTab />
          </TabsContent>

          <TabsContent value="workspaces" className="mt-6">
            <WorkspacesTab />
          </TabsContent>

          <TabsContent value="branding" className="mt-6">
            <BrandingTab />
          </TabsContent>

          <TabsContent value="billing" className="mt-6">
            <BillingTab />
          </TabsContent>

          <TabsContent value="data" className="mt-6">
            <DataTab />
          </TabsContent>
        </Tabs>
      </div>
    </ScrollArea>
  );
}
