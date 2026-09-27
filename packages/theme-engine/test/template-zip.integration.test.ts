import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeLatexThemeImport, type LatexThemeImportEntry } from '../src/index.js';
import { extractArchiveFixture } from './helpers/archive-fixture.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const archive = join(repositoryRoot, 'Template.zip');
let staging = '';
let entries: LatexThemeImportEntry[] = [];
let report: ReturnType<typeof analyzeLatexThemeImport>;

beforeAll(() => {
  staging = mkdtempSync(join(tmpdir(), "academic-template-import-Tiếng Việt '[fixture]-"));
  extractArchiveFixture(archive, staging);
  entries = [];
  collectEntries(staging, staging, entries);
  report = analyzeLatexThemeImport(entries, 'Template/main.tex');
}, 120_000);

afterAll(() => {
  if (staging) rmSync(staging, { recursive: true, force: true });
});

describe('Template.zip lossless conformance fixture', () => {
  it('resolves every active TeX include and local package', () => {
    expect(report.unresolved).toEqual([]);
    expect(report.lossless).toBe(true);
    expect(report.documentClass).toBe('book');
    expect(report.sourceGraph).toEqual(expect.arrayContaining([
      'Template/main.tex',
      'Template/khaibao.tex',
      'Template/dinhdangsection.tex',
      'Template/declare/frame_box.tex',
      'Template/declare/frame_color.tex',
      'Template/declare/renewcommand.tex',
      'Template/declare/TN_CTM.tex',
      'Template/data/Lythuyet.tex',
      'Template/data/Vidu.tex',
      'Template/data/Baitap.tex',
    ]));
    expect(report.localPackages).toEqual(expect.arrayContaining([
      'Template/ex_test.sty',
      'Template/vntcbox.sty',
    ]));
  });

  it('preserves all inactive/custom TeX sources as protected components', () => {
    expect(report.protectedComponents).toEqual(expect.arrayContaining([
      'Template/Bìa/Bìa trước.tex',
      'Template/Bìa/Bìa trong.tex',
      'Template/Bìa/Bìa sau.tex',
      'Template/declare/KhaiBao-tcolorbox.tex',
    ]));
  });

  it('classifies generated artifacts separately from runtime sources', () => {
    expect(report.generated).toEqual(expect.arrayContaining([
      'Template/main.aux',
      'Template/main.log',
      'Template/main.out',
      'Template/main.synctex.gz',
      'Template/main.toc',
    ]));
    expect(report.references).toContain('Template/main.pdf');
  });

  it('accounts for every in-root file and preserves every LaTeX source byte-for-byte', () => {
    const projectEntries = entriesForRoot(report.projectRoot);
    expect(report.artifacts.map((artifact) => artifact.path)).toEqual(
      projectEntries.map((entry) => entry.path).sort((left, right) => left.localeCompare(right)),
    );
    expect(report.artifacts.reduce((sum, artifact) => sum + artifact.byteLength, 0)).toBe(
      projectEntries.reduce((sum, entry) => sum + byteLength(entry.bytes), 0),
    );
    const sourceEntries = projectEntries.filter((entry) => (
      typeof entry.bytes === 'string' && /\.(?:tex|sty|cls|bib)$/i.test(entry.path)
    ));
    expect(report.rawComponents).toHaveLength(sourceEntries.length);
    for (const source of sourceEntries) {
      expect(report.rawComponents.find((component) => component.path === source.path)?.source).toBe(source.bytes);
    }
    expect(report.compatibility.dropped).toEqual([]);
  });
});

function entriesForRoot(root: string): LatexThemeImportEntry[] {
  return entries.filter((entry) => root === '' || entry.path.startsWith(`${root}/`));
}

function byteLength(bytes: string | Uint8Array): number {
  return typeof bytes === 'string' ? Buffer.byteLength(bytes, 'utf8') : bytes.byteLength;
}

function collectEntries(root: string, directory: string, entries: LatexThemeImportEntry[]): void {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, item.name);
    if (item.isDirectory()) {
      collectEntries(root, absolute, entries);
      continue;
    }
    if (!item.isFile()) continue;
    const path = relative(root, absolute).split('\\').join('/');
    const data = readFileSync(absolute);
    const textLike = /\.(?:tex|sty|cls|md|txt|bib)$/i.test(path);
    entries.push({ path, bytes: textLike ? data.toString('utf8') : new Uint8Array(data) });
  }
}
