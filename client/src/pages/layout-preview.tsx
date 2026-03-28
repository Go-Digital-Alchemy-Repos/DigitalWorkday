import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ArrowRight, CheckSquare, FolderKanban, AlertTriangle, Zap } from "lucide-react";

export default function LayoutPreview() {
  const [activeLayout, setActiveLayout] = useState<"tabbed" | "grid" | "hierarchical">("tabbed");

  const mockTasks = [
    { id: 1, name: "Design system update", client: "Acme Corp", dueDate: "2 days" },
    { id: 2, name: "API integration", client: "TechStart", dueDate: "5 days" },
    { id: 3, name: "Mobile optimization", client: "Acme Corp", dueDate: "1 week" },
  ];

  const mockProjects = [
    { id: 1, name: "Website Redesign", color: "#3B82F6" },
    { id: 2, name: "Mobile App", color: "#10B981" },
    { id: 3, name: "API v2", color: "#F59E0B" },
  ];

  // Layout 1: Tabbed
  const TabbedLayout = () => (
    <div className="flex-1 flex flex-col bg-white rounded-lg border">
      <div className="border-b flex overflow-x-auto">
        {["Progress", "Review Queue", "Projects"].map((tab) => (
          <button
            key={tab}
            className="px-4 py-3 border-b-2 border-primary font-medium text-sm whitespace-nowrap"
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-6 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Your Task Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">6 of 8 tasks completed</span>
                <span className="text-lg font-bold">75%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full" style={{ width: "75%" }}></div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  // Layout 2: Dense Grid
  const GridLayout = () => (
    <div className="flex-1 grid gap-4 md:grid-cols-3 auto-rows-max overflow-auto p-6 bg-gray-50 rounded-lg">
      <Card className="md:col-span-1">
        <CardHeader>
          <CardTitle className="text-base">Task Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center">
            <div className="text-3xl font-bold">75%</div>
            <div className="text-xs text-muted-foreground">6 of 8 done</div>
          </div>
        </CardContent>
      </Card>

      <Card className="md:col-span-1">
        <CardHeader>
          <CardTitle className="text-base">Review Queue</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-amber-500" />
            <div className="text-sm font-medium">1 pending</div>
          </div>
        </CardContent>
      </Card>

      <Card className="md:col-span-1">
        <CardHeader>
          <CardTitle className="text-base">Suggestions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center">
            <Zap className="h-8 w-8 mx-auto mb-2 text-yellow-500" />
            <div className="text-sm font-medium">3 available</div>
          </div>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">My Tasks</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {mockTasks.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-sm p-2 border rounded">
                <span>{t.name}</span>
                <span className="text-xs text-muted-foreground">{t.dueDate}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Projects</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {mockProjects.map((p) => (
              <div key={p.id} className="flex items-center gap-2 p-2 rounded hover:bg-gray-100">
                <div
                  className="w-3 h-3 rounded"
                  style={{ backgroundColor: p.color }}
                ></div>
                <span className="text-sm">{p.name}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // Layout 3: Hierarchical
  const HierarchicalLayout = () => (
    <div className="flex-1 overflow-auto p-6 space-y-8 bg-white rounded-lg">
      {/* Overview Section */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
          Overview
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold">75%</div>
              <div className="text-xs text-muted-foreground mt-1">Task Progress</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold">6</div>
              <div className="text-xs text-muted-foreground mt-1">Completed</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold">2</div>
              <div className="text-xs text-muted-foreground mt-1">In Progress</div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Your Work Section */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
          Your Work
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">My Tasks</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {mockTasks.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 p-2 border rounded hover:bg-gray-50">
                    <CheckSquare className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.client}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Projects</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {mockProjects.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 cursor-pointer">
                    <div
                      className="h-8 w-8 rounded flex items-center justify-center text-white text-sm font-medium"
                      style={{ backgroundColor: p.color }}
                    >
                      {p.name.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{p.name}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Admin Section */}
      <section className="bg-blue-50 -mx-6 px-6 py-4 rounded-lg border border-blue-100">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
          Admin Dashboard
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="bg-white">
            <CardHeader>
              <CardTitle className="text-base">Unassigned Tasks</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">3</p>
            </CardContent>
          </Card>
          <Card className="bg-white">
            <CardHeader>
              <CardTitle className="text-base">Overdue</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">1</p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-gray-100 p-4">
      <div className="mb-4 flex gap-2">
        <Button
          variant={activeLayout === "tabbed" ? "default" : "outline"}
          onClick={() => setActiveLayout("tabbed")}
        >
          Tabbed
        </Button>
        <Button
          variant={activeLayout === "grid" ? "default" : "outline"}
          onClick={() => setActiveLayout("grid")}
        >
          Grid
        </Button>
        <Button
          variant={activeLayout === "hierarchical" ? "default" : "outline"}
          onClick={() => setActiveLayout("hierarchical")}
        >
          Hierarchical
        </Button>
      </div>

      {activeLayout === "tabbed" && <TabbedLayout />}
      {activeLayout === "grid" && <GridLayout />}
      {activeLayout === "hierarchical" && <HierarchicalLayout />}
    </div>
  );
}
