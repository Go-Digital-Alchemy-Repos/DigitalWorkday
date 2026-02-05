# Rich Text Editor Standardization Plan

## Overview
This document inventories all multi-line text fields in the application and plans their migration to a standardized Rich Text Editor with @mentions support.

## Current State

### Existing RTE Infrastructure
The app already has a TipTap-based rich text editor system:

| Component | Location | Features | Used By |
|-----------|----------|----------|---------|
| `RichTextEditor` | `client/src/components/richtext/RichTextEditor.tsx` | Bold, Italic, Underline, Lists, Links, Alignment, Emoji | Task descriptions, Project descriptions |
| `CommentEditor` | `client/src/components/richtext/CommentEditor.tsx` | Same as above + **@mentions** | Task/Subtask comments |
| `RichTextRenderer` | `client/src/components/richtext/RichTextRenderer.tsx` | Read-only rendering with mention support | Display of rich content |

### Storage Format
- **Format**: TipTap JSON document stored as string
- **Backward Compatibility**: Plain text is auto-wrapped in paragraph nodes

---

## Field Inventory

### ✅ Already Using RichTextEditor (No Changes Needed)

| Field | File | Component Used | Mentions |
|-------|------|----------------|----------|
| Task Description | `features/tasks/task-detail-drawer.tsx` | RichTextEditor | No |
| Task Comments | `components/comment-thread.tsx` | CommentEditor | **Yes** |
| Subtask Description | `features/tasks/subtask-detail-drawer.tsx` | RichTextEditor | No |
| Subtask Comments | `components/comment-thread.tsx` | CommentEditor | **Yes** |
| Client Notes | `components/client-notes-tab.tsx` | RichTextEditor | No |
| Tenant Description | `components/super-admin/tenant-drawer.tsx` | RichTextEditor | No |
| Project Description | `features/projects/project-drawer.tsx` | RichTextEditor | No |
| Create Task Description | `features/tasks/create-task-dialog.tsx` | RichTextEditor | No |
| Task Create Drawer | `features/tasks/task-create-drawer.tsx` | RichTextEditor | No |
| Personal Task Create | `features/tasks/personal-task-create-drawer.tsx` | RichTextEditor | No |
| Time Tracking Notes | `pages/time-tracking.tsx` | RichTextEditor | No |
| Timer Description | `features/timer/start-timer-drawer.tsx` | RichTextEditor | No |

### ⚠️ Using Plain Textarea (Need Conversion)

| Field | File | Current Component | Needs Mentions | Priority |
|-------|------|-------------------|----------------|----------|
| Chat Message Composer | `components/chat-message-input.tsx` | Textarea | Yes | **HIGH** |
| Global Chat Drawer | `components/global-chat-drawer.tsx` | Textarea | Yes | **HIGH** |
| Thread Panel Replies | `features/chat/ThreadPanel.tsx` | Textarea | Yes | **HIGH** |
| Time Entry Description | `components/time-entry-drawer.tsx` | Textarea | No | Medium |
| Log Time on Complete | `components/log-time-on-complete-dialog.tsx` | Textarea | No | Medium |
| Client Documents Notes | `components/client-documents-tab.tsx` | Textarea | No | Low |
| Division Description | `features/clients/division-drawer.tsx` | Textarea | No | Low |
| Client Description | `features/clients/client-drawer.tsx` | Textarea | No | Low |
| Project Settings | `features/projects/project-settings-sheet.tsx` | Textarea | No | Low |
| Create Project Dialog | `features/projects/create-project-dialog.tsx` | Textarea | No | Low |
| Template Description | `pages/templates.tsx` | Textarea | No | Low |
| Super Admin Notes | `pages/super-admin.tsx` | Textarea | No | Low |
| Branding Settings | `components/settings/branding-tab.tsx` | Textarea | No | Low |

---

## Migration Plan

### Phase 1: Chat System (HIGH PRIORITY)
The chat system is the most urgent as it needs @mentions for real-time communication.

**Files to update:**
1. `client/src/components/chat-message-input.tsx` - Main chat composer
2. `client/src/components/global-chat-drawer.tsx` - Global chat modal
3. `client/src/features/chat/ThreadPanel.tsx` - Thread replies

**Requirements:**
- Replace Textarea with RichTextEditor variant that supports mentions
- Integrate with existing mention search endpoint
- Preserve existing keyboard shortcuts (Enter to send, Shift+Enter for newline)

### Phase 2: Time Entry Fields (MEDIUM PRIORITY)
**Files to update:**
1. `client/src/components/time-entry-drawer.tsx`
2. `client/src/components/log-time-on-complete-dialog.tsx`

**Requirements:**
- Simple RTE without mentions
- Code block support for technical notes

### Phase 3: Project/Client Fields (LOW PRIORITY)
**Files to update:**
1. `client/src/features/clients/client-drawer.tsx`
2. `client/src/features/clients/division-drawer.tsx`
3. `client/src/features/projects/create-project-dialog.tsx`
4. `client/src/features/projects/project-settings-sheet.tsx`
5. `client/src/components/client-documents-tab.tsx`

### Phase 4: Admin/Templates (LOW PRIORITY)
**Files to update:**
1. `client/src/pages/templates.tsx`
2. `client/src/pages/super-admin.tsx`
3. `client/src/components/settings/branding-tab.tsx`

---

## @Mentions Implementation Status

### Current State
- ✅ `/api/mentions/users` endpoint exists for tenant-scoped user search
- ✅ `CommentEditor` has working @mentions via TipTap Mention extension
- ✅ Mention rendering works in `RichTextRenderer`
- ✅ Notifications are triggered for @mentions in comments

### Known Issues
- Chat composer does not use RTE - no @mentions in chat messages
- Chat @mentions need to integrate with existing mentionable users endpoint

---

## Code Block Support

### Current State
- ❌ No code block button in toolbar
- ❌ No CodeBlock extension loaded

### Implementation
Add TipTap CodeBlock extension to RichTextEditor with:
- Toolbar button for inserting code blocks
- Monospace font styling
- Whitespace preservation
- No auto-formatting inside code blocks

---

## Success Criteria

1. All multi-line description/notes fields use standardized RichTextEditor
2. Chat composer supports @mentions with dropdown suggestions
3. Code blocks can be inserted and display correctly
4. Existing plain text content renders correctly
5. No data loss during migration
6. All mention notifications continue to work

---

## Timeline Estimate

| Phase | Effort | Priority |
|-------|--------|----------|
| Phase 1: Chat | 4-6 hours | HIGH |
| Phase 2: Time Entry | 2 hours | Medium |
| Phase 3: Project/Client | 3 hours | Low |
| Phase 4: Admin/Templates | 2 hours | Low |
| Code Block Support | 2 hours | Medium |
| **Total** | ~15 hours | |
