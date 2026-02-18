# Rich Text Rendering Architecture

## Overview

MyWorkDay stores rich text content (descriptions, comments, notes) in multiple formats across the database. This document describes the universal rich text rendering system that ensures content never displays raw ProseMirror JSON or unsanitized HTML to users.

## Content Formats

The system handles four input formats:

| Format | Example | Detection |
|--------|---------|-----------|
| ProseMirror JSON string | `{"type":"doc","content":[...]}` | Starts with `{`, parses to `{ type: "doc", content: [...] }` |
| ProseMirror JSON object | `{ type: "doc", content: [...] }` | Object with `type === "doc"` and `Array.isArray(content)` (all functions accept `unknown` input) |
| HTML string | `<p>Hello <strong>world</strong></p>` | Starts with an HTML tag (`<p`, `<div`, `<span`, etc.) |
| Plain text | `Hello world` | Default fallback |

## Core Module

### Location

```
client/src/lib/richtext/richText.ts
```

### Functions

#### `isProseMirrorDoc(value: unknown): boolean`

Type guard that detects whether a value is ProseMirror JSON (as object or string).

```ts
isProseMirrorDoc('{"type":"doc","content":[]}')  // true
isProseMirrorDoc({ type: "doc", content: [] })    // true
isProseMirrorDoc("Hello world")                   // false
isProseMirrorDoc("<p>Hello</p>")                  // false
```

#### `richTextToPlainText(value: unknown): string`

Converts any rich text format to plain text. Use for previews, search, truncation, or accessibility.

- ProseMirror JSON: Recursively extracts text nodes, joins paragraphs with newlines, handles mentions as `@Label`
- HTML: Strips tags via DOMParser (browser) or regex (server)
- Plain text: Returns as-is

```ts
richTextToPlainText('{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hello"}]}]}')
// => "Hello"

richTextToPlainText("<p>Hello <strong>world</strong></p>")
// => "Hello world"
```

#### `richTextToPreview(value: unknown, maxLength?: number): string`

Returns a single-line, truncated preview. Collapses newlines to spaces and appends `...` when truncated. Default max length is 100 characters.

#### `renderRichText(value: unknown): { type, content, doc? }`

Classifies content and returns structured data for rendering:

- `type: "prosemirror"` - includes parsed `doc` object for TipTap editor rendering
- `type: "html"` - HTML string
- `type: "text"` - plain text

**Security note**: Always use `<RichTextRenderer>` for full content display rather than `dangerouslySetInnerHTML`. The `RichTextRenderer` component handles all three formats safely. For preview contexts, use `richTextToPlainText()` which strips all markup.

## Component Layer

### `RichTextRenderer` (client/src/components/richtext/RichTextRenderer.tsx)

Read-only TipTap editor instance for full rich text rendering. Handles all formats via `getDocForEditor()` which auto-detects and converts input.

```tsx
<RichTextRenderer value={task.description} className="text-sm" />
```

### `RichTextPreview` (same file)

Lightweight text-only preview component:

```tsx
<RichTextPreview value={project.description} maxLength={150} />
```

## Usage Guidelines

### For previews (cards, list items, search results)

```tsx
import { richTextToPlainText, richTextToPreview } from "@/lib/richtext/richText";

// In a card subtitle
<p className="text-muted-foreground truncate">
  {richTextToPreview(project.description)}
</p>

// For search filtering
const matches = richTextToPlainText(item.description).toLowerCase().includes(query);
```

### For full content display (detail views, drawers)

```tsx
import { RichTextRenderer } from "@/components/richtext";

<RichTextRenderer value={task.description} className="text-sm" />
```

### For editors (forms)

```tsx
import { RichTextEditor, getDocForEditor, serializeDocToString } from "@/components/richtext";

<RichTextEditor
  value={description}
  onChange={(val) => setDescription(serializeDocToString(val))}
/>
```

## Anti-Patterns

| Anti-pattern | Fix |
|-------------|-----|
| `{task.description}` directly in JSX | Use `richTextToPreview()` or `<RichTextRenderer>` |
| `stripHtml(description)` | Use `richTextToPlainText()` (handles all formats) |
| `JSON.stringify(description)` for display | Use `richTextToPlainText()` |
| `dangerouslySetInnerHTML` for descriptions/comments | Use `<RichTextRenderer>` (safe for all formats) |

## File Map

```
client/src/lib/richtext/
  richText.ts              ← Pure utility functions (no React dependency)

client/src/components/richtext/
  richTextUtils.ts         ← TipTap-integrated utilities (getDocForEditor, etc.)
  RichTextRenderer.tsx     ← Read-only rendering component
  RichTextEditor.tsx       ← Editable rich text component
  CommentEditor.tsx        ← Comment-specific editor with mentions
  index.ts                 ← Barrel re-exports (includes richText.ts functions)

server/tests/
  richText.test.ts         ← 22 unit tests for isProseMirrorDoc, richTextToPlainText, etc.
```

## Test Coverage

25 tests covering:

- `isProseMirrorDoc`: JSON object, JSON string, plain text, HTML, null/undefined, invalid JSON, non-doc objects
- `richTextToPlainText`: ProseMirror extraction, HTML stripping, plain text passthrough, mention nodes, empty docs
- `richTextToPreview`: Truncation, newline collapsing, null handling
- `renderRichText`: Format classification for prosemirror, html, text, null, empty, malformed JSON
