import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { compileAuthoredTheme, type AuthoredThemeSnapshot } from '../src/authored-theme.js';
import type { ThemeDocumentSettings, ThemeSceneNode } from '../src/index.js';

const scene = JSON.parse(readFileSync(new URL('../../../tests/fixtures/themes/general-layout-scene.json', import.meta.url), 'utf8'));
function snapshot(): AuthoredThemeSnapshot {
  return { schemaVersion: 1, id: 'general-layout', version: '1.0.0', name: 'General builder', scene: structuredClone(scene) };
}
const settings: ThemeDocumentSettings = {
  title: 'Report', faculty: '', reportType: '', footerLeft: '',
  includeCover: false, includeToc: false, includeListOfFigures: false, includeListOfTables: false,
};

it('resolves section/row padding before ratios and reuses that geometry for root content, header and footer', () => {
  const compiled = compileAuthoredTheme(snapshot());
  expect(compiled.errors).toEqual([]);
  const layout = compiled.rootSectionLayouts![0]!;
  // 160 - section padding 8 - row padding 4 - gap 8 = 140; 30:70 = 42:98.
  expect(layout.children[0]!.children.map(child => child.widthMm)).toEqual([42, 98]);
  expect(layout.children[0]!.style.background).toBe('#EAF0F8');
  expect(layout.children[0]!.children[0]!.style.background).toBeUndefined();
  expect(layout.children[0]!.children[0]!.style.color).toBe('#204060');
  expect(compiled.headerLayout!.children[0]!.node.widget).toBe('section');
  expect(compiled.footerLayout!.children[0]!.node.id).toBe('footer-text');
  const tex = compiled.theme!.renderDocument('REPORT BODY', settings);
  expect(tex).toContain('{42.0000mm}');
  expect(tex).toContain('{98.0000mm}');
  expect(tex).toContain('\\colorbox[HTML]{EAF0F8}');
  expect(tex).toContain('Image placeholder: Sơ đồ — chưa nhập ảnh');
  expect(tex).toContain('Nguyễn Ánh \\& 50\\%');
  expect(tex).toContain('General header');
  expect(tex).toContain('General footer');
  expect(tex.indexOf('Nguyễn Ánh')).toBeLessThan(tex.indexOf('REPORT BODY'));
  expect(compileAuthoredTheme(JSON.parse(JSON.stringify(snapshot()))).theme!.renderDocument('REPORT BODY', settings)).toBe(tex);
});

it('accepts zero/eight columns and 1–100 integer ratios but rejects malformed or exhausted layouts and code', () => {
  const column = (i: number): ThemeSceneNode => ({ id: `c${i}`, widget: 'column', version: 1, properties: {}, style: {}, children: [] });
  for (const count of [0, 1, 8]) {
    const value = snapshot();
    const row = value.scene.root.children[0]!.children[0]!;
    row.children = Array.from({ length: count }, (_, i) => column(i));
    row.properties = { gapMm: 0, ratios: count ? Array.from({ length: count }, (_, i) => i === 0 ? '100' : '1').join(':') : '' };
    expect(compileAuthoredTheme(value).errors).toEqual([]);
  }
  for (const ratios of ['0:1', '101:1', '1.5:2', '-1:2', '1', '1:2:3', '1:NaN', '1:2\\input{x}']) {
    const value = snapshot();
    value.scene.root.children[0]!.children[0]!.properties.ratios = ratios;
    expect(compileAuthoredTheme(value).theme, ratios).toBeUndefined();
  }
  for (const mutate of [
    (row: ThemeSceneNode) => { row.children = Array.from({ length: 9 }, (_, i) => column(i)); },
    (row: ThemeSceneNode) => { row.children = Array.from({ length: 8 }, (_, i) => column(i)); row.properties = { gapMm: 20, paddingMm: 10 }; },
    (row: ThemeSceneNode) => { row.style.background = 'url(javascript:alert(1))'; },
    (row: ThemeSceneNode) => { row.children[1]!.children[0]!.properties.heightMm = 101; },
    (row: ThemeSceneNode) => { row.children.push(row); },
  ]) {
    const value = snapshot();
    mutate(value.scene.root.children[0]!.children[0]!);
    expect(compileAuthoredTheme(value).theme).toBeUndefined();
  }
});
