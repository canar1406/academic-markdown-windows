import { describe, expect, it } from 'vitest';
import {
  loadThemePackageV2,
  validateThemeManifestV2,
  type ThemeManifestV2,
} from '../src/index.js';

const manifest: ThemeManifestV2 = {
  schemaVersion: 2,
  id: 'studio-theme',
  name: 'Studio Theme',
  version: '1.0.0',
  engine: 'latex',
  compatibility: { app: '>=1.0.0', exporter: '>=1.0.0' },
  category: 'report-project',
  tags: ['report', 'academic'],
  scene: 'scene.json',
  tokens: 'tokens.json',
  components: { document: 'components/document.tex.mustache' },
  assets: ['assets/logo.png'],
  dependencies: [],
  preambleContributions: ['amsmath'],
  compilerPackages: ['amsmath'],
  integrity: 'integrity.json',
};

const resources = {
  'scene.json': '{}',
  'tokens.json': '{}',
  'components/document.tex.mustache': '{{{body}}}',
  'assets/logo.png': new Uint8Array([1, 2, 3]),
  'integrity.json': JSON.stringify({
    resources: [
      { path: 'scene.json', kind: 'scene', byteLength: 2, sha256: 'a'.repeat(64) },
      { path: 'tokens.json', kind: 'tokens', byteLength: 2, sha256: 'b'.repeat(64) },
      { path: 'components/document.tex.mustache', kind: 'component', byteLength: 10, sha256: 'c'.repeat(64) },
      { path: 'assets/logo.png', kind: 'asset', byteLength: 3, sha256: 'd'.repeat(64) },
    ],
  }),
};

describe('theme package v2', () => {
  it('accepts a fully declared data-only package contract', () => {
    expect(validateThemeManifestV2(manifest)).toEqual({ valid: true, errors: [] });
    expect(loadThemePackageV2(manifest, resources).errors).toEqual([]);
  });

  it('rejects executable resources and path traversal', () => {
    expect(validateThemeManifestV2({
      ...manifest,
      scene: '../scene.json',
      assets: ['plugins/theme.js'],
    }).errors).toEqual([
      'Theme v2 asset type is forbidden: plugins/theme.js.',
      'Theme v2 scene must use a safe relative path.',
    ]);
  });

  it('reports undeclared or missing resources before installation', () => {
    const result = loadThemePackageV2(manifest, {
      ...resources,
      'extra.txt': 'not declared',
      'assets/logo.png': undefined as never,
    });

    expect(result.theme).toBeUndefined();
    expect(result.errors).toEqual([
      'Theme v2 resource is missing: assets/logo.png.',
      'Theme v2 resource is undeclared: extra.txt.',
    ]);
  });

  it('rejects malformed integrity records', () => {
    const result = loadThemePackageV2(manifest, {
      ...resources,
      'integrity.json': JSON.stringify({
        resources: [{ path: '../scene.json', kind: 'scene', byteLength: -1, sha256: 'bad' }],
      }),
    });

    expect(result.theme).toBeUndefined();
    expect(result.errors).toContain('Theme v2 integrity contains an invalid resource record.');
  });
});
