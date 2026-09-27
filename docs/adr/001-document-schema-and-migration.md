# ADR 001 — Document schema v2 and migration

## Status

Accepted for implementation.

## Context

Schema v1 stores one document theme as `lmx.theme: hcmut-report-v1` and HCMUT-specific settings under `lmx`. Quick Edit, reusable component themes, and Theme Studio require explicit theme references and visible per-instance overrides without making native state canonical.

## Decision

Markdown remains canonical. Schema v2 is additive and keeps all LMX v1 directives readable.

```yaml
lmx:
  schema: 2
  themes:
    base:
      id: hcmut-report-v1
      version: 1.0.0-beta.1
      integrity: sha256-...
  theme:
    default: base
    components:
      table: base
  themeConfig:
    base: {}
```

Rules:

- `themes` maps document-local aliases to stable package ID, exact version, and optional integrity digest.
- `theme.default` owns the document shell and preamble.
- `theme.components` overrides component slots for the whole document.
- Per-instance overrides use visible LMX syntax defined by ADR 004.
- Absolute paths, security bookmarks, App Support paths, UUID registry IDs, and editor-only state are forbidden.
- Unknown YAML keys/comments and unknown LMX attributes are preserved.
- Missing/incompatible themes generate diagnostics and keep Source mode available; the app must not silently substitute a different package.

## Compatibility and migration

- A v1 scalar `lmx.theme` remains readable through an adapter and is not rewritten on open.
- Migration is explicit: parse → preview changes/diagnostics → recovery snapshot → user confirmation → atomic save → update schema marker.
- A failed migration leaves the original bytes and dirty state intact.
- Unsupported future schema versions open in Source/recovery mode with a compatibility warning.
- LMX v1 grammar remains accepted; v2 adds registered directives/attributes only.

## Ownership

- TypeScript document core parses, validates, migrates, and serializes schema v2.
- Swift presents migration UI and performs atomic persistence.
- Swift must not invent or rewrite semantic document fields independently.
