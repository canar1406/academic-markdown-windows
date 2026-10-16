# Project Plan — Markdown-first LaTeX Report Editor

> Status: architecture locked for macOS Beta 1
> Primary platform: macOS
> Primary shell: Swift 6.2+ / SwiftUI
> Editor engine: Muya (`@muyajs/core`) embedded in `WKWebView`
> Shared document/export core: TypeScript
> PDF engine: Tectonic/XeTeX-compatible pipeline
> Windows: original release deferral remains; user-authorized experimental shell
> work now proceeds under `docs/adr/010-experimental-windows-shell.md` and
> `docs/plans/windows-port.md`. No Windows binary has been verified.

> 2026-09-08 clarification: use the user's 19:34 Monday 2026-09-07
> instructions/screenshots as the primary requirements. The detailed
> `docs/specs/theme-studio-v2-user-request.md` describes and supplements them;
> it does not supersede them. Read ADR 007 before Studio work. Markdown,
> SwiftUI, shared TypeScript, sandboxed TeX and compiled-PDF layout authority
> remain unchanged. Stabilize the reported editor issues before Studio expansion.

> 2026-10-16 implementation: editor/IO/bridge regressions, portable Studio text
> bindings, shared original academic starters and a real compiled-PDF Studio mode
> are recorded in `docs/adr/011-studio-compiled-preview-and-text-bindings.md`,
> `docs/studio-research-20261016.md` and `docs/studio-qc-20261016.md`.
> This is not full builder parity or a verified Windows release.

---

## 0. Executive decision

Build a **native macOS application shell in SwiftUI**, but **do not rewrite the Markdown WYSIWYG editor in Swift**. Reuse and extend the Muya editor engine from MarkText, hosted inside `WKWebView`. Keep document semantics, custom Markdown extensions, LaTeX generation, and theme composition in cross-platform TypeScript packages so the same core can later run inside Windows WebView2.

The product is not a generic LaTeX IDE. Its product contract is:

> The user writes and edits Markdown. The application understands Markdown plus a small, documented set of semantic Markdown extensions. The application exports professional PDF through a real LaTeX engine and hides LaTeX complexity from normal users.

The saved document must remain human-readable text. Semantic content must never depend on hidden Swift-only state, opaque binary blobs, or a proprietary database.

### 0.1 Why this architecture is locked

MarkText's current architecture already separates the desktop shell from Muya, and Muya is the difficult part of the editing experience: block editing, selection, clipboard, undo/redo, IME, Markdown round-trip, tables, math, code blocks, and WYSIWYG behavior. Rewriting those behaviors with `NSTextView`, TextKit, or a custom SwiftUI editor would dramatically increase risk without improving the core product goal.

SwiftUI is used where native macOS integration matters: windows, commands, settings, filesystem, document lifecycle, menus, native dialogs, PDF export, app state, accessibility, security boundaries, and process management.

TypeScript is used where cross-platform reuse matters: editor extensions, document schema, semantic block model, Markdown round-trip, LaTeX generation, and theme composition.

### 0.2 Non-negotiable boundaries

1. **Markdown on disk is canonical.** Muya JSON state is an in-memory editing representation, not the file format.
2. **No Electron shell in the macOS application.** MarkText is a reference/upstream source; Muya is the reusable editor core.
3. **No Swift-only document semantics.** Any semantic feature that affects output must have a representation in Markdown and the shared TypeScript schema.
4. **No theme-specific logic in SwiftUI.** Swift UI edits settings; the theme engine decides how those settings map to LaTeX.
5. **No hard-coded Beta 1 theme branches inside generic exporters.** Beta 1 has one theme, but it must still be loaded through a versioned theme manifest.
6. **No promise that browser rendering equals TeX pagination.** Visual Editor is the primary paginated editing preview; the exported compiled PDF is the layout authority.
7. **No Windows implementation before macOS 1.0 stability.** However, no shared core design may depend on AppKit, Swift, or macOS-specific APIs.
8. **Every custom block must round-trip Markdown → editor → Markdown without semantic loss.**

---

# 1. Product vision

The application is aimed primarily at students who want professional academic reports with LaTeX-quality output but do not want to learn or maintain raw LaTeX source.

A successful workflow looks like this:

1. Create or open a Markdown file.
2. Write normal Markdown for paragraphs, headings, lists, equations, code, links, images, and tables.
3. Insert advanced academic blocks using keyboard shortcuts or slash commands.
4. Edit cover, TOC, list-of-figures, list-of-tables, header, footer, page, and theme options through a native inspector/settings UI.
5. See semantic visual representations directly in the editor.
6. Export and open the compiled PDF when exact pagination/layout must be inspected.
7. Export PDF generated by the LaTeX theme, without manually editing LaTeX.
8. Optionally export the generated `.tex` source for advanced/debug use.

The long-term differentiator is a **componentized LaTeX theme system**. Beta 1 uses one HCMUT-style report theme. Later releases can add multiple themes, and the 1.x theme architecture must permit block-level theme composition, e.g. cover from one theme, headings from another, tables from a third.

---

# 2. Beta 1 scope

## 2.1 Must ship in Beta 1

### Document editing

- Open existing `.md` / `.markdown` documents.
- Create new Markdown documents.
- Save and Save As.
- Autosave with safe conflict handling.
- Standard Markdown editing through Muya.
- Vietnamese IME input must work correctly.
- Standard headings, emphasis, lists, task lists, blockquotes, links, images, code fences, tables, math, horizontal rules.
- Undo/redo.
- Find/replace if stable in Muya integration.
- Source view for inspecting/editing raw Markdown, preferably CodeMirror 6 in the same web bundle.
- Visual view for WYSIWYG editing.

### Academic/LaTeX semantic extensions

- Document metadata/front matter.
- Cover metadata.
- Page break.
- Figure with caption + label + size metadata.
- Table with caption + label.
- Equation/math support using existing Markdown math syntax.
- Code listing with caption + label + language.
- Theorem.
- Property.
- Proposition.
- Corollary.
- Lemma.
- Exercise/problem.
- Level-4 heading mapping required by the supplied theme.
- Optional semantic section markers for unnumbered intro sections such as acknowledgements, declaration, and abstract.

### Document structure settings

- Enable/disable cover.
- Enable/disable table of contents.
- Enable/disable list of figures.
- Enable/disable list of tables.
- Configure TOC depth within supported theme limits.
- Start/reset body page numbering according to theme policy.

### Theme settings

For the supplied HCMUT report theme:

- Cover fields.
- Institution/faculty text fields where appropriate.
- Report type.
- Topic/title.
- Major/discipline.
- Council.
- Supervisor.
- Secretary.
- 1–3 student entries, designed to expand later.
- Location/date text.
- Header enable/disable.
- Header institution/faculty fields if theme allows overrides.
- Footer enable/disable.
- Footer left text.
- Footer page numbering.
- TOC/LOF/LOT toggles.

