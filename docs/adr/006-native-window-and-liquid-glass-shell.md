# ADR 006 — Theme Studio window and Liquid Glass shell

## Status

Accepted for implementation.

## Decision

Theme Studio is a separate native SwiftUI window. It is not the document Quick Edit inspector.

```text
┌────────────────┬──────────────────────────┬──────────────────┐
│ Widgets/Layers │ Opaque A4 print canvas   │ Properties       │
│ drag/drop tree │ fixture + print variants │ style + bindings │
└────────────────┴──────────────────────────┴──────────────────┘
```

The surrounding native chrome uses one Apple Liquid Glass-inspired design language shared with the main toolbar, left navigator, MathType palette, Quick Edit, Theme Library, and zoom controls:

- semantic native materials and vibrancy, not hard-coded translucent screenshots;
- consistent hierarchy, tint, separator, corner, shadow, focus, hover and pressed states;
- restrained depth and motion; Reduce Motion disables nonessential transitions;
- Reduce Transparency uses opaque semantic surfaces;
- Increase Contrast strengthens boundaries and selection;
- complete keyboard navigation, VoiceOver labels/groups, and visible focus.

The A4 canvas, theme preview, math content, and exported/PDF-facing surfaces are always opaque and print-faithful. App material, tint, blur, vibrancy, and dark-mode chrome must not leak into paper colors or exporter values.

The Studio supports add/remove/reorder/nest, drag/drop, duplicate, reset, undo/redo, preview fixture selection, data binding, validation, save, import and export. Swift owns window/filesystem/accessibility; shared TypeScript owns the Theme Scene AST, validation, reducer, deterministic serialization and export mapping.
