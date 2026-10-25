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

test('does not merge paragraphs or corrupt inline tokens when Backspace is pressed during active Vietnamese IME composition', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const outbox: Array<{ type: string; payload?: { markdown?: string } }> = [];
    (window as Window & { __typingMessages?: typeof outbox }).__typingMessages = outbox;
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
  await page.evaluate(() => window.markdownEditor?.loadMarkdown('Đoạn mở đầu.'));

  const paragraphs = page.locator('.mu-paragraph-content');
  await paragraphs.first().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(paragraphs).toHaveCount(2);
  const second = paragraphs.nth(1);

  await second.evaluate((element) => {
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
    element.textContent = 'ă';
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    element.dispatchEvent(new InputEvent('input', {
      bubbles: true, inputType: 'insertCompositionText', data: 'ă', isComposing: true,
    }));

    // User presses Backspace to clear the composed syllable while IME session is still active.
    element.textContent = '';
    const emptyRange = document.createRange();
    emptyRange.selectNodeContents(element);
    emptyRange.collapse(true);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(emptyRange);
    element.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true, cancelable: true, key: 'Backspace', isComposing: true,
    }));

    // User continues composing the intended Vietnamese syllable in the same paragraph.
    element.textContent = 'Đoạn hai tiếng Việt.';
    const finalRange = document.createRange();
    finalRange.selectNodeContents(element);
    finalRange.collapse(false);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(finalRange);
    element.dispatchEvent(new InputEvent('input', {
      bubbles: true, inputType: 'insertCompositionText', data: 'Đoạn hai tiếng Việt.', isComposing: true,
    }));
    element.dispatchEvent(new CompositionEvent('compositionend', {
      bubbles: true, data: 'Đoạn hai tiếng Việt.',
    }));
  });

  await expect(paragraphs).toHaveCount(2);
  const readMarkdown = () => page.evaluate(() => {
    window.markdownEditor?.requestMarkdown('typing-test');
    const messages = (window as Window & {
      __typingMessages?: Array<{ type: string; payload?: { markdown?: string } }>;
    }).__typingMessages ?? [];
    return messages.filter(message => message.type === 'document.markdown').at(-1)?.payload?.markdown ?? '';
  });
  await expect.poll(readMarkdown).toContain('Đoạn mở đầu.\n\nĐoạn hai tiếng Việt.');
  expect(errors).toEqual([]);
});

test('commits active Vietnamese IME composition and keeps block editable when focus moves to another paragraph before compositionend', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const outbox: Array<{ type: string; payload?: { markdown?: string } }> = [];
    (window as Window & { __typingMessages?: typeof outbox }).__typingMessages = outbox;
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
  await page.evaluate(() => window.markdownEditor?.loadMarkdown('**Mục 1:** \n\nMục 2.'));

  const paragraphs = page.locator('.mu-paragraph-content');
  await expect(paragraphs).toHaveCount(2);
  const first = paragraphs.nth(0);
  await first.click();
  await page.keyboard.press('End');

  await page.evaluate(() => {
    const all = document.querySelectorAll<HTMLElement>('.mu-paragraph-content');
    const block1 = all[0]!;
    const block2 = all[1]!;

    block1.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
    block1.append(document.createTextNode('tiếng Việt'));
    const range1 = document.createRange();
    range1.selectNodeContents(block1);
    range1.collapse(false);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range1);
    block1.dispatchEvent(new InputEvent('input', {
      bubbles: true, inputType: 'insertCompositionText', data: 'tiếng Việt', isComposing: true,
    }));

    // User clicks into the second paragraph while the IME underline is still active:
    // selection moves to block2, and the browser fires compositionend on block1.
    const range2 = document.createRange();
    range2.selectNodeContents(block2);
    range2.collapse(false);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range2);
    block1.dispatchEvent(new CompositionEvent('compositionend', {
      bubbles: true, data: 'tiếng Việt',
    }));
    block2.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  const readMarkdown = () => page.evaluate(() => {
    window.markdownEditor?.requestMarkdown('typing-blur-test');
    const messages = (window as Window & {
      __typingMessages?: Array<{ type: string; payload?: { markdown?: string } }>;
    }).__typingMessages ?? [];
    return messages.filter(message => message.type === 'document.markdown').at(-1)?.payload?.markdown ?? '';
  });

  // 1. Committed composition in block1 must not be lost from canonical Markdown.
  await expect.poll(readMarkdown).toContain('**Mục 1:** tiếng Việt');

  // 2. Clicking back into block1 and typing normal text must still work (isComposed must not stay wedged).
  await first.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' tiếp tục');
  await expect.poll(readMarkdown).toContain('**Mục 1:** tiếng Việt tiếp tục');
  expect(errors).toEqual([]);
});
