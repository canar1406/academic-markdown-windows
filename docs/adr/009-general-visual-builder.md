# ADR 009 — General authored scene builder, milestone 1

Date: 2026-09-15. Status: implementing the user's explicit general-builder request.
No Electron, runtime Node, native-only semantics, or HTML-to-PDF substitution.

## Audit

ADR008's independent PDF snapshot is useful, but the implementation couples all
row/column/text layout to Cover and its preview names. This is not a page builder.
Selection is already correlated through studio messages but palette operations are
mostly native and multiple panels obscure the edit flow. Preserve saved scenes;
replace restrictions/ownership rather than create CoverRow/HeaderRow copies.

## Milestone contract (additive, ThemeSceneV2)

General container nodes: page, section, row, column, stack, body, cover, header,
footer. General leaf nodes: text, image-placeholder. Existing document-wide
paragraph/heading/theorem definitions retain their behavior. Root sections are
normal-page theme content before the report body; header/footer containers may
reuse layout tree. This milestone does NOT implement full template conditions or
arbitrary report-body replacement. Content Slot/dynamic bindings follow later.

Layout properties: gapMm 0–20, paddingMm 0–10 on containers (including row),
alignment leading/center/trailing. Row accepts 0–8 columns; `ratios` is colon-
separated positive integer weights (1–100 each), exactly matching non-empty row's
column count when set. Default equal weights. Image-placeholder is a deliberately
labeled printed placeholder, not a successful real image import; heightMm 10–100,
alt literal optional. Color/background in style are #RRGGBB; typography inherited,
spacing/background/ratios not inherited. Validate before render, prevent exhausted
width and cycles. General resolved layout drives DOM and TeX, with old coverLayout
an alias if needed for compatibility; no duplicate geometry engine.

`:::theme-layout {node="section-id"}` is a versioned LMX layout marker for displaying
an authored section in Muya. It only resolves validated scene data from the same
Markdown snapshot. It does not load external code. In the exporter, record explicit
layout IDs in ThemeDocumentSettings so renderDocument does not auto-render a root
section already expanded at an explicit marker. Applying a theme need not rewrite
report body: root sections otherwise precede report content. Sample uses markers.
Unknown IDs fail with diagnostics, no silent dropped content. Caption/style/layout
source remains visible; old files aren't migrated on open.

## First acceptance

Blank → Section → Row with two Columns → Text left + Image placeholder right →
select Text on canvas → edit text/typography → select Row → gap/padding/background
and ratio → reorder Layers → undo/redo → save → close/reopen Studio → apply a report
→ native TeX PDF represents design. Verify with real Computer Use. If any step
is missing, mark incomplete, even if narrower tests pass.

## Subsequent milestones

M2: dynamic bindings (document title/etc) + Content Slot and page-region print
constraints; M3: template/pattern libraries; M4: A4/Letter orientation and page
conditions; M5: convert supplied theme projects with compatibility/asset/license
mapping and golden output. Sidebar thumbnail P0 remains independently open.
