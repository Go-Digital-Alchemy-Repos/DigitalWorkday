# Chat Phase 7: Context Panel

## Overview

This phase adds a collapsible right-side context panel that displays type-aware information based on whether the current conversation is a channel or a DM.

## Features

### 1. Panel Structure

The context panel is a collapsible right-side panel (272px wide when open) that shows contextual information about the current conversation.

**Component:** `ChatContextPanel` in `client/src/features/chat/ChatContextPanel.tsx`

**Responsive Defaults:**
- Desktop (>=768px): Panel opens by default
- Mobile (<768px): Panel closed by default

```typescript
const [contextPanelOpen, setContextPanelOpen] = useState(() => {
  if (typeof window !== "undefined") {
    return window.innerWidth >= 768;
  }
  return true;
});
```

### 2. Channel Context Content

When viewing a channel, the panel shows:

| Section | Description | Status |
|---------|-------------|--------|
| Channel Info | Channel name, privacy badge, project link (if applicable) | Implemented |
| Members | List of channel members with avatars, "You" badge for current user | Implemented |
| Pinned Messages | Pinned messages in the channel | Stub (no data) |
| Shared Files | Files shared in the channel | Stub (no data) |

**Channel Info:**
- Hash or Lock icon based on channel privacy
- Channel name
- "Private Channel" badge if private
- Project link card (if channel is associated with a project)

**Members Section:**
- Shows up to 10 members with avatars
- "+N more" indicator if more than 10 members
- "You" badge on current user
- Falls back to member count if list not available

### 3. DM Context Content

When viewing a DM, the panel shows:

| Section | Description | Status |
|---------|-------------|--------|
| User Card | Large avatar, name, email of the other participant | Implemented |
| Quick Actions | View Profile, Send Email buttons | Implemented |
| Conversation Info | Start date, participant count | Implemented |

**User Card:**
- 80px avatar with fallback initials
- User name (or "Unknown User")
- User email

**Quick Actions:**
- View Profile: Links to `/team?user={userId}`
- Send Email: Opens `mailto:{email}` link

### 4. Toggle Button

A toggle button appears in the chat header when the panel is closed:

```tsx
<ChatContextPanelToggle
  onClick={() => setContextPanelOpen(true)}
  isOpen={contextPanelOpen}
/>
```

The button uses `ChevronLeft` icon to indicate the panel can be opened.

### 5. Collapsible Behavior

The panel smoothly transitions between open (w-72) and closed (w-0) states:

```tsx
<div
  className={cn(
    "border-l bg-background transition-all duration-300 flex flex-col overflow-hidden",
    isOpen ? "w-72" : "w-0"
  )}
>
```

## Props Interface

```typescript
interface ChatContextPanelProps {
  selectedChannel: ChatChannel | null;
  selectedDm: ChatDmThread | null;
  currentUserId?: string;
  channelMembers?: ChannelMember[];
  isOpen: boolean;
  onToggle: () => void;
  className?: string;
}
```

## Integration

```tsx
{(selectedChannel || selectedDm) && (
  <ChatContextPanel
    selectedChannel={selectedChannel}
    selectedDm={selectedDm}
    currentUserId={user?.id}
    channelMembers={channelMembersQuery.data || []}
    isOpen={contextPanelOpen}
    onToggle={() => setContextPanelOpen(false)}
  />
)}
```

## Test IDs

- `chat-context-panel` - Main panel container
- `button-close-context-panel` - Close button in panel header
- `button-open-context-panel` - Toggle button in chat header
- `link-project` - Project link button (channels with projects)
- `member-{userId}` - Individual member row
- `button-view-profile` - View Profile action (DMs)
- `button-send-email` - Send Email action (DMs)

## Future Enhancements

- Pinned messages display when backend supports pinning
- Shared files list when tracking shared attachments
- Online/offline status indicators for DM users
- Member management actions (add/remove) in panel
- Channel settings/preferences in panel
- Search within conversation from panel
