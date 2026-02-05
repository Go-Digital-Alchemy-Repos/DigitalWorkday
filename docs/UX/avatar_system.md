# Avatar System

## Overview

The Avatar system provides consistent user identity display across the application with support for images, generated initials, presence indicators, and grouping.

## Installation

```tsx
import { 
  AvatarWithStatus, 
  AvatarGroup, 
  UserBadge, 
  AssigneeList,
  type AvatarSize,
  type PresenceStatus,
} from "@/components/ui-system";
```

---

## Components

### AvatarWithStatus

The core avatar component with image/initials and optional presence status.

```tsx
<AvatarWithStatus
  src={user.avatarUrl}
  name={user.displayName}
  size="md"
  status="online"
/>
```

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `src` | `string \| null` | - | Image URL |
| `name` | `string` | Required | User name (for initials fallback) |
| `size` | `AvatarSize` | `"md"` | Size variant |
| `status` | `PresenceStatus` | - | Presence indicator |
| `showTooltip` | `boolean` | `false` | Show name on hover |
| `colorSeed` | `string` | `name` | Seed for consistent color |

### AvatarGroup

Overlapping avatars for displaying multiple users.

```tsx
<AvatarGroup
  users={teamMembers}
  max={4}
  size="sm"
  showTooltip
/>
```

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `users` | `Array<{ id, name, avatarUrl?, status? }>` | Required | Users to display |
| `max` | `number` | `4` | Maximum visible avatars |
| `size` | `AvatarSize` | `"sm"` | Size variant |
| `showTooltip` | `boolean` | `true` | Show names on hover |

### UserBadge

Compact user display with avatar and name.

```tsx
<UserBadge
  name="John Doe"
  avatarUrl={user.avatarUrl}
  subtitle="Developer"
  status="online"
/>
```

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `name` | `string` | Required | User name |
| `avatarUrl` | `string \| null` | - | Image URL |
| `subtitle` | `string` | - | Secondary text (role, email) |
| `size` | `"sm" \| "md"` | `"sm"` | Size variant |
| `status` | `PresenceStatus` | - | Presence indicator |
| `onClick` | `() => void` | - | Click handler |

### AssigneeList

Display task/project assignees with smart formatting.

```tsx
<AssigneeList
  assignees={task.assignees}
  max={3}
  emptyText="Unassigned"
/>
```

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `assignees` | `Array<{ id, name, avatarUrl? }>` | Required | Assigned users |
| `max` | `number` | `3` | Max avatars before grouping |
| `size` | `AvatarSize` | `"xs"` | Size variant |
| `emptyText` | `string` | `"Unassigned"` | Text when empty |

---

## Sizes

| Size | Dimensions | Use Case |
|------|------------|----------|
| `xs` | 24px (h-6) | Inline mentions, compact lists |
| `sm` | 32px (h-8) | Comments, activity logs |
| `md` | 40px (h-10) | Chat messages, cards |
| `lg` | 48px (h-12) | Profile headers, drawers |
| `xl` | 64px (h-16) | Profile pages, large displays |

---

## Presence Status

| Status | Color | Icon |
|--------|-------|------|
| `online` | Green | Solid dot |
| `offline` | Gray | Solid dot |
| `idle` | Yellow | Solid dot |
| `busy` | Red | Solid dot |
| `dnd` | Dark Red | Solid dot |

---

## Initials & Colors

When no image is provided, the avatar displays:
- **Initials**: First letter of each word (max 2)
- **Background Color**: Consistently generated from user ID or name

```tsx
// Same user always gets same color
<AvatarWithStatus name="John Doe" colorSeed={user.id} />
```

Color palette includes: blue, green, purple, orange, pink, teal, indigo, cyan, emerald, rose.

---

## Usage Examples

### Chat Messages

```tsx
function ChatMessage({ message }) {
  return (
    <div className="flex gap-3">
      <AvatarWithStatus
        src={message.author.avatarUrl}
        name={message.author.name}
        size="md"
        status={message.author.presence}
        showTooltip
      />
      <div>
        <span className="font-medium">{message.author.name}</span>
        <p>{message.content}</p>
      </div>
    </div>
  );
}
```

