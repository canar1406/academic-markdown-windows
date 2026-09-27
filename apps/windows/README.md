# Experimental Windows shell

This WinUI 3/WebView2 shell is the implementation exception in
`docs/adr/010-experimental-windows-shell.md`; it does not replace or change the
macOS shell. Markdown, LMX, theme semantics and LaTeX export remain in the shared
TypeScript packages. Windows native code owns platform IO and process execution.

**Status:** Windows build/runtime acceptance is pending. Local portable tests
or resource staging on macOS are not a successful Windows build. No Windows
binary, signed release, or installer is promised by this README.

Implementation and verified checks: `docs/windows-checkpoint-20260927.md`.
The shell includes file lifecycle, Visual/Source, Find/Replace, zoom, page actions
and manual PDF export. Native Theme Studio and sidebar parity are not ported.
Save destinations use an HWND-bound, path-only Win32 dialog; no output file is
created before the atomic save/compile commit.

## Build on Windows x64

Install the developer prerequisites described in `docs/windows-build.md`:
PowerShell 7 x64, Node 22.x, pnpm 10.15.0, .NET SDK 8.0.425, and the Visual Studio
2022 Windows SDK/C++ build tools needed for WinUI 3. Do not substitute a newer
SDK or relax a frozen-lockfile failure to get a green artifact.

From the repository root, in PowerShell:

```powershell
./scripts/windows/Build-Windows.ps1
```

The script performs a frozen dependency install; shared typecheck/tests; Windows
packaging tests; a fresh editor build; checksum-verified resource staging;
Core tests with the real Windows PDF smoke; WinUI restore/build/publish; and ZIP
creation. It does not install global tools or clean source changes.

Outputs are under `apps/windows/artifacts/build-<UTC timestamp>-<unique suffix>/`:

```text
AcademicMarkdown-windows-x64-experimental.zip
AcademicMarkdown-windows-x64-experimental.zip.sha256
README.md
test-results/windows-core.trx
AcademicMarkdown-windows-x64-experimental/
  AcademicMarkdown.Windows.exe
  ... .NET / Windows App SDK / application DLLs ...
  README.md
  THIRD_PARTY_NOTICES.md
  SHA256SUMS
  Resources/
    Web/        # fresh apps/editor/dist, NOT the macOS Web copy
    Tools/      # pinned Windows tectonic.exe + its MIT license
    TeX/        # pinned offline support bundle
    Theme/      # logo, fonts and their notices
    Licenses/   # notices + exact build manifest
    runtime-resources.json
    resource-inventory.json
```

Keep the complete extracted directory together. **This is a portable ZIP, not a
single self-contained EXE.** The target machine needs the WebView2 Evergreen
Runtime and Times New Roman; it does not need Node.js or a .NET SDK.

The ZIP is unsigned, Windows interactive behavior is unverified, and **public
redistribution is gated on HCMUT logo rights and a complete dependency/license
audit**. The inherited TeX support notice has a known checksum/inventory
discrepancy documented in the packaging manifest; do not interpret the checksum
pin as license clearance.

## Local checks and optional CI

Cross-platform packaging tests, without Windows or compiler execution:

```sh
node --test scripts/test/windows-*.test.mjs
node scripts/windows/resource-tools.mjs validate
```

See `docs/windows-build.md` for resource-only staging, troubleshooting, manual
Windows acceptance checks, and the inert manual-dispatch workflow. Merely
creating `.github/workflows/windows.yml` does not run CI, upload this repository,
or authorize a remote. No remote creation, push, dispatch, or release is part of
this implementation.
