import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Users, UserX, Clock } from "lucide-react";
import { getStorageUrl } from "@/lib/storageUrl";
import { buildHeaders } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

interface EmployeeLocation {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl: string | null;
  isActive: boolean;
  lat: number;
  lng: number;
  locationUpdatedAt: string | null;
}

interface EmployeeNoLocation {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl: string | null;
}

interface LocationsData {
  withLocation: EmployeeLocation[];
  withoutLocation: EmployeeNoLocation[];
  totalWithLocation: number;
  totalWithoutLocation: number;
}

function getInitials(name: string): string {
  const parts = name.split(" ");
  return parts.map(p => p.charAt(0)).slice(0, 2).join("").toUpperCase() || "?";
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return "Unknown";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

function createClusterIcon(count: number): L.DivIcon {
  const size = count < 10 ? 36 : count < 50 ? 44 : 52;
  return L.divIcon({
    html: `<div style="
      background: hsl(var(--primary));
      color: hsl(var(--primary-foreground));
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 600;
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    ">${count}</div>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function clusterMarkers(employees: EmployeeLocation[], zoomLevel: number = 4): { clusters: { lat: number; lng: number; employees: EmployeeLocation[] }[] } {
  const threshold = 5 / Math.pow(2, zoomLevel - 2);
  const used = new Set<number>();
  const clusters: { lat: number; lng: number; employees: EmployeeLocation[] }[] = [];

  for (let i = 0; i < employees.length; i++) {
    if (used.has(i)) continue;
    const group = [employees[i]];
    used.add(i);

    for (let j = i + 1; j < employees.length; j++) {
      if (used.has(j)) continue;
      const dist = Math.sqrt(
        Math.pow(employees[i].lat - employees[j].lat, 2) +
        Math.pow(employees[i].lng - employees[j].lng, 2)
      );
      if (dist < threshold) {
        group.push(employees[j]);
        used.add(j);
      }
    }

    const avgLat = group.reduce((s, e) => s + e.lat, 0) / group.length;
    const avgLng = group.reduce((s, e) => s + e.lng, 0) / group.length;
    clusters.push({ lat: avgLat, lng: avgLng, employees: group });
  }
  return { clusters };
}

export function TeamLocationMap({ tenantId }: { tenantId: string }) {
  const [showNoLocation, setShowNoLocation] = useState(false);

  const { data, isLoading, error } = useQuery<LocationsData>({
    queryKey: ["/api/v1/super/tenants", tenantId, "employee-locations"],
    queryFn: async () => {
      const res = await fetch(`/api/v1/super/tenants/${tenantId}/employee-locations`, {
        credentials: "include",
        headers: buildHeaders(),
      });
      if (!res.ok) throw new Error("Failed to fetch employee locations");
      return res.json();
    },
    staleTime: 60_000,
  });

  const mapCenter = useMemo<[number, number]>(() => {
    if (!data?.withLocation?.length) return [39.8283, -98.5795];
    const lats = data.withLocation.map(e => e.lat);
    const lngs = data.withLocation.map(e => e.lng);
    return [
      lats.reduce((a, b) => a + b, 0) / lats.length,
      lngs.reduce((a, b) => a + b, 0) / lngs.length,
    ];
  }, [data]);

  const clustered = useMemo(() => {
    if (!data?.withLocation?.length) return [];
    return clusterMarkers(data.withLocation, 4).clusters;
  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <MapPin className="h-4 w-4" /> Team Map
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[400px] w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <MapPin className="h-4 w-4" /> Team Map
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Failed to load employee locations.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-team-location-map">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" /> Team Map
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px] gap-1" data-testid="badge-with-location">
              <MapPin className="h-3 w-3" />
              {data?.totalWithLocation ?? 0} sharing
            </Badge>
            <button
              onClick={() => setShowNoLocation(!showNoLocation)}
              className="inline-flex"
              data-testid="button-toggle-no-location"
            >
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] gap-1 cursor-pointer hover:bg-muted transition-colors",
                  showNoLocation && "bg-muted"
                )}
              >
                <UserX className="h-3 w-3" />
                {data?.totalWithoutLocation ?? 0} not sharing
              </Badge>
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="flex">
          <div className={cn("transition-all", showNoLocation ? "w-2/3" : "w-full")}>
            <div className="h-[400px] rounded-b-lg overflow-hidden" data-testid="map-container">
              {data && data.withLocation.length > 0 ? (
                <MapContainer
                  center={mapCenter}
                  zoom={4}
                  style={{ height: "100%", width: "100%" }}
                  scrollWheelZoom={true}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  {clustered.map((cluster, i) =>
                    cluster.employees.length === 1 ? (
                      <Marker key={cluster.employees[0].id} position={[cluster.lat, cluster.lng]}>
                        <Popup>
                          <div className="flex items-center gap-2 min-w-[180px]" data-testid={`popup-employee-${cluster.employees[0].id}`}>
                            <Avatar className="h-8 w-8">
                              {cluster.employees[0].avatarUrl && (
                                <AvatarImage src={getStorageUrl(cluster.employees[0].avatarUrl)} />
                              )}
                              <AvatarFallback className="text-xs">
                                {getInitials(cluster.employees[0].name)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-sm">{cluster.employees[0].name}</p>
                              <p className="text-xs text-muted-foreground capitalize">{cluster.employees[0].role}</p>
                              <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                <Clock className="h-2.5 w-2.5" />
                                {formatTimeAgo(cluster.employees[0].locationUpdatedAt)}
                              </p>
                            </div>
                          </div>
                        </Popup>
                      </Marker>
                    ) : (
                      <Marker
                        key={`cluster-${i}`}
                        position={[cluster.lat, cluster.lng]}
                        icon={createClusterIcon(cluster.employees.length)}
                      >
                        <Popup>
                          <div className="max-h-[200px] overflow-y-auto min-w-[200px]">
                            <p className="font-medium text-sm mb-2">{cluster.employees.length} team members</p>
                            {cluster.employees.map(emp => (
                              <div key={emp.id} className="flex items-center gap-2 py-1 border-t first:border-t-0">
                                <Avatar className="h-6 w-6">
                                  {emp.avatarUrl && <AvatarImage src={getStorageUrl(emp.avatarUrl)} />}
                                  <AvatarFallback className="text-[10px]">{getInitials(emp.name)}</AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="text-xs font-medium">{emp.name}</p>
                                  <p className="text-[10px] text-muted-foreground capitalize">{emp.role}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </Popup>
                      </Marker>
                    )
                  )}
                </MapContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center bg-muted/30">
                  <MapPin className="h-10 w-10 text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">No employee locations shared yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Employees can share their location from Profile Settings
                  </p>
                </div>
              )}
            </div>
          </div>

          {showNoLocation && data && (
            <div className="w-1/3 border-l overflow-y-auto h-[400px] p-3" data-testid="panel-no-location">
              <div className="flex items-center gap-1.5 mb-3">
                <UserX className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium">No Location ({data.totalWithoutLocation})</span>
              </div>
              <div className="space-y-1.5">
                {data.withoutLocation.map(emp => (
                  <div key={emp.id} className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50" data-testid={`no-location-employee-${emp.id}`}>
                    <Avatar className="h-6 w-6">
                      {emp.avatarUrl && <AvatarImage src={getStorageUrl(emp.avatarUrl)} />}
                      <AvatarFallback className="text-[10px]">{getInitials(emp.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{emp.name}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">{emp.role}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
