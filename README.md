# Academic Markdown — private Windows engineering build

This private repository contains a source snapshot for building the experimental Windows shell, shared TypeScript editor, and required TeX/theme resources. It is not a public release. macOS native shell source, unneeded original template archives, personal configuration, Git history, build products, and caches are intentionally excluded.

## Build

Run the manual **Experimental Windows portable build** workflow, or run `./scripts/windows/Build-Windows.ps1` on Windows x64 with the pinned toolchain. See [Windows build guide](docs/windows-build.md) and [Windows shell README](apps/windows/README.md).

Successful build artifacts contain a full portable ZIP, not a single standalone executable. Keep the DLLs and Resources alongside the executable.

## Status and rights

The October 17, 2026 workflow `38938608742`, from source commit `00dfb0cbd1e28509636fe93e7594a1cdebf50f70`, passes build/publish, the real offline PDF smoke and native editor startup. Native core tests: 52 passed, one skipped symlink-privilege fixture. The downloaded ZIP and all 1,202 published file checksums are verified. See `docs/windows-cloud-build.md` for the run and artifact identity. Full manual Windows interaction/IME acceptance remains separate. Theme Studio native authoring is not ported. Preserve all notices; HCMUT/logo distribution and TeX/native dependency license/provenance review remain gates before any public release.

This snapshot was prepared with user authorization for a private repository and Windows CI. No secrets were detected by the bounded pre-upload pattern scan; this is not a full security or license audit.

The supplied `Template.zip` and `Template Latex.zip` are retained as required lossless-import conformance fixtures. They are private test inputs, not public distribution clearance.
