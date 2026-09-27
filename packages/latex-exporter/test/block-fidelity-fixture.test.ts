import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hcmutReportTheme } from '@markdown/theme-hcmut-report-v1';
import { exportMarkdownToLatex } from '../src/index.js';
import {
  REQUIRED_BLOCK_FIDELITY_IDS,
  validateBlockFidelityManifest,
} from '../../../scripts/block-fidelity-audit.mjs';

const projectRoot = resolve(import.meta.dirname, '../../..');
const source = readFileSync(
  resolve(projectRoot, 'tests/fixtures/hcmut/block-fidelity.md'),
  'utf8',
);
const manifest = JSON.parse(readFileSync(
  resolve(projectRoot, 'tests/fixtures/hcmut/block-fidelity-manifest.json'),
  'utf8',
));

describe('per-block visual fidelity fixture', () => {
  it('covers every requested block with a deterministic page crop', () => {
    expect(() => validateBlockFidelityManifest(manifest)).not.toThrow();
    expect(manifest.blocks.map((block: { id: string }) => block.id).sort())
      .toEqual([...REQUIRED_BLOCK_FIDELITY_IDS].sort());
  });

  it('exports every fixture block without diagnostics and records its figure asset', () => {
    const exported = exportMarkdownToLatex(source, hcmutReportTheme);

    expect(exported.diagnostics).toEqual([]);
    expect(exported.assetPaths).toEqual(['apps/editor/test/fixtures/block-fidelity.png']);
    for (const environment of ['theorem', 'property', 'proposition', 'corollary', 'lemma', 'exer']) {
      expect(exported.latex).toContain(`\\begin{${environment}}`);
    }
    expect(exported.latex).toContain('\\int_0^{2\\pi} \\sin^2(x)\\,dx = \\pi');
    expect(exported.latex).toContain(
      '\\includegraphics[width=0.45\\textwidth]{\\detokenize{apps/editor/test/fixtures/block-fidelity.png}}',
    );
    expect(exported.latex).toContain('\\caption{Giá trị gần đúng của tích phân}');
    expect(exported.latex).toContain('\\begin{lstlisting}');
  });

  it.runIf(Boolean(process.env.BLOCK_FIDELITY_EXPORT_DIR))(
    'writes the deterministic TeX input used by the browser/PDF audit',
    () => {
      const outputDirectory = process.env.BLOCK_FIDELITY_EXPORT_DIR;
      if (!outputDirectory) throw new Error('BLOCK_FIDELITY_EXPORT_DIR is required.');
      const exported = exportMarkdownToLatex(source, hcmutReportTheme);
      expect(exported.diagnostics).toEqual([]);
      mkdirSync(outputDirectory, { recursive: true });
      writeFileSync(resolve(outputDirectory, 'report.tex'), exported.latex, 'utf8');
      writeFileSync(resolve(outputDirectory, 'export-metadata.json'), `${JSON.stringify({
        assetPaths: exported.assetPaths,
      }, null, 2)}\n`, 'utf8');
    },
  );
});
