# ADR 008 — Portable declarative authored theme snapshots

Status: additive implementation decision for the first independent authoring slice.
This does not declare full Elementor authoring or imported-template parity complete.

## Decision

Introduce optional `lmx.authoredTheme` in Markdown front matter:

```yaml
lmx:
  authoredTheme:
    schemaVersion: 1
    id: my-theme
    version: 1.0.0
    name: My theme
    scene: # existing ThemeSceneV2 JSON/YAML object
```

This is a visible, portable snapshot of the selected authored theme. It contains
only declarative scene data, not raw TeX, templates, executable CSS/JS, or absolute
paths. Package identity is provenance, not a guarantee that external resources
have been verified. The snapshot travels with Markdown and does not require Node
or the original installed package to reopen/export. Explicit Apply replaces this
one front-matter key only; report text and unrelated metadata remain unchanged.
Save Theme persists reusable package data; Apply affects the selected report.
These are separate actions. Old documents are not migrated on open.

The shared TypeScript compiler validates the supported subset and creates a
standalone `LatexTheme`, not an HCMUT variation. Invalid or unsupported authored
snapshots stop export with diagnostics instead of silently reverting to HCMUT.
The initial subset is A4 flow, global text color/font/size, heading component
styles, optional text cover/header/footer, and normal Markdown academic content.
Assets, custom raw template fragments, bindings, arbitrary positioning and nested
custom layouts must be rejected until their shared rendering contract is built.
The source-template inventory remains open; this snapshot is not a converter for
those 19 projects. Standard HCMUT documents retain their existing path.

## Migration and limits

Schema is additive. Existing `lmx.theme` references remain stored, but an explicit
authoredTheme snapshot owns the document output while present. Remove it to resume
the original selection; unknown front-matter data is preserved. Imported packages
with assets/custom components must not be labeled supported by scene-only Apply.
Per-block cross-package composition and visual authoring of richer layouts remain
separate follow-up work. Tests cover standalone output, invalid-input rejection,
round-trip Apply, and source preservation. No weakening of CSP or TeX restrictions.