### Comment Thread

```tsx
function Comment({ comment }) {
  return (
    <div className="flex gap-2">
      <AvatarWithStatus
        src={comment.user.avatarUrl}
        name={comment.user.name}
        size="sm"
        colorSeed={comment.user.id}
      />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{comment.user.name}</span>
          <span className="text-xs text-muted-foreground">{comment.timestamp}</span>
        </div>
        <p className="text-sm">{comment.content}</p>
      </div>
    </div>
  );
}
```

### Activity Log

```tsx
function ActivityItem({ activity }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <AvatarWithStatus
        src={activity.user.avatarUrl}
        name={activity.user.name}
        size="sm"
        colorSeed={activity.user.id}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">
          <span className="font-medium">{activity.user.name}</span>
          {" "}{activity.action}
        </p>
        <p className="text-xs text-muted-foreground">{activity.time}</p>
      </div>
    </div>
  );
}
```

### Task Assignees

```tsx
function TaskRow({ task }) {
  return (
    <div className="flex items-center justify-between">
      <span>{task.title}</span>
      <AssigneeList
        assignees={task.assignees}
        max={3}
        size="xs"
      />
    </div>
  );
}
```

### Project Team

```tsx
function ProjectCard({ project }) {
  return (
    <Card>
      <CardContent>
        <h3>{project.name}</h3>
        <div className="flex items-center justify-between mt-4">
          <AvatarGroup
            users={project.team}
            max={5}
            size="sm"
          />
          <span className="text-sm text-muted-foreground">
            {project.team.length} members
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
```

### Notifications

```tsx
function NotificationItem({ notification }) {
  return (
    <div className="flex items-start gap-3 p-3">
      <AvatarWithStatus
        src={notification.actor.avatarUrl}
        name={notification.actor.name}
        size="sm"
        colorSeed={notification.actor.id}
      />
      <div className="flex-1">
        <p className="text-sm">
          <span className="font-medium">{notification.actor.name}</span>
          {" "}{notification.message}
        </p>
        <p className="text-xs text-muted-foreground">{notification.time}</p>
      </div>
    </div>
  );
}
```

### User Selection Badge

```tsx
function SelectedUsers({ users, onRemove }) {
  return (
    <div className="flex flex-wrap gap-2">
      {users.map(user => (
        <UserBadge
          key={user.id}
          name={user.name}
          avatarUrl={user.avatarUrl}
          onClick={() => onRemove(user.id)}
        />
      ))}
    </div>
  );
}
```

### Online Team Members

```tsx
function OnlineTeam({ members }) {
  const online = members.filter(m => m.status === "online");
  
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Online ({online.length})</h4>
      {online.map(member => (
        <UserBadge
          key={member.id}
          name={member.name}
          avatarUrl={member.avatarUrl}
          subtitle={member.role}
          status="online"
        />
      ))}
    </div>
  );
}
```

---

## Best Practices

### DO
- Always provide `name` for initials fallback
- Use `colorSeed` with user ID for consistent colors
- Show tooltips in grouped/compact displays
- Match size to context (xs for inline, md for cards)
- Include presence status in real-time features

### DON'T
- Use different sizes for avatars in the same row
- Forget to handle missing images
- Show presence status on historical data
- Overflow with too many avatars (use AvatarGroup)

---

## Application Coverage

| Feature | Component | Size |
|---------|-----------|------|
| Chat messages | `AvatarWithStatus` | md |
| Comments | `AvatarWithStatus` | sm |
| Activity logs | `AvatarWithStatus` | sm |
| Task assignees | `AssigneeList` | xs |
| Project team | `AvatarGroup` | sm |
| Notifications | `AvatarWithStatus` | sm |
| User mentions | `UserBadge` | sm |
| Profile header | `AvatarWithStatus` | xl |
