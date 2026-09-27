# AGENTS.md — Codex Repository Guide

This repository builds a Markdown-first academic report editor that exports professional LaTeX/PDF. The macOS application is native SwiftUI, while the Markdown WYSIWYG editor and cross-platform document/export semantics are TypeScript-based.

Read `plan.md` before making architectural or document-format changes.

## Role

Act as a senior macOS/SwiftUI engineer and editor-platform engineer. Optimize for correctness, data integrity, deterministic Markdown round-trip, maintainability, and a future Windows shell that reuses the shared TypeScript core.

Do not optimize for short-term implementation speed by collapsing platform boundaries.

## Architecture invariants

1. Markdown is the canonical persistent document format.
2. Muya is the WYSIWYG editor core hosted in `WKWebView`.
3. The macOS shell is SwiftUI; do not reintroduce Electron.
4. Cross-platform document semantics, LMX parsing, theme resolution, and LaTeX export belong in TypeScript packages.
5. Swift owns macOS lifecycle, filesystem, menus, native settings, PDFKit, app state, and TeX process coordination.
6. Generated LaTeX and PDF are outputs, never canonical source.
7. Semantic settings that affect output must be represented in Markdown front matter or documented LMX syntax.
8. UI-only preferences must remain outside the Markdown document.
9. Beta 1 uses one HCMUT theme, but generic code must load it as a versioned theme package.
10. Exact final layout is determined by compiled TeX/PDF, not by DOM rendering.
11. Windows work is deferred until macOS 1.0, but shared packages must stay platform-neutral.

## Never do these without an explicit architecture decision

- Replace Muya with a native Swift text editor.
- Bring the MarkText Electron shell into the app.
- Move the shared Markdown parser/exporter into Swift.
- Add hidden proprietary semantic state.
- Change LMX syntax incompatibly.
- Change front-matter schema incompatibly.
- Change Swift↔JS bridge protocol incompatibly.
- Replace TeX with HTML/CSS-to-PDF as the authoritative PDF path.
- Require Node.js at app runtime.
- Add arbitrary shell execution or unrestricted raw LaTeX.
- Hard-code `if theme == "hcmut"` behavior throughout generic exporters/UI.

If one of these appears necessary, write an ADR under `docs/adr/` and explain the migration impact before implementation.

## Platform baseline

- macOS first.
- Swift 6.2+.
- Initial recommended deployment target: macOS 15.0+ unless the project configuration says otherwise.
- Xcode 26.3+ compatible toolchain.
- Use Swift Package Manager for Swift dependencies unless there is a documented reason not to.
- Use Node/pnpm only for development/build tooling and web packages, not as an end-user runtime requirement.

Do not blindly apply iOS-only guidance to this macOS project.

## Swift rules

- Prefer modern Swift concurrency and `async/await`.
- Avoid legacy `DispatchQueue.main.async()` when actor isolation solves the problem.
- Use Observation (`@Observable`) for shared UI models where appropriate.
- Keep UI-owned observable state correctly isolated to `@MainActor` unless project default isolation already guarantees it.
- Keep filesystem, hashing, process execution, PDF compilation, and large parsing work off the main actor.
- Make export/build tasks cancellable.
- Reject stale PDF build results using document revision IDs.
- Avoid force unwraps and force tries unless a programmer invariant makes failure unrecoverable and the reason is obvious.
- Prefer value types for immutable request/result models.
- Separate unrelated types into separate files when it improves navigation and testability.
- Do not create giant "Manager" objects that combine document IO, bridge, export, and UI state.

## SwiftUI/AppKit rules

SwiftUI owns the app shell.

AppKit bridging is allowed when required for macOS capabilities such as:

- `WKWebView`,
- PDFKit `PDFView`,
- native open/save panels,
- `NSWorkspace`,
- low-level command/focus integration that SwiftUI cannot express reliably.

Do not turn AppKit bridges into a parallel application architecture.

Follow macOS Human Interface Guidelines. Preserve keyboard accessibility and VoiceOver labels for native controls.

## WKWebView rules

