import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest , tenantKey, STALE_TIMES } from "@/lib/queryClient";
import { useAuthSafe } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Loader2, Shield, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const EXCLUDED_ROLES = ["client", "client_viewer", "client_collaborator"];

export function LocationGate({ children }: { children: React.ReactNode }) {
  const auth = useAuthSafe();
  const user = auth?.user ?? null;
  const isAuthenticated = auth?.isAuthenticated ?? false;

  if (!isAuthenticated || !user) {
    return <>{children}</>;
  }

  if (EXCLUDED_ROLES.includes(user.role)) {
    return <>{children}</>;
  }

  return <LocationCheck>{children}</LocationCheck>;
}

function LocationCheck({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: locationData, isLoading } = useQuery<{
    lat: number | null;
    lng: number | null;
    updatedAt: string | null;
  }>({
    queryKey: tenantKey(["/api/v1/me/location"]),
    staleTime: STALE_TIMES.fast,
  });

  const updateLocationMutation = useMutation({
    mutationFn: async (coords: { lat: number; lng: number }) => {
      return apiRequest("POST", "/api/v1/me/location", coords);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tenantKey(["/api/v1/me/location"]) });
      toast({ title: "Location shared successfully" });
    },
    onError: () => {
      toast({ title: "Failed to save location", variant: "destructive" });
    },
  });

  const handleShareLocation = () => {
    if (!navigator.geolocation) {
      setError("Your browser does not support location services. Please use a modern browser.");
      return;
    }
    setRequesting(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setRequesting(false);
        updateLocationMutation.mutate({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (err) => {
        setRequesting(false);
        if (err.code === err.PERMISSION_DENIED) {
          setError("Location permission was denied. Please enable location access in your browser settings and try again.");
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setError("Your location could not be determined. Please check your device's location settings.");
        } else {
          setError("Unable to retrieve your location. Please try again.");
        }
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 }
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const hasLocation = locationData?.lat != null && locationData?.lng != null;

  if (hasLocation) {
    return <>{children}</>;
  }

  return (
    <div className="flex items-center justify-center h-screen bg-background p-4" data-testid="location-gate">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <MapPin className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-xl">Location Required</CardTitle>
          <CardDescription className="text-sm mt-2">
            Your organization requires all team members to share their location to use this platform. This helps with team coordination and resource management.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 border">
            <Shield className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              Your location is only visible to platform administrators and is never shared externally. You can update your location at any time from your profile settings.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}

          <Button
            className="w-full"
            size="lg"
            onClick={handleShareLocation}
            disabled={requesting || updateLocationMutation.isPending}
            data-testid="button-gate-share-location"
          >
            {requesting || updateLocationMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {requesting ? "Requesting location..." : "Saving..."}
              </>
            ) : (
              <>
                <MapPin className="h-4 w-4 mr-2" />
                Share My Location
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
