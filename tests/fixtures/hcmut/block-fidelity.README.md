# Per-block Visual/TeX fidelity fixture

`block-fidelity.md` isolates the required HCMUT components on deterministic A4 pages. The JSON
manifest maps each component to a Visual page, PDF page, and normalized crop at 816 x 1154 pixels.

Run the pure measurement tests:

```bash
node --test scripts/test/block-fidelity-audit.test.mjs
pnpm --filter @markdown/latex-exporter exec vitest run test/block-fidelity-fixture.test.ts
```

Run the real Chromium + Tectonic + Poppler audit:

```bash
HCMUT_BLOCK_FIDELITY=1 \
pnpm --filter @markdown/editor exec playwright test \
  --config playwright.config.ts block-fidelity-capture.e2e.ts
```

The integration test writes PPM page rasters and `report.json`/`report.md` under
`output/pdf/block-fidelity-audit/`. It records exact status only when the shared PPM comparator
finds zero changed pixels for the configured crop and tolerance.

The page-break row is structural-only: the editable Visual surface intentionally displays an
interactive page-break marker, while TeX emits a non-printing `\\newpage`. The test instead proves
that the before/after anchors occupy consecutive A4 pages and that the exported command lies
between them.

The standalone browser test rewrites the fixture's relative figure path to its local test server.
The packaged app normally resolves that path through the native Swift host; the compiled PDF still
uses the canonical relative Markdown path.
