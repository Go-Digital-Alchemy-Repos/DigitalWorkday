import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, Building2, FolderKanban, Users, CheckSquare, Clock, AlertTriangle, TrendingUp } from "lucide-react";

interface TenantsSummary {
  total: number;
  active: number;
  inactive: number;
  suspended: number;
  missingAgreement: number;
  missingBranding: number;
  missingAdminUser: number;
  recentlyCreated: number;
}

interface ProjectsSummary {
  total: number;
  active: number;
  archived: number;
  withOverdueTasks: number;
  topTenantsByProjects: Array<{ tenantId: string; tenantName: string; projectCount: number }>;
}

interface UsersSummary {
  total: number;
  byRole: { super_user: number; admin: number; employee: number; client: number };
  activeUsers: number;
  pendingInvites: number;
}

interface TasksSummary {
  total: number;
  byStatus: { todo: number; in_progress: number; blocked: number; done: number };
  overdue: number;
  dueToday: number;
  upcoming: number;
  unassigned: number;
}

interface TimeSummary {
  totalMinutesThisWeek: number;
  totalMinutesThisMonth: number;
  topTenantsByHours: Array<{ tenantId: string; tenantName: string; totalMinutes: number }>;
  topUsersByHours: Array<{ userId: string; userName: string; totalMinutes: number }>;
}

