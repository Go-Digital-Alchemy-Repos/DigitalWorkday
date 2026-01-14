import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2, FileText, CheckCircle, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AgreementStatus {
  tenantId: string | null;
  requiresAcceptance: boolean;
  activeAgreement: {
    id: string;
    title: string;
    body: string;
    version: number;
    effectiveAt: string | null;
  } | null;
  accepted: boolean;
  acceptedAt: string | null;
}

export default function AcceptTermsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [hasCheckedTerms, setHasCheckedTerms] = useState(false);

  const { data: agreementStatus, isLoading, error, refetch } = useQuery<AgreementStatus>({
    queryKey: ["/api/v1/me/agreement/status"],
    refetchOnWindowFocus: true,
  });

  const acceptMutation = useMutation({
    mutationFn: async ({ agreementId, version }: { agreementId: string; version: number }) => {
      const res = await apiRequest("POST", "/api/v1/me/agreement/accept", { agreementId, version });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/me/agreement/status"] });
      toast({
        title: "Agreement accepted",
        description: "Thank you for accepting the terms. You can now continue using the application.",
      });
      setTimeout(() => {
        setLocation("/");
      }, 500);
    },
    onError: (error: any) => {
      const message = error.message || "Failed to accept agreement";
      if (message.includes("VERSION_MISMATCH")) {
        toast({
          title: "Agreement updated",
          description: "The agreement has been updated. Please review the latest version.",
          variant: "destructive",
        });
        refetch();
      } else {
        toast({
          title: "Error",
          description: message,
          variant: "destructive",
        });
      }
    },
  });

  const handleAccept = () => {
    if (!agreementStatus?.activeAgreement || !hasCheckedTerms) return;
    
    acceptMutation.mutate({
      agreementId: agreementStatus.activeAgreement.id,
      version: agreementStatus.activeAgreement.version,
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading agreement...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <CardTitle>Error Loading Agreement</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              We couldn't load the agreement. Please try again or contact support.
            </p>
          </CardContent>
          <CardFooter>
            <Button onClick={() => refetch()} variant="outline" data-testid="button-retry">
              Try Again
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (!agreementStatus?.requiresAcceptance || !agreementStatus.activeAgreement) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              <CardTitle>All Set!</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              You're all caught up. There's no agreement requiring your attention.
            </p>
          </CardContent>
          <CardFooter>
            <Button onClick={() => setLocation("/")} data-testid="button-continue">
              Continue to App
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const agreement = agreementStatus.activeAgreement;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-2xl w-full">
        <CardHeader>
          <div className="flex items-center gap-3">
            <FileText className="h-6 w-6 text-primary" />
            <div>
              <CardTitle data-testid="text-agreement-title">{agreement.title}</CardTitle>
              <CardDescription>
                Version {agreement.version}
                {agreement.effectiveAt && (
                  <> • Effective {new Date(agreement.effectiveAt).toLocaleDateString()}</>
                )}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <ScrollArea className="h-[400px] w-full rounded-md border p-4">
            <div 
              className="prose prose-sm dark:prose-invert max-w-none"
              data-testid="text-agreement-body"
              dangerouslySetInnerHTML={{ __html: agreement.body }}
            />
          </ScrollArea>

          <div className="flex items-start gap-3 p-4 rounded-lg border bg-muted/50">
            <Checkbox 
              id="accept-terms" 
              checked={hasCheckedTerms}
              onCheckedChange={(checked) => setHasCheckedTerms(checked === true)}
              data-testid="checkbox-accept-terms"
            />
            <Label 
              htmlFor="accept-terms" 
              className="text-sm leading-relaxed cursor-pointer"
            >
              I have read, understood, and agree to the terms outlined in this agreement. I understand that by checking this box and clicking "Accept", I am legally bound by these terms.
            </Label>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-3">
          <Button
            onClick={handleAccept}
            disabled={!hasCheckedTerms || acceptMutation.isPending}
            data-testid="button-accept-terms"
          >
            {acceptMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Accept Agreement
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
