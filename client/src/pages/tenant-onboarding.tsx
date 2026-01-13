import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Building2, Palette, Mail, CheckCircle2, ArrowRight, ArrowLeft, Loader2 } from "lucide-react";

interface TenantInfo {
  tenant: {
    id: string;
    name: string;
    slug: string;
    status: string;
    onboardedAt: string | null;
    ownerUserId: string | null;
  };
  tenantSettings: {
    displayName: string;
    logoUrl: string | null;
    primaryColor: string | null;
    supportEmail: string | null;
  } | null;
  user: {
    id: string;
    email: string;
    name: string;
    firstName: string | null;
    lastName: string | null;
    role: string;
  };
}

interface OnboardingStep {
  id: number;
  title: string;
  description: string;
  icon: typeof Building2;
}

const STEPS: OnboardingStep[] = [
  {
    id: 1,
    title: "Organization Profile",
    description: "Set up your organization's basic information",
    icon: Building2,
  },
  {
    id: 2,
    title: "Branding",
    description: "Customize your workspace appearance",
    icon: Palette,
  },
  {
    id: 3,
    title: "Email Settings",
    description: "Configure email notifications (optional)",
    icon: Mail,
  },
  {
    id: 4,
    title: "Complete Setup",
    description: "Review and activate your workspace",
    icon: CheckCircle2,
  },
];

