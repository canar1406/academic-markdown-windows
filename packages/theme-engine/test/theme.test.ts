import { describe, expect, it } from 'vitest';
import {
  loadThemePackage,
  renderThemeComponent,
  resolveThemeComponent,
  validateThemeManifest,
  type ThemeManifestV1,
} from '../src/index.js';

const validManifest: ThemeManifestV1 = {
  schemaVersion: 1,
  id: 'example-report-v1',
  name: 'Example Report',
  version: '1.0.0',
  engine: 'latex',
  documentClass: 'article',
  page: { size: 'A4' },
  capabilities: {
    cover: true,
    toc: true,
    listOfFigures: true,
    listOfTables: true,
    header: true,
    footer: true,
    headingDepth: 4,
  },
  components: {
    document: 'document.tex.mustache',
    preamble: 'preamble.tex',
    cover: 'components/cover.tex.mustache',
  },
  assets: ['assets/logo.png'],
  settings: [
    {
      key: 'cover.supervisor',
      type: 'string',
      label: 'Supervisor',
      required: false,
      section: 'Cover',
    },
  ],
};

describe('theme manifest v1', () => {
  it('accepts a complete versioned LaTeX theme contract', () => {
    expect(validateThemeManifest(validManifest)).toEqual({ valid: true, errors: [] });
  });

  it('rejects traversing component paths', () => {
    const manifest = {
      ...validManifest,
      components: { ...validManifest.components, cover: '../outside.tex' },
    };

    expect(validateThemeManifest(manifest)).toEqual({
      valid: false,
      errors: ['Theme component "cover" must use a safe relative path.'],
    });
  });

  it('rejects traversing asset paths', () => {
    const manifest = { ...validManifest, assets: ['../secret.png'] };

    expect(validateThemeManifest(manifest)).toEqual({
      valid: false,
      errors: ['Theme assets must contain safe relative paths only.'],
    });
  });

  it('requires independently addressable component slots', () => {
    const manifest = { ...validManifest, components: {} };

    expect(validateThemeManifest(manifest)).toEqual({
      valid: false,
      errors: ['Theme components must define at least one component slot.'],
    });
  });

  it('rejects ambiguous settings definitions at the manifest boundary', () => {
    const manifest = {
      ...validManifest,
      settings: [
        {
          key: 'footer.pageNumber',
          type: 'select',
          label: 'Page number',
          required: false,
          section: 'Footer',
        },
        {
          key: 'footer.pageNumber',
          type: 'string',
          label: 'Duplicate',
          required: false,
          section: 'Footer',
        },
      ],
    };

    expect(validateThemeManifest(manifest)).toEqual({
      valid: false,
      errors: [
        'Select theme setting "footer.pageNumber" must define non-empty string options.',
        'Theme setting keys must be unique: footer.pageNumber.',
      ],
    });
  });
});

describe('theme package loading', () => {
  it('loads a manifest and resolves a component from platform-neutral resources', () => {
    const loaded = loadThemePackage(JSON.stringify(validManifest), {
      'document.tex.mustache': '{{{preamble}}}\n{{{body}}}',
      'preamble.tex': '\\documentclass[a4paper]{article}',
      'components/cover.tex.mustache': '\\begin{titlepage}Cover\\end{titlepage}',
      'assets/logo.png': new Uint8Array([137, 80, 78, 71]),
    });

    expect(loaded.errors).toEqual([]);
    expect(loaded.theme?.manifest.id).toBe('example-report-v1');
    expect(resolveThemeComponent(loaded.theme!, 'cover')).toEqual({
      path: 'components/cover.tex.mustache',
      source: '\\begin{titlepage}Cover\\end{titlepage}',
    });
  });

  it('renders component values and optional sections from the loaded theme resource', () => {
    const loaded = loadThemePackage(JSON.stringify(validManifest), {
      'document.tex.mustache': '{{{preamble}}}\n{{{body}}}',
      'preamble.tex': '\\documentclass[a4paper]{article}',
      'components/cover.tex.mustache': '\\section{{{{title}}}} {{#major}}NGÀNH: {{{major}}}{{/major}}',
      'assets/logo.png': new Uint8Array([137, 80, 78, 71]),
    });

    expect(renderThemeComponent(loaded.theme!, 'cover', {
      title: 'Báo cáo \\& dữ liệu',
      major: 'Khoa học máy tính',
    })).toBe('\\section{Báo cáo \\& dữ liệu} NGÀNH: Khoa học máy tính');
    expect(renderThemeComponent(loaded.theme!, 'cover', {
      title: 'Báo cáo',
      major: '',
    })).toBe('\\section{Báo cáo} ');
  });

  it('reports every missing component or asset before the theme is used', () => {
    const loaded = loadThemePackage(validManifest, {
      'document.tex.mustache': '{{{body}}}',
    });

    expect(loaded.theme).toBeUndefined();
    expect(loaded.errors).toEqual([
      'Theme resource is missing: preamble.tex.',
      'Theme resource is missing: components/cover.tex.mustache.',
      'Theme resource is missing: assets/logo.png.',
    ]);
  });

  it('rejects malformed JSON without throwing', () => {
    expect(loadThemePackage('{ broken', {})).toEqual({
      errors: ['Theme manifest is not valid JSON.'],
    });
  });
});
