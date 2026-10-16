# Private Windows cloud build

## User authorization

The user explicitly approved uploading source to a **private** GitHub repository
and running the prepared Windows workflow. This does not authorize making the
repository public, publishing a release, purchasing infrastructure, or changing
account billing.

## Repository and local snapshot

- GitHub repository: `canar1406/academic-markdown-windows`.
- Verified `private: true` before pushing.
- Local build snapshot: `/Users/Heavietnam/Desktop/academic-markdown-windows-build`.
- Integration source: `/Users/Heavietnam/Desktop/markdown-worktrees/zoom`.
- Initial snapshot commit: `d494c6cfe18af93801e08bd262e86c77c874ee3c`.
- First workflow run: `36293375875`.

The snapshot is a separate Git repository, not a reset/commit of the dirty
integration worktree. Only shared/editor/Windows source, fixtures, build scripts,
required resources/notices, and relevant technical documentation were copied.
The macOS native application source, unneeded original template archives, old Git
history, machine configuration, credentials, caches and generated binaries
were excluded. A bounded token/private-key pattern scan found no credentials
in selected text files. This is not a full security or license audit.

The two lossless-import suites require `Template.zip` and `Template Latex.zip`.
They were added in a follow-up snapshot after scanning 1,098 text entries:
no credential-pattern matches, symlinks, or unsafe archive entry paths were
found. They remain private conformance fixtures, not public distribution assets.

`.gitattributes` preserves LF text and binary resource bytes on Windows checkout.
Upstream license text and its whitespace were preserved, not reformatted.

Upload manifest is local-only:
`output/windows-cloud-build/upload-manifest.json`.

## Workflow and delivery

The existing manual-only workflow runs on `windows-2022` with read-only repository
permissions. Build artifacts are uploaded only after all configured gates pass.
No public release is created. WinUI runtime/UI acceptance remains distinct from
successful compilation and offline Tectonic smoke.

## Run history

1. `36293375875`, commit `d494c6c`: failed at the shared theme-import tests.
   Both suites invoked macOS-only `/usr/bin/ditto` on Windows. No gate was skipped.
2. `36293642337`, commit `e82b931`, branch `codex/windows-ci`: adds the required
   original archive fixtures and a platform-aware test extraction helper.
   `Expand-Archive` then failed because its destination handling treated brackets
   in the fixture directory as glob syntax.
3. `36293783375`, commit `9d4392e`: uses .NET `ZipFile.ExtractToDirectory` from
   PowerShell with environment-supplied literal paths. All 1,264 archive file
   bytes/names were independently verified locally; the archive tests passed on
   Windows. The next failure identified a missing example-report fixture.
4. `36293994714`, commit `7d34a4e`: includes the example report and its assets.
   Shared gates passed. The actual Windows PDF smoke exposed a Tectonic path
   issue: drive-letter paths were interpreted as URL schemes.
5. **`36294296801`, commit `549fbfa`: successful Windows build/publish/package.**
   Uses `file:///` URIs for the local TeX bundle, following Tectonic's URL-first
   bundle resolver. Shared gates, packaging gates, real Windows Tectonic smoke
   and WinUI full build all passed. Native tests: **52 passed, 1 explicitly
   skipped** (symlink privilege fixture). WinUI: **0 warnings, 0 errors**.
   Private artifact ID: `10923412696`.
   Portable ZIP SHA-256:
   `7da66cfd663f50866c7eea5014263ada5e8fa9fde28d8c8f6dd8b34f8ed40ff3`.
6. `36294844607`, commit `c4528ec`: adds a native startup gate using Windows UI
   Automation, requiring the real WinUI status to confirm both `editor.ready`
   and document-load acknowledgement. The gate failed: process exited with
   `0xc000027b` before readiness. The earlier build-only ZIP is **not accepted
   for delivery as a working app**.
7. `36296686981`, commit `3d88085`: opt-in diagnostic stages localize the crash
   to application resource initialization, before window construction. Windows
   reports a fault in `Microsoft.UI.Xaml.dll`; no managed exception was surfaced.
   A missing code-only XAML metadata-provider registration is under investigation.
8. `36297091984`, commit `7dd6278`: handwritten metadata-provider forwarding
   compiled but did not resolve the startup crash.
9. `36297600596`, commit `ba62493`: switched to generated `App.xaml` application
   initialization. Full build passed; diagnostics now reach
   `application-initialized`, `window-creating`, and `window-activating`, then
   native `Microsoft.UI.Xaml.dll` faults with `0xc000027b`. Startup remains failed.

## Handoff state — 01/10/2026

