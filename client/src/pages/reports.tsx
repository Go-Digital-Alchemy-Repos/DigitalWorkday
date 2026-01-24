import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BarChart3 } from "lucide-react";
import { ReportsTab } from "@/components/settings/reports-tab";

export default function ReportsPage() {
  const { user, isLoading } = useAuth();

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

  return (
    <ScrollArea className="h-full">
      <div className="container max-w-7xl py-8 px-6">
        <div className="flex items-center gap-3 mb-6">
          <BarChart3 className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Reports</h1>
            <p className="text-muted-foreground text-sm">
              View time tracking, workload, and performance analytics
            </p>
          </div>
        </div>

        <ReportsTab />
      </div>
    </ScrollArea>
  );
}
