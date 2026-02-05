# Dashboard Cards

## Overview

The `MetricCard` component provides a consistent way to display key metrics and statistics across all dashboards with icons, large numbers, labels, and optional trend indicators.

## Installation

```tsx
import { 
  MetricCard, 
  MetricGrid, 
  StatItem,
  type MetricCardVariant,
  type TrendDirection,
} from "@/components/ui-system";
```

---

## MetricCard Component

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `string` | Required | Metric label |
| `value` | `string \| number` | Required | The main metric value |
| `description` | `string` | - | Additional context text |
| `icon` | `LucideIcon` | - | Icon component |
| `iconColor` | `string` | - | Custom icon background color class |
| `trend` | `TrendData` | - | Trend indicator data |
| `variant` | `MetricCardVariant` | `"default"` | Card style variant |
| `loading` | `boolean` | `false` | Show loading skeleton |

### TrendData

```tsx
interface TrendData {
  value: number;          // Percentage change (e.g., 12 for +12%)
  label?: string;         // Optional label (e.g., "vs last month")
  direction?: TrendDirection; // "up" | "down" | "neutral" (auto-detected if not set)
}
```

---

## Variants

### Default

Standard metric card with icon in top-right corner.

```tsx
<MetricCard
  title="Total Revenue"
  value="$45,231"
  icon={DollarSign}
  trend={{ value: 12, label: "vs last month" }}
/>
```

### Compact

Horizontal layout with icon on the left, ideal for smaller spaces.

```tsx
<MetricCard
  variant="compact"
  title="Active Users"
  value="1,234"
  icon={Users}
  trend={{ value: 5 }}
/>
```

### Featured

Highlighted card with primary background color for key metrics.

```tsx
<MetricCard
  variant="featured"
  title="Monthly Target"
  value="87%"
  description="On track to exceed goal"
  icon={Target}
  trend={{ value: 8 }}
/>
```

---

## MetricGrid Component

Responsive grid layout for metric cards.

```tsx
<MetricGrid columns={4}>
  <MetricCard title="Tasks" value={42} icon={CheckCircle} />
  <MetricCard title="Projects" value={12} icon={Folder} />
  <MetricCard title="Hours" value="156" icon={Clock} />
  <MetricCard title="Team" value={8} icon={Users} />
</MetricGrid>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `columns` | `2 \| 3 \| 4` | `4` | Number of columns on large screens |
| `className` | `string` | - | Additional CSS classes |

---

## Usage Examples

### Main Dashboard

```tsx
function MainDashboard() {
  const { data, isLoading } = useQuery({ queryKey: ["/api/dashboard/stats"] });

  return (
    <MetricGrid columns={4}>
      <MetricCard
        title="Total Tasks"
        value={data?.totalTasks ?? 0}
        icon={CheckSquare}
        trend={{ value: 12, label: "this week" }}
        loading={isLoading}
      />
      <MetricCard
        title="In Progress"
        value={data?.inProgress ?? 0}
        icon={Clock}
        description="Active work items"
        loading={isLoading}
      />
      <MetricCard
        title="Completed"
        value={data?.completed ?? 0}
        icon={CheckCircle}
        trend={{ value: 8, direction: "up" }}
        loading={isLoading}
      />
      <MetricCard
        title="Overdue"
        value={data?.overdue ?? 0}
        icon={AlertCircle}
        iconColor="bg-red-100 dark:bg-red-900/30"
        loading={isLoading}
      />
    </MetricGrid>
  );
}
```

### Reports Overview

```tsx
function ReportsOverview() {
  return (
    <MetricGrid columns={4}>
      <MetricCard
        variant="featured"
        title="Total Hours"
        value="1,247"
        description="This month"
        icon={Clock}
        trend={{ value: 15, label: "vs last month" }}
      />
      <MetricCard
        title="Billable Rate"
        value="78%"
        icon={DollarSign}
        trend={{ value: 3 }}
      />
      <MetricCard
        title="Projects Active"
        value="24"
        icon={Folder}
      />
      <MetricCard
        title="Team Utilization"
        value="92%"
        icon={Users}
        trend={{ value: -2, direction: "down" }}
      />
    </MetricGrid>
  );
}
```

### Admin Dashboard

```tsx
function AdminDashboard() {
  return (
    <MetricGrid columns={3}>
      <MetricCard
        title="Total Users"
        value="1,234"
        icon={Users}
        trend={{ value: 5, label: "new this week" }}
      />
      <MetricCard
        title="Active Tenants"
        value="89"
        icon={Building}
        description="Across all plans"
      />
      <MetricCard
        title="System Health"
        value="99.9%"
        icon={Activity}
        iconColor="bg-green-100 dark:bg-green-900/30"
      />
    </MetricGrid>
  );
}
```

### Compact Layout (Sidebar Stats)

```tsx
function SidebarStats() {
  return (
    <div className="space-y-2">
      <MetricCard
        variant="compact"
        title="My Tasks"
        value={12}
        icon={CheckSquare}
      />
      <MetricCard
        variant="compact"
        title="Hours Today"
        value="4.5"
        icon={Clock}
        trend={{ value: 10 }}
      />
    </div>
  );
}
```

---

## Trend Indicators

Trends automatically display with appropriate colors and icons:

| Direction | Icon | Color |
|-----------|------|-------|
| `up` (positive) | ↗ TrendingUp | Green |
| `down` (negative) | ↘ TrendingDown | Red |
| `neutral` | — Minus | Gray |

Direction is auto-detected from value sign, or can be explicitly set:

```tsx
// Auto-detected: positive value = up
<MetricCard trend={{ value: 12 }} /> // Shows green ↗ +12%

