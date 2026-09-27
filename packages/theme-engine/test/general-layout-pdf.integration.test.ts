import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { expect, it } from 'vitest';
import { compileAuthoredTheme } from '../src/authored-theme.js';

it.runIf(process.env.GENERAL_LAYOUT_PDF === '1')('compiles a general section, ratio row, background and labeled image placeholder offline', () => {
  const root = resolve(import.meta.dirname, '../../..');
  const tectonic = process.env.TECTONIC_PATH ?? join(root, 'apps/macos/.build/apple/Products/Release/MarkdownMacOS_MarkdownMacOS.bundle/Contents/Resources/Tools/tectonic');
  const bundle = join(root, 'apps/macos/Sources/MarkdownMacOS/Resources/TeX/hcmut-offline-v1.ttb');
  const scene: unknown = JSON.parse(readFileSync(join(root, 'tests/fixtures/themes/general-layout-scene.json'), 'utf8'));
  const result = compileAuthoredTheme({ schemaVersion: 1, id: 'general-layout', version: '1.0.0', name: 'General builder', scene });
  expect(result.errors).toEqual([]);
  const workspace = mkdtempSync(join(tmpdir(), 'general-layout-pdf-gate-'));
  console.info(`General layout PDF evidence: ${workspace}`);
  const tex = result.theme!.renderDocument('Báo cáo thật — nội dung giữ nguyên.\\par\n', {
    title: 'Report', faculty: '', reportType: '', footerLeft: '',
    includeCover: false, includeToc: false, includeListOfFigures: false, includeListOfTables: false,
  });
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
