import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const host = window as Window & { __bridgeMessages?: unknown[]; webkit?: unknown };
    host.__bridgeMessages = [];
    Object.defineProperty(host, 'webkit', {
      configurable: true,
      value: { messageHandlers: { bridge: {
        postMessage(message: unknown): void { host.__bridgeMessages?.push(message); },
      } } },
    });
  });
  await page.goto('/');
  await expect(page.locator('#editor.mu-editor')).toBeVisible();
  await page.evaluate(() => window.markdownEditor?.loadMarkdown([
    ':::cover',
    ':::',
    '',
    '# Noi dung',
    '',
  ].join('\n')));
});

test('shows per-page actions in the A4 gap and emits typed add/delete requests', async ({ page }) => {
  const strips = page.locator('.visual-page-action-strip');
  await expect(strips).toHaveCount(2);
  await expect(strips.nth(0)).toContainText('Trang 1');
  await expect(strips.nth(1)).toContainText('Trang 2');

  const readSecondStripPosition = () => strips.nth(1).evaluate((strip) => {
    const editor = document.querySelector<HTMLElement>('#editor');
    if (!editor) throw new Error('Visual editor is missing');
    const style = getComputedStyle(editor);
    const pageHeight = Number.parseFloat(style.getPropertyValue('--visual-page-height'));
    const pageGap = Number.parseFloat(style.getPropertyValue('--visual-page-gap'));
    return {
      top: strip.getBoundingClientRect().top - editor.getBoundingClientRect().top,
      pageHeight,
      pageGap,
    };
  });
  await expect.poll(async () => {
    const position = await readSecondStripPosition();
    return position.top >= position.pageHeight - 1
      && position.top < position.pageHeight + position.pageGap;
  }).toBe(true);
  const secondStripPosition = await readSecondStripPosition();
  expect(secondStripPosition.top).toBeGreaterThanOrEqual(secondStripPosition.pageHeight - 1);
  expect(secondStripPosition.top).toBeLessThan(
    secondStripPosition.pageHeight + secondStripPosition.pageGap,
  );
  const stripGeometry = await strips.nth(1).evaluate((strip) => {
    const editor = document.querySelector<HTMLElement>('#editor');
    if (!editor) throw new Error('Visual editor is missing');
    const stripRect = strip.getBoundingClientRect();
    const editorRect = editor.getBoundingClientRect();
    return {
      widthDelta: Math.abs(stripRect.width - editorRect.width),
      leftDelta: Math.abs(stripRect.left - editorRect.left),
    };
  });
  expect(stripGeometry.widthDelta).toBeLessThan(2);
  expect(stripGeometry.leftDelta).toBeLessThan(2);

  await page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('#editor');
    if (!editor) throw new Error('Visual editor is missing');
    const state = window as Window & {
      __pageActionRequests?: Array<{ type: string; detail: unknown }>;
    };
    state.__pageActionRequests = [];
    editor.addEventListener('visual-page-add-requested', (event) => {
      state.__pageActionRequests?.push({
        type: event.type,
        detail: (event as CustomEvent).detail,
      });
    });
    editor.addEventListener('visual-page-delete-requested', (event) => {
      state.__pageActionRequests?.push({
        type: event.type,
        detail: (event as CustomEvent).detail,
      });
    });
    editor.addEventListener('visual-page-move-requested', (event) => {
      state.__pageActionRequests?.push({
        type: event.type,
        detail: (event as CustomEvent).detail,
      });
    });
  });

  await expect(strips.nth(0).getByRole('button', { name: 'Di chuyển trang 1 lên' })).toBeDisabled();
  await expect(strips.nth(1).getByRole('button', { name: 'Di chuyển trang 2 xuống' })).toBeDisabled();
  await strips.nth(1).getByRole('button', { name: 'Di chuyển trang 2 lên' }).click();
  await strips.nth(0).getByRole('button', { name: 'Di chuyển trang 1 xuống' }).click();
  await strips.nth(0).getByRole('button', { name: 'Thêm trang sau trang 1' }).click();
  await strips.nth(1).getByRole('button', { name: 'Xóa trang 2' }).click();

  await expect.poll(() => page.evaluate(() => (
    (window as Window & { __pageActionRequests?: unknown[] }).__pageActionRequests
  ))).toEqual([
    { type: 'visual-page-move-requested', detail: { pageIndex: 1, direction: 'up' } },
    { type: 'visual-page-move-requested', detail: { pageIndex: 0, direction: 'down' } },
    { type: 'visual-page-add-requested', detail: { afterPageIndex: 0 } },
    { type: 'visual-page-delete-requested', detail: { pageIndex: 1 } },
  ]);
});

test('moving a populated page keeps both page contents visible and in Markdown order', async ({ page }) => {
  await page.evaluate(() => window.markdownEditor?.loadMarkdown([
    '# Trang A',
    '',
    ':::pagebreak',
    ':::',
    '',
    '# Trang B',
    '',
  ].join('\n')));

  const strips = page.locator('.visual-page-action-strip');
  await expect(strips).toHaveCount(2);
  const moved = await page.evaluate(() => window.markdownEditor?.movePage(1, 'up'));
  expect(moved).toBe(true);

  const readMarkdown = () => page.evaluate(() => {
    const host = window as Window & {
      __bridgeMessages?: Array<{ type: string; payload?: { markdown?: string } }>;
    };
    host.__bridgeMessages = [];
    window.markdownEditor?.requestMarkdown('page-move-regression');
    return host.__bridgeMessages?.find(message => message.type === 'document.markdown')
      ?.payload?.markdown ?? '';
  });
  await expect.poll(readMarkdown).toBe([
    '# Trang B',
    '',
    ':::pagebreak',
    ':::',
    '',
    '# Trang A',
    '',
  ].join('\n'));
  await expect(page.locator('#editor')).toContainText('Trang A');
  await expect(page.locator('#editor')).toContainText('Trang B');
});
