# Tiptap Document Validation & Safety

This document outlines the validation rules and safety measures implemented for Tiptap document persistence.

## Supported Node Types

The backend accepts the following ProseMirror/Tiptap node types:

### Block Nodes
- `doc` - Root document node (required)
- `paragraph` - Standard paragraph
- `heading` - Headings with levels 1-6
- `blockquote` - Block quotations
- `bulletList` - Unordered lists
- `orderedList` - Ordered lists
- `listItem` - List items
- `codeBlock` - Code blocks
- `horizontalRule` - Horizontal rules
- `image` - Images (with src and alt attributes)

### Inline Nodes
- `text` - Text content
- `hardBreak` - Line breaks

## Supported Mark Types

Marks for text formatting:

- `bold` - Bold text
- `italic` - Italic text
- `strike` - Strikethrough text
- `code` - Inline code
- `link` - Links (with href attribute)
- `highlight` - Highlighted text (with color attribute)

## Validation Rules

### Document Structure
- Must be a valid JSON object
- Root must have `type: "doc"`
- Must contain a `content` array with at least one child
- All nodes must have valid `type` strings
- Content arrays must contain valid node objects

### Node-Specific Rules
- `heading`: Must have `level` attribute (1-6)
- `text`: Must have `text` string, optional `marks` array
- `image`: Must have `src` and `alt` string attributes
- `link`: Must have `href` string attribute
- Lists and blockquotes must have `content` arrays

### Mark Rules
- Marks must be arrays of valid mark objects
- Each mark must have a `type` string
- `link` marks require `href` attribute
- `highlight` marks support optional `color` attribute

## Rejected Structures

The following will be rejected with `BadRequestException`:

- Unknown node or mark types
- Missing required attributes
- Invalid attribute types
- Malformed JSON
- Circular references
- Empty documents
- Invalid nesting (e.g., text nodes with content)

## Sanitization

Currently, the system validates strictly and rejects invalid documents. Future enhancements may include:

- Stripping unknown nodes/marks
- Sanitizing dangerous attributes
- Normalizing structure

## Export & Rendering

The `TiptapRenderer` service provides:

- `renderToHtml()` - Converts documents to HTML fragments
- `extractPlainText()` - Extracts plain text content
- `renderToPdf()` - Generates PDF via Puppeteer with proper page layout

### HTML Rendering Features
- Proper tag nesting for marks
- Support for all validated nodes
- Basic styling for highlights
- Safe attribute handling (XSS-safe escaping)
- Code blocks use raw text extraction to avoid double-escaping

---

## Markdown Import/Export

### Supported Elements (bidirectional)

| Element | Markdown → JSON | JSON → Markdown |
|---------|:---------------:|:---------------:|
| Headings (1-6) | ✅ | ✅ |
| Paragraphs | ✅ | ✅ |
| Bullet lists | ✅ (with nesting) | ✅ (with nesting) |
| Ordered lists | ✅ (with nesting) | ✅ (with nesting) |
| Blockquotes | ✅ (multi-line) | ✅ |
| Fenced code blocks | ✅ (with language) | ✅ (with language) |
| Horizontal rules | ✅ | ✅ |
| Bold (`**text**`) | ✅ | ✅ |
| Italic (`*text*`) | ✅ | ✅ |
| Strikethrough (`~~text~~`) | ✅ | ✅ |
| Inline code (`` `code` ``) | ✅ | ✅ |
| Links (`[text](url)`) | ✅ | ✅ |

### Known Limitations

| Feature | Behavior |
|---------|----------|
| Tables | **Not supported** — skipped on import, not exported |
| Task lists (`- [ ]`) | Not supported |
| Footnotes | Not supported |
| HTML in markdown | Treated as plain text |
| Images (`![](url)`) | Exported if present, not created on import |
| Highlight marks | Preserved in editor; dropped silently in markdown export (no standard equivalent) |
| Deeply nested lists (>3 levels) | Supported but may lose precise indentation on round-trip |

### API Endpoints

```
POST  /documents/workspaces/:id/import/markdown
Body: { "markdown": "# Hello\n\nWorld" }
→ Returns: { document, newVersion }

GET   /documents/workspaces/:id/export/markdown
→ Returns: { markdown: "...", workspaceName: "..." }

GET   /documents/workspaces/:id/export/markdown?download=true
→ Returns: text/markdown file attachment
```

---

## PDF Export

### How It Works

1. Tiptap JSON → HTML via `TiptapRenderer.renderToHtml()`
2. HTML wrapped in a full page template with print-optimized CSS
3. Rendered to PDF via Puppeteer's `page.pdf()` (A4, 1" margins)

### Features
- **Deterministic and stable** — same content always produces same layout
- **Page numbers** in footer ("Page X of Y")
- **Document title** in header (from workspace name)
- **Export date** in footer
- **Print-optimized typography** — Segoe UI / Helvetica Neue, 12pt, 1.7 line-height
- **Proper code block styling** — monospace font, background, border
- **Blockquote styling** — left border accent, subtle background

### Limitations
- Custom Tiptap extensions not in the allowed node list render as plain text
- Image nodes require absolute URLs accessible at render time
- PDF generation is **synchronous** — call returns when the full PDF buffer is ready
- Large documents (>50 pages) may take several seconds

### API Endpoint

```
GET   /documents/workspaces/:id/export/pdf
→ Returns: application/pdf binary (Content-Disposition: attachment)
```

---

## Security Considerations

- No script execution in stored content
- Attribute validation prevents XSS vectors
- Content hashing prevents tampering
- Transaction safety ensures consistency
- Input validation protects against malformed data attacks
- HTML rendering escapes all text and attributes

## Frontend Compatibility

Validation is designed to be compatible with standard Tiptap configurations. If the frontend uses custom extensions, update the `allowedNodes` and `allowedMarks` sets accordingly.

## Error Messages

Clear error messages indicate:
- Unsupported node/mark types
- Missing required attributes
- Invalid structure
- Malformed content
- PDF generation failures

This enables frontend debugging and user feedback.