The nine runs above were reread; none is running. Repository remains private.
`codex/windows-ci` HEAD is `ba62493`; default `main` is not yet updated with its fixes.
The integration worktree contains an additional CDB diagnostic branch in
`scripts/windows/Test-Startup.ps1`, not copied/committed to the snapshot and not
run on Windows. Review before publishing it.

The build-only ZIP from run `36294296801` is now present under
`/Users/Heavietnam/Desktop/Academic-Markdown-Windows/`; its SHA-256 was rechecked
and matches the hash above. It is not accepted for functional delivery because
the later startup gate failed.

Full handoff: `/Users/Heavietnam/Desktop/markdown/CLAUDE_HANDOFF.md`.
Read-only status/CI snapshots and the unpublished diagnostic patch are under
`docs/handoff/2026-10-01/`.

The original integration worktree receives code fixes without changing its Git
index. The isolated snapshot repository is the only repository committed/pushed
by this cloud-build workflow.

No Windows executable is run on the user's macOS machine. A successful native
startup smoke is still not full manual IME/drag/drop/Theme Studio acceptance.

## Follow-up - 2026-10-17

The user requested uploading the current source and building an EXE. GitHub
authentication and `private: true` were rechecked before preparing the upload.
The separate snapshot is clean on `codex/windows-ci`, at `d3a9f568742d141a0877558b6cfe7cf1d056724f`.

Live Actions history supersedes the old 2026-10-01 handoff: run `36967247682`
on 2026-10-02 passed the complete workflow, including the native startup gate.
The MenuBar and InfoBar resource-lookup crashes were addressed by replacing
those controls with the existing button/flyout and notice-grid implementation.
Those fixes already match the integration source and must not be reverted.

The current upload includes the newly verified editor composition/pagination,
portable theme bindings/starters, updated shared exporter and regression tests.
macOS native shell source, credentials, local configuration, generated test
results, caches and build products remain excluded from this Windows snapshot.
The integration worktree's Git index is not staged or committed.

The new workflow must pass before its artifact is accepted. The historical
October 2 artifact is not delivery of the October 17 source. Build/run identity,
checksums and the downloaded artifact are recorded in the local QC evidence
directory and updated here after verification. This is an unsigned private
engineering build, not a public release or Windows Theme Studio UI parity.

### Verified current-source Windows run

- Source commit: `00dfb0cbd1e28509636fe93e7594a1cdebf50f70`.
- Branch: `codex/windows-ci`; repository remains private.
- Run: `38938608742`, requested and completed on 2026-10-17 local time.
- Job duration: 5 minutes 35 seconds.
- Frozen shared gates, fresh web bundle and pinned resource staging: passed.
- Windows native core: 52 passed, zero failed, one skipped symlink-privilege test.
- Real bundled Windows Tectonic/offline PDF smoke: passed.
- WinUI build: zero warnings and zero errors; publish/package passed.
- Native startup: real WinUI window, editor.ready and document-load
  acknowledgement visible; smoke passed.
- Private artifact: `12062681389`, `AcademicMarkdown-windows-x64-experimental`.
- Portable ZIP SHA-256:
  `fcb405805c73c876904eb5cf7f135037a9c9add4e1e36ee4da43841298bfaf58`.

The runner warns that the pinned action implementations target deprecated
Node 20 and are being hosted on Node 24. The application's pinned Node 22/pnpm
toolchain and all required gates still pass; no dependency pins were silently
changed for this run.

The output is a full portable directory/ZIP containing
`AcademicMarkdown.Windows.exe`, runtime DLLs and Resources, not a standalone
single-file EXE. Downloaded bytes and the complete checksum inventory must be
verified before local delivery. CI evidence and the local verification result
are retained in `results.json` under the editor/Studio QC evidence directory.

### Local delivery verified

The new artifact is downloaded to
`/Users/Heavietnam/Desktop/Academic-Markdown-Windows-20261017/`.
Its ZIP matches the CI SHA-256, ZIP CRC validation passes, and all 1,202
published file checksums and the resource inventory match. Both the application
and bundled compiler have Windows x64 PE headers. The downloaded TRX and startup
report independently confirm the native PDF smoke and Ready/load acknowledgement.
No Windows executable is run on macOS.

Executable:
`/Users/Heavietnam/Desktop/Academic-Markdown-Windows-20261017/AcademicMarkdown-windows-x64-experimental/AcademicMarkdown.Windows.exe`.
Keep its complete extracted directory together; do not substitute the old
September build in `Desktop/Academic-Markdown-Windows`.
`verification.json` in the new delivery directory records the verified paths,
hashes and scoped acceptance. This remains unsigned, private and experimental.
