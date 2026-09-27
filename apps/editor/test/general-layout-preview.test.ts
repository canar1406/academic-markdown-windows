// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { parseFrontMatter, parseLmx } from '@markdown/document-core';
import { createHcmutStructurePreviewRenderer, refreshHcmutStructurePreviews, readVisualPageDecorationSettings } from '../src/hcmut-structure-preview';
import { projectThemeSceneToMarkdown } from '../src/studio-preview';

const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/themes/general-layout-scene.json'), 'utf8'));
it('projects root sections as markers and renders literal selectable nodes with the shared ratio/background geometry', () => {
  const scene = structuredClone(fixture);
  scene.root.children[0].children[0].children[0].children[0].properties.text = '<img src=x onerror=alert(1)> Nguyễn Ánh';
  const projected = projectThemeSceneToMarkdown(scene);
  expect(projected.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  expect(parseLmx(parseFrontMatter(projected.markdown).body).directives[0]).toMatchObject({ name: 'theme-layout', attributes: { node: 'intro' } });
  const container = document.createElement('div');
  container.dataset.authoredLayoutNodeId = 'intro';
  const render = createHcmutStructurePreviewRenderer(() => projected.markdown);
  render({ name: 'theme-layout', title: 'Layout', container });
  const node = (id: string) => container.querySelector<HTMLElement>(`[data-authored-node-id="${id}"]`)!;
  expect(node('left').style.width).toBe('42mm');
  expect(node('right').style.width).toBe('98mm');
  expect(node('row').style.padding).toBe('2mm');
  expect(node('row').style.gap).toBe('8mm');
  expect(node('row').style.backgroundColor.toLowerCase()).toBe('#eaf0f8');
  expect(node('left').style.backgroundColor).toBe('');
  expect(node('text').textContent).toBe('<img src=x onerror=alert(1)> Nguyễn Ánh');
  expect(node('placeholder').textContent).toContain('Image placeholder:');
  expect(node('placeholder').style.height).toBe('30mm');
  expect(container.querySelector('img,script')).toBeNull();
  expect([...container.querySelectorAll<HTMLElement>('[data-authored-node-id]')].map(n => n.dataset.authoredWidget)).toEqual([
    'section', 'row', 'column', 'text', 'column', 'image-placeholder',
  ]);
  const host = document.createElement('section');
  host.dataset.lmxName = 'theme-layout';
  container.classList.add('mu-lmx-structure-preview'); host.append(container);
  container.dataset.authoredLayoutNodeId = 'missing';
  refreshHcmutStructurePreviews(host, () => projected.markdown);
  expect(container.textContent).toContain('Unknown authored layout node');
  expect(container.dataset.structureEnabled).toBe('false');
  const settings = readVisualPageDecorationSettings(projected.markdown);
  expect(settings.header.renderContent?.().querySelector('[data-authored-node-id="header-text"]')?.textContent).toBe('General header');
  expect(settings.footer.renderContent?.().querySelector('[data-authored-node-id="footer-text"]')?.textContent).toBe('General footer');
});
