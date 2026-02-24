import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, LogIn, UserPlus, Shield, Eye, EyeOff, FlaskConical, Crown, ShieldCheck, User } from "lucide-react";
import { UserRole } from "@shared/schema";
import { getStorageUrl } from "@/lib/storageUrl";

const DEV_TEST_ACCOUNTS = [
  {
    label: "Super Admin",
    email: "admin@myworkday.dev",
    password: "SuperAdmin123!",
    icon: Crown,
    description: "Full system access",
    variant: "outline" as const,
  },
  {
    label: "Tenant Admin",
    email: "alex@brightstudio.com",
    password: "Password123!",
    icon: ShieldCheck,
    description: "Bright Studio owner",
    variant: "outline" as const,
  },
  {
    label: "Tenant Employee",
    email: "mike@brightstudio.com",
    password: "Password123!",
    icon: User,
    description: "Bright Studio member",
    variant: "outline" as const,
  },
];

const isDevMode = import.meta.env.DEV && import.meta.env.VITE_DEV_TEST_ACCOUNTS !== "false";

interface BootstrapStatus {
  bootstrapRequired: boolean;
}

interface LoginBranding {
  appName: string | null;
  loginMessage: string | null;
  logoUrl: string | null;
  iconUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string | null;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showBootstrap, setShowBootstrap] = useState(false);
  const [bootstrapRequired, setBootstrapRequired] = useState(false);
  const [isCheckingBootstrap, setIsCheckingBootstrap] = useState(true);
  const [branding, setBranding] = useState<LoginBranding>({ appName: null, loginMessage: null, logoUrl: null, iconUrl: null, faviconUrl: null, primaryColor: null });
  const { login } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchString = useSearch();

  // Handle error messages from OAuth callback redirects and session expiry
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const errorMessage = params.get("error");
    if (errorMessage) {
      toast({
        title: "Authentication failed",
        description: decodeURIComponent(errorMessage),
        variant: "destructive",
      });
      // Clear the error from URL without page reload
      window.history.replaceState({}, "", "/login");
    }
    
    // Check for session expired message from redirect
    const authMessage = sessionStorage.getItem("authMessage");
    if (authMessage) {
      toast({
        title: "Session expired",
        description: authMessage,
        variant: "destructive",
      });
      sessionStorage.removeItem("authMessage");
    }
  }, [searchString, toast]);

  useEffect(() => {
    async function checkBootstrapStatus() {
      try {
        const response = await fetch("/api/v1/auth/bootstrap-status", {
          credentials: "include",
        });
        if (response.ok) {
          const data: BootstrapStatus = await response.json();
          setBootstrapRequired(data.bootstrapRequired);
        }
      } catch (error) {
        console.error("Failed to check bootstrap status:", error);
      } finally {
        setIsCheckingBootstrap(false);
      }
    }
    checkBootstrapStatus();
  }, []);

  useEffect(() => {
    async function fetchLoginBranding() {
      try {
        const response = await fetch("/api/v1/auth/login-branding", {
          credentials: "include",
        });
        if (response.ok) {
          const data: LoginBranding = await response.json();
          setBranding({
            ...data,
            logoUrl: getStorageUrl(data.logoUrl) || data.logoUrl,
            iconUrl: getStorageUrl(data.iconUrl) || data.iconUrl,
            faviconUrl: getStorageUrl(data.faviconUrl) || data.faviconUrl,
          });

          // Apply favicon
          if (data.faviconUrl) {
            const faviconHref = getStorageUrl(data.faviconUrl) || data.faviconUrl;
            let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
            if (!link) {
              link = document.createElement("link");
              link.rel = "icon";
              document.head.appendChild(link);
            }
            link.href = faviconHref;
          }

          // Apply primary color as CSS variable
          if (data.primaryColor) {
            const hex = data.primaryColor;
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            if (result) {
              let r = parseInt(result[1], 16) / 255;
              let g = parseInt(result[2], 16) / 255;
              let b = parseInt(result[3], 16) / 255;
              const max = Math.max(r, g, b), min = Math.min(r, g, b);
              let h = 0, s = 0;
              const l = (max + min) / 2;
              if (max !== min) {
                const d = max - min;
                s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                switch (max) {
                  case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                  case g: h = ((b - r) / d + 2) / 6; break;
                  case b: h = ((r - g) / d + 4) / 6; break;
                }
              }
              const hsl = `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
              document.documentElement.style.setProperty("--primary", hsl);
              document.documentElement.style.setProperty("--primary-foreground", "0 0% 100%");
              document.documentElement.style.setProperty("--ring", hsl);
            }
          }

          // Update document title
          if (data.appName) {
            document.title = data.appName;
          }
        }
      } catch (error) {
        console.error("Failed to fetch login branding:", error);
      }
    }
    fetchLoginBranding();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({
        title: "Missing credentials",
        description: "Please enter both email and password",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    const result = await login(email, password);
    setIsSubmitting(false);

    if (result.success) {
      toast({
        title: "Welcome back!",
        description: "You have been logged in successfully",
      });
      const isSuperUser = result.user?.role === UserRole.SUPER_USER;
      setLocation(isSuperUser ? "/super-admin/dashboard" : "/my-tasks");
    } else {
      toast({
        title: "Login failed",
        description: result.error || "Invalid credentials",
        variant: "destructive",
      });
    }
  };

  const handleBootstrapRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({
        title: "Missing information",
        description: "Please enter email and password",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 8) {
      toast({
        title: "Password too short",
        description: "Password must be at least 8 characters",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/v1/auth/bootstrap-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password, firstName, lastName }),
      });

      const data = await response.json();

      if (response.ok) {
        if (data.autoLoginFailed) {
          toast({
            title: "Account created",
            description: "Account created but auto-login failed. Please sign in manually.",
            variant: "default",
          });
          setShowBootstrap(false);
          setEmail("");
          setPassword("");
        } else {
          toast({
            title: "Account created!",
            description: data.message || "Super Admin account created successfully",
          });
          setLocation("/super-admin");
        }
      } else {
        const errorMessage = data.error?.message || data.message || "Registration failed";
        toast({
          title: "Registration failed",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Registration failed",
        description: "Network error. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isCheckingBootstrap) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          {branding.logoUrl && (
            <div className="flex justify-center mb-2">
              <img 
                src={branding.logoUrl} 
                alt={branding.appName || "Logo"} 
                className="h-10 w-auto object-contain"
                data-testid="img-login-logo"
              />
            </div>
          )}
          <CardTitle className="text-2xl font-bold text-center" data-testid="text-login-title">
            {branding.appName || "MyWorkDay"}
          </CardTitle>
          <CardDescription className="text-center" data-testid="text-login-description">
            {showBootstrap 
              ? "Create the first admin account to get started"
              : branding.loginMessage || "Enter your credentials to access your workspace"
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {showBootstrap ? (
            <form onSubmit={handleBootstrapRegister} className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-lg mb-4">
                <Shield className="h-5 w-5 text-primary" />
                <p className="text-sm text-muted-foreground">
                  This account will have full Super Admin access.
                </p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    type="text"
                    placeholder="John"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    disabled={isSubmitting}
                    data-testid="input-firstName"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    type="text"
                    placeholder="Doe"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    disabled={isSubmitting}
                    data-testid="input-lastName"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isSubmitting}
                  data-testid="input-email-bootstrap"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Min. 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isSubmitting}
                    className="pr-10"
                    data-testid="input-password-bootstrap"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 no-default-hover-elevate no-default-active-elevate hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    data-testid="button-toggle-password-bootstrap"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                  </Button>
                </div>
              </div>
              
              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting}
                data-testid="button-bootstrap-register"
              >
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="mr-2 h-4 w-4" />
                )}
                {isSubmitting ? "Creating account..." : "Create Admin Account"}
              </Button>
              
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setShowBootstrap(false)}
                disabled={isSubmitting}
                data-testid="button-back-to-login"
              >
                Back to login
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isSubmitting}
                    data-testid="input-email"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <a
                      href="/auth/forgot-password"
                      className="text-xs text-muted-foreground hover:text-primary hover:underline"
                      data-testid="link-forgot-password"
                    >
                      Forgot password?
                    </a>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isSubmitting}
                      className="pr-10"
                      data-testid="input-password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 no-default-hover-elevate no-default-active-elevate hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                      data-testid="button-toggle-password"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                    </Button>
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isSubmitting}
                  data-testid="button-login"
                >
                  {isSubmitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <LogIn className="mr-2 h-4 w-4" />
                  )}
                  {isSubmitting ? "Signing in..." : "Sign in"}
                </Button>
              </form>
              
              {bootstrapRequired && (
                <div className="pt-4 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => setShowBootstrap(true)}
                    disabled={isSubmitting}
                    data-testid="button-create-first-admin"
                  >
                    <Shield className="mr-2 h-4 w-4" />
                    Create first admin account
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {isDevMode && !showBootstrap && (
        <Card className="w-full max-w-md mt-4 border-dashed border-muted-foreground/30" data-testid="card-dev-credentials">
          <CardHeader className="pb-3 pt-4 px-4">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium text-muted-foreground">Dev Test Accounts</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0 space-y-2">
            {DEV_TEST_ACCOUNTS.map((account) => {
              const Icon = account.icon;
              const testId = account.label.toLowerCase().replace(/\s+/g, "-");
              return (
                <div key={account.email} className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="default"
                    disabled={isSubmitting}
                    className="flex-1 justify-start gap-2"
                    onClick={() => {
                      setEmail(account.email);
                      setPassword(account.password);
                    }}
                    data-testid={`button-dev-fill-${testId}`}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="flex flex-col items-start text-left">
                      <span className="text-xs font-medium">{account.label}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{account.email}</span>
                    </div>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="default"
                    disabled={isSubmitting}
                    className="shrink-0"
                    onClick={async () => {
                      setEmail(account.email);
                      setPassword(account.password);
                      setIsSubmitting(true);
                      const result = await login(account.email, account.password);
                      setIsSubmitting(false);
                      if (result.success) {
                        toast({ title: "Welcome!", description: `Logged in as ${account.label}` });
                        const isSuperUser = result.user?.role === UserRole.SUPER_USER;
                        setLocation(isSuperUser ? "/super-admin/dashboard" : "/my-tasks");
                      } else {
                        toast({ title: "Login failed", description: result.error || "Invalid credentials", variant: "destructive" });
                      }
                    }}
                    data-testid={`button-dev-login-${testId}`}
                  >
                    <LogIn className="h-3 w-3 mr-1" />
                    Login
                  </Button>
                </div>
              );
            })}
            <p className="text-[10px] text-muted-foreground text-center pt-1">
              Fill to populate form, Login to sign in directly
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
