import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { BridgeEnvelope } from '@markdown/bridge-protocol';

declare global {
  interface Window {
    __windowsTestMessages: BridgeEnvelope[];
    __windowsTestReceive: (message: unknown) => void;
  }
}

// Runs the actual bundled editor in Chromium, with only the native WebView2
// message channel simulated. This is NOT a WinUI/WebView2 runtime acceptance test.
test('bundled editor uses Windows messages for Unicode source, find and LaTeX snapshots', async ({ page }) => {
  const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
  const types: Record<string, string> = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  };
  await page.route('https://editor.academic-markdown.invalid/**', async route => {
    const relative = decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
    const file = path.resolve(dist, relative || 'index.html');
    if (!file.startsWith(dist)) return route.abort();
    try {
      await route.fulfill({ body: await readFile(file), contentType: types[path.extname(file)] ?? 'application/octet-stream' });
    } catch { await route.fulfill({ status: 404 }); }
  });
  await page.addInitScript(() => {
    window.__windowsTestMessages = [];
    const listeners = new Set<(event: MessageEvent<unknown>) => void>();
    window.__windowsTestReceive = message => {
      for (const listener of listeners) listener(new MessageEvent('message', { data: message }));
    };
    Object.defineProperty(window, 'chrome', {
      configurable: true,
      value: { webview: {
        postMessage(message: BridgeEnvelope) { window.__windowsTestMessages.push(message); },
        addEventListener(_type: string, listener: (event: MessageEvent<unknown>) => void) { listeners.add(listener); },
        removeEventListener(_type: string, listener: (event: MessageEvent<unknown>) => void) { listeners.delete(listener); },
      } },
    });
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('https://editor.academic-markdown.invalid/index.html');
  await expect.poll(() => page.evaluate(() =>
    window.__windowsTestMessages.some(message => message.type === 'editor.ready'))).toBe(true);

  const send = (type: string, payload: Record<string, unknown> = {}, requestId: string | null = null) =>
    page.evaluate(envelope => window.__windowsTestReceive(envelope), { protocolVersion: 1, type, requestId, payload });
  const markdown = '---\ntitle: Báo cáo Windows\ncustom: giữ nguyên\n---\n\n# Toán học\n\nNội dung Toán.\n';
  await send('document.loadMarkdown', { markdown });
  await send('editor.setMode', { mode: 'source' });
  const source = page.locator('#source-editor .cm-content');
  await expect(source).toBeVisible();
  await expect(source).toContainText('custom: giữ nguyên');
  await source.fill(markdown + '\nTiếng Việt vừa gõ: Võ Nguyễn Hoàng Long.\n');
  await send('document.requestMarkdown', {}, 'windows-save');
  const saved = await page.evaluate(() =>
    window.__windowsTestMessages.find(message => message.type === 'document.markdown' && message.requestId === 'windows-save'));
  expect(saved?.payload.markdown).toContain('Tiếng Việt vừa gõ: Võ Nguyễn Hoàng Long.');
  expect(saved?.payload.markdown).toContain('custom: giữ nguyên');
  expect(saved?.payload.revision).toBeGreaterThan(0);

  await send('editor.search', { action: 'open' });
  await page.locator('.search-query').fill('Toán');
  await expect(page.locator('.search-status')).toContainText('of 2');
  await send('editor.search', { action: 'close' });
  await send('export.requestLatex', {}, 'windows-pdf');
  const exported = await page.evaluate(() =>
    window.__windowsTestMessages.find(message => message.type === 'export.latex' && message.requestId === 'windows-pdf'));
  expect(exported?.payload.latex).toContain('\\begin{document}');
  expect(exported?.payload.revision).toEqual(saved?.payload.revision);
  expect(exported?.payload.diagnostics).toEqual(expect.not.arrayContaining([expect.objectContaining({ severity: 'error' })]));
  expect(errors).toEqual([]);
});
