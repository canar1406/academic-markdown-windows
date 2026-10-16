import { expect, test } from '@playwright/test';

test('does not move the A4 layout under an active Vietnamese composition', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#editor.mu-editor')).toBeVisible();
  await page.evaluate(() => window.markdownEditor?.loadMarkdown(
    Array.from({ length: 24 }, (_, index) => `Đoạn ${index + 1}: văn bản kiểm tra.`).join('\n\n'),
  ));
  const paragraph = page.locator('.mu-paragraph-content').last();
  await paragraph.click();
  await page.keyboard.press('End');
  // Let initial layout, fonts and selection settle before measuring composition.
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame);
  });
  const composing = await paragraph.evaluate(async element => {
    const editor = document.querySelector<HTMLElement>('#editor')!;
    let commits = 0;
    const onCommit = () => { commits += 1; };
    editor.addEventListener('visual-page-layout-committed', onCommit);
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
    for (const text of [' t', ' ti', ' tiế', ' tiếng Việt']) {
      element.textContent = `Đoạn 24: văn bản kiểm tra.${text}`;
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
      element.dispatchEvent(new InputEvent('input', {
        bubbles: true, inputType: 'insertCompositionText', data: text, isComposing: true,
      }));
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    }
    editor.removeEventListener('visual-page-layout-committed', onCommit);
    element.dispatchEvent(new CompositionEvent('compositionend', {
      bubbles: true, data: ' tiếng Việt',
    }));
    return { commits };
  });
  expect(composing.commits, 'Repagination must wait until IME has committed its candidate').toBe(0);
  await expect(paragraph).toContainText('tiếng Việt');
  await expect.poll(() => page.evaluate(() => Number(
    document.querySelector<HTMLElement>('#editor')?.dataset.pageLayoutRevision,
  ))).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
