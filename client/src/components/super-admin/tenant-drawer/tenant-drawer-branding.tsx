import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Save, Loader2 } from "lucide-react";
import { S3Dropzone } from "@/components/common/S3Dropzone";
import { ColorPicker } from "@/components/ui/color-picker";
import type { TenantWithDetails, TenantSettings, SystemSettings } from "./types";

interface TenantDrawerBrandingProps {
  activeTenant: TenantWithDetails;
  open: boolean;
}

export function TenantDrawerBranding({ activeTenant, open }: TenantDrawerBrandingProps) {
  const { toast } = useToast();

  const { data: settingsResponse } = useQuery<{ tenantSettings: TenantSettings | null; systemSettings: SystemSettings | null }>({
    queryKey: ["/api/v1/super/tenants", activeTenant.id, "settings"],
    queryFn: () => fetch(`/api/v1/super/tenants/${activeTenant.id}/settings`, { credentials: "include" }).then(r => r.json()),
    enabled: !!activeTenant.id && open,
  });

  const systemSettings = settingsResponse?.systemSettings;
  const tenantSettings = settingsResponse?.tenantSettings;

  const [brandingData, setBrandingData] = useState<TenantSettings>({});

  useEffect(() => {
    if (tenantSettings) {
      setBrandingData(tenantSettings);
    }
  }, [tenantSettings]);

  const handleBrandingChange = (field: string, value: any) => {
    setBrandingData(prev => ({ ...prev, [field]: value }));
  };

  const saveBrandingMutation = useMutation({
    mutationFn: async (data: TenantSettings) => {
      return apiRequest("PUT", `/api/v1/super/tenants/${activeTenant.id}/settings`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant.id, "settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants-detail"] });
      toast({ title: "Branding saved" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to save branding", description: error.message, variant: "destructive" });
    },
  });

  const handleSaveBranding = (e: React.FormEvent) => {
    e.preventDefault();
    saveBrandingMutation.mutate(brandingData);
  };

  return (
    <div className="space-y-6 mt-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">White Label Settings</CardTitle>
          <CardDescription>Configure branding and appearance for this tenant</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveBranding} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  value={brandingData.displayName || ""}
                  onChange={(e) => handleBrandingChange("displayName", e.target.value)}
                  data-testid="input-tenant-display-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="appName">App Name</Label>
                <Input
                  id="appName"
                  value={brandingData.appName || ""}
                  onChange={(e) => handleBrandingChange("appName", e.target.value)}
                  data-testid="input-tenant-app-name"
                />
              </div>
            </div>
            <div className="grid gap-6 sm:grid-cols-3">
              <S3Dropzone
                category="tenant-branding-logo"
                label="Logo"
                description="Full logo for headers (max 2MB, PNG or SVG)"
                valueUrl={brandingData.logoUrl}
                inheritedUrl={systemSettings?.defaultLogoUrl}
                onUploaded={(fileUrl) => handleBrandingChange("logoUrl", fileUrl)}
                onRemoved={() => handleBrandingChange("logoUrl", null)}
                enableCropping
                cropShape="rect"
                cropAspectRatio={4}
              />
              <S3Dropzone
                category="tenant-branding-icon"
                label="Icon"
                description="Square icon for PWA (max 512KB, 192x192px)"
                valueUrl={brandingData.iconUrl}
                inheritedUrl={systemSettings?.defaultIconUrl}
                onUploaded={(fileUrl) => handleBrandingChange("iconUrl", fileUrl)}
                onRemoved={() => handleBrandingChange("iconUrl", null)}
                enableCropping
                cropShape="rect"
                cropAspectRatio={1}
              />
              <S3Dropzone
                category="tenant-branding-favicon"
                label="Favicon"
                description="Browser tab icon (max 512KB, 32x32px)"
                valueUrl={brandingData.faviconUrl}
                inheritedUrl={systemSettings?.defaultFaviconUrl}
                onUploaded={(fileUrl) => handleBrandingChange("faviconUrl", fileUrl)}
                onRemoved={() => handleBrandingChange("faviconUrl", null)}
                enableCropping
                cropShape="rect"
                cropAspectRatio={1}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <ColorPicker
                label="Primary Color"
                value={brandingData.primaryColor || "#83ba3b"}
                defaultValue="#83ba3b"
                onChange={(value) => handleBrandingChange("primaryColor", value)}
                data-testid="input-primary-color"
              />
              <ColorPicker
                label="Secondary Color"
                value={brandingData.secondaryColor || "#64748b"}
                defaultValue="#64748b"
                onChange={(value) => handleBrandingChange("secondaryColor", value)}
                data-testid="input-secondary-color"
              />
              <ColorPicker
                label="Accent Color"
                value={brandingData.accentColor || "#10b981"}
                defaultValue="#10b981"
                onChange={(value) => handleBrandingChange("accentColor", value)}
                data-testid="input-accent-color"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supportEmail">Support Email</Label>
              <Input
                id="supportEmail"
                type="email"
                value={brandingData.supportEmail || ""}
                onChange={(e) => handleBrandingChange("supportEmail", e.target.value)}
                data-testid="input-tenant-support-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="loginMessage">Login Message</Label>
              <Textarea
                id="loginMessage"
                value={brandingData.loginMessage || ""}
                onChange={(e) => handleBrandingChange("loginMessage", e.target.value)}
                className="min-h-[60px] resize-none"
                data-testid="input-tenant-login-message"
              />
            </div>
            <div className="flex items-center justify-between border-t pt-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    id="whiteLabelEnabled"
                    checked={brandingData.whiteLabelEnabled || false}
                    onCheckedChange={(checked) => handleBrandingChange("whiteLabelEnabled", checked)}
                    data-testid="switch-white-label"
                  />
                  <Label htmlFor="whiteLabelEnabled" className="text-sm">White Label</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="hideVendorBranding"
                    checked={brandingData.hideVendorBranding || false}
                    onCheckedChange={(checked) => handleBrandingChange("hideVendorBranding", checked)}
                    data-testid="switch-hide-vendor"
                  />
                  <Label htmlFor="hideVendorBranding" className="text-sm">Hide Vendor</Label>
                </div>
              </div>
              <Button type="submit" disabled={saveBrandingMutation.isPending} data-testid="button-save-tenant-branding">
                {saveBrandingMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
