import { expect, test } from '@playwright/test';

test('find and replace is bounded, preserves Markdown, and can be undone', async ({ page }) => {
  const source = '---\ncustom: keep\n---\n\n# Báo cáo\n\nToán Toán\n:::not-a-real-block\n';
  await page.addInitScript(() => {
    const outbox: Array<{ type: string; payload?: { markdown?: string } }> = [];
    (window as Window & { __searchMessages?: typeof outbox }).__searchMessages = outbox;
    Object.defineProperty(window, 'webkit', {
      configurable: true,
      value: { messageHandlers: { bridge: {
        postMessage(message: { type: string; payload?: { markdown?: string } }) {
          outbox.push(message);
        },
      } } },
    });
  });
  await page.goto('/');
  await expect(page.locator('#editor.mu-editor')).toBeVisible();
  await page.evaluate(value => window.markdownEditor?.loadMarkdown(value), source);

  await page.evaluate(() => window.markdownEditor?.search('open'));
  await expect(page.locator('.search-replace-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Toggle replace' }).click();
  await page.locator('.search-query').fill('Toán');
  await page.locator('.search-replacement').fill('Giải tích');
  await page.getByRole('button', { name: 'Replace All' }).click();

  const markdown = () => page.evaluate(() => {
    window.markdownEditor?.requestMarkdown('search-test');
    const messages = (window as Window & {
      __searchMessages?: Array<{ type: string; payload?: { markdown?: string } }>;
    }).__searchMessages ?? [];
    return messages.filter(message => message.type === 'document.markdown').at(-1)?.payload?.markdown ?? '';
  });
  await expect.poll(markdown).toContain('Giải tích Giải tích');
  await expect.poll(markdown).toContain('custom: keep');

  await page.locator('#source-editor .cm-content').focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(markdown).toContain('Toán Toán');
  await expect.poll(markdown).toContain('custom: keep');
});

test('Find and Replace work directly in Visual, including table cells, without modifying YAML', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.markdownEditor?.loadMarkdown('---\ntitle: Toán\n---\n\n# Toán\n\nToán học\n\n| A | B |\n| --- | --- |\n| Toán | Toán |\n'));
  await page.evaluate(() => window.markdownEditor?.search('open'));
  await expect(page.locator('#editor')).toBeVisible();
  await expect(page.locator('#source-editor')).toBeHidden();
  await expect(page.locator('.search-scope')).toContainText('Visual');
  await page.locator('.search-query').fill('Toán');
  await expect(page.locator('.search-status')).toHaveText('1 of 4');
  await page.locator('.search-query').press('Enter');
  await expect(page.locator('.search-status')).toHaveText('2 of 4');
  await page.getByRole('button', { name: 'Toggle replace' }).click();
  await page.locator('.search-replacement').fill('Giải tích');
  await page.getByRole('button', { name: 'Replace All', exact: true }).click();
  await expect(page.locator('#editor table')).toContainText('Giải tích');
  await expect(page.locator('#source-editor')).toBeHidden();
  await page.locator('.search-query').press('Escape');
  await page.locator('#editor .mu-paragraph-content').first().click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('#editor table')).toContainText('Toán');
  await expect(page.locator('#editor table')).not.toContainText('Giải tích');
  await page.evaluate(() => window.markdownEditor?.setMode('source'));
  await expect(page.locator('#source-editor .cm-content')).toContainText('title: Toán');
});

test('selection seeds Find, navigation wraps, options recompute, and Escape restores source focus', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.markdownEditor?.loadMarkdown('Toán toán họcToán\n');
    window.markdownEditor?.setMode('source');
  });
  const content = page.locator('#source-editor .cm-content');
  await content.focus();
  await page.keyboard.press('ControlOrMeta+Home');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.evaluate(() => window.markdownEditor?.search('open'));
  await expect(page.locator('.search-query')).toHaveValue('Toán');
  await expect(page.locator('.search-replacement')).toBeHidden();
  await expect(page.locator('.search-status')).toHaveText('1 of 3');
  await page.locator('.search-query').press('Shift+Enter');
  await expect(page.locator('.search-status')).toHaveText('3 of 3');
  await page.locator('.search-query').press('Enter');
  await expect(page.locator('.search-status')).toHaveText('1 of 3');
  await page.getByRole('button', { name: 'Whole word', exact: true }).click();
  await expect(page.locator('.search-status')).toHaveText('1 of 2');
  await page.getByRole('button', { name: 'Match case', exact: true }).click();
  await expect(page.locator('.search-status')).toHaveText('1 of 1');
  await page.getByRole('button', { name: 'Match case', exact: true }).press('Escape');
  await expect(page.locator('.search-replace-panel')).toBeHidden();
  await expect(content).toBeFocused();
});

test('source edits and undo recompute matches without stealing focus; file loads clear stale replacements', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.markdownEditor?.loadMarkdown('Toán Toán\n');
    window.markdownEditor?.setMode('source');
    window.markdownEditor?.search('open');
  });
  await page.locator('.search-query').fill('Toán');
  await expect(page.locator('.search-status')).toHaveText('1 of 2');
  const content = page.locator('#source-editor .cm-content');
  await content.focus();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' Toán');
  await expect(page.locator('.search-status')).toContainText('of 3');
  await expect(content).toBeFocused();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.search-status')).toContainText('of 2');
  await page.getByRole('button', { name: 'Toggle replace' }).click();
  await page.locator('.search-replacement').fill('WRONG');
  await page.evaluate(() => window.markdownEditor?.loadMarkdown('new document\n'));
  await expect(page.locator('.search-replace-panel')).toBeHidden();
  await page.evaluate(() => window.markdownEditor?.search('replaceAll'));
  await expect(page.locator('.search-query')).toHaveValue('');
  await expect(page.locator('#editor')).toContainText('new document');
  await expect(page.locator('#editor')).not.toContainText('WRONG');
});

test('Replace advances past inserted query text and keeps each replacement separately undoable', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.markdownEditor?.loadMarkdown('cat cat\n');
    window.markdownEditor?.setMode('source');
    window.markdownEditor?.search('open');
  });
  await page.locator('.search-query').fill('cat');
  await page.getByRole('button', { name: 'Toggle replace' }).click();
  await page.locator('.search-replacement').fill('cat!');
  await page.locator('.search-replacement').press('Enter');
  await expect(page.locator('.search-status')).toHaveText('2 of 2');
  await page.locator('.search-replacement').press('Enter');
  const content = page.locator('#source-editor .cm-content');
  await expect(content).toHaveText('cat! cat!');
  await content.focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(content).toHaveText('cat! cat');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(content).toHaveText('cat cat');
});

 test('Visual re-open and replace do not operate on stale Source after switching documents', async ({page}) => {
 await page.goto('/');
 await page.evaluate(()=>{window.markdownEditor?.loadMarkdown('Old target');window.markdownEditor?.setMode('source');window.markdownEditor?.search('open');});
 await page.locator('.search-query').fill('target');
 await page.evaluate(()=>window.markdownEditor?.loadMarkdown('New target'));
 await expect(page.locator('.search-replace-panel')).toBeHidden();
 await page.evaluate(()=>window.markdownEditor?.search('open'));
 await page.locator('.search-query').fill('target');
 await page.getByRole('button',{name:'Toggle replace'}).click();
 await page.locator('.search-replacement').fill('text');
 await page.getByRole('button',{name:'Replace All',exact:true}).click();
 await expect(page.locator('#editor')).toContainText('New text');
 await expect(page.locator('#editor')).not.toContainText('Old');
});
