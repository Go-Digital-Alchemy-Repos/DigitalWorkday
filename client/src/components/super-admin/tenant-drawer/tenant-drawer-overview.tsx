import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Save,
  Loader2,
  Clock,
  CheckCircle,
  AlertTriangle,
  Heart,
} from "lucide-react";
import type { TenantWithDetails, TenantHealth, OnboardingProgress } from "./types";

interface TenantDrawerOverviewProps {
  activeTenant: TenantWithDetails;
  onTenantUpdated?: () => void;
  onUnsavedChangesChange: (hasChanges: boolean) => void;
  onboardingProgress: OnboardingProgress;
  setActiveTab: (tab: string) => void;
}

export function TenantDrawerOverview({ activeTenant, onTenantUpdated, onUnsavedChangesChange, onboardingProgress, setActiveTab }: TenantDrawerOverviewProps) {
  const { toast } = useToast();
  const [editedName, setEditedName] = useState(activeTenant.name);
  const [editedSlug, setEditedSlug] = useState(activeTenant.slug);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [hasUnsavedSlugChanges, setHasUnsavedSlugChanges] = useState(false);

  useEffect(() => {
    setEditedName(activeTenant.name);
    setEditedSlug(activeTenant.slug);
    setHasUnsavedChanges(false);
    setHasUnsavedSlugChanges(false);
  }, [activeTenant.id]);

  const { data: healthData, isLoading: healthLoading } = useQuery<TenantHealth>({
    queryKey: ["/api/v1/super/tenants", activeTenant.id, "health"],
    queryFn: () => fetch(`/api/v1/super/tenants/${activeTenant.id}/health`, { credentials: "include" }).then(r => r.json()),
    enabled: !!activeTenant.id,
  });

  const updateTenantMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      return apiRequest("PATCH", `/api/v1/super/tenants/${activeTenant.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants-detail"] });
      setHasUnsavedChanges(false);
      setHasUnsavedSlugChanges(false);
      onUnsavedChangesChange(false);
      toast({ title: "Tenant updated successfully" });
      onTenantUpdated?.();
    },
    onError: (error: any) => {
      toast({ title: "Failed to update tenant", description: error.message, variant: "destructive" });
    },
  });

  const handleNameChange = (value: string) => {
    setEditedName(value);
    const changed = value !== activeTenant.name;
    setHasUnsavedChanges(changed);
    onUnsavedChangesChange(changed);
  };

  const handleSaveName = () => {
    if (editedName !== activeTenant.name) {
      updateTenantMutation.mutate({ name: editedName });
    }
  };

  const handleSlugChange = (value: string) => {
    const sanitized = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setEditedSlug(sanitized);
    setHasUnsavedSlugChanges(sanitized !== activeTenant.slug);
  };

  const handleSaveSlug = () => {
    if (editedSlug !== activeTenant.slug) {
      updateTenantMutation.mutate({ slug: editedSlug });
    }
  };

  const completedSteps = Object.values(onboardingProgress).filter(Boolean).length;
  const totalSteps = Object.keys(onboardingProgress).length;
  const progressPercent = Math.round((completedSteps / totalSteps) * 100);

  return (
    <div className="space-y-6 mt-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tenant-name">Organization Name</Label>
            <div className="flex gap-2">
              <Input
                id="tenant-name"
                value={editedName}
                onChange={(e) => handleNameChange(e.target.value)}
                data-testid="input-tenant-name"
              />
              {hasUnsavedChanges && (
                <Button 
                  onClick={handleSaveName} 
                  disabled={updateTenantMutation.isPending}
                  data-testid="button-save-name"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tenant-slug">URL Slug</Label>
            <div className="flex gap-2">
              <div className="flex items-center">
                <span className="text-muted-foreground mr-1">/</span>
                <Input
                  id="tenant-slug"
                  value={editedSlug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  placeholder="url-slug"
                  className="w-48"
                  data-testid="input-tenant-slug"
                />
              </div>
              {hasUnsavedSlugChanges && (
                <Button 
                  onClick={handleSaveSlug} 
                  disabled={updateTenantMutation.isPending || !editedSlug.trim()}
                  data-testid="button-save-slug"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Only lowercase letters, numbers, and hyphens allowed
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-4">
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">Users</div>
              <div className="text-2xl font-semibold">{activeTenant.userCount || 0}</div>
            </div>
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">Created</div>
              <div className="text-sm">{new Date(activeTenant.createdAt!).toLocaleDateString()}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Company Details</CardTitle>
          <CardDescription>Additional organization information</CardDescription>
        </CardHeader>
        <CardContent>
          <form 
            className="space-y-6"
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const updates: Record<string, string | null> = {};
              
              const fields = [
                'legalName', 'industry', 'companySize', 'website', 'taxId', 
                'foundedDate', 'description', 'addressLine1', 'addressLine2',
                'city', 'state', 'postalCode', 'country', 'phoneNumber',
                'primaryContactName', 'primaryContactEmail', 'primaryContactPhone', 'billingEmail'
              ];
              
              fields.forEach(field => {
                const value = formData.get(field) as string;
                updates[field] = value || null;
              });
              
              updateTenantMutation.mutate(updates);
            }}
          >
            <div className="space-y-4">
              <h4 className="text-sm font-medium">Company Information</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="legalName">Legal Name</Label>
                  <Input
                    id="legalName"
                    name="legalName"
                    defaultValue={(activeTenant as any).legalName || ""}
                    placeholder="Legal company name"
                    data-testid="input-legal-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="industry">Industry</Label>
                  <Input
                    id="industry"
                    name="industry"
                    defaultValue={(activeTenant as any).industry || ""}
                    placeholder="e.g. Technology, Healthcare"
                    data-testid="input-industry"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companySize">Company Size</Label>
                  <Select name="companySize" defaultValue={(activeTenant as any).companySize || ""}>
                    <SelectTrigger data-testid="select-company-size">
                      <SelectValue placeholder="Select size" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1-10">1-10 employees</SelectItem>
                      <SelectItem value="11-50">11-50 employees</SelectItem>
                      <SelectItem value="51-200">51-200 employees</SelectItem>
                      <SelectItem value="201-500">201-500 employees</SelectItem>
                      <SelectItem value="501+">501+ employees</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    name="website"
                    type="url"
                    defaultValue={(activeTenant as any).website || "https://"}
                    placeholder="https://example.com"
                    data-testid="input-website"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="taxId">Tax ID</Label>
                  <Input
                    id="taxId"
                    name="taxId"
                    defaultValue={(activeTenant as any).taxId || ""}
                    placeholder="Tax identification number"
                    data-testid="input-tax-id"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="foundedDate">Founded Date</Label>
                  <Input
                    id="foundedDate"
                    name="foundedDate"
                    defaultValue={(activeTenant as any).foundedDate || ""}
                    placeholder="e.g. 2020"
                    data-testid="input-founded-date"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  defaultValue={(activeTenant as any).description || ""}
                  placeholder="Brief description of the company"
                  rows={3}
                  data-testid="input-description"
                />
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t">
              <h4 className="text-sm font-medium">Address</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="addressLine1">Address Line 1</Label>
                  <Input
                    id="addressLine1"
                    name="addressLine1"
                    defaultValue={(activeTenant as any).addressLine1 || ""}
                    placeholder="Street address"
                    data-testid="input-address-1"
                  />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="addressLine2">Address Line 2</Label>
                  <Input
                    id="addressLine2"
                    name="addressLine2"
                    defaultValue={(activeTenant as any).addressLine2 || ""}
                    placeholder="Suite, unit, building"
                    data-testid="input-address-2"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    name="city"
                    defaultValue={(activeTenant as any).city || ""}
                    placeholder="City"
                    data-testid="input-city"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">State / Province</Label>
                  <Input
                    id="state"
                    name="state"
                    defaultValue={(activeTenant as any).state || ""}
                    placeholder="State or province"
                    data-testid="input-state"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="postalCode">Postal Code</Label>
                  <Input
                    id="postalCode"
                    name="postalCode"
                    defaultValue={(activeTenant as any).postalCode || ""}
                    placeholder="Zip / postal code"
                    data-testid="input-postal-code"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    name="country"
                    defaultValue={(activeTenant as any).country || ""}
                    placeholder="Country"
                    data-testid="input-country"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t">
              <h4 className="text-sm font-medium">Contact Information</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phoneNumber">Phone Number</Label>
                  <Input
                    id="phoneNumber"
                    name="phoneNumber"
                    defaultValue={(activeTenant as any).phoneNumber || ""}
                    placeholder="+1 (555) 000-0000"
                    data-testid="input-phone"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="billingEmail">Billing Email</Label>
                  <Input
                    id="billingEmail"
                    name="billingEmail"
                    type="email"
                    defaultValue={(activeTenant as any).billingEmail || ""}
                    placeholder="billing@example.com"
                    data-testid="input-billing-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="primaryContactName">Primary Contact Name</Label>
                  <Input
                    id="primaryContactName"
                    name="primaryContactName"
                    defaultValue={(activeTenant as any).primaryContactName || ""}
                    placeholder="Full name"
                    data-testid="input-contact-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="primaryContactEmail">Primary Contact Email</Label>
                  <Input
                    id="primaryContactEmail"
                    name="primaryContactEmail"
                    type="email"
                    defaultValue={(activeTenant as any).primaryContactEmail || ""}
                    placeholder="contact@example.com"
                    data-testid="input-contact-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="primaryContactPhone">Primary Contact Phone</Label>
                  <Input
                    id="primaryContactPhone"
                    name="primaryContactPhone"
                    defaultValue={(activeTenant as any).primaryContactPhone || ""}
                    placeholder="+1 (555) 000-0000"
                    data-testid="input-contact-phone"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <Button 
                type="submit" 
                disabled={updateTenantMutation.isPending}
                data-testid="button-save-company-details"
              >
                {updateTenantMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Save className="h-4 w-4 mr-2" />
                Save Company Details
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {activeTenant.status === "inactive" && (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-600" />
              Onboarding Progress
            </CardTitle>
            <CardDescription>Complete the setup to activate this tenant</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{completedSteps} of {totalSteps} steps completed</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div 
                  className="h-full bg-amber-500 transition-all duration-300" 
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-4"
                onClick={() => setActiveTab("onboarding")}
                data-testid="button-continue-onboarding"
              >
                Continue Onboarding
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Heart className="h-4 w-4" />
            Health Summary
          </CardTitle>
          <CardDescription>Quick status overview of tenant configuration</CardDescription>
        </CardHeader>
        <CardContent>
          {healthLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : healthData ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  {healthData.primaryWorkspaceExists ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  )}
                  <span className="text-sm">Primary Workspace</span>
                </div>
                <div className="flex items-center gap-2">
                  {healthData.users.total > 0 ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  )}
                  <span className="text-sm">{healthData.users.total} Users</span>
                </div>
                <div className="flex items-center gap-2">
                  {healthData.integrations.mailgunConfigured ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  )}
                  <span className="text-sm">Email Integration</span>
                </div>
                <div className="flex items-center gap-2">
                  {healthData.branding.logoConfigured ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  )}
                  <span className="text-sm">Logo Configured</span>
                </div>
              </div>
              {healthData.warnings.length > 0 && (
                <div className="pt-2 border-t space-y-1">
                  <div className="text-sm font-medium text-amber-600">Warnings:</div>
                  {healthData.warnings.map((warning, i) => (
                    <div key={i} className="text-sm text-muted-foreground flex items-center gap-2">
                      <AlertTriangle className="h-3 w-3 text-amber-500 flex-shrink-0" />
                      {warning}
                    </div>
                  ))}
                </div>
              )}
              {healthData.canEnableStrict && (
                <div className="pt-2 border-t">
                  <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-500/20">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Ready for Strict Tenancy
                  </Badge>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Failed to load health data</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
