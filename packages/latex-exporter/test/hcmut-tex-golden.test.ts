import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hcmutReportTheme } from '@markdown/theme-hcmut-report-v1';
import { exportMarkdownToLatex } from '../src/index.js';

describe('HCMUT deterministic TeX golden', () => {
  it('matches the approved normalized-theme output for the canonical fixture', () => {
    const fixtureUrl = new URL('../../../themes/hcmut-report-v1/fixtures/golden.md', import.meta.url);
    const expectedUrl = new URL('../../../themes/hcmut-report-v1/expected/golden.tex', import.meta.url);
    const result = exportMarkdownToLatex(readFileSync(fixtureUrl, 'utf8'), hcmutReportTheme);

    expect(result.diagnostics).toEqual([]);
    expect(result.latex).toBe(readFileSync(expectedUrl, 'utf8'));
  });
});
