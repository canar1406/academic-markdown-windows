import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hcmutReportTheme } from '@markdown/theme-hcmut-report-v1';
import { exportMarkdownToLatex } from '../src/index.js';

describe('BTL HK232 report example', () => {
  it('exports the complete steepest-ascent report without diagnostics', () => {
    const fixture = readFileSync(
      new URL('../../../examples/btl-hk232-de1-steepest-ascent.md', import.meta.url),
      'utf8',
    );

    const result = exportMarkdownToLatex(fixture, hcmutReportTheme);

    expect(result.diagnostics).toEqual([]);
    expect(result.latex).toContain('TÌM ĐƯỜNG ĐI CÓ ĐỘ DỐC LỚN NHẤT');
    expect(result.latex).toContain('\\begin{theorem}');
    expect(result.latex).toContain('\\begin{lstlisting}');
    expect(result.latex).toContain('\\begin{tabular}');
    expect(result.latex).not.toContain('\\mathbf{u}');
    expect(result.assetPaths).toEqual([
      'assets/btl-hk232-contour.png',
      'assets/btl-hk232-surface.png',
    ]);

    const outputPath = process.env.BTL_REPORT_TEX_OUTPUT;
    if (outputPath) {
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, result.latex, 'utf8');
    }
  });
});
