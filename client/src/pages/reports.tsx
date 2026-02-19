import { useState, lazy, Suspense } from "react";
import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  BarChart3, 
  Clock, 
  Users, 
  TrendingUp, 
  ArrowLeft,
  FileText,
  Calendar,
  Target,
  MessageSquare,
} from "lucide-react";
import { ReportsTab } from "@/components/settings/reports-tab";

const MessagesReports = lazy(() => import("@/components/reports/messages-reports"));

type ReportView = "landing" | "workload" | "time" | "projects" | "messages";

interface ReportCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  color: string;
}

function ReportCard({ icon, title, description, onClick, color }: ReportCardProps) {
  return (
    <Card 
      className="cursor-pointer hover-elevate active-elevate-2 transition-all"
      onClick={onClick}
      data-testid={`card-report-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <CardHeader className="pb-2">
        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${color}`}>
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <CardTitle className="text-lg mb-1">{title}</CardTitle>
        <CardDescription className="text-sm">
          {description}
        </CardDescription>
      </CardContent>
    </Card>
  );
}

export default function ReportsPage() {
  const { user, isLoading } = useAuth();
  const [currentView, setCurrentView] = useState<ReportView>("landing");

  const isAdmin = user?.role === "admin";
  const isSuperUser = user?.role === "super_user";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAdmin && !isSuperUser) {
    return <Redirect to="/" />;
  }

  const reportCategories = [
    {
      icon: <Users className="h-6 w-6 text-white" />,
      title: "Workload Reports",
      description: "View task distribution and workload across your team members with completion metrics",
      view: "workload" as ReportView,
      color: "bg-blue-500",
    },
    {
      icon: <Clock className="h-6 w-6 text-white" />,
      title: "Time Tracking",
      description: "Analyze time entries by project, employee, and date range with detailed breakdowns",
      view: "time" as ReportView,
      color: "bg-green-500",
    },
    {
      icon: <Target className="h-6 w-6 text-white" />,
      title: "Project Analytics",
      description: "Project progress, budget utilization, and milestone tracking across all projects",
      view: "projects" as ReportView,
      color: "bg-purple-500",
    },
    {
      icon: <MessageSquare className="h-6 w-6 text-white" />,
      title: "Messages",
      description: "Response times, resolution rates, overdue threads, and conversation volume by client",
      view: "messages" as ReportView,
      color: "bg-amber-500",
    },
  ];

  if (currentView === "landing") {
    return (
      <ScrollArea className="h-full">
        <div className="container max-w-7xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <BarChart3 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Reports & Analytics</h1>
              <p className="text-muted-foreground text-sm">
                Comprehensive insights into time tracking, workload, and project performance
              </p>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
            {reportCategories.map((category) => (
              <ReportCard
                key={category.title}
                icon={category.icon}
                title={category.title}
                description={category.description}
                onClick={() => setCurrentView(category.view)}
                color={category.color}
              />
            ))}
          </div>

          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Quick Stats
              </CardTitle>
              <CardDescription>
                Overview of your organization's key metrics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">
                Select a report category above to view detailed analytics and export options.
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    );
  }

  const getViewTitle = () => {
    switch (currentView) {
      case "workload": return "Workload Reports";
      case "time": return "Time Tracking Reports";
      case "projects": return "Project Analytics";
      case "messages": return "Messages Reports";
      default: return "Reports";
    }
  };

  const getViewDescription = () => {
    switch (currentView) {
      case "messages": return "Response times, SLA compliance, and conversation analytics";
      default: return "Detailed analytics and exportable reports";
    }
  };

  return (
    <ScrollArea className="h-full">
      <div className="container max-w-7xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setCurrentView("landing")}
            data-testid="button-back-to-reports"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            {currentView === "messages" ? (
              <MessageSquare className="h-5 w-5 text-primary" />
            ) : (
              <BarChart3 className="h-5 w-5 text-primary" />
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{getViewTitle()}</h1>
            <p className="text-muted-foreground text-sm">
              {getViewDescription()}
            </p>
          </div>
        </div>

        {currentView === "messages" ? (
          <Suspense
            fallback={
              <div className="space-y-4">
                <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Card key={i}>
                      <CardContent className="p-4">
                        <Skeleton className="h-3 w-20 mb-2" />
                        <Skeleton className="h-7 w-16" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            }
          >
            <MessagesReports />
          </Suspense>
        ) : (
          <ReportsTab defaultTab={currentView === "workload" ? "workload" : currentView === "time" ? "time" : undefined} />
        )}
      </div>
    </ScrollArea>
  );
}
