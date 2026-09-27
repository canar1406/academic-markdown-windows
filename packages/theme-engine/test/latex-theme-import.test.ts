import { describe, expect, it } from 'vitest';
import {
  analyzeLatexThemeImport,
  type LatexThemeImportEntry,
} from '../src/index.js';

const entries: LatexThemeImportEntry[] = [
  {
    path: 'Template/main.tex',
    bytes: String.raw`\input{khaibao}
\input{dinhdangsection}
\input{declare/frame_color}
%\input{Bìa/Bìa trước}
\begin{document}
\input{data/Lythuyet}
\end{document}`,
  },
  {
    path: 'Template/khaibao.tex',
    bytes: String.raw`\documentclass[11pt,openany]{book}
\usepackage{amsmath,tcolorbox,vntcbox,graphicx}
\usepackage[a4paper]{geometry}`,
  },
  { path: 'Template/dinhdangsection.tex', bytes: String.raw`\usepackage[book]{ex_test}\usepackage{fancyhdr}` },
  { path: 'Template/declare/frame_color.tex', bytes: '\\definecolor{chapternum}{RGB}{54,100,139}' },
  { path: 'Template/data/Lythuyet.tex', bytes: '\\chapter{Lý thuyết}' },
  { path: 'Template/Bìa/Bìa trước.tex', bytes: '\\begin{tikzpicture}\\end{tikzpicture}' },
  { path: 'Template/vntcbox.sty', bytes: '\\ProvidesPackage{vntcbox}' },
  { path: 'Template/ex_test.sty', bytes: '\\ProvidesPackage{ex_test}' },
  { path: 'Template/main.aux', bytes: 'generated' },
  { path: 'Template/main.pdf', bytes: new Uint8Array([1, 2]) },
  { path: 'Template/figure/logo.png', bytes: new Uint8Array([137, 80, 78, 71]) },
];

describe('lossless LaTeX theme import analysis', () => {
  it('builds a complete source graph and preserves inactive cover components', () => {
    const report = analyzeLatexThemeImport(entries, 'Template/main.tex');

    expect(report.lossless).toBe(true);
    expect(report.documentClass).toBe('book');
    expect(report.sourceGraph).toEqual([
      'Template/main.tex',
      'Template/khaibao.tex',
      'Template/dinhdangsection.tex',
      'Template/declare/frame_color.tex',
      'Template/data/Lythuyet.tex',
    ]);
    expect(report.protectedComponents).toContain('Template/Bìa/Bìa trước.tex');
    expect(report.localPackages).toEqual(['Template/ex_test.sty', 'Template/vntcbox.sty']);
    expect(report.externalPackages).toEqual(['amsmath', 'fancyhdr', 'geometry', 'graphicx', 'tcolorbox']);
    expect(report.generated).toEqual(['Template/main.aux']);
    expect(report.references).toEqual(['Template/main.pdf']);
    expect(report.runtimeAssets).toEqual(['Template/figure/logo.png']);
    expect(report.unresolved).toEqual([]);
  });

  it('marks import non-lossless when an active include is missing', () => {
    const report = analyzeLatexThemeImport([
      { path: 'Template/main.tex', bytes: '\\input{missing}\\begin{document}\\end{document}' },
    ], 'Template/main.tex');

    expect(report.lossless).toBe(false);
    expect(report.unresolved).toEqual(['Template/missing.tex']);
  });

  it('rejects unsafe entry paths before analysis', () => {
    expect(() => analyzeLatexThemeImport([
      { path: '../escape.tex', bytes: 'unsafe' },
    ], '../escape.tex')).toThrow('Unsafe LaTeX theme import path');
  });
});
