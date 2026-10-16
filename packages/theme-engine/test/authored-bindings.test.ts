import { describe, expect, it } from 'vitest';
import { compileAuthoredTheme } from '../src/authored-theme.js';
import type { ThemeSceneV2 } from '../src/index.js';

function snapshot() {
  const scene: ThemeSceneV2 = {
    schemaVersion: 2, page: { size: 'A4', widthMm: 210, heightMm: 297 },
    tokens: {}, variants: {},
    bindings: [
      { key: 'document.title', valueType: 'string' },
      { key: 'cover.students', valueType: 'string' },
    ],
    root: {
      id: 'page', widget: 'page', version: 1, properties: {}, style: {}, children: [{
        id: 'cover', widget: 'cover', version: 1, properties: {}, style: {}, children: [{
          id: 'title', widget: 'text', version: 1, properties: { text: 'Fallback title' },
          style: {}, bindings: { text: 'document.title' }, children: [],
        }, {
          id: 'authors', widget: 'text', version: 1, properties: { text: 'Author names' },
          style: {}, bindings: { text: 'cover.students' }, children: [],
        }],
      }],
    },
  };
  return { schemaVersion: 1, id: 'bound-report', version: '1.0.0', name: 'Reusable report', scene };
}

describe('portable authored metadata bindings', () => {
  it('resolves another report without mutating the saved theme or interpreting text as TeX', () => {
    const input = snapshot();
    const original = structuredClone(input);
    const metadata = { lmx: { cover: {
      title: 'Báo cáo A & \\input{secret}',
      students: [{ name: 'Nguyễn Ánh', id: 'S_01' }, { name: 'Trần Bình', id: 'S02' }],
    } } };
    const first = compileAuthoredTheme(input, metadata);
    expect(first.errors).toEqual([]);
    expect(first.coverLayout?.children[0]?.node.properties.text).toBe('Báo cáo A & \\input{secret}');
    const settings = { title: '', faculty: '', reportType: '', footerLeft: '',
      includeCover: true, includeToc: false, includeListOfFigures: false, includeListOfTables: false };
    const tex = first.theme!.renderStructureBlock!('cover', settings);
    expect(tex).toContain('Nguyễn Ánh (S\\_01)');
    expect(tex).toContain('Trần Bình (S02)');
    expect(tex).not.toContain('\\input{secret}');
    const second = compileAuthoredTheme(input, { lmx: { cover: { title: 'Báo cáo B' } } });
    expect(second.coverLayout?.children[0]?.node.properties.text).toBe('Báo cáo B');
    expect(second.coverLayout?.children[1]?.node.properties.text).toBe('Author names');
    expect(input).toEqual(original);
    expect(first.snapshot).toEqual(input);
  });

  it('keeps literal fallback text when metadata is absent', () => {
    const result = compileAuthoredTheme(snapshot());
    expect(result.errors).toEqual([]);
    expect(result.coverLayout?.children[0]?.node.properties.text).toBe('Fallback title');
  });

  it('rejects unknown binding keys and non-text property targets', () => {
    const unknown = snapshot();
    unknown.scene.root.children[0]!.children[0]!.bindings = { text: '__proto__.title' };
    expect(compileAuthoredTheme(unknown).errors.join(' ')).toMatch(/binding/i);
    const executable = snapshot();
    executable.scene.root.children[0]!.children[0]!.bindings = { fontSizePt: 'document.title' };
    expect(compileAuthoredTheme(executable).errors.join(' ')).toMatch(/binding/i);
  });
});
