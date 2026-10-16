# Theme Scene AST v2

## Goal

One declarative model drives Theme Studio editing, Visual print preview, package serialization and LaTeX component resolution.

## Core model

```ts
interface ThemeSceneV2 {
  schemaVersion: 2;
  root: ThemeNode;
  page: { size: 'A4'; widthMm: 210; heightMm: 297 };
  tokens: Record<string, ThemeToken>;
  variants: Record<string, ThemeVariant>;
  bindings: ThemeBindingDefinition[];
}

interface ThemeNode {
  id: string;                 // stable only inside package
  widget: string;
  version: number;
  slot?: string;
  properties: Record<string, ThemeValue>;
  style: Record<string, ThemeValue>;
  bindings?: Record<string, string>;
  children: ThemeNode[];
  locked?: boolean;           // Studio-only, ignored by export
}
```

Required widget families: page frame, cover, header, footer, H1–H4, paragraph, math, theorem family, table, figure, list, listing, TOC/LOF/LOT, front section, page break, text/image/divider/stack/grid/page number and metadata field.

## Constraints

- Layout uses physical print units and validated A4 bounds.
- Widget registry defines allowed child slots, required properties, binding types and exporter mapping.
- IDs are deterministic within saved package and never inserted into Markdown.
- Editor selection/hover state is outside the serialized AST.
- Print variants may change output; app appearance variants may not.
- Reducer operations (insert/remove/move/update/duplicate/reset) are deterministic and undoable.
- Unknown future nodes/properties are preserved when safe and diagnosed when not renderable.

## Supported text bindings (2026-10-16)

ADR 011 adds a text-only capability to the existing schema, not a schema
migration. A reusable theme declares each supported binding once:

```json
{
  "bindings": [{ "key": "document.title", "valueType": "string" }]
}
```

A text node uses `bindings: { "text": "document.title" }` and retains
`properties.text` as its literal fallback. Cover title, header text and footer
text use their own supported property targets. The shared implementation and
allowlist live in `packages/theme-engine/src/authored-bindings.ts`.

Supported keys:

- `document.title`
- `cover.university`, `cover.school`, `cover.faculty`
- `cover.reportType`, `cover.major`, `cover.supervisor`, `cover.locationDate`
- `cover.students` (zero to ten name/ID pairs, rendered as plain text)
- `header.institution`, `header.faculty`, `footer.left`

Resolution reads the current report front matter. Versioned `lmx` values take
precedence over legacy top-level groups. Missing values use literal fallback;
an explicitly empty string stays empty. Unknown keys, undeclared keys, wrong
property targets, executable expressions and non-string values are rejected.
Resolved text is bounded and passes through normal DOM/LaTeX escaping.

The persisted snapshot stays unresolved. `compileAuthoredTheme(snapshot, data)`
returns a separate `resolvedScene` and uses it for layout/export, so applying the
same saved theme to two reports does not freeze the first report's metadata.
Older clients may reject this capability; no automatic document migration occurs.

## Current builder boundary

The authored compiler supports flow-based A4 scenes, section/row/column/text
layout, literal image placeholders, cover/header/footer, paragraph and heading
styles, theorem-family styles and page numbering. The broader widget-family list
in this specification remains a target, not an availability claim.

Real image assets, arbitrary positioning, bindings to images, per-page
conditions, chapter/appendix template routing, bibliography style editing,
cross-theme composition and full reusable pattern libraries are not implemented.
Do not display controls claiming support for these operations.
