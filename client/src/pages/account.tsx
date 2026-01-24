import { useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { Building2, Palette, CreditCard, ClipboardList, UserCog, Layers } from "lucide-react";
import { ProfileTab } from "@/components/settings/profile-tab";
import { BrandingTab } from "@/components/settings/branding-tab";
import { WorkspacesTab } from "@/components/settings/workspaces-tab";
import { BillingTab } from "@/components/settings/billing-tab";
import { WorkloadTab } from "@/components/settings/workload-tab";

export default function AccountPage() {
  const [location, setLocation] = useLocation();
  const { user, isLoading } = useAuth();

  const isAdmin = user?.role === "admin";
  const isSuperUser = user?.role === "super_user";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
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
      <div className="container max-w-5xl py-8 px-6">
        <div className="flex items-center gap-3 mb-8">
          <UserCog className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold">Account</h1>
            <p className="text-muted-foreground text-sm">
              Manage your organization profile, workspaces, branding, and billing
            </p>
          </div>
        </div>

        <Tabs value={currentTab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-grid">
            <TabsTrigger value="profile" className="gap-2" data-testid="tab-profile">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">Profile</span>
            </TabsTrigger>
            <TabsTrigger value="workspaces" className="gap-2" data-testid="tab-workspaces">
              <Layers className="h-4 w-4" />
              <span className="hidden sm:inline">Workspaces</span>
            </TabsTrigger>
            <TabsTrigger value="branding" className="gap-2" data-testid="tab-branding">
              <Palette className="h-4 w-4" />
              <span className="hidden sm:inline">Branding</span>
            </TabsTrigger>
            <TabsTrigger value="billing" className="gap-2" data-testid="tab-billing">
              <CreditCard className="h-4 w-4" />
              <span className="hidden sm:inline">Billing</span>
            </TabsTrigger>
            <TabsTrigger value="workload" className="gap-2" data-testid="tab-workload">
              <ClipboardList className="h-4 w-4" />
              <span className="hidden sm:inline">Workload</span>
            </TabsTrigger>
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

          <TabsContent value="workload" className="mt-6">
            <WorkloadTab />
          </TabsContent>
        </Tabs>
      </div>
    </ScrollArea>
  );
}
