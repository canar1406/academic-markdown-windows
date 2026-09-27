import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileAuthoredTheme, type AuthoredThemeSnapshot } from '../src/authored-theme.js';
import type { ThemeDocumentSettings, ThemeSceneNode } from '../src/index.js';

const fixture: unknown = JSON.parse(readFileSync(new URL('../../../tests/fixtures/themes/nested-cover-scene.json', import.meta.url), 'utf8'));
const settings: ThemeDocumentSettings = {
  title: 'Report metadata must not leak into the custom cover', faculty: '', reportType: '', footerLeft: '',
  includeCover: true, includeToc: false, includeListOfFigures: false, includeListOfTables: false,
};
function snapshot(): AuthoredThemeSnapshot {
  const checked = compileAuthoredTheme({ schemaVersion: 1, id: 'nested-cover', version: '1.0.0', name: 'Bìa lồng', scene: structuredClone(fixture) });
  expect(checked.errors).toEqual([]);
  return checked.snapshot!;
}
function node(value: AuthoredThemeSnapshot, id: string): ThemeSceneNode {
  const pending = [value.scene.root];
  while (pending.length) {
    const current = pending.pop()!;
    if (current.id === id) return current;
    pending.push(...current.children);
  }
  throw new Error(`Missing fixture node ${id}`);
}
function coverTex(value: unknown): string {
  const result = compileAuthoredTheme(value);
  expect(result.errors).toEqual([]);
  return result.theme!.renderStructureBlock!('cover', settings);
}

