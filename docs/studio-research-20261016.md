# Theme Studio reference research - 2026-10-16

This is implementation research, not a claim of full Elementor/GrapesJS parity.

## Downloaded references

References are outside the application source tree:

- `/Users/Heavietnam/Codex-References/elementor`
  - Repository: `https://github.com/elementor/elementor`
  - Inspected revision: `a1680caf4bdeb38be6ecbb6736af0d2970d5b4ec`
  - License reviewed: `license.txt`, GPL version 3.
- `/Users/Heavietnam/Codex-References/grapesjs`
  - Repository: `https://github.com/GrapesJS/grapesjs`
  - Inspected revision: `3b2c671c0ab50f052a219b987dea8738ea75886e`
  - License reviewed: `LICENSE`, BSD 3-clause terms.

These are reference-only clones. No Elementor, GrapesJS, PHP or WordPress code
is imported into the app, and no commercial Flatsome software is downloaded.
Their test/build/install scripts were not executed.

## Primary documentation inspected

Saved HTML references are in
`/Users/Heavietnam/Codex-References/documentation`:

- Elementor developer documentation, Data Structure:
  `https://developers.elementor.com/docs/data-structure/`
- GrapesJS Component Manager:
  `https://grapesjs.com/docs/modules/Components.html`
- UX Themes official documentation and its linked public tutorial:
  `https://docs.uxthemes.com/article/186-how-to-use-the-ux-builder`

The initial Python HTTPS fetch failed certificate validation; system curl
retrieved the public references without disabling certificate verification.
The supplied old `/article/70-ux-builder` address was unavailable. The actual
tutorial link was discovered through the official video-tutorials category.
The UX Builder article embeds a tutorial; no commercial implementation or
unobserved tutorial interaction is treated as source evidence.

ECC is already installed and also has a local source checkout at
`/Users/Heavietnam/Desktop/markdown-worktrees/.ecc-src` (revision `c70874fa`).
The installed `tdd-workflow`, `e2e-testing`, `browser-qa`, `verification-loop` and
`production-audit` skills guided this work. Their examples were adapted to the
repo's pinned pnpm, Vitest, Playwright and native test commands. No external audit
service received the app source. Existing staged/unstaged work is not committed
as a purported TDD checkpoint; RED/GREEN evidence is recorded in the QC report.

## Ideas retained

### Elementor

Inspected editor element models, container views and global typography/color
commands under `assets/dev/js/editor/`. The useful architectural separation is
between the structured element model, allowed parent/child relationships,
inspector controls and global design settings. The UI should expose operations
whose model and output support actually exists.

Applied here: a Home entry point, real property bindings, two original reusable
starters, a model-backed canvas/layers workflow, and honest unsupported controls.
No WordPress runtime, PHP or GPL source is introduced.

### GrapesJS

Inspected `packages/core/src/dom_components/model/Component.ts`,
`undo_manager/index.ts`, module boundaries, and the source documentation for
Components, Blocks, Canvas, Style Manager and Layers.

The component tree is the durable model; rendering/export traverse that tree.
Drop compatibility is explicit. Canvas, blocks, styles, history and storage are
separate concerns. Transient selection is not serialized content.

Applied here: root-canvas drop targeting, deterministic style resolution,
immutable unresolved binding snapshots shared by DOM and LaTeX, and separate
compiled-preview state with cancellation, caching and stale-result presentation.
This is not a transplant of GrapesJS's HTML/CSS export model.

### Flatsome UX Builder

Public material is used only as a UX reference for visually grouped builder
controls and reusable sections. No source inspection of the commercial product
is claimed. Academic report layout remains semantic flow, not website responsive
layout or arbitrary absolute positioning of paragraphs.

## Architecture choice

Reuse the existing portable `ThemeSceneV2` plus its independently compiled
authored-theme snapshot. Shared TypeScript validates and resolves text bindings,
starter definitions, geometry and LaTeX. SwiftUI owns the workspace and native
filesystem/process work. Muya remains the real interactive preview; PDFKit shows
the actual Tectonic output in the optional Studio PDF mode.

ADR 011 documents the explicit exception to ADR 007's old no-PDF-pane policy
inside Studio. The normal document workspace is unchanged. Markdown stays the
report source; installed theme packages and unresolved snapshots remain reusable.

The current native undo/model implementation is not yet fully migrated into a
shared TypeScript command/history service. Windows can reuse the added theme
semantics, but native Windows Studio authoring parity is not delivered here.