### Export

- Generate deterministic `.tex` from current semantic document.
- Compile PDF with a real TeX engine.
- Show compile status and diagnostics.
- Use the paginated Visual editor as the only in-app preview surface.
- Export PDF.
- Optional advanced action: reveal/export generated `.tex` and build log.
- Missing image/package/font errors must map to user-readable diagnostics.

### macOS integration

- SwiftUI application lifecycle.
- Standard File/Open/Save/Close commands.
- Standard Edit commands where bridged to editor.
- Native Settings window.
- Native export panel.
- Keyboard shortcuts.
- Dark/light mode for application chrome; document theme is independent from app appearance.
- External links open in default browser, not inside editor web view.

## 2.2 Explicitly out of scope for Beta 1

- Windows build.
- Linux build.
- Real-time collaboration.
- Cloud sync service owned by the app.
- Theme marketplace.
- GUI theme authoring.
- Per-block mixing of different themes in user-facing UI.
- Full MarkText feature parity.
- Electron compatibility layer.
- Arbitrary plugin execution.
- Arbitrary shell execution from Markdown.
- Full BibLaTeX/Zotero integration.
- Live multi-user comments.
- DOCX export.
- HTML/CSS as the authoritative PDF engine.

These can be added later only if they do not weaken the Markdown-first and deterministic-export architecture.

---

# 3. Reference theme: Beta 1 HCMUT report

The uploaded LaTeX project is the **golden visual/semantic reference** for Beta 1. Do not treat it as an unstructured file to copy into application code. Normalize it into a theme package.

## 3.1 Important properties extracted from the supplied template

The supplied `main.tex` uses, among others:

- `article` document class on A4.
- Vietnamese support through `vntex`.
- Times-like text using `mathptmx`.
- Geometry with approximately:
  - left: 30 mm
  - top: 22 mm
  - right: 20 mm
  - bottom: 20 mm
- `fancyhdr`.
- Header height: 40 pt.
- Header left containing the HCMUT logo and two bold institutional lines.
- Footer left containing report/course/semester text.
- Footer right showing `Trang current/LastPage`.
- Header and footer rules of 0.3 pt.
- Section numbering depth 4.
- TOC depth 3.
- A custom fourth-level `subsubsubsection` with alphabetic suffix behavior.
- Figure and table caption styling.
- Tight float spacing.
- Theorem environments for:
  - theorem / Định lý
  - property / Tính chất
  - proposition / Mệnh đề
  - corollary / Hệ quả
  - lemma / Bổ đề
  - exercise / Bài toán
- `listings` configuration with line numbers and framed code.
- A title page with a double border drawn using TikZ.
- Large institution/faculty headings.
- HCMUT logo at approximately 4 cm on the cover.
- Report type/topic/major/council/supervisor/secretary/student fields.
- Intro pages for acknowledgements, declaration, and abstract.
- TOC, list of figures, list of tables.
- Body page count reset to page 1 after front matter.

## 3.2 Theme fidelity rule

For Beta 1, the output PDF must be compared against a golden PDF compiled from the original theme using the same fixture content.

The goal is **functional and visual equivalence**, not byte-for-byte PDF identity. PDF metadata, object ordering, embedded font details, or TeX engine-version differences may change bytes while rendering equivalently.

## 3.3 Theme normalization target

Create:

```text
themes/hcmut-report-v1/
├── theme.json
├── preamble.tex
├── document.tex.mustache
├── components/
│   ├── cover.tex.mustache
│   ├── header.tex.mustache
│   ├── footer.tex.mustache
│   ├── frontmatter.tex.mustache
│   ├── heading-1.tex.mustache
│   ├── heading-2.tex.mustache
│   ├── heading-3.tex.mustache
│   ├── heading-4.tex.mustache
│   ├── figure.tex.mustache
│   ├── table.tex.mustache
│   ├── code-listing.tex.mustache
│   ├── theorem.tex.mustache
│   ├── property.tex.mustache
│   ├── proposition.tex.mustache
│   ├── corollary.tex.mustache
│   ├── lemma.tex.mustache
│   ├── exercise.tex.mustache
│   └── page-break.tex.mustache
├── assets/
│   └── hcmut.png
├── fixtures/
│   └── golden.md
└── expected/
    ├── golden.tex
    └── README.md
```

Do not require all component files to contain large independent LaTeX fragments. Small components may map to renderer functions, but the manifest must expose them as independently addressable slots so future theme composition remains possible.

---

# 4. Canonical document format

## 4.1 Source of truth

The persistent source of truth is UTF-8 Markdown.

Do not save semantic document state only in:

- UserDefaults,
- SwiftData,
- Core Data,
- Muya JSON state,
- DOM HTML,
- generated LaTeX,
- PDF metadata.

Those may be caches or UI state only.

## 4.2 Front matter

Use YAML front matter for document-level metadata and settings. Keep the schema versioned.

Example:

```markdown
---
lmx:
  schema: 1
  theme: hcmut-report-v1
  structure:
    cover: true
    toc: true
    tocDepth: 3
    listOfFigures: true
    listOfTables: true
  cover:
    university: "ĐẠI HỌC QUỐC GIA THÀNH PHỐ HỒ CHÍ MINH"
    school: "TRƯỜNG ĐẠI HỌC BÁCH KHOA"
    faculty: "KHOA KHOA HỌC VÀ KỸ THUẬT MÁY TÍNH"
    reportType: "ĐỒ ÁN MÔN HỌC"
    title: "TÊN ĐỀ TÀI"
    major: "Khoa học máy tính"
    council: "..."
    supervisor: "..."
    secretary: "..."
    students:
      - name: "Nguyễn Văn A"
        id: "2212345"
    locationDate: "TP. HỒ CHÍ MINH, 08/2026"
  header:
    enabled: true
  footer:
    enabled: true
    left: "Báo cáo Đồ án môn học - HK1 2026 - 2027"
    pageNumber: "current-total"
---
```

Rules:

- Unknown keys must be preserved when possible.
- Unsupported future schema versions must produce a clear compatibility warning, not silently discard fields.
- UI edits to metadata must update the Markdown front matter.
- Source-mode edits to front matter must update the native inspector after parsing.

## 4.3 App-specific block syntax: LMX v1

Working name: **LMX — LaTeX Markdown Extensions**.

Use fenced directives because they are visible, text-based, easy to copy, and degrade reasonably in other Markdown editors.

### Page break

```markdown
:::pagebreak
:::
```

### Theorem

```markdown
:::theorem {#thm-bayes title="Định lý Bayes"}
Với hai biến cố $A$ và $B$ ...
:::
```

### Property

```markdown
:::property {#prop-monotonic title="Tính đơn điệu"}
Nội dung tính chất.
:::
```

### Proposition

```markdown
:::proposition {#prop-1}
Nội dung mệnh đề.
:::
```

