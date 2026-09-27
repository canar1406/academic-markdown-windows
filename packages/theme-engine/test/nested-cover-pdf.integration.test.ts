import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { expect, it } from 'vitest';
import { compileAuthoredTheme } from '../src/authored-theme.js';
import type { ThemeDocumentSettings } from '../src/index.js';

/** Opt-in narrow offline gate, not a whole-package PDF suite. Retains evidence
 * in the printed temporary directory for raster/geometry inspection. */
it.runIf(process.env.NESTED_COVER_PDF === '1')('compiles the nested fixture offline without lost font styles or overflowing boxes', () => {
  const root = resolve(import.meta.dirname, '../../..');
  const tectonic = process.env.TECTONIC_PATH ?? join(root, 'apps/macos/.build/apple/Products/Debug/MarkdownMacOS_MarkdownMacOS.bundle/Contents/Resources/Tools/tectonic');
  const bundle = join(root, 'apps/macos/Sources/MarkdownMacOS/Resources/TeX/hcmut-offline-v1.ttb');
  const scene: unknown = JSON.parse(readFileSync(join(root, 'tests/fixtures/themes/nested-cover-scene.json'), 'utf8'));
  const result = compileAuthoredTheme({ schemaVersion: 1, id: 'nested-cover-fixture', version: '1.0.0', name: 'Bìa lồng', scene });
  expect(result.errors).toEqual([]);
  const settings: ThemeDocumentSettings = {
    title: 'Fixture report', faculty: '', reportType: '', footerLeft: '',
    includeCover: true, includeToc: false, includeListOfFigures: false, includeListOfTables: false,
  };
  const workspace = mkdtempSync(join(tmpdir(), 'nested-cover-pdf-gate-'));
  console.info(`Nested cover PDF evidence: ${workspace}`);
  const tex = result.theme!.renderDocument(result.theme!.renderStructureBlock!('cover', settings), settings);
  writeFileSync(join(workspace, 'report.tex'), tex);
  const output = execFileSync(tectonic, [
    '--untrusted', '--only-cached', '--bundle', bundle, '--keep-logs', '--keep-intermediates',
    '--outdir', workspace, join(workspace, 'report.tex'),
  ], { cwd: workspace, encoding: 'utf8', timeout: 60_000 });
  writeFileSync(join(workspace, 'compile.stdout.log'), output);
  const log = readFileSync(join(workspace, 'report.log'), 'utf8');
  expect(log).not.toMatch(/Font shape .* (?:undefined|not available)|Missing character:|Overfull \\[hv]box/u);
  expect(readFileSync(join(workspace, 'report.pdf')).subarray(0, 5).toString()).toBe('%PDF-');
}, 65_000);