- Load the bundled editor app locally.
- Do not allow arbitrary remote navigation inside the editor WebView.
- External links must be handed to Swift and opened with the system browser.
- Keep a restrictive Content Security Policy.
- Do not expose generic filesystem/process functions to JavaScript.
- All privileged file operations occur in Swift after an explicit bridge request.
- Validate every bridge message.
- Prefer structured arguments with `callAsyncJavaScript` or a typed dispatcher; do not interpolate user strings into arbitrary JavaScript source.

## Bridge protocol rules

All Swift↔JavaScript messages use a versioned envelope:

```json
{
  "protocolVersion": 1,
  "type": "document.changed",
  "requestId": null,
  "payload": {}
}
```

- Keep message type names stable.
- Add decoding tests on both sides.
- Reject unsupported protocol versions clearly.
- Use request IDs for async request/response operations.
- Track document revision separately from persisted revision and PDF build revision.
- Do not transfer the full Markdown document on every keystroke.

## Markdown/data-integrity rules

The highest-priority invariant is: **never silently corrupt or discard user Markdown**.

- Saved source is UTF-8 Markdown.
- YAML front matter stores document/theme metadata.
- Preserve unknown front-matter keys where feasible.
- Source-mode parse failures must keep original text intact.
- Never silently rewrite malformed custom blocks into a different meaning.
- Use atomic file writes.
- Handle external file modifications/conflicts explicitly.
- Muya JSON/DOM is transient editor state, not the file format.

Any feature that changes semantic output must define its Markdown representation before implementation.

## LMX rules

LMX is the project's custom Markdown extension layer.

- Prefer standard Markdown whenever it already expresses the concept.
- Use fenced semantic directives only for concepts Markdown lacks: theorem family, captioned figure/table wrappers, page break, academic front sections, etc.
- Parse nested directives with a real parser/tokenizer; never rely on a few greedy regular expressions.
- Every LMX node requires parse + serialize + visual editor + export tests.
- Keep LMX schema/version compatibility explicit.
- Stable labels such as `#fig-x` are semantic IDs; do not serialize random internal editor UUIDs.

## Muya rules

Muya is upstream code with a deliberately small local patch surface.

- Keep upstream revision documented.
- Keep project-specific changes isolated.
- Prefer extension points/plugins when adequate.
- If core changes are required for new block types, add focused tests around the changed block/parser/selection behavior.
- Never casually rewrite Muya selection, clipboard, history, IME, or state internals.
- Before rebasing/updating upstream, run Markdown round-trip, IME, clipboard, and custom-block regression tests.
- Do not edit the old Electron desktop shell as part of app features.

## TypeScript rules

- Strict TypeScript.
- Avoid `any`; isolate unavoidable untyped boundaries.
- Keep browser/shared packages free of Node/macOS APIs.
- Export versioned schema types from one source.
- Validate untrusted/front-matter/bridge/theme input at boundaries.
- Keep serializer output deterministic.
- Do not couple generic exporter functions to the HCMUT theme.

## LaTeX exporter rules

- Export from semantic document state through the shared TypeScript exporter.
- Centralize LaTeX escaping.
- Distinguish normal text, math, code, URLs/paths, labels, and explicitly trusted template fragments.
- Never interpolate normal user text into LaTeX without the correct escaping path.
- Generated `.tex` must be deterministic for the same source/theme/toolchain.
- Map exporter/compiler diagnostics back to source blocks/lines where practical.
- Raw LaTeX is not a normal Beta 1 requirement.

## Theme rules

The supplied HCMUT template is Beta 1's golden theme.

Preserve these behaviors unless a verified compatibility reason requires an equivalent rewrite:

- A4 layout and supplied margins.
- HCMUT header with logo/institution text.
- footer text plus current/total page numbering.
- cover double border and cover metadata.
- TOC/list of figures/list of tables behavior.
- front-matter/page-number reset behavior.
- heading depth through level 4.
- caption formatting.
- theorem family.
- listings/code presentation.

Theme-specific values live in the theme package/manifest/templates, not generic Swift or exporter branches.

## TeX compiler rules

