# Windows engineering build and packaging

This implements the packaging slice of ADR 010 and `docs/plans/windows-port.md`.
It is not Windows release acceptance. Keep the existing macOS and shared-editor
work intact; the scripts never reset Git, clean a worktree, or edit C# projects.

## Pins and developer prerequisites

The authoritative packaging configuration is
`scripts/windows/resources.manifest.json`. Build scripts read it; the workflow
duplicates the provisioning versions and must be updated together with it.

| Tool | Pin / requirement |
| --- | --- |
| OS | x64 Windows 10 2004+ / 11; workflow uses `windows-2022` |
| PowerShell | 7+, x64 |
| Node | **22.x**, development/build only |
| pnpm | **10.15.0**, matching root `packageManager` |
| .NET SDK | **8.0.425**, no SDK roll-forward |
| Windows App SDK | **1.8.260921001**, pinned in the parent-owned WinUI project |
| Target | `net8.0-windows10.0.19041.0`, `win-x64`, self-contained, unpackaged |
| Tectonic | **0.17.0**, official `x86_64-pc-windows-msvc.zip` |

Use Visual Studio 2022 / Build Tools with the Windows 10/11 SDK and C++/Windows
app development components needed by WinUI's XAML compiler. The manual workflow
uses the hosted Windows 2022 development image, not a macOS cross-build.
The generated SDK driver contains an exact `global.json`; the repository root
and user/global .NET configuration are not modified.

The target machine needs **WebView2 Evergreen Runtime**. It is intentionally not
bundled in the ZIP; provision it before launch, using Microsoft's standalone
installer for offline machines. Times New Roman is required for the existing
HCMUT compatibility fixture and theme. No system fonts are downloaded or
redistributed by these scripts.

Official provenance endpoints (also recorded in the manifest):

```text
https://api.github.com/repos/tectonic-typesetting/tectonic/releases/tags/tectonic%400.17.0
https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/8.0/releases.json
https://api.nuget.org/v3-flatcontainer/microsoft.windowsappsdk/index.json
https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution
https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/self-contained-deploy/deploy-unpackaged-self-contained-apps
```

The official GitHub release asset SHA-256 is
`f61ce51f0b0ade1015b7de7ef368541c5424e9756ecbd0d7af97d6d48030845f`.
The extracted Windows EXE SHA-256 is
`99ffcfdbf1ebf8bdda9e791942e3d06aedb12463fddc33f07de6f5211c8bf08d`.
Both the archive and extracted binary are verified; the compiler MIT license is
fetched from an immutable upstream commit and separately hash-verified. Hash
verification does not constitute Authenticode signing or release approval.

## Complete Windows build

From the repository root, with the exact tool versions on `PATH`:

```powershell
./scripts/windows/Build-Windows.ps1
# Optional debug configuration:
./scripts/windows/Build-Windows.ps1 -Configuration Debug
```

The script performs these gates, in order:

1. Verify Windows x64, Node 22, pnpm 10.15.0 and the WinUI dependency pin.
2. `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`.
3. Run `scripts/test/windows-*.test.mjs` using Node's test runner.
4. `pnpm build:web`, then `Stage-Resources.ps1`.
5. Select .NET SDK 8.0.425 via an isolated generated SDK driver.
6. Run `dotnet test` on
   `apps/windows/AcademicMarkdown.Core.Tests/AcademicMarkdown.Core.Tests.csproj`.
   Set `ACADEMIC_NATIVE_PDF_RESOURCES` to the staged resource root and
   `ACADEMIC_NATIVE_PDF_LATEX` to `scripts/fixtures/offline-tex/report.tex`.
   Set `ACADEMIC_NATIVE_PDF_OUTPUT` to this build's unique `smoke.pdf` and use an
   empty per-build `TECTONIC_CACHE_DIR`. Caller values are restored afterward;
   an inherited output path cannot overwrite a user's file.
   The Core `NativePdfSmoke` integration test must use the actual staged Windows
   compiler, copy the runtime-manifest fonts/logo into isolated temporary space,
   and compile with `--untrusted --only-cached --bundle <staged TTB>`.
   Missing Times New Roman, offline support, fonts, a compiler failure, or a
   failed/skipped/absent smoke must fail the build. The packager checks the TRX
   contains a passed `NativePdfSmoke` result; it cannot silently package a run
   that only executed portable unit tests.
7. `dotnet restore`, `dotnet build`, and `dotnet publish` on
   `apps/windows/AcademicMarkdown.Windows/AcademicMarkdown.Windows.csproj`,
   with `win-x64`, self-contained .NET and Windows App SDK, no MSIX and no
   single-file publish.
8. Verify the published resource inventory equals the staged one; require the
   application and self-contained runtime outputs; copy the portable README and
   notices; generate `SHA256SUMS`; ZIP the entire directory; hash the ZIP.

Each attempt uses a unique `apps/windows/artifacts/build-*` directory. Failed
attempts remain available for diagnostics and are never uploaded by the
success-only artifact step. The script does not delete previous packages.

**Frozen install failure is a real failure.** The current dirty worktree may
have package/lockfile drift. Coordinate with the shared-package owner to update
and review the lockfile separately, then retry. Do not add
`--no-frozen-lockfile`, skip tests, weaken CSP, or omit a resource to obtain an
artifact. The packager does not edit root `package.json` or the lockfile.

