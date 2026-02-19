import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { format, parse } from "date-fns";

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#EF4444",
  high: "#F59E0B",
  normal: "#3B82F6",
  low: "#6B7280",
};

const VOLUME_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16"];

interface MessagesChartsProps {
  volumeByClient: {
    clientId: string;
    clientName: string;
    total: number;
    open: number;
    closed: number;
  }[];
  dailyTrend: {
    date: string;
    created: number;
    responded: number;
    resolved: number;
    avgResponseMinutes: number | null;
  }[];
  openByPriority: Record<string, number>;
}

function truncateName(name: string, maxLen = 16): string {
  return name.length > maxLen ? name.slice(0, maxLen - 1) + "\u2026" : name;
}

export default function MessagesCharts({ volumeByClient, dailyTrend, openByPriority }: MessagesChartsProps) {
  const trendData = dailyTrend.map(d => {
    let label: string;
    try {
      const parsed = typeof d.date === "string" && d.date.match(/^\d{4}-\d{2}-\d{2}$/)
        ? parse(d.date, "yyyy-MM-dd", new Date())
        : new Date(d.date);
      label = format(parsed, "MMM d");
    } catch {
      label = String(d.date).slice(0, 10);
    }
    return { ...d, label };
  });

  const priorityData = Object.entries(openByPriority)
    .filter(([, v]) => Number(v) > 0)
    .map(([priority, count]) => ({
      name: priority.charAt(0).toUpperCase() + priority.slice(1),
      value: Number(count),
      fill: PRIORITY_COLORS[priority] || "#6B7280",
    }));

  const clientData = volumeByClient.slice(0, 12).map(c => ({
    ...c,
    name: truncateName(c.clientName),
    fullName: c.clientName,
  }));

  return (
    <div className="grid gap-6 lg:grid-cols-2" data-testid="messages-charts-container">
      <Card className="lg:col-span-2" data-testid="chart-daily-trend">
        <CardHeader>
          <CardTitle className="text-base">Daily Thread Activity</CardTitle>
          <CardDescription>Created, responded, and resolved threads per day</CardDescription>
        </CardHeader>
        <CardContent>
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  className="fill-muted-foreground"
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  className="fill-muted-foreground"
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "var(--radius)",
                    color: "hsl(var(--card-foreground))",
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="created"
                  name="Created"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="responded"
                  name="Responded"
                  stroke="#10B981"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="resolved"
                  name="Resolved"
                  stroke="#8B5CF6"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
              No data for the selected period
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="chart-volume-by-client">
        <CardHeader>
          <CardTitle className="text-base">Volume by Client</CardTitle>
          <CardDescription>Conversation count per client (top 12)</CardDescription>
        </CardHeader>
        <CardContent>
          {clientData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={clientData} layout="vertical" margin={{ left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11 }}
                  className="fill-muted-foreground"
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  className="fill-muted-foreground"
                  width={120}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "var(--radius)",
                    color: "hsl(var(--card-foreground))",
                  }}
                  formatter={(value: number, name: string) => [value, name]}
                  labelFormatter={(label: string, payload: any[]) => payload?.[0]?.payload?.fullName || label}
                />
                <Legend />
                <Bar dataKey="open" name="Open" fill="#3B82F6" stackId="a" radius={[0, 0, 0, 0]} />
                <Bar dataKey="closed" name="Closed" fill="#10B981" stackId="a" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
              No data for the selected period
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="chart-open-by-priority">
        <CardHeader>
          <CardTitle className="text-base">Open Threads by Priority</CardTitle>
          <CardDescription>Distribution of currently open threads</CardDescription>
        </CardHeader>
        <CardContent>
          {priorityData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={priorityData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {priorityData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "var(--radius)",
                    color: "hsl(var(--card-foreground))",
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
              No open threads
            </div>
          )}
        </CardContent>
      </Card>

      {trendData.some(d => d.avgResponseMinutes !== null) && (
        <Card className="lg:col-span-2" data-testid="chart-response-time-trend">
          <CardHeader>
            <CardTitle className="text-base">Response Time Trend</CardTitle>
            <CardDescription>Average first response time per day (in minutes)</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trendData.filter(d => d.avgResponseMinutes !== null)}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  className="fill-muted-foreground"
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  className="fill-muted-foreground"
                  label={{ value: "Minutes", angle: -90, position: "insideLeft", className: "fill-muted-foreground" }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "var(--radius)",
                    color: "hsl(var(--card-foreground))",
                  }}
                  formatter={(value: number) => [`${value}m`, "Avg Response"]}
                />
                <Line
                  type="monotone"
                  dataKey="avgResponseMinutes"
                  name="Avg Response Time"
                  stroke="#F59E0B"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#F59E0B" }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
