# ADR 004 — Quick Edit serialization

## Status

Accepted for implementation.

## Context

Quick Edit changes one block once. It is distinct from Theme Studio, whose packages are reusable. A Quick Edit must survive save/reopen, copy as Markdown, Source↔Visual transitions, and PDF export without hidden native IDs.

## Decision

Use a visible transparent LMX wrapper for standard Markdown and nested LMX blocks:

```markdown
:::style {component="paragraph" color="#1E4B8F" fontSizePt=12 align="center"}
Nội dung Markdown.
:::
```

Existing semantic directives may also reference a reusable theme alias with the reserved `theme` attribute when that is unambiguous:

```markdown
:::theorem {#thm-1 theme="modern" title="Định lý"}
...
:::
```

## Supported property model

- Typography: family token, size in pt, weight, style, line height, letter spacing, alignment.
- Paint: foreground, background, border color/width/radius.
- Spacing: margin/padding in physical print units.
- Component-specific options are namespaced.
- Unknown properties are preserved and ignored with a warning.
- Values are validated; invalid values never produce arbitrary CSS or LaTeX.

## Per-instance freedom and Apply to all

Quick Edit defaults to the selected instance. Two blocks with the same semantic function may use different theme aliases/styles, e.g. theorem 1 uses `theme="modern"` and theorem 2 uses `theme="classic"`.

The UI exposes:

- **Apply to this block:** writes/updates only the selected per-instance override.
- **Apply to all [semantic function]:** writes one document-level `lmx.theme.components.<slot>` override in front matter rather than duplicating wrappers across every block.
- **Replace existing custom overrides:** optional destructive scope that removes/replaces same-slot per-instance overrides after explicit confirmation; default behavior preserves them and displays a `Custom` badge.
- **Reset to document theme:** removes the selected instance override.

## Precedence

1. Per-instance `:::style`/directive override.
2. Document component-theme override created by Apply to all.
3. Document default theme.
4. Built-in safe fallback.

Nested wrappers merge outer to inner; the nearest explicit property wins. Reset removes only the selected instance override.

## Editing contract

- Visual mode renders the wrapper transparently around its child content.
- Source mode shows the exact directive.
- A selected block is addressed by transient editor handle plus source/state path for the current revision; no random ID is serialized.
- Mutation uses Muya JSON/history operations and produces one undo entry.
- Quick Edit UI provides Apply, Reset, Copy style, Paste style, Duplicate style, Remove override, and validation status.
