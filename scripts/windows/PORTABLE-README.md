# Academic Markdown — experimental Windows x64 portable directory

**Unsigned engineering artifact; Windows interactive behavior is unverified
until the manual checklist has been run. Not a public release or an installer.**

Extract the **entire ZIP** to a writable local directory and run
`AcademicMarkdown.Windows.exe` there. Do not move the EXE out of its accompanying
DLLs and `Resources/` directory. This is a self-contained .NET / Windows App SDK
directory, **not a single self-contained EXE**. Node.js, pnpm, and a .NET SDK are
build tools and are not required on the end-user machine.

## Prerequisites

- x64 Windows 10 version 2004 (build 19041) or newer, or x64 Windows 11.
- **Microsoft Edge WebView2 Evergreen Runtime** must already be installed.
  It is not bundled in this ZIP. On a machine without it, provision Microsoft's
  official runtime separately before trying to launch the editor; for an
  offline machine use its standalone installer.
- The HCMUT report uses **Times New Roman**. Verify that font is available on the
  target Windows machine. This ZIP includes the TeX support bundle and the
  three Latin Modern Mono font supplements, not a license to redistribute
  Microsoft's fonts.

The build script gates ZIP creation on the Core `NativePdfSmoke` test compiling
the offline compatibility fixture with the bundled Windows Tectonic binary.
That is a focused compiler/resource check, **not** evidence that WebView2,
the WinUI shell, file dialogs, IME, cancellation, or every document works.

## Integrity and provenance

- The adjacent `*.zip.sha256` records the archive hash.
- `SHA256SUMS` inside this directory records each packaged file except itself.
- `Resources/resource-inventory.json` records the staged runtime resource hashes.
- `Resources/runtime-resources.json` describes trusted compiler assets.
- `Resources/Licenses/WINDOWS_BUILD_MANIFEST.json` records toolchain/download
  pins and provenance, including the known offline bundle notice discrepancy.
- Preserve `THIRD_PARTY_NOTICES.md`, `Resources/Licenses/`,
  `Resources/Tools/TECTONIC_LICENSE`, and the font notices under
  `Resources/Theme/Fonts/`.

These hashes detect accidental changes relative to their manifests; they do
not replace code signing, artifact authenticity verification, or license review.
Do not bypass Windows security controls to run an untrusted download.

## Public redistribution is blocked

The supplied **HCMUT logo/theme artwork requires explicit redistribution
clearance**. Its inclusion in a private engineering build is not permission to
publish it. The inherited TeX bundle notice records a different bundle checksum
and content inventory from the currently pinned bytes; reconcile that provenance
and audit all TeX/font/native dependency licenses before public redistribution.
The root notices also contain macOS-specific wording and are preserved verbatim,
not a completed Windows native dependency license audit.

No signing, installer, Store package, release upload, or auto-update is included.
Windows UI smoke, Vietnamese IME, open/save conflict recovery, offline PDF/theme
regressions, and cancellation/stale-result behavior still require manual
validation on Windows. Keep original Markdown files backed up during evaluation.
