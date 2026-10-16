# ADR 011 - Studio compiled preview and portable text bindings

Status: accepted for implementation from the user's 2026-10-16 builder request.
This records scope, not release acceptance.

## Context

ADR 007 correctly rejected replacing the document canvas with a disconnected
mock. Its earlier restriction on adding a PDF pane predates the user's explicit
request for complementary interactive and compiled PDF modes in Theme Studio.
Literal-only covers also cannot reuse report metadata across documents.

## Decision

- Keep the real Muya renderer as Studio's interactive A4 canvas.
- Add an optional PDFKit compiled preview **inside the Studio workspace only**.
  Keep its WebView alive when switching modes. The main document editor gains
  no additional PDF pane and keeps its established layout.
- Use the same versioned bridge, shared LaTeX exporter and offline native
  Tectonic coordinator as document export. Do not print HTML to PDF.
- Debounce compilation, cancel superseded scenes, cache the last successful
  scene, and retain the last valid PDF on failure with an explicit stale label.
- Add allowlisted text metadata bindings using the existing scene v2
  `bindings` declarations and node `bindings` maps. Do not evaluate expressions
  or arbitrary property paths. Missing metadata uses the node's literal fallback.
- Keep the saved authored snapshot unresolved and reusable. Resolve a disposable
  scene in shared TypeScript using the current Markdown front matter, for both
  DOM and LaTeX. Report content and unknown metadata must not change when applying.

The initial keys cover document title, university/school/faculty, report type,
major, supervisor, date, up to ten students, header institution/faculty and
footer text. This is not arbitrary data binding or asset binding.

## Compatibility and security

No Markdown, LMX, bridge envelope or scene schema version changes. Older apps
reject the newly supported binding capability rather than executing it.
All bound strings remain plain text: DOM text nodes and LaTeX escaping still
apply. Images, JavaScript, CSS, executable expressions and TeX snippets cannot be
supplied through these bindings.

## Acceptance

Test blank-canvas drops, binding resolution for two reports, snapshot
immutability, hostile literal text, persistence, PDF cancellation/cache/failure,
and actual offline compilation. List remaining unsupported builder features
and platform-specific runtime gaps separately.
