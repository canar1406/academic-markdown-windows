import { describe, expect, it } from 'vitest';
import {
  analyzeLatexThemeImport,
  buildThemeCatalog,
  classifyLatexThemeArtifact,
  discoverLatexThemeProjects,
  inferLatexCompilerProfile,
  type LatexThemeImportEntry,
  type ThemeCatalogEntry,
} from '../src/index.js';

describe('lossless theme import standard', () => {
  it('discovers independent LaTeX projects and applies one artifact taxonomy', () => {
    const entries: LatexThemeImportEntry[] = [
      { path: 'collection/Report/main.tex', bytes: '\\input{chapters/intro}\\begin{document}\\end{document}' },
      { path: 'collection/Report/chapters/intro.tex', bytes: 'Intro' },
      { path: 'collection/Report/figures/logo.png', bytes: new Uint8Array([1]) },
      { path: 'collection/Report/main.aux', bytes: 'generated' },
      { path: 'collection/Slides/main.tex', bytes: '\\documentclass{beamer}' },
      { path: 'collection/Slides/main.pdf', bytes: new Uint8Array([1]) },
    ];

    expect(discoverLatexThemeProjects(entries)).toEqual([
      { root: 'collection/Report', entrypoint: 'collection/Report/main.tex', documentClass: null },
      { root: 'collection/Slides', entrypoint: 'collection/Slides/main.tex', documentClass: 'beamer' },
    ]);
    expect(classifyLatexThemeArtifact('collection/Report/main.aux')).toBe('generated');
    expect(classifyLatexThemeArtifact('collection/Report/main.pdf')).toBe('reference');
    expect(classifyLatexThemeArtifact('collection/Report/figures/logo.png')).toBe('runtime-asset');
    expect(classifyLatexThemeArtifact('collection/Report/chapters/intro.tex')).toBe('source');
  });

  it('discovers an archive-root project without inventing a root directory', () => {
    expect(discoverLatexThemeProjects([
      { path: 'main.tex', bytes: '\\documentclass{article}\\begin{document}Hi\\end{document}' },
    ])).toEqual([{
      root: '',
      entrypoint: 'main.tex',
      documentClass: 'article',
    }]);
  });

  it('rejects unsafe or duplicate archive paths during project discovery', () => {
    expect(() => discoverLatexThemeProjects([
      { path: '../main.tex', bytes: '\\documentclass{article}' },
    ])).toThrow('Unsafe LaTeX theme import path: ../main.tex');
    expect(() => discoverLatexThemeProjects([
      { path: 'Theme/main.tex', bytes: '\\documentclass{article}' },
      { path: 'Theme/main.tex', bytes: '\\documentclass{book}' },
    ])).toThrow('Duplicate LaTeX theme import path: Theme/main.tex');
  });

  it('keeps all source logic as protected raw components and reports unsafe escapes', () => {
    const entries: LatexThemeImportEntry[] = [
      {
        path: 'Report/main.tex',
        bytes: '\\input{chapters/intro}\\input{../outside}\\input{/etc/passwd}\\input{C:/secret}\\begin{document}\\end{document}',
      },
      { path: 'Report/chapters/intro.tex', bytes: '\\newcommand{\\x}{x}' },
      { path: 'outside.tex', bytes: 'must not be reached' },
      { path: 'Report/etc/passwd.tex', bytes: 'absolute path alias must not be reached' },
      { path: 'Report/C:/secret.tex', bytes: 'drive path alias must not be reached' },
      { path: 'Report/unused.sty', bytes: '\\ProvidesPackage{unused}' },
    ];

    const report = analyzeLatexThemeImport(entries, 'Report/main.tex');

    expect(report.lossless).toBe(false);
    expect(report.unresolved).toEqual([
      'Report/../outside.tex',
      'Report//etc/passwd.tex',
      'Report/C:/secret.tex',
    ]);
    expect(report.compatibility.unsafe).toEqual(report.unresolved);
    expect(report.sourceGraph).toEqual([
      'Report/main.tex',
      'Report/chapters/intro.tex',
    ]);
    expect(report.protectedComponents).toContain('Report/unused.sty');
    expect(report.rawComponents?.find((item) => item.path === 'Report/chapters/intro.tex')).toMatchObject({
      path: 'Report/chapters/intro.tex',
      source: '\\newcommand{\\x}{x}',
      dependencies: [],
    });
    expect(report.compatibility?.dropped).toEqual([]);
    expect(report.compatibility?.approximated).toEqual([]);
  });

  it('infers conservative compiler candidates and shell-escape requirements', () => {
    expect(inferLatexCompilerProfile([
      '\\usepackage{fontspec}',
      '\\usepackage{minted}',
    ])).toEqual({
      engines: ['xelatex', 'lualatex'],
      shellEscape: true,
      reasons: [
        'fontspec or OpenType font commands require XeLaTeX or LuaLaTeX.',
        'minted or explicit write18 commands require shell escape.',
      ],
    });
    expect(inferLatexCompilerProfile(['\\documentclass{article}'])).toEqual({
      engines: ['pdflatex', 'xelatex', 'lualatex'],
      shellEscape: false,
      reasons: ['No engine-specific source requirement was detected.'],
    });
  });

  it('builds deterministic catalog metadata without installation paths', () => {
    const entries: ThemeCatalogEntry[] = [
      { id: 'z-theme', name: 'Z', version: '1.0.0', engine: 'latex', compatibility: { app: '>=1', exporter: '>=1' }, digest: 'sha256-z', source: 'imported', category: 'book-textbook', tags: ['book'] },
      { id: 'a-theme', name: 'A', version: '2.0.0', engine: 'latex', compatibility: { app: '>=1', exporter: '>=1' }, digest: 'sha256-a', source: 'bundled', category: 'report-project', tags: ['report'] },
    ];
    expect(buildThemeCatalog(entries)).toEqual({
      schemaVersion: 1,
      themes: [entries[1], entries[0]],
    });
  });
});
