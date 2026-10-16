import { expect, test, type Page } from '@playwright/test';
import type { BridgeEnvelope } from '@markdown/bridge-protocol';
import type { ThemeSceneNode, ThemeSceneV2 } from '@markdown/theme-engine';

declare global {
  interface Window { __studioMessages: BridgeEnvelope[] }
}

function node(id: string, widget: string, children: ThemeSceneNode[] = []): ThemeSceneNode {
  return { id, widget, version: 1, properties: {}, style: {}, children };
}

function scene(): ThemeSceneV2 {
  const text = node('title', 'text');
  text.properties.text = 'Fallback report title';
  text.bindings = { text: 'document.title' };
  return {
    schemaVersion: 2, page: { size: 'A4', widthMm: 210, heightMm: 297 },
    tokens: {}, variants: {}, bindings: [{ key: 'document.title', valueType: 'string' }],
    root: node('page', 'page', [node('cover', 'cover', [text])]),
  };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__studioMessages = [];
    Object.defineProperty(window, 'webkit', { configurable: true, value: {
      messageHandlers: { bridge: { postMessage: (message: BridgeEnvelope) => window.__studioMessages.push(message) } },
    } });
  });
  await page.goto('/');
  await expect(page.locator('#editor.mu-editor')).toBeVisible();
});

async function preview(page: Page, value: ThemeSceneV2, requestId: string, title: string) {
  await page.evaluate(({ value, requestId, title }) => window.markdownEditor?.handleEnvelope({
    protocolVersion: 1, type: 'studio.previewScene', requestId, payload: { scene: value, title },
  }), { value, requestId, title });
  await expect.poll(() => page.evaluate(id => window.__studioMessages.find(
    message => message.type === 'studio.previewRendered' && message.requestId === id,
  )?.payload.diagnostics, requestId)).not.toBeUndefined();
}

test('a blank A4 page accepts a real browser DataTransfer and stays read-only', async ({ page }) => {
  const value = scene();
  value.root.children = [];
  await preview(page, value, 'blank', 'Blank theme');
  await page.locator('#editor').evaluate(editor => {
    const transfer = new DataTransfer();
    transfer.setData('text/plain', 'studio-widget:section');
    editor.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    editor.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  await expect.poll(() => page.evaluate(() => window.__studioMessages.find(
    message => message.type === 'studio.dropNode',
  )?.payload)).toEqual({ value: 'studio-widget:section', nodeId: 'page', placement: 'inside' });
  await expect(page.locator('#editor [contenteditable=true]')).toHaveCount(0);
});

test('bound content, selection, typography and real LaTeX export share the same scene', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const value = scene();
  await preview(page, value, 'first', 'Báo cáo thứ nhất');
  const title = page.locator('[data-authored-node-id=title]').first();
  await expect(title).toContainText('Báo cáo thứ nhất');
  await title.click();
  await expect.poll(() => page.evaluate(() => window.__studioMessages.find(
    message => message.type === 'studio.nodeSelected',
  )?.payload.nodeId)).toBe('title');
  value.root.children[0]!.children[0]!.style = { color: '#8A2145', fontSizePt: 18 };
  await preview(page, value, 'second', 'Báo cáo thứ hai');
  await expect(title).toContainText('Báo cáo thứ hai');
  await expect(title).toHaveCSS('color', 'rgb(138, 33, 69)');
  await page.evaluate(() => window.markdownEditor?.requestLatex('pdf-source'));
  const latex = await page.evaluate(() => window.__studioMessages.find(
    message => message.type === 'export.latex' && message.requestId === 'pdf-source',
  )?.payload.latex);
  expect(latex).toContain('Báo cáo thứ hai');
  expect(latex).toContain('8A2145');
  expect(latex).toContain('\\fontsize{18}');
  expect(latex).not.toContain('Fallback report title');
  expect(errors).toEqual([]);
});

test('applying the saved snapshot to two reports preserves their text and unknown metadata', async ({ page }) => {
  for (const report of ['A', 'B']) {
    const markdown = `---\nfuture: keep\nlmx:\n  cover:\n    title: Báo cáo ${report}\n  structure:\n    toc: false\n    listOfFigures: false\n    listOfTables: false\n---\n\n:::cover\n:::\n\n# Nội dung ${report}\n\nKhông được mất nội dung.\n`;
    await page.evaluate(source => window.markdownEditor?.loadMarkdown(source), markdown);
    await page.evaluate(snapshot => window.markdownEditor?.handleEnvelope({
      protocolVersion: 1, type: 'document.applyAuthoredTheme', requestId: 'apply',
      payload: { snapshot },
    }), { schemaVersion: 1, id: 'bound-report', version: '1.0.0', name: 'Reusable report', scene: scene() });
    await page.evaluate(id => {
      window.markdownEditor?.requestMarkdown(`saved-${id}`);
      window.markdownEditor?.requestLatex(`latex-${id}`);
    }, report);
    const result = await page.evaluate(id => ({
      markdown: window.__studioMessages.find(message => message.requestId === `saved-${id}`)?.payload.markdown,
      latex: window.__studioMessages.find(message => message.requestId === `latex-${id}`)?.payload.latex,
    }), report);
    expect(result.markdown).toContain('future: keep');
    expect(result.markdown).toContain(`# Nội dung ${report}`);
    expect(result.markdown).toContain('Không được mất nội dung.');
    expect(result.latex).toContain(`Báo cáo ${report}`);
    expect(result.latex).not.toContain('Fallback report title');
  }
});
