# Native-JavaScript Bridge Protocol v1

## Host transports (additive Windows support)

The semantic envelope is unchanged. macOS uses
`window.webkit.messageHandlers.bridge.postMessage`; the experimental Windows
shell uses `window.chrome.webview.postMessage`. Windows replies with
`CoreWebView2.PostWebMessageAsJson`, received by a listener installed before
`editor.ready`. No JavaScript source string carries user Markdown.

The Windows host accepts messages only from its bundled editor origin,
`https://editor.academic-markdown.invalid/index.html`. Before dispatch, both
transport boundaries require protocol 1, a nonempty string type, string-or-null
request ID, and an object payload. Unknown valid v1 events are ignored unless
supported. Shared decoder fixtures:
`packages/bridge-protocol/test/fixtures/host-envelope-v1.json`.

Only a matching host-initiated request ID and response type may complete an
async native operation. Save/export snapshots validate revision and payload
fields separately. Windows requests time out and pending requests are cancelled
when the host is closed. Document identity stays native and guards revision 0
across document switches; it is not serialized into Markdown.

All macOS request/response operations now have a deadline (20 seconds by
default), including Markdown, metadata, metadata updates, theme application and
LaTeX requests. A failed asynchronous WebView delivery completes the matching
request immediately. Cancellation, replacement of the bridge sender and detach
complete pending requests exactly once; late responses cannot complete them
again. These changes do not change the v1 envelope.

Document image URLs are a local transport concern, not stored Markdown:
`app-document://local/…` on macOS,
`https://document.academic-markdown.invalid/…` on Windows. The Windows host serves
only allowed relative image paths beneath the selected document directory; it
does not expose an unrestricted virtual mapping of that directory.

Every message uses the versioned envelope defined in `plan.md`:

```json
{
  "protocolVersion": 1,
  "type": "editor.modeChanged",
  "requestId": null,
  "payload": {}
}
```

## Authoritative editor mode

Swift requests a mode through `editor.setMode` with `mode` set to `visual` or
`source`. JavaScript validates the transition, updates the editor surface, and
then emits `editor.modeChanged`:

```json
{
  "mode": "source",
  "requestedMode": "visual",
  "accepted": false
}
```

`mode` is always the mode actually displayed by the web editor. Swift must use
it as the authoritative Picker value. A rejected Source-to-Visual transition
keeps the raw source intact, leaves only Source visible, and reports validation
diagnostics in the web editor.

## Studio starter catalog

The native Studio requests the shared, original academic starters using
`studio.requestStarters` with an empty payload and a non-null request ID.
JavaScript replies with `studio.starterThemes`, the matching request ID and
`{ "themes": [AuthoredThemeSnapshot, ...] }`. The native projection bounds and
decodes this catalog; applying a starter is an undoable draft operation, not an
implicit install or report mutation.

Studio preview/drop/selection messages continue using their active scene request
ID. The root A4 canvas exposes the scene root ID as a drop target, so a blank
scene can receive its first supported container. The interactive sample stays
read-only; scene changes go through the native model and shared compiler.

## Metadata invalidation

JavaScript emits `document.metadataChanged` only when parsed YAML front matter
changes or when a document load replaces the metadata snapshot:

```json
{
  "revision": 12,
  "valid": true
}
```

The event intentionally excludes the Markdown document. An open Properties
inspector responds by sending `document.requestMetadata`; JavaScript returns
the parsed snapshot in `document.metadata` with the matching request ID.

## LaTeX export snapshots

`export.requestLatex` returns `export.latex` with the same request ID. JavaScript
flushes pending editor edits before capturing source and revision in one
synchronous operation:

```json
{
  "latex": "...",
  "assetPaths": [],
  "diagnostics": [],
  "revision": 12
}
```

`revision` is an additive protocol-v1 field: a nonnegative JavaScript safe
integer identifying the source used to generate this LaTeX. Native clients
reject invalid supplied revisions and discard superseded results. Older v1
responses without this field remain decodable; they use the conservative
request-start revision guard and cannot be relabeled as newer source.

## Page layout revisions and thumbnail feedback

`editor.pageLayoutChanged` is an additive v1 event with the constant-size
payload `{ "layoutRevision": 12 }`. It follows every committed Visual layout,
including font/viewport/content reflows that leave the page inventory unchanged.
It contains neither Markdown nor the full page inventory. Native code must
advance its thumbnail revision guard on this event; otherwise valid rasters
are rejected after an unchanged-inventory reflow and the navigator stays loading.
Older hosts may ignore this event. It does not change document dirty revisions
or infer semantic page breaks.

`editor.pageThumbnailChanged` retains its existing current-layout check.
`editor.pageThumbnailFailed` carries `layoutRevision`, `pageIndex`,
`targetWidth` and `message`. The macOS host validates the revision, page and
bounded image width, exposes a bounded error message and offers an explicit
retry through the existing `editor.setPageNavigatorDemand` command. A failed
refresh preserves the last successful raster; retry clears that page's error.
Superseded failures are ignored. These are transient UI states, never saved
into Markdown.

## Page action requests

The Visual editor renders transient controls above each A4 page. These controls
never mutate Markdown directly. JavaScript emits `editor.pageActionRequested`
with one of these payloads:

```json
{ "action": "addAfter", "pageIndex": 1 }
```

```json
{ "action": "delete", "pageIndex": 1 }
```