// Auto-detected: negative value = down  
<MetricCard trend={{ value: -5 }} /> // Shows red ↘ -5%

// Explicit direction (for cases where down is good)
<MetricCard 
  title="Response Time"
  value="120ms"
  trend={{ value: -15, direction: "up" }} // Green ↗ despite negative value
/>
```

---

## Loading State

Use the `loading` prop for skeleton loading:

```tsx
function DashboardMetrics() {
  const { data, isLoading } = useQuery({ queryKey: ["/api/stats"] });

  return (
    <MetricGrid>
      <MetricCard
        title="Revenue"
        value={data?.revenue ?? "$0"}
        icon={DollarSign}
        loading={isLoading}
      />
      {/* Other cards... */}
    </MetricGrid>
  );
}
```

---

## Icon Colors

Customize icon background for emphasis:

```tsx
// Success/positive
<MetricCard iconColor="bg-green-100 dark:bg-green-900/30" />

// Warning
<MetricCard iconColor="bg-yellow-100 dark:bg-yellow-900/30" />

// Error/urgent
<MetricCard iconColor="bg-red-100 dark:bg-red-900/30" />

// Info/neutral
<MetricCard iconColor="bg-blue-100 dark:bg-blue-900/30" />
```

---

## StatItem Component

For inline stats without cards:

```tsx
<div className="flex gap-8">
  <StatItem label="Tasks" value={42} />
  <StatItem label="Hours" value="156" subtext="this month" />
  <StatItem label="Completion" value="87%" />
</div>
```

---

## Best Practices

### DO
- Use consistent icon styles (outline or solid, not mixed)
- Include trends for metrics that change over time
- Use `featured` variant for the most important metric only
- Group related metrics together

### DON'T
- Use more than 4-6 metric cards per row
- Mix different card variants in the same row (except featured)
- Show too many decimal places (round for readability)
- Omit icons when space allows

---

## Application Coverage

| Dashboard | Status | Notes |
|-----------|--------|-------|
| Main Dashboard | ✅ Ready | Use 4-column grid |
| Reports Overview | ✅ Ready | Feature total hours |
| Admin Dashboard | ✅ Ready | Use 3-column grid |
| Client Portal | ✅ Ready | Compact variant |
| My Tasks | ✅ Ready | Summary stats |
