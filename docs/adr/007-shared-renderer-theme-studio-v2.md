# ADR 007 — Stabilize the shared renderer before expanding Theme Studio

## Status

Accepted as the implementation interpretation, with precedence clarified on 2026-09-08.
This is not a completion claim.

## Context

The user's issue report and instructions at **19:34 on Monday, 2026-09-07
(Asia/Ho_Chi_Minh)** are the primary product requirements. The detailed document
preserved verbatim in `docs/specs/theme-studio-v2-user-request.md` describes
and supplements those requirements; it is not a replacement or a separate
scope expansion. If wording differs, the 19:34 instructions take precedence.

The current native Theme Studio canvas renders illustrative widgets independently
of Muya and the LaTeX exporter. Its controls and serializer existing in code do
not demonstrate that document layout or exported PDF uses the same settings.
The user has reproduced pagination jitter, failed thumbnail loading, incorrect
navigation/caret placement and cover updates being rejected in the packaged app.

## Decision

1. Fix and verify the renderer prerequisites in the requested order: pagination,
   header/footer safe areas, page/caret mapping, bookmark navigation, preview,
   cover state, then theme discovery/path handling.
2. Build the Studio workspace around Home, Styles, Templates, Patterns, Pages,
   Theme Library and Advanced only after those prerequisites pass. Patterns may
   have a clearly scoped initial subset; unfinished actions must not simulate
   success.
3. Reuse the real Muya/document renderer for the Studio's live canvas and the
   same shared TypeScript style resolution for Quick Edit and export. The
   current illustrative native canvas is not an acceptable substitute.
4. Keep SwiftUI as the native shell and Swift as the filesystem/process owner.
   Theme schemas, resolution, reusable patterns and export semantics remain
   platform-neutral TypeScript. No Electron or runtime Node requirement.
5. The shared style cascade is renderer defaults → theme tokens → global styles
   → block styles → template/context → document overrides → local overrides.
   Reset removes an override; it must not freeze the inherited value locally.
6. Hover previews are transient. Save identifies and persists changed theme
   resources independently, using validated snapshots and atomic installation.
   Bundled themes are read-only; editing begins with an explicit duplicate.

## Document and page boundaries

Markdown remains canonical. Document theme references and semantic overrides
remain visible in versioned front matter or documented LMX.

The editor page model is a transient, revisioned projection with stable
interaction identity during reflow. Empty/sparse pages have a valid hit target
and insertion mapping; that does not make DOM page containers persistent source.
Explicit page boundaries still round-trip as LMX page-break directives.
Internal layout IDs must not be serialized as random document IDs.

The editor and TeX exporter share semantic settings and print intent. Compiled
TeX/PDF remains the exact-layout authority; this decision does not promise equal
DOM/TeX line breaking, introduce an in-app PDF pane or authorize HTML-to-PDF.

## Security and migration

Absolute selected source-folder URLs may contain spaces/Unicode. Resource paths
*inside* a package remain validated relative paths confined to approved roots.
No manual shell-string construction is needed to load a theme.

Advanced does not authorize arbitrary CSS execution, JavaScript, shell escape
or unrestricted raw LaTeX. Unsupported imported constructs must be reported
and preserved safely, not executed or silently dropped.

Existing Markdown/LMX and theme packages remain readable. Opening a document
does not migrate it. Any additional public schema fields require an explicit
versioned contract, validation and round-trip tests before enabling their UI.
Native Swift scene types are boundary projections, not a second semantic source.

## Acceptance

Use the end-to-end flow in the user specification on a freshly built artifact:
open, type across boundaries, navigate/caret, load preview, apply a discovered
theme (including beyond item 10 and paths with spaces), change shared styles,
edit cover with 0–10 authors, save/restart, then export and compare PDF.

Code presence, mocks, successful compilation and isolated package tests are
partial evidence, not sufficient for “Theme Studio functional.”
