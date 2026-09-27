import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeLatexThemeImport, discoverLatexThemeProjects, type LatexThemeImportEntry } from '../src/index.js';
import { extractArchiveFixture } from './helpers/archive-fixture.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const archive = join(repositoryRoot, 'Template Latex.zip');
let staging = '';
let entries: LatexThemeImportEntry[] = [];

beforeAll(() => {
  staging = mkdtempSync(join(tmpdir(), "academic-template-latex-import-Tiếng Việt '[fixture]-"));
  extractArchiveFixture(archive, staging);
  entries = [];
  collectEntries(staging, staging, entries);
}, 120_000);

afterAll(() => {
  if (staging) rmSync(staging, { recursive: true, force: true });
});

describe('Template Latex.zip lossless conformance fixture', () => {
  it('discovers exactly the 19 canonical main-file project roots', () => {
    const projects = discoverLatexThemeProjects(entries);
    expect(projects).toHaveLength(19);
    expect(projects.every((project) => /(?:^|\/)main\.tex$/i.test(project.entrypoint))).toBe(true);
    expect(projects).toEqual(expect.arrayContaining([
      expect.objectContaining({ root: 'Template Latex/Template Beamer 1' }),
      expect.objectContaining({ root: 'Template Latex/Template soạn sách 4' }),
      expect.objectContaining({ root: 'Template Latex/Template trình bày 3' }),
    ]));
    expect(entries.some((entry) => entry.path.endsWith('/main.pdf'))).toBe(true);
  });

  it('preserves and reports every selected-root file across all 19 projects', () => {
    for (const project of discoverLatexThemeProjects(entries)) {
      const report = analyzeLatexThemeImport(entries, project.entrypoint);
      const projectEntries = entries
        .filter((entry) => entry.path === project.root || entry.path.startsWith(`${project.root}/`))
        .sort((left, right) => left.path.localeCompare(right.path));
      const sourceEntries = projectEntries.filter((entry) => (
        typeof entry.bytes === 'string' && /\.(?:tex|sty|cls|bib)$/i.test(entry.path)
      ));

      expect(report.artifacts.map((artifact) => artifact.path), project.root).toEqual(
        projectEntries.map((entry) => entry.path),
      );
      expect(report.rawComponents.map((component) => component.path), project.root).toEqual(
        sourceEntries.map((entry) => entry.path),
      );
      for (const source of sourceEntries) {
        expect(report.rawComponents.find((component) => component.path === source.path)?.source, source.path)
          .toBe(source.bytes);
      }
      expect(report.compatibility.unsafe, project.root).toEqual(
        report.unresolved.filter((path) => !path.startsWith(`${project.root}/`)),
      );
      expect(report.compatibility.dropped, project.root).toEqual([]);
      expect(report.compatibility.approximated, project.root).toEqual([]);
    }
  });
});

function collectEntries(root: string, directory: string, result: LatexThemeImportEntry[]): void {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, item.name);
    if (item.isDirectory()) {
      collectEntries(root, absolute, result);
      continue;
    }
    if (!item.isFile()) continue;
    const path = relative(root, absolute).split('\\').join('/');
    const data = readFileSync(absolute);
    const textLike = /\.(?:tex|sty|cls|md|txt|bib|json)$/i.test(path);
    result.push({ path, bytes: textLike ? data.toString('utf8') : new Uint8Array(data) });
  }
}
