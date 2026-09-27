# Upstream Provenance

## Muya

- Package: `@muyajs/core@0.2.0`
- Git tag: `v0.2.0`
- Pinned commit: `dfcdb8b757ff41c6e83950e86597daa86a8fc0b7`
- Tag object: `9754ac15c31d3466de9d89eec59ede4dcd580a8b`
- npm integrity: `sha512-KmvFfbWoNbrPH3YswHNfPxzLeYR/qFm0A9Z2BwtWvXN7LPEXAgvvoBIt9/M8WoKLYHiDFd5I5Hgklv49YcUXHQ==`

Muya is kept as an upstream dependency and hosted in the local `WKWebView` editor. The standard MarkText UI plugins (front block menu, slash insert menu, inline format toolbar, image/table tools, and preview tools) are registered in `apps/editor/src/muya-plugins.ts`; LMX commands are appended as an academic group. The upstream selection, history, clipboard, and IME internals are not modified.

Before updating Muya, run the editor unit tests, source-mode Playwright smoke test, and Swift bridge tests. Preserve the MIT license notice in `THIRD_PARTY_NOTICES.md`.
