# Client Notes System

**Status:** Current  
**Last Updated:** January 2026

The Client Notes system provides a comprehensive dashboard for managing notes associated with each client, including rich text content, categorization, and version history tracking.

---

## Overview

Client Notes is accessible from the Client Detail page under the "Notes" tab. It features a dashboard-style layout with:

- **Categories Sidebar** - Browse and filter notes by category
- **Latest Notes Section** - Quick access to 3 most recent notes
- **Statistics Panel** - Overview of note counts
- **Category Management** - Create and manage custom categories

---

## Features

### Dashboard Layout

The Notes Dashboard consists of three main areas:

1. **Main Content Area**
   - Latest Notes section (top 3 most recent)
   - Full notes list with search and filtering
   - Note cards with preview and metadata

2. **Right Sidebar**
   - Categories Overview panel
   - Statistics panel
   - Category management controls

3. **Drawer System**
   - Create/Edit note drawer
   - Note history drawer
   - Category management dialog

### Note Categories

Notes are organized into categories for easy filtering and organization:

**System Categories (Default):**
- General - Default category for general notes
- Project - Project-related information
- Feedback - Client feedback and reviews
- Meeting - Meeting notes and action items
- Requirement - Client requirements and specifications

**Custom Categories:**
- Users can create custom categories with custom colors
- System categories cannot be edited or deleted
- When a custom category is deleted, affected notes are moved to "General"

### Rich Text Editor

Notes use TipTap-based rich text editor with support for:
- Bold, italic, underline formatting
- Bullet and numbered lists
- Headings and paragraphs
- Emoji picker integration

### Version History

Every note edit creates a version record:
- Full history of all changes
- View any previous version
- Restore previous versions
- Version metadata (author, timestamp)

---

## API Endpoints

### Notes Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/clients/:clientId/notes` | List all notes for a client |
| POST | `/api/v1/clients/:clientId/notes` | Create a new note |
| PATCH | `/api/v1/clients/:clientId/notes/:noteId` | Update a note |
| DELETE | `/api/v1/clients/:clientId/notes/:noteId` | Delete a note |
| GET | `/api/v1/clients/:clientId/notes/:noteId/versions` | Get note version history |

### Categories Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/clients/:clientId/note-categories` | List all categories |
| POST | `/api/v1/clients/:clientId/note-categories` | Create custom category |
| PUT | `/api/v1/clients/:clientId/note-categories/:categoryId` | Update category |
| DELETE | `/api/v1/clients/:clientId/note-categories/:categoryId` | Delete category |

---

## Data Model

### Client Notes Table

```typescript
export const clientNotes = pgTable("client_notes", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }),
  clientId: varchar("client_id", { length: 36 }).notNull(),
  body: text("body").notNull(), // TipTap JSON content
  category: varchar("category", { length: 50 }).default("general"),
  categoryId: varchar("category_id", { length: 36 }),
  createdByUserId: varchar("created_by_user_id", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

### Note Categories Table

```typescript
export const noteCategories = pgTable("note_categories", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }),
  clientId: varchar("client_id", { length: 36 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  color: varchar("color", { length: 20 }),
  isSystem: boolean("is_system").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});
```

### Note Versions Table

```typescript
export const clientNoteVersions = pgTable("client_note_versions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  noteId: varchar("note_id", { length: 36 }).notNull(),
  body: text("body").notNull(),
  category: varchar("category", { length: 50 }),
  editedByUserId: varchar("edited_by_user_id", { length: 36 }),
  editedAt: timestamp("edited_at").defaultNow(),
});
```

---

## Frontend Components

### Main Component
- `client-notes-tab.tsx` - Dashboard container with all note management features

### Key Features
- Real-time category counts
- Optimistic updates for better UX
- Search filtering across note content
- Category-based filtering
- Responsive drawer system

### Test IDs

| Test ID | Element |
|---------|---------|
| `button-create-note` | Add Note button |
| `button-manage-categories` | Add Category button |
| `panel-categories-overview` | Categories sidebar |
| `panel-notes-stats` | Statistics panel |
| `input-category-name` | Category name input |
| `select-category-color` | Color selector |
| `button-save-category` | Save category button |
| `button-save-note` | Save note button |
| `note-card-*` | Note card elements |

---

## Usage Examples

### Creating a Note

1. Navigate to Client Detail page
2. Click "Notes" tab
3. Click "Add Note" button
4. Select category from dropdown
5. Enter note content in rich text editor
6. Click "Save Note"

### Managing Categories

1. Click "Add Category" in the Categories sidebar
2. Enter category name
3. Select color (optional)
4. Click "Save"

Custom categories appear in the "Custom Categories" section below system categories.

### Viewing Note History

1. Find the note in the list
2. Click the "History" button (clock icon)
3. View all previous versions
4. Click "View" on any version to see full content

---

## Security Considerations

- All note endpoints require authentication
- Notes are tenant-scoped - users can only access notes within their tenant
- Category management respects tenant boundaries
- System categories cannot be modified
- Version history preserves all changes for audit purposes

---

## Related Documentation

- [Clients Overview](../clients/) - Client management
- [Rich Text Editor](../05-FRONTEND/RICH_TEXT.md) - TipTap implementation
- [Multi-Tenancy Security](../07-SECURITY/MULTI_TENANCY.md) - Tenant isolation
