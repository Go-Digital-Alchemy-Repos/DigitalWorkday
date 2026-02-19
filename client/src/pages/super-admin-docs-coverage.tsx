import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { Redirect, Link } from "wouter";
import { 
  Loader2, RefreshCw, CheckCircle, XCircle, AlertTriangle, 
  Code, BookOpen, ExternalLink, Sparkles
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ApiDomainCoverage {
  domain: string;
  displayName: string;
  endpointCount: number;
  hasDoc: boolean;
  docFile: string | null;
  hasAuthNotes: boolean;
  hasExamples: boolean;
}

interface FunctionalDocCoverage {
  id: string;
  name: string;
  exists: boolean;
  isEmpty: boolean;
  wordCount: number;
}

interface CoverageData {
  api: {
    total: number;
    withDocs: number;
    withAuth: number;
    withExamples: number;
    totalEndpoints: number;
    coverage: ApiDomainCoverage[];
  };
  functional: {
    total: number;
    exists: number;
    complete: number;
    coverage: FunctionalDocCoverage[];
  };
  summary: {
    apiCoveragePercent: number;
    functionalCoveragePercent: number;
  };
}

export default function SuperAdminDocsCoverage() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const { data: coverage, isLoading, refetch, isRefetching } = useQuery<CoverageData>({
    queryKey: ["/api/v1/super/docs/coverage"],
    enabled: user?.role === "super_user",
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/v1/super/docs/sync");
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "API Docs Synced",
        description: `Created: ${data.summary.created}, Updated: ${data.summary.updated}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/docs/coverage"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Sync Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (authLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user || user.role !== "super_user") {
    return <Redirect to="/super-admin/login" />;
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const missingApiDocs = coverage?.api.coverage.filter(d => !d.hasDoc) || [];
  const incompleteApiDocs = coverage?.api.coverage.filter(d => d.hasDoc && (!d.hasAuthNotes || !d.hasExamples)) || [];
  const missingFunctionalDocs = coverage?.functional.coverage.filter(d => !d.exists || d.isEmpty) || [];

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Documentation Coverage</h1>
            <p className="text-muted-foreground" data-testid="text-page-description">
              Track documentation completeness across API and functional domains
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isRefetching}
              data-testid="button-refresh-coverage"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              data-testid="button-sync-api-docs"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              {syncMutation.isPending ? "Syncing..." : "Sync API Docs"}
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card data-testid="card-api-coverage">
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-lg" data-testid="title-api-coverage">
                <Code className="h-5 w-5" />
                API Coverage
              </CardTitle>
              <CardDescription data-testid="description-api-coverage">
                {coverage?.api.withDocs} of {coverage?.api.total} domains documented
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-2xl font-bold" data-testid="text-api-coverage-percent">
                    {coverage?.summary.apiCoveragePercent}%
                  </span>
                  <Badge variant={coverage?.summary.apiCoveragePercent === 100 ? "default" : "secondary"} data-testid="badge-api-endpoints">
                    {coverage?.api.totalEndpoints} endpoints
                  </Badge>
                </div>
                <Progress value={coverage?.summary.apiCoveragePercent} className="h-2" data-testid="progress-api-coverage" />
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2" data-testid="text-api-with-auth">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>{coverage?.api.withAuth} with auth notes</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2" data-testid="text-api-with-examples">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>{coverage?.api.withExamples} with examples</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-functional-coverage">
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-lg" data-testid="title-functional-coverage">
                <BookOpen className="h-5 w-5" />
                Functional Coverage
              </CardTitle>
              <CardDescription data-testid="description-functional-coverage">
                {coverage?.functional.complete} of {coverage?.functional.total} pages complete
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-2xl font-bold" data-testid="text-functional-coverage-percent">
                    {coverage?.summary.functionalCoveragePercent}%
                  </span>
                  <Badge variant={coverage?.summary.functionalCoveragePercent === 100 ? "default" : "secondary"} data-testid="badge-functional-required">
                    {coverage?.functional.total} required
                  </Badge>
                </div>
                <Progress value={coverage?.summary.functionalCoveragePercent} className="h-2" data-testid="progress-functional-coverage" />
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2" data-testid="text-functional-exists">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>{coverage?.functional.exists} pages exist</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2" data-testid="text-functional-complete">
                    {coverage?.functional.complete === coverage?.functional.exists ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    )}
                    <span>{coverage?.functional.complete} complete</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {(missingApiDocs.length > 0 || incompleteApiDocs.length > 0 || missingFunctionalDocs.length > 0) && (
          <Card data-testid="card-missing-docs">
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2" data-testid="title-missing-docs">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                Missing or Incomplete Documentation
              </CardTitle>
              <CardDescription data-testid="description-missing-docs">
                Items that need attention
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {missingApiDocs.length > 0 && (
                <div data-testid="section-missing-api-docs">
                  <h4 className="font-medium mb-2 flex flex-wrap items-center gap-2" data-testid="heading-missing-api-docs">
                    <XCircle className="h-4 w-4 text-red-500" />
                    Missing API Docs ({missingApiDocs.length})
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {missingApiDocs.map(d => (
                      <Badge key={d.domain} variant="outline" className="text-red-600" data-testid={`badge-missing-api-${d.domain}`}>
                        {d.displayName} ({d.endpointCount} endpoints)
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {incompleteApiDocs.length > 0 && (
                <div data-testid="section-incomplete-api-docs">
                  <h4 className="font-medium mb-2 flex flex-wrap items-center gap-2" data-testid="heading-incomplete-api-docs">
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    Incomplete API Docs ({incompleteApiDocs.length})
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {incompleteApiDocs.map(d => (
                      <Badge key={d.domain} variant="outline" className="text-yellow-600" data-testid={`badge-incomplete-api-${d.domain}`}>
                        {d.displayName}
                        {!d.hasAuthNotes && " (no auth)"}
                        {!d.hasExamples && " (no examples)"}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {missingFunctionalDocs.length > 0 && (
                <div data-testid="section-missing-functional-docs">
                  <h4 className="font-medium mb-2 flex flex-wrap items-center gap-2" data-testid="heading-missing-functional-docs">
                    <XCircle className="h-4 w-4 text-red-500" />
                    Missing/Empty Functional Docs ({missingFunctionalDocs.length})
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {missingFunctionalDocs.map(d => (
                      <Badge key={d.id} variant="outline" className="text-red-600" data-testid={`badge-missing-functional-${d.id}`}>
                        {d.name}
                        {d.exists && d.isEmpty && " (stub only)"}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <Card data-testid="card-api-domains-list">
            <CardHeader>
              <CardTitle className="text-lg" data-testid="title-api-domains">API Domains</CardTitle>
              <CardDescription data-testid="description-api-domains">
                All detected route domains
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {coverage?.api.coverage.map(d => (
                  <div
                    key={d.domain}
                    className="flex items-center justify-between gap-2 p-2 rounded-md border"
                    data-testid={`row-api-domain-${d.domain}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {d.hasDoc ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                      <span className="font-medium" data-testid={`text-domain-name-${d.domain}`}>{d.displayName}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" data-testid={`badge-endpoints-${d.domain}`}>
                        {d.endpointCount} endpoints
                      </Badge>
                      {d.hasDoc && (
                        <Link href="/super-admin/docs" data-testid={`link-view-doc-${d.domain}`}>
                          <Button variant="ghost" size="icon" aria-label="View documentation" data-testid={`button-view-doc-${d.domain}`}>
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-functional-docs-list">
            <CardHeader>
              <CardTitle className="text-lg" data-testid="title-functional-docs">Functional Docs</CardTitle>
              <CardDescription data-testid="description-functional-docs">
                Required functional documentation pages
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {coverage?.functional.coverage.map(d => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between gap-2 p-2 rounded-md border"
                    data-testid={`row-functional-doc-${d.id}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {d.exists && !d.isEmpty ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : d.exists ? (
                        <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                      <span className="font-medium" data-testid={`text-functional-name-${d.id}`}>{d.name}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {d.exists && (
                        <Badge variant="secondary" data-testid={`badge-wordcount-${d.id}`}>
                          {d.wordCount} words
                        </Badge>
                      )}
                      {d.exists && (
                        <Link href="/super-admin/docs" data-testid={`link-view-functional-${d.id}`}>
                          <Button variant="ghost" size="icon" aria-label="View documentation" data-testid={`button-view-functional-${d.id}`}>
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
