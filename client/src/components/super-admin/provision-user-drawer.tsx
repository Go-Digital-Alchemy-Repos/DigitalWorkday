import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { FullScreenDrawer } from "@/components/ui/full-screen-drawer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  User, 
  Key, 
  Copy, 
  CheckCircle,
  AlertTriangle,
  Loader2,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  UserPlus
} from "lucide-react";

interface ProvisionUserDrawerProps {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  tenantName?: string;
  mailgunConfigured?: boolean;
}

interface ProvisionResult {
  ok: boolean;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    isActive: boolean;
    mustChangeOnNextLogin?: boolean;
    lastLoginAt?: string;
  };
  isNewUser: boolean;
  resetUrl?: string;
  expiresAt?: string;
  requestId: string;
}

export function ProvisionUserDrawer({ 
  open, 
  onClose, 
  tenantId, 
  tenantName,
  mailgunConfigured = false 
}: ProvisionUserDrawerProps) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<"admin" | "employee" | "client">("employee");
  const [method, setMethod] = useState<"SET_PASSWORD" | "RESET_LINK">("SET_PASSWORD");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mustChangeOnNextLogin, setMustChangeOnNextLogin] = useState(true);
  const [sendEmail, setSendEmail] = useState(false);
  const [result, setResult] = useState<ProvisionResult | null>(null);

  const provisionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${tenantId}/users/provision`, {
        email,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        role,
        activateNow: true,
        method,
        password: method === "SET_PASSWORD" ? password : undefined,
        mustChangeOnNextLogin: method === "SET_PASSWORD" ? mustChangeOnNextLogin : undefined,
        sendEmail: method === "RESET_LINK" ? sendEmail : undefined,
      });
      return res.json();
    },
    onSuccess: (data: ProvisionResult) => {
      setResult(data);
      setStep(4);
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", tenantId, "users"] });
      toast({ 
        title: data.isNewUser ? "User created" : "User updated",
        description: `${email} has been provisioned successfully.`
      });
    },
    onError: (error: any) => {
      const requestId = error?.requestId || "unknown";
      toast({ 
        title: "Provisioning failed", 
        description: `Request ID: ${requestId}`,
        variant: "destructive" 
      });
    },
  });

  useEffect(() => {
    if (!open) {
      setStep(1);
      setEmail("");
      setFirstName("");
      setLastName("");
      setRole("employee");
      setMethod("SET_PASSWORD");
      setPassword("");
      setConfirmPassword("");
      setMustChangeOnNextLogin(true);
      setSendEmail(false);
      setResult(null);
    }
  }, [open]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied to clipboard" });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const canProceedStep1 = email.trim().length > 0 && email.includes("@");
  const canProceedStep2 = method === "RESET_LINK" || 
    (method === "SET_PASSWORD" && password.length >= 8 && password === confirmPassword);

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-4">
          <User className="h-6 w-6 text-primary" />
        </div>
        <h3 className="text-lg font-semibold">Step 1: User Information</h3>
        <p className="text-sm text-muted-foreground">
          Enter the user's email and basic details
        </p>
      </div>

      <div className="space-y-4 max-w-md mx-auto">
        <div className="space-y-2">
          <Label htmlFor="email">Email Address *</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            data-testid="input-provision-email"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">First Name</Label>
            <Input
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="John"
              data-testid="input-provision-firstname"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Last Name</Label>
            <Input
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Doe"
              data-testid="input-provision-lastname"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="role">Role</Label>
          <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
            <SelectTrigger data-testid="select-provision-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Tenant Admin</SelectItem>
              <SelectItem value="employee">Employee</SelectItem>
              <SelectItem value="client">Client</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-4">
          <Key className="h-6 w-6 text-primary" />
        </div>
        <h3 className="text-lg font-semibold">Step 2: Access Method</h3>
        <p className="text-sm text-muted-foreground">
          Choose how the user will set up their password
        </p>
      </div>

      <div className="max-w-md mx-auto space-y-6">
        <RadioGroup 
          value={method} 
          onValueChange={(v) => setMethod(v as typeof method)}
          className="space-y-4"
        >
          <div className="flex items-start space-x-3 p-4 rounded-lg border cursor-pointer hover:bg-muted/50">
            <RadioGroupItem value="SET_PASSWORD" id="set-password" className="mt-1" />
            <div className="flex-1">
              <Label htmlFor="set-password" className="font-medium cursor-pointer">
                Set Initial Password
              </Label>
              <p className="text-sm text-muted-foreground">
                You set a temporary password that the user will use to log in
              </p>
            </div>
          </div>
          
          <div className="flex items-start space-x-3 p-4 rounded-lg border cursor-pointer hover:bg-muted/50">
            <RadioGroupItem value="RESET_LINK" id="reset-link" className="mt-1" />
            <div className="flex-1">
              <Label htmlFor="reset-link" className="font-medium cursor-pointer">
                Generate Reset Link
              </Label>
              <p className="text-sm text-muted-foreground">
                Generate a one-time link for the user to set their own password
              </p>
            </div>
          </div>
        </RadioGroup>

        {method === "SET_PASSWORD" && (
          <Card>
            <CardContent className="pt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password (min 8 characters)</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="pr-10"
                    data-testid="input-provision-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  data-testid="input-provision-confirm-password"
                />
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-sm text-destructive">Passwords don't match</p>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  checked={mustChangeOnNextLogin}
                  onCheckedChange={setMustChangeOnNextLogin}
                  id="must-change"
                  data-testid="switch-must-change-login"
                />
                <Label htmlFor="must-change" className="text-sm">
                  Force password change on next login
                </Label>
              </div>
            </CardContent>
          </Card>
        )}

        {method === "RESET_LINK" && (
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center space-x-2">
                <Switch
                  checked={sendEmail}
                  onCheckedChange={setSendEmail}
                  id="send-email"
                  disabled={!mailgunConfigured}
                  data-testid="switch-send-email"
                />
                <div>
                  <Label htmlFor="send-email" className="text-sm">
                    Send reset link via email
                  </Label>
                  {!mailgunConfigured && (
                    <p className="text-xs text-muted-foreground">
                      Mailgun not configured for this tenant
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-4">
          <CheckCircle className="h-6 w-6 text-primary" />
        </div>
        <h3 className="text-lg font-semibold">Step 3: Review & Confirm</h3>
        <p className="text-sm text-muted-foreground">
          Verify the details before provisioning
        </p>
      </div>

      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="text-base">User Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium">{email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Name</span>
            <span className="font-medium">{firstName || lastName ? `${firstName} ${lastName}`.trim() : "Not set"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Role</span>
            <Badge variant="secondary">
              {role === "admin" ? "Tenant Admin" : role === "employee" ? "Employee" : "Client"}
            </Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status</span>
            <Badge className="bg-green-600">Active</Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Access Method</span>
            <span className="font-medium">
              {method === "SET_PASSWORD" ? "Password set by admin" : "Reset link"}
            </span>
          </div>
          {method === "SET_PASSWORD" && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Force change</span>
              <span className="font-medium">{mustChangeOnNextLogin ? "Yes" : "No"}</span>
            </div>
          )}
          {method === "RESET_LINK" && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email link</span>
              <span className="font-medium">{sendEmail ? "Yes" : "No (manual copy)"}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/20 mb-4">
          <CheckCircle className="h-6 w-6 text-green-600" />
        </div>
        <h3 className="text-lg font-semibold">
          {result?.isNewUser ? "User Created Successfully" : "User Updated Successfully"}
        </h3>
        <p className="text-sm text-muted-foreground">
          {result?.user.email} has been provisioned
        </p>
      </div>

      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="text-base">Provisioned User</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium">{result?.user.email}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Status</span>
            <Badge className={result?.user.isActive ? "bg-green-600" : "bg-gray-500"}>
              {result?.user.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Role</span>
            <Badge variant="secondary">
              {result?.user.role === "admin" ? "Tenant Admin" : 
               result?.user.role === "employee" ? "Employee" : "Client"}
            </Badge>
          </div>
          {result?.user.mustChangeOnNextLogin !== undefined && (
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Must Change Password</span>
              <span className="font-medium">{result.user.mustChangeOnNextLogin ? "Yes" : "No"}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {result?.resetUrl && (
        <Card className="max-w-md mx-auto border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="h-4 w-4" />
              Password Reset Link
            </CardTitle>
            <CardDescription>
              Share this link with the user to set their password
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Input 
                value={result.resetUrl} 
                readOnly 
                className="text-xs"
              />
              <Button 
                size="icon" 
                variant="outline"
                onClick={() => copyToClipboard(result.resetUrl!)}
                data-testid="button-copy-provision-link"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            {result.expiresAt && (
              <p className="text-xs text-muted-foreground">
                Expires: {new Date(result.expiresAt).toLocaleString()}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {result && method === "SET_PASSWORD" && (
        <Card className="max-w-md mx-auto border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/10">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Password Set
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              The user can now log in with the password you provided.
              {result.user.mustChangeOnNextLogin && " They will be required to change it on first login."}
            </p>
          </CardContent>
        </Card>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Request ID: {result?.requestId}
      </p>
    </div>
  );

  return (
    <FullScreenDrawer
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          Provision User Access
          {tenantName && (
            <Badge variant="outline" className="ml-2">{tenantName}</Badge>
          )}
        </div>
      }
    >
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-8 flex justify-center">
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className="flex items-center">
                <div 
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors
                    ${step === s ? "bg-primary text-primary-foreground" : 
                      step > s ? "bg-green-600 text-white" : "bg-muted text-muted-foreground"}`}
                >
                  {step > s ? <CheckCircle className="h-4 w-4" /> : s}
                </div>
                {s < 4 && (
                  <div className={`w-12 h-0.5 ${step > s ? "bg-green-600" : "bg-muted"}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
      </div>

      <div className="flex items-center justify-between gap-3 p-4 border-t">
        <div>
          {step > 1 && step < 4 && (
            <Button 
              variant="outline" 
              onClick={() => setStep(step - 1)}
              data-testid="button-provision-back"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          )}
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} data-testid="button-provision-close">
            {step === 4 ? "Done" : "Cancel"}
          </Button>
          
          {step === 1 && (
            <Button 
              onClick={() => setStep(2)} 
              disabled={!canProceedStep1}
              data-testid="button-provision-next-1"
            >
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
          
          {step === 2 && (
            <Button 
              onClick={() => setStep(3)} 
              disabled={!canProceedStep2}
              data-testid="button-provision-next-2"
            >
              Review
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
          
          {step === 3 && (
            <Button 
              onClick={() => provisionMutation.mutate()}
              disabled={provisionMutation.isPending}
              data-testid="button-provision-confirm"
            >
              {provisionMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4 mr-2" />
              )}
              Provision User
            </Button>
          )}
        </div>
      </div>
    </FullScreenDrawer>
  );
}
