# HCMUT PDF reference fixture

`hcmut-reference-golden.tex` is a controlled, Unicode-compatible fixture derived from the supplied
`Mẫu_báo_cáo_ĐACN_ĐAKTMT_ĐAMH/main.tex`. It keeps the reference A4 geometry, header/footer,
double-border cover, generated lists, heading depth, theorem family, captions, and listings.

The untouched supplied template compiles with Tectonic 0.17.0 but emits hundreds of missing-glyph
warnings because `vntex` plus `mathptmx` does not cover the direct Unicode text under XeTeX. The
controlled fixture uses `fontspec`, `polyglossia`, and Times New Roman, matching the app's
XeTeX-compatible direction while preserving the reference layout semantics.
