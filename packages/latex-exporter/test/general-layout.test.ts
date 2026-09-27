import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { replaceFrontMatterValue } from '@markdown/document-core';
import { hcmutReportTheme } from '@markdown/theme-hcmut-report-v1';
import { exportMarkdownToLatex } from '../src/index.js';

const scene = JSON.parse(readFileSync(new URL('../../../tests/fixtures/themes/general-layout-scene.json', import.meta.url), 'utf8'));
const source = (body: string) => replaceFrontMatterValue(body, ['lmx', 'authoredTheme'], {
  schemaVersion: 1, id: 'general-layout', version: '1.0.0', name: 'General builder', scene,
}).source;

it('auto-includes root sections once and respects explicit markers nested inside style without changing report source', () => {
  const automatic = exportMarkdownToLatex(source('REPORT BODY\n'), hcmutReportTheme);
  expect(automatic.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  expect(automatic.latex.match(/Nguyễn Ánh/g)).toHaveLength(1);
  const explicit = exportMarkdownToLatex(source('BEFORE\n\n:::style {color="#204060"}\n:::theme-layout {node="intro"}\n:::\n:::\n\nAFTER\n'), hcmutReportTheme);
  expect(explicit.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  expect(explicit.settings.explicitThemeLayoutNodes).toEqual(['intro']);
  expect(explicit.latex.match(/Nguyễn Ánh/g)).toHaveLength(1);
  expect(explicit.latex.indexOf('BEFORE')).toBeLessThan(explicit.latex.indexOf('Nguyễn Ánh'));
  expect(explicit.latex.indexOf('Nguyễn Ánh')).toBeLessThan(explicit.latex.indexOf('AFTER'));
  expect(explicit.assetPaths).toEqual([]);
  expect(explicit.latex).not.toContain('Images/hcmut.png');
});

it('rejects unknown IDs, non-layout IDs, missing node, extra properties and marker body rather than dropping content', () => {
  for (const marker of [
    ':::theme-layout {node="missing"}\n:::\n', ':::theme-layout\n:::\n',
    ':::theme-layout {node="page"}\n:::\n', ':::theme-layout {node="intro" script="x"}\n:::\n',
    ':::theme-layout {node="intro"}\nDO NOT DROP\n:::\n',
  ]) {
    const result = exportMarkdownToLatex(source(marker), hcmutReportTheme);
    expect(result.latex).toBe('');
    expect(result.diagnostics.some(d => d.severity === 'error')).toBe(true);
  }
  expect(exportMarkdownToLatex(':::theme-layout {node="intro"}\n:::\n', hcmutReportTheme).latex).toBe('');
});