### Corollary

```markdown
:::corollary {#cor-1}
Nội dung hệ quả.
:::
```

### Lemma

```markdown
:::lemma {#lemma-1}
Nội dung bổ đề.
:::
```

### Exercise/problem

```markdown
:::exercise {#exercise-1 title="Bài toán 1"}
Nội dung bài toán.
:::
```

### Figure

```markdown
:::figure {#fig-system caption="Kiến trúc hệ thống" width="0.80" placement="h!"}
![Kiến trúc hệ thống](assets/system-architecture.png)
:::
```

### Table

```markdown
:::table {#tbl-requirements caption="Danh sách yêu cầu" placement="h!"}
| ID | Yêu cầu | Mức độ |
| --- | --- | --- |
| FR-01 | Đăng nhập | Cao |
:::
```

### Code listing

````markdown
:::listing {#lst-example caption="Ví dụ chương trình" language="swift" lineNumbers=true}
```swift
print("Hello")
```
:::
````

The implementation must correctly handle nested fences; use a parser, not regex-only splitting.

## 4.4 Standard Markdown must remain standard

Do not create custom syntax when normal Markdown is sufficient.

- H1–H4 remain `#` through `####`.
- Inline math and display math use the syntax already supported by Muya.
- Code remains fenced code.
- Basic tables remain GFM tables.
- Images remain Markdown images.
- Links remain Markdown links.
- Lists remain Markdown lists.

Theme mapping decides how these standard nodes render to LaTeX.

## 4.5 Fourth-level heading mapping

The supplied LaTeX theme defines a custom fourth-level command. Therefore:

- `#` → section
- `##` → subsection
- `###` → subsubsection
- `####` → theme-specific fourth-level command (`subsubsubsection` in HCMUT v1)

Do not force users to type raw LaTeX for the fourth level.

## 4.6 Unnumbered front-matter sections

Provide semantic directive metadata or a section attribute rather than raw `\section*`.

Preferred form:

```markdown
:::front-section {kind="acknowledgements" title="Lời cảm ơn" numbered=false pageStyle="empty"}
Nội dung...
:::
```

Beta 1 may expose quick commands for:

- Acknowledgements / Lời cảm ơn
- Declaration / Lời cam đoan
- Abstract / Tóm tắt

The theme decides pagination and page style.

---

# 5. Editor UX model

## 5.1 Three views

### Visual Editor

Primary mode. Hosted by Muya inside `WKWebView`.

Requirements:

- Standard Markdown is rendered WYSIWYG.
- LMX blocks become first-class visual cards/blocks.
- Selection, keyboard navigation, copy/paste, undo/redo remain stable.
- Editing a semantic block updates underlying Markdown-equivalent state.
- Slash commands insert semantic blocks.
- Block toolbar lets user edit block metadata such as caption, label, width, and theorem title.

### Source

Raw Markdown mode.

Recommended implementation: CodeMirror 6 in the same web application bundle.

Requirements:

- Syntax highlight Markdown + YAML front matter + LMX directives.
- Switching Source → Visual performs parse/validation.
- If parsing fails, do not destroy source. Show line/column diagnostics and keep source mode available.

### PDF export authority

The paginated Visual editor is the only in-app preview surface. Do not add a
parallel PDF pane or a separate preview sheet. The compiled PDF remains the
authoritative output for:

- exact page breaks,
- header/footer,
- floats,
- font metrics,
- TOC page numbers,
- figure/table placement,
- final cover layout.

## 5.2 Visual fidelity contract

Do not claim that the Muya/DOM view is identical to TeX.

The visual editor should match semantics, typography intent, labels, captions, borders, spacing, and component identity closely enough that users understand the final structure.

For exact layout, compile and export the PDF.

## 5.3 Slash command palette

Typing `/` at an empty block should open a quick insert menu.

Beta 1 commands:

```text
/heading1
/heading2
/heading3
/heading4
/figure
/table
/equation
/listing
/theorem
/property
/proposition
/corollary
/lemma
/exercise
/pagebreak
/acknowledgements
/declaration
/abstract
```

Allow fuzzy search and Vietnamese aliases later.

## 5.4 Keyboard shortcuts

Initial proposal; keep configurable where practical:

- `⌘1` … `⌘4`: heading levels 1–4 when editor focus is active.
- `⌘B`: bold.
- `⌘I`: italic.
- `⌘K`: link.
- `⌘⇧K`: inline code or code block according to selection context.
- `⌘⌥T`: theorem quick insert.
- `⌘⌥F`: figure quick insert.
- `⌘⌥P`: page break.
- `⌘⇧P`: command palette.
- `⌘⌥Return`: export PDF.

Do not steal macOS-reserved shortcuts. Validate key handling with both Vietnamese and English keyboard input.

---

# 6. macOS application architecture

## 6.1 High-level diagram

```text
┌──────────────────────────────────────────────────────────────┐
│ macOS app — SwiftUI / AppKit bridges                         │
│                                                              │
│  Window / menus / settings / filesystem / PDF export        │
│                      │                                       │
│                      │ versioned JSON bridge                 │
│                      ▼                                       │
│               WKWebView Editor Host                          │
│                      │                                       │
│       ┌──────────────┴─────────────────┐                     │
│       │                                │                     │
│       ▼                                ▼                     │
│     Muya                         Source editor                │
│  WYSIWYG core                    CodeMirror 6                 │
│       │                                │                     │
│       └──────────────┬─────────────────┘                     │
│                      ▼                                       │
│              Shared TypeScript Core                          │
│    schema / validation / LMX / theme / LaTeX exporter       │
│                      │                                       │
└──────────────────────┼───────────────────────────────────────┘
                       │ generated TeX + assets
                       ▼
                TeX build service
                    Tectonic
                       │
                       ▼
                      PDF
```

## 6.2 Swift modules

Recommended logical modules/targets:

```text
MacApp
├── AppShell
├── DocumentHost
├── EditorBridge
├── ExportCoordinator
├── SettingsUI
├── DiagnosticsUI
└── SharedModels
```

Prefer separate Swift files/types over giant feature files.

## 6.3 SwiftUI responsibilities

SwiftUI owns:

- app/window lifecycle,
- document selection/open/save,
- toolbar/sidebar/inspector,
- settings forms,
- theme settings forms generated from supported schema,
- PDF export progress and diagnostics,
- export progress and diagnostics,
- menu commands,
- app appearance,
- native file panels,
- accessibility labels for native controls.

SwiftUI does **not** parse arbitrary Markdown or emit LaTeX.

## 6.4 AppKit use

AppKit is acceptable when required for macOS-specific capabilities that SwiftUI does not expose adequately.

Expected bridges:

- `WKWebView` through `NSViewRepresentable`.
- `NSOpenPanel`/`NSSavePanel` if required by document/export UX.
- `NSWorkspace` for external links.

Do not convert the app into an AppKit-first architecture.

## 6.5 Swift language policy

- Swift 6.2+.
- Modern Swift concurrency.
- Prefer `async/await`.
- Do not introduce `DispatchQueue.main.async()` when actor isolation can solve the problem.
- UI-observable models should use Observation (`@Observable`) and appropriate `@MainActor` isolation.
- Avoid force unwrap and force try except for truly invariant programmer errors with explicit justification.
- Keep file/process work off the main actor.
- Make export tasks cancellable.
- Use structured concurrency for rebuild/debounce orchestration.

## 6.6 Deployment target

Initial recommendation: **macOS 15.0+** unless product requirements demand older systems.

Do not blindly inherit iOS-only or macOS-26-only rules from generic Swift agent skills. This is a macOS desktop editor and must explicitly audit API availability against the chosen deployment target.

---

# 7. Web/editor architecture

## 7.1 Upstream strategy

Use current Muya TypeScript core from the MarkText ecosystem as the base.

Do not maintain a copy of the entire Electron MarkText application.

Recommended approach:

- Pin the upstream MarkText/Muya revision used by the project.
- Keep Muya integration in a local workspace package/fork.
- Keep custom block changes isolated and documented.
- Maintain an `UPSTREAM.md` file containing:
  - upstream repository,
  - pinned commit/tag,
  - local patches,
  - rebase/update procedure.

Avoid undocumented edits scattered through vendored code.

## 7.2 Editor workspace packages

Recommended structure:

```text
packages/
├── muya-fork/
├── editor-app/
├── document-schema/
├── lmx-parser/
├── latex-exporter/
├── theme-engine/
└── theme-hcmut-report-v1/
```

### `muya-fork`

Owns only necessary extensions/patches to Muya.

### `editor-app`

Browser application bundled by Vite and loaded locally by WKWebView.

Owns:

- Muya initialization,
- plugin registration,
- slash command UI,
- semantic block visual renderers,
- source editor integration,
- Swift bridge adapter.

### `document-schema`

Owns versioned TypeScript types and validation for:

- document metadata,
- front matter,
- block attributes,
- semantic nodes,
- theme references,
- export options.

### `lmx-parser`

Owns custom directive grammar and transformations.

Must not use regex as the sole parser for nested block structures.

### `latex-exporter`

Transforms the canonical semantic representation into escaped, deterministic LaTeX.

### `theme-engine`

Loads/validates theme manifests and resolves component slots.

### `theme-hcmut-report-v1`

Contains the Beta 1 theme package.

## 7.3 TypeScript policy

- Strict TypeScript.
- Avoid `any` unless a boundary requires it and document why.
- Version serialized schemas.
- Validate all messages crossing Swift ↔ JavaScript.
- Make Markdown serialization deterministic.
- Preserve unknown front-matter keys where feasible.
- Do not mix filesystem/process APIs into shared browser packages.

---

# 8. Swift ↔ JavaScript bridge

## 8.1 Principles

The bridge is a versioned protocol, not ad-hoc string evaluation.

Every message contains:

```json
{
  "protocolVersion": 1,
  "type": "document.changed",
  "requestId": "uuid-or-null",
  "payload": {}
}
```

Validate both directions.

## 8.2 JavaScript → Swift messages

Minimum Beta 1 types:

```text
editor.ready
editor.focusChanged
editor.modeChanged
document.changed
document.markdown
document.dirtyChanged
document.metadataChanged
document.outlineChanged
command.requestOpenFile
command.requestInsertImage
command.requestBuildPDF
command.openExternalURL
diagnostic.report
```

`editor.modeChanged` is the authoritative acknowledgement for every mode
transition request. Its payload contains the actual `mode`, the
`requestedMode`, and whether validation `accepted` the request. When invalid
Source Markdown prevents a switch to Visual, the actual mode remains `source`
and native controls must roll back to Source.

`document.metadataChanged` is a lightweight invalidation event containing the
document `revision` and parsed front-matter `valid` state. It does not include
the Markdown source; an open native inspector requests a fresh metadata
snapshot after receiving it.

## 8.3 Swift → JavaScript commands

```text
document.loadMarkdown
document.requestMarkdown
document.applyMetadataPatch
editor.setAppearance
editor.setMode
editor.focus
editor.undo
editor.redo
editor.find
editor.replace
command.insertBlock
command.insertImage
export.requestLatex
```

## 8.4 Request/response

Commands that need a response use `requestId` and resolve/reject through a typed bridge abstraction.

`document.requestMarkdown` resolves through `document.markdown` with the same
`requestId`. Its payload contains the exact Markdown snapshot and the editor
revision represented by that snapshot:

```json
{
  "markdown": "# Report",
  "revision": 12
}
```

Swift must persist the snapshot revision, not a newer current revision that may
arrive while the write is in progress.

Do not make Swift call random JavaScript functions by constructing source strings with user data. Prefer `WKWebView.callAsyncJavaScript` or a controlled dispatcher with structured arguments.

## 8.5 Dirty state

The editor reports content revisions. Swift tracks:

- current revision,
- last persisted revision,
- current build revision.

A PDF result is stale if its build revision is older than current document revision.

---

# 9. Document lifecycle

## 9.1 File format

Beta 1 works directly with `.md` / `.markdown`.

Assets use relative paths whenever possible:

```text
report/
├── report.md
└── assets/
    ├── architecture.png
    └── benchmark.pdf
```

Avoid inventing a proprietary bundle before necessary.

## 9.2 Saving

Save sequence:

1. Ask editor bridge for canonical Markdown.
2. Validate encoding and schema.
3. Perform atomic write.
4. Update persisted revision only after successful write.
5. Keep dirty state on failure.

## 9.3 Opening

Open sequence:

1. Read UTF-8 text.
2. Detect YAML front matter and schema.
3. Pass exact source to editor.
4. Parse in editor core.
5. Return metadata/diagnostics/outline to Swift.
6. If invalid custom syntax exists, preserve source and open in recoverable mode.

Never "repair" user text silently.

## 9.4 External modifications

If the file changes externally while dirty:

- do not overwrite silently,
- show conflict state,
- offer reload/keep current/save copy,
- add merge workflow later if needed.

---

# 10. Semantic AST / state model

## 10.1 Goal

Use one semantic model to drive:

- visual block identity,
- Markdown serialization,
- outline,
- export,
- diagnostics,
- theme component resolution.

## 10.2 Example node types

```ts
type DocumentNode =
  | ParagraphNode
  | HeadingNode
  | ListNode
  | QuoteNode
  | CodeBlockNode
  | MathBlockNode
  | ImageNode
  | TableNode
  | FigureNode
  | ListingNode
  | TheoremNode
  | PropertyNode
  | PropositionNode
  | CorollaryNode
  | LemmaNode
  | ExerciseNode
  | FrontSectionNode
  | PageBreakNode;
```

Do not duplicate semantically identical structures only because the editor and exporter need different fields. Use adapter layers where needed.

## 10.3 Stable IDs

Labels such as `#fig-system` are semantic export IDs.

Internal transient editor node IDs may differ.

Never serialize random UUIDs into Markdown unless they serve a user-visible semantic purpose.

---

# 11. LaTeX exporter

## 11.1 Export stages

```text
Markdown source
    ↓
Parse + validate LMX/front matter
    ↓
Semantic document model
    ↓
Resolve theme + options
    ↓
Escape/normalize content
    ↓
Render semantic blocks to LaTeX components
    ↓
Assemble document
    ↓
Write temp build workspace
    ↓
Compile with TeX engine
    ↓
Parse diagnostics
    ↓
PDF
```

## 11.2 Escaping

Create one tested LaTeX escaping layer.

At minimum correctly handle normal text containing:

```text
# $ % & _ { } ~ ^ \
```

Do not escape math/code/raw nodes as normal prose.

Do not interpolate user text directly into LaTeX templates without the correct content-type escape path.

## 11.3 Raw LaTeX

Raw LaTeX is **not a normal Beta 1 feature**.

If an expert escape hatch is later added, it must be explicitly marked and considered unsafe/unportable. It must not be required to use the supplied theme.

## 11.4 Determinism

Given:

- the same Markdown,
- the same app version,
- the same theme version,
- the same TeX bundle,

then generated `.tex` should be deterministic apart from explicitly documented build metadata.

## 11.5 Diagnostics

Map TeX diagnostics back to semantic nodes/source lines where practical.

User-facing diagnostic should include:

- severity,
- concise message,
- source line/block if known,
- generated TeX line only as advanced detail,
- suggested correction when reliable.

Do not dump an unreadable full TeX log as the primary error UI.

---

# 12. TeX engine strategy

## 12.1 Preferred Beta 1 engine

Use **Tectonic** as the preferred direction because it is a self-contained XeTeX/TeXLive-based engine and is cross-platform.

The engine abstraction must be protocol-based so we can later support system MacTeX/`latexmk` as an advanced fallback if useful.

Example Swift boundary:

```swift
protocol PDFCompiler: Sendable {
    func compile(_ request: PDFCompileRequest) async throws -> PDFCompileResult
}
```

## 12.2 Offline behavior

Tectonic normally obtains support files from bundles/cache. The shipped app must not surprise users by requiring a full MacTeX installation.

Before public Beta 1, choose and document one of these release modes:

### Preferred release mode

- Bundle or pre-provision the required TeX support bundle/cache for the HCMUT theme.
- Verify all required packages from the uploaded theme are available.
- Export works offline after app installation.

### Temporary developer mode

- Allow Tectonic to fetch missing support files during development.
- Surface a clear network/build status.
- Do not treat this as the final offline UX.

## 12.3 TeX compatibility fixture

Compile the supplied theme fixture and verify packages including:

- Vietnamese support,
- `geometry`,
- `fancyhdr`,
- `lastpage`,
- `tikz`,
- `caption`/`subcaption`,
- `algorithm2e`,
- `listings`,
- `amsmath`/`amsthm`,
- table packages used by the source.

If Tectonic has an incompatibility, document it before altering visual output. Prefer a compatible theme rewrite that preserves rendering instead of silently dropping features.

## 12.4 Process safety

- Build in a unique temporary directory.
- No shell-escape.
- Do not allow theme paths to escape the theme root.
- Normalize/copy project assets into the build workspace.
- Cancel superseded live-preview builds.
- Remove stale temp directories safely.

---

# 13. Theme engine

## 13.1 Manifest schema

Example direction:

```json
{
  "schemaVersion": 1,
  "id": "hcmut-report-v1",
  "name": "HCMUT Engineering Report",
  "version": "1.0.0-beta.1",
  "engine": "latex",
  "documentClass": "article",
  "page": {
    "size": "A4"
  },
  "capabilities": {
    "cover": true,
    "toc": true,
    "listOfFigures": true,
    "listOfTables": true,
    "header": true,
    "footer": true,
    "headingDepth": 4
  },
  "components": {
    "cover": "components/cover.tex.mustache",
    "header": "components/header.tex.mustache",
    "footer": "components/footer.tex.mustache",
    "figure": "components/figure.tex.mustache",
    "table": "components/table.tex.mustache",
    "listing": "components/code-listing.tex.mustache",
    "theorem": "components/theorem.tex.mustache",
    "property": "components/property.tex.mustache",
    "proposition": "components/proposition.tex.mustache",
    "corollary": "components/corollary.tex.mustache",
    "lemma": "components/lemma.tex.mustache",
    "exercise": "components/exercise.tex.mustache"
  }
}
```

Exact schema can evolve, but `schemaVersion`, stable theme `id`, and component slots are mandatory.

## 13.2 Theme settings schema

Do not hard-code every HCMUT field directly into Swift forms forever.

Beta 1 may use native purpose-built forms for speed, but the theme package should expose a settings schema that can later generate inspectors.

Example conceptual field:

```json
{
  "key": "cover.supervisor",
  "type": "string",
  "label": "GVHD",
  "required": false,
  "section": "Cover"
}
```

## 13.3 Future block-level theme composition

Design resolution as:

```text
DocumentThemeSelection
├── defaultTheme = academic-a
├── cover = hcmut-report-v1
├── heading = academic-a
├── figure = ieee-like
├── table = ieee-like
└── listing = minimal-code
```

Do not expose this in Beta 1, but keep theme components independently resolvable so adding it later does not require a new exporter architecture.

---

# 14. PDF export pipeline

## 14.1 Export behavior

Beta 1 must have a manual `Export PDF` command. Export compiles the current
document revision and then presents a native destination panel.

The paginated Visual editor remains the only in-app preview surface. Beta 1
does not compile TeX on every edit and does not present a parallel PDF pane or
preview sheet.

During export:

- make the build cancellable,
- reject stale results from older document revisions,
- preserve the last valid generated output when a newer build fails,
- show concise progress and diagnostics,
- write the selected PDF destination atomically.

## 14.2 Exported PDF

The compiled PDF is the exact-layout authority and may be opened in the user's
chosen system PDF application after export. Do not render it inside the editor
WebView and do not add a second in-app preview surface.

---

# 15. Repository layout

Recommended repository layout:

```text
repo/
├── AGENTS.md
├── plan.md
├── README.md
├── LICENSE
├── THIRD_PARTY_NOTICES.md
├── pnpm-workspace.yaml
├── package.json
├── pnpm-lock.yaml
│
├── apps/
│   └── macos/
│       ├── Project.xcodeproj
│       ├── App/
│       │   ├── AppShell/
│       │   ├── DocumentHost/
│       │   ├── EditorBridge/
│       │   ├── Export/
│       │   ├── Settings/
│       │   └── Resources/
│       │       └── EditorBundle/
│       ├── AppTests/
│       └── AppUITests/
│
├── packages/
│   ├── muya-fork/
│   ├── editor-app/
│   ├── document-schema/
│   ├── lmx-parser/
│   ├── latex-exporter/
│   ├── theme-engine/
│   └── theme-hcmut-report-v1/
│
├── docs/
│   ├── architecture.md
│   ├── bridge-protocol.md
│   ├── lmx-spec.md
│   ├── theme-spec.md
│   ├── upstream-muya.md
│   └── adr/
│
├── tools/
│   ├── build-editor-bundle.*
│   ├── verify-theme.*
│   └── pdf-golden-diff.*
│
└── tests/
    └── fixtures/
        ├── markdown-roundtrip/
        ├── vietnamese-ime/
        ├── export/
        └── themes/
```

Use exact names appropriate to the actual app name once chosen.

---

# 16. Build system

## 16.1 Development tools

Recommended baseline:

- Xcode 26.3 or newer compatible toolchain.
- Swift 6.2+.
- Node.js 22 LTS class runtime for development/CI unless upstream requirements force another supported version.
- pnpm 10.x.
- Vite for editor bundle.
- Vitest for TypeScript unit tests.
- Playwright/browser tests for editor behavior where useful.
- Swift Testing/XCTest according to target compatibility and existing Xcode support.

## 16.2 Build flow

```text
pnpm install
    ↓
pnpm build:web
    ↓
copy deterministic web bundle into macOS app resources
    ↓
xcodebuild / Xcode build
    ↓
app bundle contains editor resources; Node is not required at runtime
```

Release app must not require a user-installed Node.js runtime.

## 16.3 Local WKWebView loading

Load only bundled local editor resources through a controlled URL/file scheme.

Recommended:

- custom `WKURLSchemeHandler` or carefully configured local resource loading,
- strict navigation delegate,
- Content Security Policy,
- no arbitrary remote page navigation,
- no Node integration.

---

# 17. Security model

## 17.1 Web content

- Retain Muya sanitization behavior.
- Sanitize imported HTML.
- Disallow dangerous URL schemes.
- Open normal external links with `NSWorkspace`.
- Keep app bridge names narrow and typed.
- Do not expose generic filesystem methods to JavaScript.

## 17.2 File access

JavaScript requests a user action; Swift performs privileged filesystem operations.

Example:

```text
JS: requestInsertImage
Swift: show picker
Swift: validate/copy/reference chosen file
Swift → JS: insertImage(relativePath)
```

Never give WebView arbitrary file read/write APIs.

## 17.3 LaTeX compilation

- Disable shell escape.
- Restrict build root.
- Validate theme manifest paths.
- Do not let Markdown reference arbitrary `\input{}` commands through normal syntax.
- Raw LaTeX, if later enabled, requires a clearly labeled expert/security mode.

---

# 18. Licensing and attribution

MarkText and Muya are MIT-licensed upstream projects. Preserve required copyright/license notices for reused or modified source.

Before distribution:

- Maintain `THIRD_PARTY_NOTICES.md`.
- Record the exact Muya upstream revision.
- Preserve applicable MIT license text.
- Audit licenses for bundled JS packages.
- Audit licenses for Tectonic and any redistributed TeX bundle/packages.
- Confirm redistribution rights for the HCMUT logo/theme assets; do not assume trademark/logo redistribution rights solely because the surrounding template was supplied.

Do not let Codex remove attribution headers or license files during refactors.

---

# 19. Testing strategy

## 19.1 TypeScript unit tests

Required categories:

### Markdown round-trip

For each fixture:

```text
Markdown
→ parse
→ semantic state
→ serialize
→ Markdown
```

Assert semantic equivalence and, where intended, exact normalized source equality.

Fixtures must cover:

- Vietnamese Unicode,
- nested emphasis,
- lists,
- tables,
- math,
- code fences,
- images,
- all LMX blocks,
- unknown front-matter keys,
- malformed directives,
- labels/captions containing LaTeX special characters.

### LaTeX escaping

Test all special characters and mixed Vietnamese text.

### Theme manifest validation

Reject:

- unsupported schema version,
- missing component,
- path traversal,
- invalid component type,
- invalid setting definition.

### Export snapshots

Normalize generated `.tex` and compare against checked-in golden output.

## 19.2 Editor browser tests

Test:

- load Markdown,
- type Vietnamese text,
- insert standard blocks,
- insert every LMX block,
- edit block metadata,
- undo/redo,
- copy/paste,
- source ↔ visual switch,
- round-trip after source edits,
- selection after block insertion,
- large table navigation,
- no document corruption after invalid source syntax.

The checked-in Playwright regression suite is at
`apps/editor/test/browser/editor-regression.e2e.ts`; it verifies these browser
behaviors against the bundled editor. Chromium CDP composition coverage does
not replace the final native WKWebView/macOS Vietnamese input-source matrix.

## 19.3 Swift tests

Test:

- bridge message encoding/decoding,
- unsupported protocol versions,
- document dirty revision state,
- atomic save behavior,
- export coordinator cancellation,
- stale PDF result rejection,
- diagnostic mapping,
- settings/front-matter synchronization.

## 19.4 End-to-end macOS tests

At minimum:

1. Launch app.
2. Open fixture Markdown.
3. Verify editor ready.
4. Edit text.
5. Save.
6. Reopen and verify persisted Markdown.
7. Export PDF to a selected path.
8. Verify PDF exists and has the expected page count range.
9. Open the exported PDF with the system application when exact layout needs inspection.

## 19.5 Golden PDF tests

For the HCMUT theme:

- Compile original reference template with controlled fixture content.
- Compile app-generated LaTeX with equivalent content.
- Rasterize pages in CI/test tool.
- Compare visual regions with tolerance.
- Also inspect text extraction/page count/major geometry.

Do not rely only on binary PDF equality.

---

# 20. Performance targets

These are engineering targets, not marketing promises.

## 20.1 Editing

Typical academic document target:

- 50–100 pages equivalent content.
- normal typing should not trigger TeX compilation on every keystroke.
- editor input should remain responsive while PDF is building.
- source serialization should be incremental or efficiently debounced.

Track:

- first editor ready time,
- document parse time,
- typing event latency,
- bridge message volume,
- serialization time,
- PDF build time,
- peak memory for large fixtures.

## 20.2 WebView bridge

Do not send the full Markdown document from JS to Swift on every keystroke.

Use lightweight change/revision notifications while editing. Request full source only when needed for save/export/specific synchronization.

## 20.3 PDF builds

- Debounce live builds.
- Cancel superseded builds.
- Cache stable theme assets.
- Avoid rebuilding web resources during app runtime.

---

# 21. Accessibility and macOS UX

Native UI must follow macOS conventions.

- Full keyboard navigation.
- VoiceOver labels for toolbars/settings/export state.
- Do not encode state by color alone.
- Respect Reduce Motion for non-essential animations.
- Support system text scaling where practical in native controls.
- Web editor must expose meaningful accessibility roles for semantic blocks where possible.
- Dialogs must not trap focus in WKWebView.

Do not mechanically apply iOS-specific navigation or touch rules to this macOS app.

---

# 22. Detailed implementation milestones

## Milestone 0 — Repository bootstrap and evidence capture

### Goals

Create a clean repo and capture reference behavior before feature work.

### Tasks

- [x] Create root monorepo structure.
- [x] Add `AGENTS.md` and this `plan.md`.
- [x] Add MIT/upstream notices as required.
- [x] Record current upstream MarkText/Muya commit.
- [x] Copy only necessary Muya source into the chosen fork/workspace strategy.
- [x] Store supplied HCMUT LaTeX template as development reference outside generic runtime code.
- [x] Create `theme-hcmut-report-v1` package skeleton.
- [x] Compile original supplied LaTeX template manually/CI and save reference screenshots or approved PDF fixture.
- [x] Document TeX engine version used for the reference.

### Exit criteria

- Repo builds a placeholder macOS app.
- Web workspace builds a placeholder page.
- Original reference theme can be compiled in the development environment.
- Upstream revision/license is documented.

---

## Milestone 1 — Muya in a native macOS window

### Goals

Prove the central architectural risk early.

### Tasks

- [x] Create SwiftUI macOS app.
- [x] Add `WKWebView` wrapper.
- [x] Build Vite editor bundle.
- [x] Load bundle from app resources.
- [x] Initialize Muya.
- [x] Load sample Markdown.
- [x] Type/edit Vietnamese text.
- [x] Implement minimal JS → Swift `editor.ready` event.
- [x] Implement Swift → JS `document.loadMarkdown` command.
- [x] Verify undo/redo.
- [x] Verify copy/paste.
- [x] Verify focus and keyboard shortcuts do not conflict catastrophically with app commands.

### Exit criteria

- A native macOS app can edit Markdown with Muya smoothly.
- No Electron runtime.
- Vietnamese IME works in a realistic sample.
- App can programmatically load a document.

### Stop condition

If WKWebView + Muya has an unresolvable IME/selection/focus defect, investigate before building export/theme features. Do not mask editor corruption with later layers.

---

## Milestone 2 — File lifecycle + versioned bridge

### Goals

Make Markdown persistence trustworthy.

### Tasks

- [x] Define bridge protocol v1 TypeScript/Swift mirror types.
- [x] Implement typed message dispatcher.
- [x] Add request/response IDs.
- [x] Add revision tracking.
- [x] Implement New/Open/Save/Save As.
- [x] Implement atomic writes.
- [x] Implement dirty state.
- [x] Add basic front-matter parse/preserve.
- [x] Add source mode.
- [x] Add Source → Visual validation failure UI.
- [x] Add round-trip fixtures.

### Exit criteria

- Open → edit → save → reopen preserves semantic Markdown.
- Unknown YAML keys are not silently dropped.
- Invalid custom source remains recoverable.

---

## Milestone 3 — LMX custom block foundation

### Goals

Make app-specific LaTeX semantics first-class in the editor.

### Tasks

- [x] Freeze LMX v1 directive grammar.
- [x] Implement parser/tokenizer extension.
- [x] Implement serializer.
- [x] Add semantic block registry.
- [x] Add Muya renderers/blocks for page break.
- [x] Add theorem family.
- [x] Add figure wrapper.
- [x] Add table wrapper.
- [x] Add listing wrapper.
- [x] Add front-section wrapper.
- [x] Add slash command menu.
- [x] Add metadata popover/toolbar for semantic blocks.
- [x] Add unit tests for nested fences and malformed syntax.

### Exit criteria

Every Beta 1 LMX block:

- inserts from slash menu,
- edits visually,
- serializes to deterministic Markdown,
- reopens correctly,
- survives copy/paste when copied as Markdown/source.

---

## Milestone 4 — Shared semantic model + exporter skeleton

### Goals

Produce deterministic LaTeX without yet matching the final theme.

### Tasks

- [x] Define semantic node types.
- [x] Define document settings types.
- [x] Implement text escaping.
- [x] Implement standard Markdown node exporters.
- [x] Implement LMX node exporters.
- [x] Implement labels/captions.
- [x] Implement heading level mapping.
- [x] Implement diagnostics model.
- [x] Add `.tex` snapshots.

### Exit criteria

A fixture document produces valid compilable LaTeX with no theme-specific conditionals in generic block logic.

---

## Milestone 5 — HCMUT theme normalization

### Goals

Recreate the uploaded theme through the theme engine.

### Tasks

- [x] Create manifest v1.
- [x] Extract preamble/package requirements.
- [x] Recreate geometry.
- [x] Recreate header.
- [x] Recreate footer.
- [x] Recreate cover double border.
- [x] Recreate cover fields.
- [x] Recreate TOC/LOF/LOT behavior.
- [x] Recreate page numbering/reset behavior.
- [x] Recreate level-4 heading.
- [x] Recreate caption styling.
- [x] Recreate theorem environments.
- [x] Recreate listing style.
- [x] Add the HCMUT logo asset for local/private fixture use. Public
  redistribution remains blocked pending the review tracked in
  `docs/license-audit.md`.
- [x] Create golden fixture.
- [x] Compare generated `.tex` and rendered PDF against reference.

### Exit criteria

Beta 1 fixture is visually equivalent to the supplied template within documented tolerances.

---

## Milestone 6 — TeX compiler + native export

### Goals

Complete the core user promise: Markdown → professional PDF.

### Tasks

- [x] Add `PDFCompiler` abstraction.
- [x] Integrate Tectonic developer build.
- [x] Verify all HCMUT packages.
- [x] Create isolated temp build workspace.
- [x] Copy theme/assets safely.
- [x] Parse compiler diagnostics.
- [x] Compile PDF as part of the Export PDF command.
- [x] Use the paginated Visual editor as the primary preview; do not add a parallel PDF pane or sheet.
- [x] Add export panel.
- [x] Add generated `.tex` reveal/export debug command.
- [x] Add revision/staleness state.
- [x] Add cancellation for superseded builds.

### Exit criteria

User can open Markdown, edit it in the paginated Visual editor, and export a valid HCMUT-formatted PDF without manually using LaTeX.

---

## Milestone 7 — Native document/theme settings UI

### Goals

Move LaTeX configuration into understandable UI.

### Tasks

- [x] Add inspector/settings architecture.
- [x] Cover form.
- [x] Structure form: cover/TOC/LOF/LOT/depth.
- [x] Header form.
- [x] Footer form.
- [x] Theme identity/version display.
- [x] Front matter synchronization both directions.
- [x] Validation for required/invalid fields.
- [x] Preview refresh behavior after settings change.

### Exit criteria

A non-LaTeX user can configure the complete Beta 1 theme through UI, and all settings remain visible in Markdown front matter.

---

## Milestone 8 — Hardening and Beta 1 release

### Goals

Make the project safe enough for real student reports.

### Tasks

- [x] Large-document fixtures.
- [ ] Vietnamese IME regression suite/manual matrix.
- [x] Image path edge cases.
- [x] Unsaved-close behavior.
- [x] External file modification behavior.
- [x] Crash recovery strategy.
- [x] Export error UX.
- [x] Offline TeX support decision finalized.
- [x] License audit.
- [ ] Accessibility pass. Automated roles/labels are covered; the user deferred
  the real VoiceOver pass on 2026-08-25.
- [x] Dark/light app chrome pass.
- [x] Golden PDF regression.
- [x] Release signing/notarization plan.
- [x] Beta feedback instrumentation only if privacy-respecting and explicitly chosen.

### Beta 1 release gate

Do not call the app Beta 1 until:

- Markdown round-trip tests pass.
- Golden theme tests pass.
- PDF export works on a clean supported macOS machine.
- Vietnamese typing is stable.
- No known bug can silently corrupt a Markdown file.
- Export errors are recoverable.
- Upstream/license notices are present.

Current engineering evidence and the remaining credential, clean-machine,
legal, IME, and VoiceOver release gates are tracked in
`docs/goal-completion-audit.md`. The local ad-hoc package must not be called a
public Beta 1 artifact while those external gates remain open.

---

# 23. Post-Beta roadmap

## Beta 2

- More figure/table controls.
- Cross-reference UI.
- Citation/bibliography design.
- Better image management.
- Multiple HCMUT variants if required.
- Import/theme compatibility tooling.
- More theme manifests.

## Beta 3

- Theme browser.
- Theme validation tool.
- Better source diagnostics.
- Snippets/templates.
- Improved large-document performance.
- Optional project sidebar/multi-file report model while keeping Markdown canonical.

## 1.0 macOS

Requirements before starting Windows:

- stable document schema,
- stable LMX v1,
- stable bridge protocol,
- stable theme manifest v1,
- proven upgrade/migration path,
- no known data-loss defects,
- export engine is robust and offline strategy is settled.

## Windows after macOS 1.0

Preferred Windows architecture:

```text
WinUI 3 shell
   │
WebView2
   │
Same editor-app + Muya + document schema + LMX + exporter + themes
   │
Tectonic Windows compiler
```

Do not port Swift implementation details. Reuse the TypeScript protocol/schema/export packages.

## Later 1.x: block-level theme composition

Implement theme selection at component level only after manifest/component contracts are stable.

Example:

```yaml
lmx:
  theme:
    default: academic-modern
    components:
      cover: hcmut-report-v1
      table: ieee-table-v1
      listing: minimal-code-v2
```

This must remain optional and backward-compatible with Beta 1 documents.

---

# 24. Decisions Codex must not make implicitly

Codex must stop and create an ADR/propose a change before doing any of these:

- Replacing Muya with a Swift editor.
- Reintroducing Electron.
- Moving Markdown parsing/export semantics into Swift.
- Changing the LMX grammar incompatibly.
- Changing front-matter schema incompatibly.
- Changing bridge protocol incompatibly.
- Replacing Tectonic/TeX with HTML-to-PDF as the authoritative export path.
- Adding proprietary hidden document state.
- Making generated LaTeX the canonical user document.
- Adding a runtime dependency on Node.js.
- Adding per-block theme mixing before the theme component contract is ready.
- Shipping arbitrary raw LaTeX execution without a security design.

---

# 25. Definition of done for each feature

This is a reusable per-feature checklist, not a single global completion flag.
The six requested product behaviors and their concrete evidence are audited in
`docs/goal-completion-audit.md`.

A feature affecting document semantics is not done until all applicable items pass:

- [ ] Markdown syntax representation defined.
- [ ] Parser support implemented.
- [ ] Serializer support implemented.
- [ ] Visual editor support implemented.
- [ ] Source mode support validated.
- [ ] Swift bridge impact handled.
- [ ] LaTeX exporter implemented.
- [ ] HCMUT theme mapping implemented.
- [ ] Round-trip test added.
- [ ] Export snapshot added.
- [ ] PDF/golden test updated if layout changes.
- [ ] Vietnamese/Unicode tested if text-bearing.
- [ ] Accessibility considered.
- [ ] Documentation updated.

A UI-only preference that does not affect document output should not pollute the Markdown schema.

---

# 26. Initial task queue for Codex

Codex should execute in this order unless a blocking issue requires an ADR:

1. Scaffold repo and macOS app.
2. Add Vite web editor package.
3. Embed Muya in WKWebView.
4. Prove Vietnamese typing, selection, copy/paste, undo/redo.
5. Implement bridge v1 skeleton.
6. Implement Markdown load/request/save round-trip.
7. Add front matter schema and preservation tests.
8. Add source mode.
9. Freeze and implement LMX parser v1.
10. Implement page break + theorem as first custom block vertical slice.
11. Export those nodes to minimal valid LaTeX.
12. Integrate Tectonic on a minimal fixture.
13. Add the native PDF export panel and diagnostics flow.
14. Only then expand all HCMUT theme components.

The purpose of this order is to validate the highest-risk boundaries early rather than spending weeks reproducing the theme before the editor/export path is proven.

---

# 27. Research basis used for this plan

The architecture is informed by:

- Current MarkText project architecture: Electron/renderer separation with Muya as editor backend/core.
- Current Muya TypeScript core architecture: block tree, JSON state, selection, clipboard, history, serialization, plugin/UI architecture.
- Current MarkText/Muya MIT licensing information.
- Current Tectonic architecture as a self-contained XeTeX/TeXLive-based engine.
- Paul Hudson's 2026 guidance distinguishing repository-wide `AGENTS.md` instructions from reusable Agent Skills and his SwiftUI Agent Skill ecosystem.
- The user-supplied HCMUT LaTeX report template, especially `main.tex` and its cover/header/footer/geometry/TOC/theorem/listings rules.

When upstream APIs have changed since this plan was written, Codex must inspect the pinned project version before applying assumptions from online examples.

---

# 28. Final architecture statement

The project succeeds if its layers remain replaceable and well-defined:

```text
Markdown file (canonical)
        ↕
Muya + LMX editor
        ↕
Semantic document model
        ↓
Theme engine
        ↓
LaTeX exporter
        ↓
Tectonic
        ↓
PDF
```

```text
macOS shell = SwiftUI
Windows shell later = WinUI 3
shared editor/document/export core = TypeScript
```

Never optimize for Beta 1 speed by violating these boundaries. Beta 1 may expose only one theme, but the implementation must already behave as though that theme is a package rather than the application itself.
