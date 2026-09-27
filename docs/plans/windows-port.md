# Windows engineering slice

Architecture: ADR 010. The user approved continuing with WinUI 3 + WebView2,
and does not have a Windows machine or runner.

## Deliverable and boundaries

Create a buildable first Windows shell around the existing shared editor.
Do not claim a working `.exe` until an actual Windows build/runtime check exists.
No remote upload, paid VM, code-signing, or installer publication is authorized.
Do not discard the existing dirty integration worktree or change macOS behavior.

## Implementation order

1. **Record architecture exception and transport contract.**
   Preserve bridge v1; use editor/document HTTPS virtual hosts as in ADR 010.
2. **Shared host adapter, in parallel with native code.**
   Test WKWebView, WebView2, malformed messages, and document-image resolution.
   Keep CSP restrictive. Run editor typecheck and focused regression tests.
3. **Portable Windows shell core.**
   Test strict envelope/response decoding, request correlation/timeouts,
   safe asset paths including Windows-specific attacks, strict UTF-8 reading,
   atomic saves/conflict detection, and document/revision-based stale results.
   Keep parsing/theme/export semantics in TypeScript.
4. **WinUI shell.**
   Local editor hosting, new/open/save/save-as, unsaved-change confirmation,
   Visual/Source, Find/Replace, zoom, export status/cancel, and system PDF opening.
   File/resource/process work is asynchronous, outside the UI thread.
5. **Tectonic coordinator.**
   Stage validated assets and trusted resources in an isolated directory.
   Use bundled Windows executable and support bundle, no shell execution.
   Drain both log streams, cancel the process tree, bound build duration,
   reject stale results before touching the chosen PDF output.
6. **Repeatable packaging.**
   PowerShell resource staging/build/ZIP and opt-in Windows CI. Validate resources,
   carry notices, and fail on missing compiler/fonts/bundle/editor rather than
   emitting an apparently complete app. No automatic release or source upload.
7. **Verification and handoff.**
   Run local portable gates. Record Windows-only gates as pending, not passed.
   Document exact commands, artifact layout, limitations, and how to activate
   cloud build later without owning a Windows computer.

## Acceptance checklist

- [x] Shared transport tests and Chromium bundled-editor smoke pass.
- [x] Portable C# core builds and tests on the current host.
- [x] Unknown/malformed bridge input is rejected without granting native commands.
- [x] File IO tests preserve Vietnamese, YAML, and malformed source exactly.
- [x] Core tests reject external modification, cancelled writes, stale document/revision results.
- [x] Open-same-file-after-Save regression fixed; path-only native Save contract tested.
- [x] Resources staged and verified with checksums/notices; PowerShell gates tested.
- [x] C# compiler orchestration produces an HCMUT PDF with native macOS Tectonic.
- [ ] Full macOS app runtime retest after rebuilding its editor bundle.
- [ ] Native Windows Save/close guard and export cancellation/stale-result interaction accepted.
- [ ] Windows WinUI build succeeds on a Windows runner.
- [ ] Windows live edit/open/save/find/export smoke checks pass.
- [ ] Vietnamese IME and offline PDF/theme resources verified on Windows.

Windows gates require an environment that is not currently available.
Theme Studio native authoring, sidebar parity, installer signing, ARM64, and
public redistribution approval are subsequent work, not hidden completion claims.

Checkpoint and exact evidence: `docs/windows-checkpoint-20260927.md`.
The full build was attempted and stops at Windows SDK `mt.exe` on macOS.
No skip/bypass was added to call that build successful.