function StatCard({ title, value, subtitle, icon: Icon }: { title: string; value: number | string; subtitle?: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

export default function SuperAdminPlatformReports() {
  const [activeTab, setActiveTab] = useState("tenants");

  const { data: tenantsSummary, isLoading: tenantsLoading } = useQuery<TenantsSummary>({
    queryKey: ["/api/v1/super/reports/tenants-summary"],
    enabled: activeTab === "tenants",
  });

  const { data: projectsSummary, isLoading: projectsLoading } = useQuery<ProjectsSummary>({
    queryKey: ["/api/v1/super/reports/projects-summary"],
    enabled: activeTab === "projects",
  });

  const { data: usersSummary, isLoading: usersLoading } = useQuery<UsersSummary>({
    queryKey: ["/api/v1/super/reports/users-summary"],
    enabled: activeTab === "users",
  });

  const { data: tasksSummary, isLoading: tasksLoading } = useQuery<TasksSummary>({
    queryKey: ["/api/v1/super/reports/tasks-summary"],
    enabled: activeTab === "tasks",
  });

  const { data: timeSummary, isLoading: timeLoading } = useQuery<TimeSummary>({
    queryKey: ["/api/v1/super/reports/time-summary"],
    enabled: activeTab === "time",
  });

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="p-4 sm:p-6">
        <p className="text-sm text-muted-foreground mb-6">
          Cross-tenant aggregate analytics and platform-wide metrics.
        </p>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 mb-6">
            <TabsList className="inline-flex w-auto min-w-full sm:min-w-0" data-testid="platform-reports-tabs">
              <TabsTrigger value="tenants" className="text-xs sm:text-sm whitespace-nowrap" data-testid="tab-tenants">
                <Building2 className="h-4 w-4 mr-1.5 sm:mr-2" />
                Tenants
              </TabsTrigger>
              <TabsTrigger value="projects" className="text-xs sm:text-sm whitespace-nowrap" data-testid="tab-projects">
                <FolderKanban className="h-4 w-4 mr-1.5 sm:mr-2" />
                Projects
              </TabsTrigger>
              <TabsTrigger value="users" className="text-xs sm:text-sm whitespace-nowrap" data-testid="tab-users">
                <Users className="h-4 w-4 mr-1.5 sm:mr-2" />
                Users
              </TabsTrigger>
              <TabsTrigger value="tasks" className="text-xs sm:text-sm whitespace-nowrap" data-testid="tab-tasks">
                <CheckSquare className="h-4 w-4 mr-1.5 sm:mr-2" />
                Tasks
              </TabsTrigger>
              <TabsTrigger value="time" className="text-xs sm:text-sm whitespace-nowrap" data-testid="tab-time">
                <Clock className="h-4 w-4 mr-1.5 sm:mr-2" />
                Time Tracking
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="tenants">
            {tenantsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : tenantsSummary ? (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <StatCard title="Total Tenants" value={tenantsSummary.total} icon={Building2} />
                  <StatCard title="Active" value={tenantsSummary.active} subtitle={`${tenantsSummary.inactive} inactive, ${tenantsSummary.suspended} suspended`} icon={TrendingUp} />
                  <StatCard title="Missing Agreement" value={tenantsSummary.missingAgreement} icon={AlertTriangle} />
                  <StatCard title="Recently Created" value={tenantsSummary.recentlyCreated} subtitle="Last 7 days" icon={Building2} />
                </div>
                <Card>
                  <CardHeader>
                    <CardTitle>Configuration Status</CardTitle>
                    <CardDescription>Tenants missing critical configuration</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Missing Agreement</span>
                        <Badge variant={tenantsSummary.missingAgreement > 0 ? "destructive" : "secondary"}>{tenantsSummary.missingAgreement}</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Missing Branding</span>
                        <Badge variant={tenantsSummary.missingBranding > 0 ? "outline" : "secondary"}>{tenantsSummary.missingBranding}</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Missing Admin User</span>
                        <Badge variant={tenantsSummary.missingAdminUser > 0 ? "destructive" : "secondary"}>{tenantsSummary.missingAdminUser}</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">No tenant data available</div>
            )}
          </TabsContent>

          <TabsContent value="projects">
            {projectsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : projectsSummary ? (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <StatCard title="Total Projects" value={projectsSummary.total} icon={FolderKanban} />
                  <StatCard title="Active" value={projectsSummary.active} icon={TrendingUp} />
                  <StatCard title="Archived" value={projectsSummary.archived} icon={FolderKanban} />
                  <StatCard title="With Overdue Tasks" value={projectsSummary.withOverdueTasks} icon={AlertTriangle} />
                </div>
                {projectsSummary.topTenantsByProjects?.length > 0 && (
                  <Card>
                    <CardHeader><CardTitle>Top Tenants by Projects</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {projectsSummary.topTenantsByProjects.map((tenant, i) => (
                          <div key={tenant.tenantId} className="flex items-center justify-between">
                            <span className="text-sm">{i + 1}. {tenant.tenantName}</span>
                            <Badge variant="secondary">{tenant.projectCount} projects</Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">No project data available</div>
            )}
          </TabsContent>

          <TabsContent value="users">
            {usersLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : usersSummary ? (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <StatCard title="Total Users" value={usersSummary.total} icon={Users} />
                  <StatCard title="Active Users" value={usersSummary.activeUsers} icon={TrendingUp} />
                  <StatCard title="Pending Invites" value={usersSummary.pendingInvites} icon={Users} />
                  <StatCard title="Platform Admins" value={usersSummary.byRole.super_user} icon={Users} />
                </div>
                <Card>
                  <CardHeader><CardTitle>Users by Role</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {[
                        { label: "Super Users", count: usersSummary.byRole.super_user },
                        { label: "Tenant Admins", count: usersSummary.byRole.admin },
                        { label: "Employees", count: usersSummary.byRole.employee },
                        { label: "Clients", count: usersSummary.byRole.client },
                      ].map(({ label, count }) => (
                        <div key={label} className="flex items-center justify-between">
                          <span className="text-sm">{label}</span>
                          <Badge variant="secondary">{count}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">No user data available</div>
            )}
          </TabsContent>

          <TabsContent value="tasks">
            {tasksLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : tasksSummary ? (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <StatCard title="Total Tasks" value={tasksSummary.total} icon={CheckSquare} />
                  <StatCard title="Overdue" value={tasksSummary.overdue} icon={AlertTriangle} />
                  <StatCard title="Due Today" value={tasksSummary.dueToday} icon={Clock} />
                  <StatCard title="Unassigned" value={tasksSummary.unassigned} icon={Users} />
                </div>
                <Card>
                  <CardHeader><CardTitle>Tasks by Status</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {[
                        { label: "To Do", count: tasksSummary.byStatus.todo, variant: "secondary" as const },
                        { label: "In Progress", count: tasksSummary.byStatus.in_progress, variant: "secondary" as const },
                        { label: "Blocked", count: tasksSummary.byStatus.blocked, variant: "destructive" as const },
                        { label: "Done", count: tasksSummary.byStatus.done, variant: "secondary" as const },
                      ].map(({ label, count, variant }) => (
                        <div key={label} className="flex items-center justify-between">
                          <span className="text-sm">{label}</span>
                          <Badge variant={variant}>{count}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">No task data available</div>
            )}
          </TabsContent>

          <TabsContent value="time">
            {timeLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : timeSummary ? (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <StatCard
                    title="This Week"
                    value={`${Math.round(timeSummary.totalMinutesThisWeek / 60)}h`}
                    subtitle={`${timeSummary.totalMinutesThisWeek} minutes`}
                    icon={Clock}
                  />
                  <StatCard
                    title="This Month"
                    value={`${Math.round(timeSummary.totalMinutesThisMonth / 60)}h`}
                    subtitle={`${timeSummary.totalMinutesThisMonth} minutes`}
                    icon={Clock}
                  />
                </div>
                {timeSummary.topTenantsByHours?.length > 0 && (
                  <Card>
                    <CardHeader><CardTitle>Top Tenants by Hours</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {timeSummary.topTenantsByHours.map((tenant, i) => (
                          <div key={tenant.tenantId} className="flex items-center justify-between">
                            <span className="text-sm">{i + 1}. {tenant.tenantName}</span>
                            <Badge variant="secondary">{Math.round(tenant.totalMinutes / 60)}h</Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">No time tracking data available</div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