export default function TenantOnboarding() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  
  const [formData, setFormData] = useState({
    displayName: "",
    logoUrl: "",
    primaryColor: "#3B82F6",
    supportEmail: "",
  });

  const { data: tenantInfo, isLoading, error } = useQuery<TenantInfo>({
    queryKey: ["/api/v1/tenant/me"],
  });

  useEffect(() => {
    if (tenantInfo?.tenant.status === "active" && tenantInfo?.tenant.onboardedAt) {
      setLocation("/");
    }
    if (tenantInfo?.tenantSettings) {
      setFormData({
        displayName: tenantInfo.tenantSettings.displayName || tenantInfo.tenant.name || "",
        logoUrl: tenantInfo.tenantSettings.logoUrl || "",
        primaryColor: tenantInfo.tenantSettings.primaryColor || "#3B82F6",
        supportEmail: tenantInfo.tenantSettings.supportEmail || "",
      });
    } else if (tenantInfo?.tenant) {
      setFormData(prev => ({
        ...prev,
        displayName: tenantInfo.tenant.name || "",
      }));
    }
  }, [tenantInfo, setLocation]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: Partial<typeof formData>) => {
      return apiRequest("PATCH", "/api/v1/tenant/settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/tenant/me"] });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to save settings",
      });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/v1/tenant/onboarding/complete");
    },
    onSuccess: () => {
      toast({
        title: "Welcome!",
        description: "Your workspace is now ready to use.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/tenant/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setLocation("/");
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to complete setup",
      });
    },
  });

  const handleNext = async () => {
    if (currentStep === 1) {
      if (!formData.displayName.trim()) {
        toast({
          variant: "destructive",
          title: "Required",
          description: "Organization name is required",
        });
        return;
      }
      await updateSettingsMutation.mutateAsync({ displayName: formData.displayName });
    } else if (currentStep === 2) {
      await updateSettingsMutation.mutateAsync({
        logoUrl: formData.logoUrl || undefined,
        primaryColor: formData.primaryColor || undefined,
      });
    } else if (currentStep === 3) {
      if (formData.supportEmail) {
        await updateSettingsMutation.mutateAsync({
          supportEmail: formData.supportEmail,
        });
      }
    }
    
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    completeMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" data-testid="loading-onboarding">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" data-testid="error-onboarding">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Access Denied</CardTitle>
            <CardDescription>
              You don't have permission to access this page. Please contact your administrator.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setLocation("/login")} data-testid="button-go-login">
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const progress = (currentStep / STEPS.length) * 100;

  return (
    <div className="min-h-screen bg-background" data-testid="tenant-onboarding-page">
      <div className="container max-w-3xl mx-auto py-8 px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2" data-testid="text-onboarding-title">
            Welcome to MyWorkDay
          </h1>
          <p className="text-muted-foreground" data-testid="text-onboarding-subtitle">
            Let's set up your workspace in a few quick steps
          </p>
        </div>

        <div className="mb-8">
          <div className="flex justify-between mb-2">
            {STEPS.map((step) => (
              <div
                key={step.id}
                className={`flex flex-col items-center flex-1 ${
                  step.id <= currentStep ? "text-primary" : "text-muted-foreground"
                }`}
                data-testid={`step-indicator-${step.id}`}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${
                    step.id < currentStep
                      ? "bg-primary text-primary-foreground"
                      : step.id === currentStep
                      ? "border-2 border-primary text-primary"
                      : "border-2 border-muted text-muted-foreground"
                  }`}
                >
                  {step.id < currentStep ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <step.icon className="h-5 w-5" />
                  )}
                </div>
                <span className="text-xs font-medium hidden sm:block">{step.title}</span>
              </div>
            ))}
          </div>
          <Progress value={progress} className="h-2" data-testid="progress-onboarding" />
        </div>

        <Card data-testid="card-onboarding-step">
          <CardHeader>
            <CardTitle data-testid="text-step-title">{STEPS[currentStep - 1].title}</CardTitle>
            <CardDescription data-testid="text-step-description">
              {STEPS[currentStep - 1].description}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {currentStep === 1 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="displayName">Organization Name</Label>
                  <Input
                    id="displayName"
                    value={formData.displayName}
                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                    placeholder="Enter your organization name"
                    data-testid="input-display-name"
                  />
                  <p className="text-sm text-muted-foreground">
                    This is how your organization will appear in the app
                  </p>
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="logoUrl">Logo URL (optional)</Label>
                  <Input
                    id="logoUrl"
                    value={formData.logoUrl}
                    onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
                    placeholder="https://example.com/logo.png"
                    data-testid="input-logo-url"
                  />
                  <p className="text-sm text-muted-foreground">
                    Enter a URL for your organization's logo
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="primaryColor">Primary Color</Label>
                  <div className="flex gap-3 items-center">
                    <Input
                      id="primaryColor"
                      type="color"
                      value={formData.primaryColor}
                      onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                      className="w-16 h-10 p-1 cursor-pointer"
                      data-testid="input-primary-color"
                    />
                    <Input
                      value={formData.primaryColor}
                      onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                      placeholder="#3B82F6"
                      className="flex-1"
                      data-testid="input-primary-color-hex"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Choose a brand color for your workspace
                  </p>
                </div>
                {formData.logoUrl && (
                  <div className="mt-4 p-4 border rounded-lg">
                    <p className="text-sm font-medium mb-2">Preview</p>
                    <div className="flex items-center gap-3">
                      <img
                        src={formData.logoUrl}
                        alt="Logo preview"
                        className="h-10 w-10 object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                      <span
                        className="font-semibold"
                        style={{ color: formData.primaryColor }}
                      >
                        {formData.displayName || "Your Organization"}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="supportEmail">Support Email (optional)</Label>
                  <Input
                    id="supportEmail"
                    type="email"
                    value={formData.supportEmail}
                    onChange={(e) => setFormData({ ...formData, supportEmail: e.target.value })}
                    placeholder="support@yourcompany.com"
                    data-testid="input-support-email"
                  />
                  <p className="text-sm text-muted-foreground">
                    Email address for support inquiries from your team
                  </p>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm">
                    <strong>Note:</strong> Advanced email settings like Mailgun integration can be configured later in Settings.
                  </p>
                </div>
              </div>
            )}

            {currentStep === 4 && (
              <div className="space-y-6">
                <div className="p-6 border rounded-lg space-y-4">
                  <h3 className="font-semibold text-lg">Review Your Settings</h3>
                  <div className="grid gap-3">
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">Organization Name</span>
                      <span className="font-medium" data-testid="text-review-display-name">
                        {formData.displayName}
                      </span>
                    </div>
                    {formData.logoUrl && (
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-muted-foreground">Logo</span>
                        <img
                          src={formData.logoUrl}
                          alt="Logo"
                          className="h-8 w-8 object-contain"
                        />
                      </div>
                    )}
                    <div className="flex justify-between py-2 border-b items-center">
                      <span className="text-muted-foreground">Primary Color</span>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-6 h-6 rounded border"
                          style={{ backgroundColor: formData.primaryColor }}
                        />
                        <span className="font-mono text-sm">{formData.primaryColor}</span>
                      </div>
                    </div>
                    {formData.supportEmail && (
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-muted-foreground">Support Email</span>
                        <span className="font-medium" data-testid="text-review-support-email">
                          {formData.supportEmail}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="p-4 bg-primary/10 rounded-lg">
                  <p className="text-sm">
                    <strong>Ready to launch!</strong> Clicking "Complete Setup" will activate your workspace and you can start inviting team members.
                  </p>
                </div>
              </div>
            )}

            <div className="flex justify-between pt-4">
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={currentStep === 1 || updateSettingsMutation.isPending}
                data-testid="button-back"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              
              {currentStep < 4 ? (
                <Button
                  onClick={handleNext}
                  disabled={updateSettingsMutation.isPending}
                  data-testid="button-next"
                >
                  {updateSettingsMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : null}
                  Next
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button
                  onClick={handleComplete}
                  disabled={completeMutation.isPending}
                  data-testid="button-complete-setup"
                >
                  {completeMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                  )}
                  Complete Setup
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
