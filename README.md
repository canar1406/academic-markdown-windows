# Academic Markdown — private Windows engineering build

This private repository contains a source snapshot for building the experimental Windows shell, shared TypeScript editor, and required TeX/theme resources. It is not a public release. macOS native shell source, unneeded original template archives, personal configuration, Git history, build products, and caches are intentionally excluded.

## Build

Run the manual **Experimental Windows portable build** workflow, or run `./scripts/windows/Build-Windows.ps1` on Windows x64 with the pinned toolchain. See [Windows build guide](docs/windows-build.md) and [Windows shell README](apps/windows/README.md).

Successful build artifacts contain a full portable ZIP, not a single standalone executable. Keep the DLLs and Resources alongside the executable.

## Status and rights

The October 2, 2026 workflow passed build, the real offline PDF smoke and native editor startup. The October 17 editor/theme update must pass a fresh workflow before delivery; an old successful artifact is not acceptance of new source. Full manual Windows interaction/IME acceptance remains separate. Theme Studio native authoring is not ported. Preserve all notices; HCMUT/logo distribution and TeX/native dependency license/provenance review remain gates before any public release.

This snapshot was prepared with user authorization for a private repository and Windows CI. No secrets were detected by the bounded pre-upload pattern scan; this is not a full security or license audit.

The supplied `Template.zip` and `Template Latex.zip` are retained as required lossless-import conformance fixtures. They are private test inputs, not public distribution clearance.