## Resource-only staging and checks

Staging is build tooling and can run on macOS with Node and PowerShell 7. It
**never executes the downloaded Windows binary**. Build the editor first:

```powershell
pnpm build:web
./scripts/windows/Stage-Resources.ps1
node ./scripts/windows/resource-tools.mjs verify ./apps/windows/AcademicMarkdown.Windows/Resources
```

`Stage-Resources.ps1` caches verified upstream downloads under
`apps/windows/.cache/`. The upstream MSVC ZIP has exactly one entry,
`tectonic.exe`; an unexpected archive layout is rejected rather than blindly
extracted. The license is a separate pinned download.

For an offline developer build, supply a directory already containing the
exact pinned `tectonic.exe` and `LICENSE`:

```powershell
./scripts/windows/Stage-Resources.ps1 -TectonicDirectory C:/verified/tectonic-0.17.0
./scripts/windows/Build-Windows.ps1 -TectonicDirectory C:/verified/tectonic-0.17.0
```

Without PowerShell, a provisioned compiler directory can be staged using Node:

```sh
node scripts/windows/resource-tools.mjs stage . /absolute/verified/compiler /absolute/temporary/Resources
node scripts/windows/resource-tools.mjs verify /absolute/temporary/Resources
```

This lower-level operation does not rebuild `apps/editor/dist`; callers must
run `pnpm build:web` first. The complete Windows build always rebuilds it.
The source for `Web/` is **only `apps/editor/dist`**, never the potentially stale
macOS copied Web resources. TeX, logo and font supplements come from the existing
macOS resource directories but are checksum-pinned in the Windows manifest.
No macOS executable is copied.

The stager rejects missing/empty files, checksum mismatches, unsafe Windows
paths, case-insensitive duplicate outputs, symlinks/reparse-point resources,
and an editor entry without its restrictive script/network CSP. Notices are
copied byte-for-byte. All outputs are staged and verified before swapping in the
generated directory. If the old directory is unowned or manually modified,
staging refuses to overwrite it: move that directory aside yourself after
reviewing its contents, rather than using a force switch.

`runtime-resources.json` is at the root of `Resources/`:

```json
{
  "schemaVersion": 1,
  "compiler": "Tools/tectonic.exe",
  "supportBundle": "TeX/hcmut-offline-v1.ttb",
  "assets": [
    { "source": "Theme/Images/hcmut.png", "target": "Images/hcmut.png" },
    { "source": "Theme/Fonts/lmmonolt10-bold.otf", "target": "lmmonolt10-bold.otf" },
    { "source": "Theme/Fonts/lmmonolt10-boldoblique.otf", "target": "lmmonolt10-boldoblique.otf" },
    { "source": "Theme/Fonts/lmmono10-italic.otf", "target": "lmmono10-italic.otf" }
  ]
}
```

These are forward-slash relative paths for the generic native compiler. The
resource manifest does not authorize arbitrary document-controlled paths or
commands, and no HCMUT-specific compiler branch is required.

## Opt-in CI, later

`.github/workflows/windows.yml` has **only `workflow_dispatch`**, read-only
`contents` permission, immutable action revisions, and a Windows 2022 job. It
does not run on push, pull requests, or a schedule and does not create releases.
No remote has been created, pushed to, or dispatched by these packaging scripts.

Only after the user separately authorizes uploading the repository to a suitable
private GitHub repository:

1. Review whether all source/resources may be uploaded, including HCMUT artwork.
2. Push through the user's chosen workflow. The workflow file must be present
   on the default branch for the Actions manual-dispatch UI.
3. Open **Actions → Experimental Windows portable build (manual only)**.
4. Select the reviewed ref, check the private/experimental acknowledgement,
   and run the workflow.
5. Download the ZIP, its checksum, README and native test results only after
   every gate passes. Artifacts expire after seven days.

The workflow never uploads a successful-looking application on a failed smoke.
Hosted workflow execution/upload is a separate authorization step, not something
this local source change has performed.

## Acceptance still requiring Windows

- [ ] WinUI/XAML restore, build and publish with the pinned toolchain.
- [ ] Real bundled Tectonic `NativePdfSmoke` passes on Windows.
- [ ] Extracted ZIP launches on a clean x64 machine with WebView2 provisioned.
- [ ] Editor opens locally, remote navigation/download/permission restrictions hold.
- [ ] Vietnamese IME, keyboard shortcuts, search, visual/source editing and zoom.
- [ ] Open/save/save-as dialogs, dirty-close cancellation, atomic saves and conflicts.
- [ ] Export offline, all mono font styles/logo present, and HCMUT PDF comparison.
- [ ] Export cancellation, timeout and stale-result protection preserve prior PDFs.
- [ ] Signing/installer decisions, native dependency audit, TeX bundle provenance
      reconciliation, and explicit HCMUT logo redistribution rights.

The checked-in bundle currently hashes to
`24e1606f84ad2dfb051e1bebe1fb535a3e77252a871376ad597f56ff20a56255`;
its inherited notice names a different checksum and inventory. Both the actual
pin and the unresolved discrepancy travel with the private artifact. Preserving
the notice is not a claim that its inventory is correct for the current bytes.
Public distribution must wait for reconciliation and rights review.
