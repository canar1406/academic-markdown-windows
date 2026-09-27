import { describe, expect, it } from 'vitest';
import { compileAuthoredTheme } from '../src/authored-theme.js';
const scene = { schemaVersion: 2, page: { size: 'A4', widthMm: 210, heightMm: 297 }, tokens: { ink: { type: 'color', value: '#204060' } }, variants: {}, bindings: [], root: {id: 'page', widget: 'page', version: 1, properties: {}, style: {color: {token: 'ink'}, fontSizePt: 12}, children: []} };
const snapshot = {schemaVersion: 1, id: 'new-theme', version: '1.0.0', name: 'New theme', scene};
describe('standalone authored theme compiler', () => {
  it('creates a document without HCMUT content or assets and applies style tokens', () => {
    const result = compileAuthoredTheme(snapshot);
    expect(result.errors).toEqual([]);
    const tex = result.theme!.renderDocument('USER BODY', {
      title: 'User report', faculty: '', reportType: '', footerLeft: '',
      includeCover: false, includeToc: false, includeListOfFigures: false, includeListOfTables: false,
    });
    expect(tex).toContain('USER BODY');
    expect(tex).toContain('204060');
    expect(tex).toContain('\\fontsize{12}');
    expect(tex).not.toMatch(/HCMUT|hcmut|Bách|Images\//);
  });
  it('rejects unsupported widgets and executable style values', () => {
    const bad = structuredClone(snapshot);
    bad.scene.root.style.color = {token: 'missing'};
    expect(compileAuthoredTheme(bad).theme).toBeUndefined();
    const asset = structuredClone(snapshot);
    asset.scene.root.widget = 'image';
    expect(compileAuthoredTheme(asset).errors.length).toBeGreaterThan(0);
  });
  it('rejects malformed inputs without recursion overflow or fallback', () => {
    expect(compileAuthoredTheme(null).theme).toBeUndefined();
    expect(compileAuthoredTheme({...snapshot,schemaVersion: 9}).theme).toBeUndefined();
    const cyclic: Record<string, unknown> = {}; cyclic.scene=cyclic;
    expect(compileAuthoredTheme(cyclic).theme).toBeUndefined();
  });
});