describe('nested authored cover contract', () => {
  it('uses stable absolute widths across nested minipages and emits real padding and vertical gaps', () => {
    const value = snapshot();
    const tex = coverTex(value);
    // A4 minus two 25mm margins = 160; cover inner = 152; row columns = 72.
    // Left padding 2+2 makes 68; right nested row (72-4)/2 makes 34.
    expect(tex).toContain('{160.0000mm}');
    expect(tex).toContain('{152.0000mm}');
    expect(tex).toContain('{72.0000mm}');
    expect(tex).toContain('{68.0000mm}');
    expect(tex).toContain('{34.0000mm}');
    expect(tex).not.toMatch(/\\(?:linewidth|textwidth)/);
    expect(tex).toContain('\\hspace*{4.0000mm}');
    expect(tex).toContain('\\hspace*{2.0000mm}');
    expect(tex).toContain('\\vspace*{2.0000mm}');
    expect(tex).toContain('\\vspace*{4.0000mm}');
    expect(tex).toContain('\\vspace{3.0000mm}');
    expect(tex).toContain('\\vspace{6.0000mm}');
    expect(tex).toContain('\\hspace{8.0000mm}');
    expect(tex).not.toContain('Cover layer label');
    expect(tex).not.toContain(settings.title);
    expect(tex).not.toContain('\\LARGE');
    expect(tex).toMatchSnapshot();
    expect(coverTex(JSON.parse(JSON.stringify(value)))).toBe(tex);
  });

  it('escapes literal text, never uses layer titles as content, and isolates nested typography from body style', () => {
    const value = snapshot();
    node(value, 'left-text').properties.text = 'Nguyễn Ánh & 50% _ # $ { } \\input{evil.tex} <b>literal</b>';
    node(value, 'left-text').style = { fontSizePt: 20, color: '#FF0000' };
    node(value, 'closing').properties = { title: 'Layer only' };
    value.scene.root.children.push({ id: 'paragraph', widget: 'paragraph', version: 1, properties: {}, style: { fontSizePt: 11 }, children: [] });
    const tex = coverTex(value);
    expect(tex).toContain('Nguyễn Ánh \\& 50\\% \\_ \\# \\$ \\{ \\} \\textbackslash{}input\\{evil.tex\\}');
    expect(tex).not.toContain('\\input{evil.tex}');
    expect(tex).not.toContain('Layer only');
    expect(tex).toContain('\\color[HTML]{FF0000}');
    expect(tex).toContain('\\color[HTML]{204060}');
    expect(tex).toContain('\\color[HTML]{111111}');
    const compiled = compileAuthoredTheme(value);
    expect(compiled.theme!.renderDocument('BODY', settings)).toMatch(/\\fontsize\{11\}\{[^}]+\}\\selectfont[^]*\nBODY\n/);
  });

  it('preserves the fixed leaf cover and treats an empty row as no content or gap', () => {
    const value = snapshot();
    const cover = node(value, 'cover');
    cover.children = [];
    cover.properties = { title: 'Legacy title', university: 'Legacy university', paddingMm: 10, gapMm: 20 };
    const legacy = coverTex(value);
    expect(legacy).toContain('\\LARGE Legacy title');
    expect(legacy).toContain('Legacy university');
    expect(legacy).not.toContain('minipage');
    cover.children = [{ id: 'empty-row', widget: 'row', version: 1, properties: {}, style: {}, children: [] }];
    const empty = coverTex(value);
    expect(empty).not.toContain('Legacy title');
    expect(empty).not.toContain('\\hspace{');
    // Zero-height minipage top anchors are not visible designer gaps.
    expect(empty).not.toMatch(/\\vspace\{[^}]*mm\}/);
    cover.children = [
      { id: 'one', widget: 'text', version: 1, properties: { text: 'One' }, style: {}, children: [] },
      { id: 'two', widget: 'text', version: 1, properties: { text: 'Two' }, style: {}, children: [] },
    ];
    const withoutPlaceholder = coverTex(value);
    cover.children.splice(1, 0, { id: 'empty-row', widget: 'row', version: 1, properties: {}, style: {}, children: [] });
    expect(coverTex(value)).toBe(withoutPlaceholder);
  });

  it.each(['row', 'column', 'text'])('rejects enabled on %s layout nodes even at the page root', widget => {
    const value = snapshot();
    value.scene.root.children.push({ id: 'bad', widget, version: 1, properties: { enabled: false }, style: {}, children: [] });
    expect(compileAuthoredTheme(value).theme).toBeUndefined();
  });

  it.each(['image', 'heading', 'paragraph', 'cover'])('rejects unsupported %s children inside cover', widget => {
    const value = snapshot();
    node(value, 'cover').children.push({ id: 'bad', widget, version: 1, properties: {}, style: {}, children: [] });
    expect(compileAuthoredTheme(value).theme).toBeUndefined();
  });

  it.each(['stack', 'body'])('renders supported %s cover children with local spacing and inherited typography', widget => {
    const value = snapshot();
    node(value, 'cover').children = [{
      id: 'container', widget, version: 1, properties: { gapMm: 7, paddingMm: 3 },
      style: { fontSizePt: 14, lineHeight: 1.5, color: '#2468AC' },
      children: [
        { id: 'first', widget: 'text', version: 1, properties: { text: 'Nội dung & 50%' }, style: {}, children: [] },
        { id: 'second', widget: 'text', version: 1, properties: { text: 'Dòng thứ hai' }, style: {}, children: [] },
      ],
    }];
    const compiled = compileAuthoredTheme(value);
    expect(compiled.errors).toEqual([]);
    const container = compiled.coverLayout!.children[0]!;
    // Cover width 160 minus its padding 8; container padding 6 leaves 146.
    expect(container).toMatchObject({ widthMm: 152, contentWidthMm: 146, gapMm: 7, paddingMm: 3 });
    expect(container.children.map(child => child.widthMm)).toEqual([146, 146]);
    expect(container.children[0]!.style).toMatchObject({ fontSizePt: 14, lineHeight: 1.5, color: '#2468AC' });
    const tex = coverTex(value);
    expect(tex).toContain('\\begin{minipage}[t]{146.0000mm}');
    expect(tex).toContain('\\hspace*{3.0000mm}');
    expect(tex).toContain('\\vspace*{3.0000mm}');
    expect(tex).toContain('\\vspace{7.0000mm}');
    expect(tex).toContain('\\fontsize{14}{21}\\selectfont\\color[HTML]{2468AC}');
    expect(tex).toContain('Nội dung \\& 50\\%');
    expect(tex.indexOf('Nội dung')).toBeLessThan(tex.indexOf('Dòng thứ hai'));
    expect(coverTex(JSON.parse(JSON.stringify(value)))).toBe(tex);
  });

  it.each(['row-text', 'nine-columns', 'text-child'])('rejects invalid nested children: %s', kind => {
    const value = snapshot();
    const row = node(value, 'row');
    if (kind === 'row-text') row.children = [{ id: 'row-text', widget: 'text', version: 1, properties: { text: 'Invalid row child' }, style: {}, children: [] }];
    if (kind === 'nine-columns') row.children = Array.from({ length: 9 }, (_, i) => ({ id: `column-${i}`, widget: 'column', version: 1, properties: {}, style: {}, children: [] }));
    if (kind === 'text-child') node(value, 'closing').children = [{ id: 'nested-text', widget: 'text', version: 1, properties: {}, style: {}, children: [] }];
    const compiled = compileAuthoredTheme(value);
    expect(compiled.theme).toBeUndefined();
    expect(compiled.errors).toContain(kind === 'text-child'
      ? 'Custom child layout is not yet supported: closing.'
      : 'Rows require 0–8 column children: row.');
  });

  it.each([
    ['gapMm', -1], ['gapMm', 20.1], ['gapMm', '4'], ['gapMm', NaN], ['gapMm', Infinity],
    ['paddingMm', -1], ['paddingMm', 10.1], ['paddingMm', '2'], ['paddingMm', NaN], ['paddingMm', Infinity],
  ])('rejects invalid %s=%s without fallback', (key, val) => {
    const value = snapshot();
    node(value, 'cover').properties[String(key)] = val;
    expect(compileAuthoredTheme(value).theme).toBeUndefined();
  });

  it.each([['left-text', 'gapMm'], ['left-text', 'enabled']])(
    'rejects unsupported layout properties on %s.%s', (id, key) => {
      const value = snapshot();
      node(value, id).properties[key] = 0;
      expect(compileAuthoredTheme(value).theme).toBeUndefined();
    },
  );

  it('renders row padding before distributing equal column widths', () => {
    const value = snapshot();
    node(value, 'row').properties.paddingMm = 2;
    const compiled = compileAuthoredTheme(value);
    expect(compiled.errors).toEqual([]);
    const row = compiled.coverLayout!.children[0]!;
    // 152 - row padding 4 - gap 8 = 140, split into two 70mm columns.
    expect(row).toMatchObject({ widthMm: 152, contentWidthMm: 148, paddingMm: 2, gapMm: 8 });
    expect(row.children.map(child => child.widthMm)).toEqual([70, 70]);
    expect(row.children.map(child => child.paddingMm)).toEqual([2, 0]);
    const tex = coverTex(value);
    expect(tex).toContain('\\hspace*{2.0000mm}%\n\\begin{minipage}[t]{148.0000mm}');
    expect(tex).toContain('\\begin{minipage}[t]{70.0000mm}');
    expect(tex).toContain('\\begin{minipage}[t]{66.0000mm}');
    expect(tex).toContain('\\begin{minipage}[t]{33.0000mm}');
    expect(tex).toContain('\\hspace{8.0000mm}');
  });

  it.each([0, 20])('accepts page gap %s without inheriting it into the single cover layout', gapMm => {
    const value = snapshot();
    const originalTex = coverTex(value);
    node(value, 'page').properties.gapMm = gapMm;
    const compiled = compileAuthoredTheme(value);
    expect(compiled.errors).toEqual([]);
    expect(compiled.layout!.gapMm).toBe(gapMm);
    expect(compiled.coverLayout!.gapMm).toBe(6);
    expect(compiled.coverLayout!.children[0]!.gapMm).toBe(8);
    expect(coverTex(value)).toBe(originalTex);
  });

  it('rejects invalid text types and unknown layout widget versions', () => {
    const value = snapshot();
    node(value, 'left-text').properties.text = 42;
    expect(compileAuthoredTheme(value).theme).toBeUndefined();
    node(value, 'left-text').properties.text = '';
    node(value, 'left-text').version = 2;
    expect(compileAuthoredTheme(value).theme).toBeUndefined();
  });

  it('renders zero/maximum numeric layout properties and one, four, five, or eight equal columns', () => {
    for (const [count, width] of [[1, 140], [4, 35], [5, 28], [8, 17.5]] as const) {
      const value = snapshot();
      node(value, 'cover').properties = { gapMm: 20, paddingMm: 10 };
      node(value, 'row').properties = { gapMm: 0 };
      node(value, 'row').children = Array.from({ length: count }, (_, i) => ({
        id: `col-${i}`, widget: 'column', version: 1, properties: { paddingMm: 0, gapMm: 0 }, style: {},
        children: [{ id: `text-${i}`, widget: 'text', version: 1, properties: { text: `Cột ${i}` }, style: {}, children: [] }],
      }));
      const compiled = compileAuthoredTheme(value);
      expect(compiled.errors).toEqual([]);
      expect(compiled.coverLayout!.children[0]!.children.map(child => child.widthMm))
        .toEqual(Array(count).fill(width));
      const tex = coverTex(value);
      expect(tex).toContain(`\\begin{minipage}[t]{${width.toFixed(4)}mm}`);
      expect(tex).toContain('\\hspace*{10.0000mm}');
      expect(tex).toContain('\\vspace{20.0000mm}');
      expect(tex.match(/\\hspace\{0\.0000mm\}/g) ?? []).toHaveLength(count - 1);
      for (let i = 0; i < count; i++) expect(tex).toContain(`\\strut Cột ${i}\\par`);
    }
  });

  it('rejects cycles, excessive depth, and oversized strings before recursive scene validation', () => {
    const cyclic = snapshot();
    node(cyclic, 'left').children.push(node(cyclic, 'cover'));
    expect(compileAuthoredTheme(cyclic).theme).toBeUndefined();
    const deep = snapshot();
    let parent = node(deep, 'left');
    for (let i = 0; i < 40; i++) {
      const child: ThemeSceneNode = { id: `depth-${i}`, widget: 'column', version: 1, properties: {}, style: {}, children: [] };
      parent.children = [child]; parent = child;
    }
    expect(compileAuthoredTheme(deep).theme).toBeUndefined();
    const large = snapshot();
    node(large, 'closing').properties.text = 'a'.repeat(262145);
    expect(compileAuthoredTheme(large).theme).toBeUndefined();
  });
});
