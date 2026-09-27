// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFrontMatter, replaceFrontMatterValue } from '@markdown/document-core';
import { compileAuthoredTheme, type ThemeSceneV2 } from '@markdown/theme-engine';
import { exportMarkdownToLatex } from '@markdown/latex-exporter';
import { hcmutReportTheme } from '@markdown/theme-hcmut-report-v1';
import { createHcmutStructurePreviewRenderer, refreshHcmutStructurePreviews } from '../src/hcmut-structure-preview';
import { projectThemeSceneToMarkdown } from '../src/studio-preview';

const fixture: ThemeSceneV2 = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/themes/nested-cover-scene.json'), 'utf8'));
function render(scene = fixture): { container: HTMLElement; markdown: string } {
  const projection = projectThemeSceneToMarkdown(scene);
  expect(projection.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  const container = document.createElement('div');
  createHcmutStructurePreviewRenderer(() => projection.markdown)({ name: 'cover', title: 'Cover', container });
  return { container, markdown: projection.markdown };
}
function element(container: HTMLElement, id: string): HTMLElement {
  const found = container.querySelector<HTMLElement>(`[data-theme-node-id="${id}"]`);
  expect(found).not.toBeNull();
  return found!;
}
describe('nested cover DOM and Markdown contract', () => {
  it('uses the same bounded widths/padding/gaps and ordered IDs as the TeX layout', () => {
    const { container } = render();
    expect(element(container, 'cover').style.padding).toBe('4mm');
    expect(element(container, 'cover').style.gap).toBe('6mm');
    expect(element(container, 'row').style.gap).toBe('8mm');
    expect(element(container, 'left').style.padding).toBe('2mm');
    expect(element(container, 'left').style.gap).toBe('3mm');
    expect(element(container, 'right').style.padding).toBe('0mm');
    expect(element(container, 'right').style.gap).toBe('4mm');
    expect(element(container, 'left').dataset.widthMm).toBe('72');
    expect(element(container, 'right').dataset.widthMm).toBe('72');
    expect(element(container, 'inner-left').dataset.widthMm).toBe('34');
    expect(element(container, 'inner-right').dataset.widthMm).toBe('34');
    for (const node of container.querySelectorAll<HTMLElement>('[data-theme-node-id]')) {
      expect(node.dataset.authoredNodeId).toBe(node.dataset.themeNodeId);
    }
    expect(element(container, 'left').style.width).toBe('72mm');
    expect(element(container, 'right').style.width).toBe('72mm');
    expect([...container.querySelectorAll('[data-theme-widget="text"]')].map(n => n.textContent)).toEqual([
      'Left & safe — Trái', 'Chi tiết thứ hai', 'Right % safe — Phải', 'Inner one', 'Inner two', 'Nguyễn Ánh — Kết luận',
    ]);
    expect(container.textContent).not.toContain('Cover layer label');
    expect(container.querySelector('[data-cover-field], .hcmut-cover-content, img')).toBeNull();
  });

  it('inherits typography but resets layout alignment on each node and does not leak sibling styles', () => {
    const scene = structuredClone(fixture);
    scene.root.children[0].properties.alignment = 'trailing';
    const { container } = render(scene);
    expect(element(container, 'cover').style.textAlign).toBe('right');
    expect(element(container, 'left-text').style.textAlign).toBe('left');
    expect(element(container, 'left-text').style.color).toBe('#204060');
    expect(element(container, 'left-text').style.fontWeight).toBe('bold');
    expect(element(container, 'left-detail').style.fontWeight).toBe('normal');
    expect(element(container, 'left-detail').style.fontStyle).toBe('italic');
    expect(element(container, 'right-text').style.fontWeight).toBe('normal');
    expect(element(container, 'right-text').style.color).toBe('#111111');
    expect(element(container, 'inner-left-text').style.fontSize).toBe('10pt');
    expect(element(container, 'closing').style.fontSize).toBe('12pt');
  });

  it('refreshes edited/reordered literal text without executing HTML or treating labels as text', () => {
    const scene = structuredClone(fixture);
    scene.root.children[0].children.reverse();
    scene.root.children[0].children[0].properties.text = '<img src=x onerror=alert(1)> Nguyễn & Ánh';
    const { container, markdown } = render(scene);
    expect(container.querySelector('img,script')).toBeNull();
    expect(element(container, 'closing').textContent).toBe('<img src=x onerror=alert(1)> Nguyễn & Ánh');
    expect(parseFrontMatter(markdown).data.lmx).toHaveProperty('authoredTheme.scene', scene);
    const host = document.createElement('div');
    host.dataset.lmxName = 'cover';
    container.classList.add('mu-lmx-structure-preview'); host.append(container);
    delete scene.root.children[0].children[0].properties.text;
    scene.root.children[0].children[0].properties.title = 'Only a label';
    const edited = projectThemeSceneToMarkdown(scene).markdown;
    refreshHcmutStructurePreviews(host, () => edited);
    expect(element(container, 'closing').textContent).toBe('');
    expect(container.textContent).not.toContain('Only a label');
  });

  it('round-trips the exact reusable scene and exports nested content independently of HCMUT', () => {
    const { markdown } = render();
    const snapshot = (parseFrontMatter(markdown).data.lmx as Record<string, unknown>).authoredTheme;
    expect(compileAuthoredTheme(snapshot).snapshot?.scene).toEqual(fixture);
    const source = '---\ncustom: nguyên vẹn\n---\n\n:::cover\n:::\n\n# Báo cáo thật\n\nNguyên văn.\n';
    const saved = replaceFrontMatterValue(source, ['lmx', 'authoredTheme'], snapshot).source;
    expect(parseFrontMatter(saved).body).toBe(parseFrontMatter(source).body);
    const exported = exportMarkdownToLatex(saved, hcmutReportTheme);
    expect(exported.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(exported.latex).toContain('Left \\& safe — Trái');
    expect(exported.latex).toContain('Nguyên văn.');
    expect(exported.latex).not.toMatch(/hcmut\.png|Cover layer label/);
    expect(exportMarkdownToLatex(`${saved}`, hcmutReportTheme).latex).toBe(exported.latex);
  });

  it('renders empty rows without spacing, retains selectable legacy covers, and rejects unknown widgets', () => {
    const scene = structuredClone(fixture);
    scene.root.children[0].children.unshift({ id: 'empty-row', widget: 'row', version: 1, properties: {}, style: {}, children: [] });
    const { container } = render(scene);
    expect(container.querySelector('[data-authored-node-id="empty-row"]')).toBeNull();
    scene.root.children[0].children = [];
    const legacy = render(scene).container;
    expect(legacy.querySelector('[data-authored-node-id="cover"]')).not.toBeNull();
    expect(legacy.querySelector('[data-cover-field="title"]')).not.toBeNull();

    scene.root.children[0].children = [{ id: 'unsupported', widget: 'image', version: 1, properties: {}, style: {}, children: [] }];
    const bad = replaceFrontMatterValue(':::cover\n:::\n', ['lmx', 'authoredTheme'], {
      schemaVersion: 1, id: 'bad', version: '1.0.0', name: 'Invalid theme', scene,
    }).source;
    container.replaceChildren();
    createHcmutStructurePreviewRenderer(() => bad)({ name: 'cover', title: 'Cover', container });
    expect(container.dataset.structureEnabled).toBe('false');
    expect(container.textContent).toContain('Unsupported authored widget: image');
    expect(container.querySelector('.authored-cover-content, .hcmut-cover-content')).toBeNull();
  });
});
