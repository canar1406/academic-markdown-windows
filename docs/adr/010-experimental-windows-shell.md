# ADR 010 — Experimental Windows shell before macOS 1.0

Status: accepted for implementation by the user's request for a Windows version
and subsequent instruction to continue. This is **not** release acceptance.

## Context

The original plan deferred Windows until macOS 1.0. The user has now explicitly
requested Windows and confirmed that they have neither a Windows computer nor
a Windows runner. The current development host is macOS. No Git remote is
configured. Existing macOS/Theme Studio work remains unfinished and must not be
reset or represented as complete.

## Decision

Allow a parallel, experimental Windows implementation now, without relaxing
any document, security, export, or macOS architecture invariant.

- Native WinUI 3 shell with WebView2, targeting Windows 10 2004+/11 x64.
- Reuse the bundled `apps/editor` build and shared TypeScript packages unchanged
  in their semantic responsibilities. No Electron and no end-user Node runtime.
- Preserve bridge envelope version 1. Add a WebView2 transport, not a second
  document format, parser, or exporter.
- Native C# owns file dialogs, UTF-8 atomic writes, external-change checks,
  Windows lifecycle, and cancellable Tectonic process execution.
- TeX compilation remains authoritative. No WebView printing fallback.
- Separate platform-neutral native IO/bridge/compiler coordination code from
  WinUI APIs so it can be tested on this macOS host with a local .NET SDK.
- Use a self-contained, unpackaged directory/ZIP for initial engineering
  artifacts. A signed installer, single executable, and Store release are not
  promised.

## Trust boundaries

The bundled editor loads at `https://editor.academic-markdown.invalid/index.html`
through a local virtual-host mapping. Document images are served separately at
`https://document.academic-markdown.invalid/` by a narrow native request handler,
not by exposing the document folder. Only allowlisted image types under the
selected document root may be read. Reject path traversal, Windows device names,
alternate data streams, and reparse-point/symlink escapes.

Validate source origin and envelope shape before handling WebView messages.
Native messages use `PostWebMessageAsJson`; no user-text JavaScript interpolation.
Block remote/privileged navigation, pop-ups, permissions, and downloads.
User-initiated HTTPS/HTTP/mail links may be handed to the system browser.

Compile in an isolated temporary directory with explicit argument arrays,
`--untrusted`, `--only-cached`, and a bundled offline support bundle. Do not expose
generic filesystem or process commands to Markdown or JavaScript. Refuse stale
export results by document identity and revision; preserve existing output on
failure.

## Build and distribution

Prepare a local PowerShell build/package script and a **manual-dispatch**
Windows workflow. The workflow will be inert until the user authorizes hosting
the repository on a compatible service. Do not create a repository, upload
source, trigger paid infrastructure, or publish releases automatically.

Pin compiler/SDK dependencies and verify downloaded compiler checksums. Carry
licenses and provenance with resources. Public redistribution of the supplied
HCMUT logo remains a separate gate.

## Compatibility and migration

No Markdown, LMX, front-matter, theme, or envelope version migration is required.
Existing macOS `window.webkit.messageHandlers.bridge` remains supported.
Windows native Theme Studio UI is **not** part of this first shell slice;
documents using shared theme metadata continue to use the shared exporter.
Unfinished general-builder work is not a claim of Windows feature parity.

## Verification and limitations

Locally verify TypeScript transport, editor build, and portable C# unit tests.
WinUI/XAML compilation, WebView2 interaction, native file dialogs, Windows IME,
offline Tectonic, and install/uninstall need a real Windows run. Until those
gates run, the result is source/build infrastructure, not a tested Windows app.