Swift validates the current page inventory. It responds with `editor.addPage`
for an accepted add request, or asks for native confirmation before sending
`editor.deletePage`. The page index is always a non-negative integer and is
revalidated immediately before a destructive command.

## Quick Edit component themes

A per-instance Quick Edit uses `editor.updateSelectedLmxBlock` with the
transient current-revision path plus visible directive attributes. To apply one
declared document alias to every block in a semantic slot, Swift sends a
request-scoped command instead of constructing YAML itself:

```json
{
  "protocolVersion": 1,
  "type": "editor.applyThemeToComponent",
  "requestId": "theme-update-1",
  "payload": {
    "componentSlot": "theorem",
    "themeAlias": "formal"
  }
}
```

JavaScript validates and serializes the change through document-core. Schema-v2
documents must already declare the alias under `lmx.themes`. A known legacy
`lmx.schema: 1` / `lmx.theme: hcmut-report-v1` document may be migrated only by
an explicit Apply-to-all request for alias `base`; the operation preserves
existing metadata and visible per-instance `theme="base"` attributes.

JavaScript answers with `document.themeComponent.updated` using the same
request ID:

```json
{
  "updated": true,
  "diagnostics": []
}
```

A successful operation creates one document revision. Invalid slots, undeclared
aliases, path-bearing package references, malformed YAML, and unsupported
schemas return `updated: false` and diagnostics without changing Markdown.
Resolution order is per-instance alias, document component alias, document
default alias, then the explicit built-in fallback. Missing installed packages
produce a warning rather than a silent version substitution.

## Editor canvas zoom

Swift sends `editor.setZoom` for keyboard zoom. Trackpad pinch is handled
directly inside the WebView so gesture frames never cross the asynchronous
Swift/JavaScript bridge. Zoom is a UI-only preference and never changes
Markdown or A4 pagination:

```json
{
  "magnification": 0.5,
  "pageIndex": 1,
  "interactive": true
}
```

`magnification` is clamped to the supported canvas range. `pageIndex` is
optional and lets JavaScript keep the selected sheet anchored while it scales
the fixed-layout A4 canvas. A local trackpad gesture performs compositor-only
transforms and updates the scrollable canvas dimensions once when the gesture
ends. JavaScript must not implement this command with `WKWebView.pageZoom`,
because viewport zoom changes CSS layout and reflows text.

## Theme Studio sample projection (additive v1 messages)

`studio.previewScene` carries `{ scene: ThemeSceneV2, title: string }` and a
request ID. The editor validates and projects a bounded subset into disposable
Markdown, then replies `studio.previewRendered` with the same ID and
`{ diagnostics: [{ message, severity }] }`. Rejected input leaves the previous
sample untouched. This is not a generic ThemeScene-to-TeX compiler or a change to
saved user documents. The generated sample goes through the normal Muya and
`export.requestLatex` paths. Unsupported widgets/fields are reported.

Scene snapshots reset their independent sample revision to zero. Native code
correlates acknowledgement IDs and disables sample export while a new scene is
pending. The sample is read-only; normal document editing is unaffected.

Foundation can alias empty arrays/dictionaries while WebKit converts structured
arguments. Shared identity is valid input, not by itself a cycle. Projection
retains depth/value/text limits before recursive validation, including for real
cycles. Styles are resolved only through supported Markdown/front-matter/Quick
Style attributes. No arbitrary CSS, JavaScript or TeX is executed.

## Apply authored theme snapshot (additive protocol v1)

- Request: `document.applyAuthoredTheme`, non-null request ID,
  `{ snapshot: AuthoredThemeSnapshot }` as defined by the shared theme-engine.
- Response: `document.authoredTheme.updated`, same request ID,
  `{ updated: boolean, diagnostics: [{ code, message, severity }] }`.
- JS validates the supported declarative subset before replacing only
  `lmx.authoredTheme`. Empty maps are preserved and old snapshot fields are replaced,
  not recursively merged into a different design. Source/other metadata is retained.
- Studio read-only samples reject Apply. Native captures the intended report before
  showing confirmation and rejects a report that changes during package loading.
- Native rejects packages requiring custom template fragments/dependencies/assets
  for scene-only Apply. Unsupported content is not silently called applied.
- The independent PDF compiler uses the snapshot after reopening the file without
  needing a runtime registry. Invalid authored snapshots stop export instead of
  falling back to HCMUT. Visual document theming is not connected in this slice;
  the action and confirmation explicitly say **Apply to Report PDF**.
- Deadline 15s, cancellation/disconnection resolves the pending operation. Generic
  bridge timeout text is still shared with export and needs a follow-up wording fix.

See ADR 008 for scope and migration. This is not generic raw LaTeX import or full
cross-package per-block composition.

## Authored cover selection (protocol v1 additive)

`studio.previewScene` optionally carries `selectedNodeId`. Preview DOM nodes get
`data-authored-node-id` from the theme scene only, never saved into report blocks.
A delegated cover click sends `studio.nodeSelected` with `{nodeId}` and the current
preview request ID. Native validates this ID and node existence before selecting.
`studio.selectNode` carries `{nodeId: string|null}` and the matching preview request
ID to mark selection from Layers without replacing/reflowing the scene. Stale
messages are ignored. Selection alone is not a document/theme content edit.
This maps cover/layout nodes only; body and arbitrary imported layout selection
is not yet a supported contract. Text is edited through the native inspector.