Preferred engine direction is Tectonic behind a protocol/abstraction.

- Build in an isolated temporary directory.
- Disable shell escape.
- Validate/canonicalize asset and theme paths.
- No path traversal outside approved roots.
- Make builds cancellable.
- Ignore/discard stale build results.
- Preserve the last valid PDF while a newer preview build fails.
- Present concise diagnostics in UI; full logs are advanced details.

## Test requirements

For any semantic document feature, add all applicable tests before considering work complete:

1. Markdown parse test.
2. Markdown serialize/round-trip test.
3. malformed-input/recovery test.
4. visual editor interaction test.
5. LaTeX export snapshot.
6. HCMUT theme mapping test.
7. PDF golden/regression test if layout changes.
8. Swift bridge/state test if protocol/UI is affected.
9. Vietnamese/Unicode case if user text is involved.

For bug fixes, add a regression test that fails before the fix whenever practical.

## Performance rules

- Do not compile TeX on every keystroke.
- Do not send entire Markdown source over the bridge on every keystroke.
- Keep WebView input responsive during PDF builds.
- Debounce optional live preview.
- Cancel superseded builds.
- Measure before attempting deep Muya performance rewrites.

## Security rules

Treat Markdown, imported HTML, theme metadata, file paths, and bridge payloads as untrusted input.

- Preserve/supplement HTML sanitization.
- Restrict URL schemes.
- Never expose shell commands to document content.
- No TeX shell escape.
- No unrestricted `\input` path behavior from normal Markdown.
- Validate theme manifest paths.
- Do not weaken WebView navigation/CSP for convenience.

## Licensing rules

MarkText/Muya upstream is MIT licensed; preserve required notices.

- Do not remove license/copyright files from vendored or forked code.
- Keep `THIRD_PARTY_NOTICES.md` current.
- Record upstream revision.
- Audit redistribution rights for Tectonic/TeX support bundles and theme assets before release.
- Do not assume the HCMUT logo can be redistributed merely because it exists in the supplied template.

## Working method for Codex

For each task:

1. Read the relevant section of `plan.md`.
2. Inspect existing code and tests before changing architecture.
3. State the smallest coherent implementation plan internally.
4. Make focused changes; avoid unrelated refactors.
5. Add/update tests with the implementation.
6. Run the narrowest relevant tests first, then project gates.
7. Fix root causes instead of weakening tests.
8. Update docs/specs if a public schema/protocol/theme contract changes.
9. Report changed files, tests run, and remaining limitations.

If a task conflicts with an architecture invariant, do not silently reinterpret the invariant. Surface the conflict and propose an ADR-compatible solution.

## Suggested project gates

Use the commands actually present in the repository. Once configured, keep equivalents of:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build:web
xcodebuild -project apps/macos/Project.xcodeproj -scheme Project -configuration Debug build
```

Add targeted package commands as the monorepo evolves. Do not invent successful test results; only report commands that were run.

## MCP-assisted development

This repository has project-scoped MCP configuration in `.codex/config.toml`.

- Prefer XcodeBuildMCP for Xcode/SwiftPM discovery, macOS builds, tests, diagnostics, logs, and runtime validation. After Swift or Xcode configuration changes, run the affected build/test before claiming success.
- Use Context7 only when current, version-specific third-party API documentation is needed. Reconcile its guidance with the installed dependency version and local source.
- Use GitHub MCP for upstream MarkText/Muya research and repository-hosted issues/PRs when relevant. Prefer read-only investigation and do not mutate remote state without explicit user authorization.
- Do not add or use Filesystem MCP for local repository work; shell and repository tools already cover it.
- If an MCP server is unavailable, continue with local tools where safe and report the verification gap rather than inventing results.

## Definition of done

A change is done only when:

- it preserves canonical Markdown,
- it respects platform boundaries,
- it has appropriate tests,
- it introduces no undocumented schema/protocol incompatibility,
- it builds cleanly in the affected targets,
- it does not weaken security or licensing obligations,
- and any PDF-affecting change has been checked against the HCMUT reference behavior.
