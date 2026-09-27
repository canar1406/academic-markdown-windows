import { expect, test, type Locator, type Page } from '@playwright/test';

interface HostMessage {
  type: string;
  requestId: string | null;
  payload: Record<string, unknown>;
}

const runtimeErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.addInitScript(() => {
    const host = window as Window & { __selectionMessages?: HostMessage[] };
    host.__selectionMessages = [];
    Object.defineProperty(host, 'webkit', {
      configurable: true,
      value: { messageHandlers: { bridge: {
        postMessage(message: HostMessage): void {
          host.__selectionMessages?.push(message);
        },
      } } },
    });
  });
  await page.goto('/');
  expect(new URL(page.url()).pathname).toBe('/');
  await expect(page).toHaveTitle(/Markdown/);
  await expect(page.locator('#editor.mu-editor')).toBeVisible();
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
});

test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page) ?? []).toEqual([]);
});

test('keeps Vietnamese multi-word math aliases open through spaces and inserts with Enter', async ({ page }) => {
  await loadMarkdown(page, '$$\nx =\n$$\n');
  const content = page.locator('.mu-math-block .mu-codeblock-content');
  await content.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' /');
  for (const word of ['trị ', 'tuyệt ', 'đối ']) {
    await page.keyboard.insertText(word);
    await expect(page.locator('.mu-float-wrapper').filter({ has: page.locator('.mu-math-quick-insert') }))
      .toHaveCSS('opacity', '1');
    await expect(page.locator('.mu-math-quick-insert [data-label="absolute-value"]')).toBeVisible();
  }
  await expect(page.locator('.mu-math-quick-insert [data-label="absolute-value"]'))
    .toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await expect.poll(() => markdown(page)).toBe('$$\nx = \\left|\\right|\n$$\n');
  await page.keyboard.type('a');
  await expect.poll(() => markdown(page)).toBe('$$\nx = \\left|a\\right|\n$$\n');
  await expect(page.locator('.mu-math-preview .katex')).toBeVisible();
});

test('does not mistake division or whitespace immediately after slash for commands', async ({ page }) => {
  await loadMarkdown(page, '$$\nx =\n$$\n');
  await page.locator('.mu-math-block .mu-codeblock-content').click();
  await page.keyboard.press('End');
  for (const text of [' 1/2', ' + a/b', ' + x / y', ' + / ']) {
    await page.keyboard.type(text);
    // Muya hides floating menus using opacity and offscreen positioning.
    await expect(page.locator('.mu-float-wrapper').filter({ has: page.locator('.mu-math-quick-insert') }))
      .toHaveCSS('opacity', '0');
  }
  await expect.poll(() => markdown(page)).toBe('$$\nx = 1/2 + a/b + x / y + / \n$$\n');
});

for (const modifier of ['Control', 'Meta']) {
  for (const sample of [
    { name: 'two paragraphs', source: 'Đoạn đầu tiếng Việt.\n\nĐoạn cuối.\n', selector: '.mu-paragraph .mu-content', text: 'Đoạn đầu tiếng Việt.' },
    { name: 'math block', source: 'Trước.\n\n$$\nx + y\n$$\n\nSau.\n', selector: '.mu-math-block .mu-codeblock-content', text: 'x + y' },
    { name: 'list item', source: 'Trước.\n\n- Mục một\n- Mục hai\n\nSau.\n', selector: '.mu-bullet-list .mu-content', text: 'Mục một' },
    { name: 'heading including its source marker', source: '# Hello World\n\nĐoạn cuối.\n', selector: '.mu-atxheading-content', text: '# Hello World' },
    { name: 'multiline code block', source: 'Trước.\n\n```text\nhello\nworld\n```\n\nSau.\n', selector: '.mu-code-block .mu-codeblock-content', text: 'hello\nworld' },
  ]) {
    test(`${modifier}+A selects ${sample.name} first, document second, and resets after cursor movement`, async ({ page }) => {
      await loadMarkdown(page, sample.source);
      const block = page.locator(sample.selector).filter({ hasText: sample.text }).first();
      if (sample.name === 'math block') await page.locator('.mu-math-preview').click();
      await placeCaret(block, 2);
      await page.keyboard.press(`${modifier}+a`);
      await expect.poll(() => selectedText(page)).toBe(sample.text);
      await page.keyboard.press(`${modifier}+a`);
      await expect.poll(() => selectionEndpoints(page)).toEqual({
        first: true, last: true, start: 0,
      });
      await page.keyboard.press(`${modifier}+a`);
      await expect.poll(() => selectionEndpoints(page)).toEqual({
        first: true, last: true, start: 0,
      });
      if (sample.name === 'math block') await page.locator('.mu-math-preview').click();
      await placeCaret(block, 1);
      await page.keyboard.press(`${modifier}+a`);
      await expect.poll(() => selectedText(page)).toBe(sample.text);
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press(`${modifier}+a`);
      await expect.poll(() => selectedText(page)).toBe(sample.text);
      await expect.poll(() => markdown(page)).toBe(sample.source);
    });
  }
}

test('resets selection after edits, partial selections, switching documents and modes', async ({ page }) => {
  await loadMarkdown(page, 'Đoạn một.\n\nĐoạn hai.\n');
  const first = page.locator('.mu-paragraph-content').first();
  await placeCaret(first, 2);
  await page.keyboard.press('Control+a');
  await page.keyboard.insertText('Nội dung mới.');
  await expect.poll(() => markdown(page)).toBe('Nội dung mới.\n\nĐoạn hai.\n');
  await page.keyboard.press('Control+a');
  await expect.poll(() => selectedText(page)).toBe('Nội dung mới.');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Control+a');
  await expect.poll(() => selectedText(page)).toBe('Nội dung mới.');
  await page.keyboard.press('Control+a');
  await loadMarkdown(page, 'Tài liệu khác.\n\nKết thúc.\n');
  await placeCaret(first, 1);
  await page.keyboard.press('Meta+a');
  await expect.poll(() => selectedText(page)).toBe('Tài liệu khác.');
  await page.evaluate(() => window.markdownEditor?.setMode('source'));
  await page.evaluate(() => window.markdownEditor?.setMode('visual'));
  await placeCaret(first, 1);
  await page.keyboard.press('Meta+a');
  await expect.poll(() => selectedText(page)).toBe('Tài liệu khác.');
});

test('does not intercept native metadata fields with a stale Visual selection', async ({ page }) => {
  await loadMarkdown(page, 'Đoạn một.\n\nĐoạn hai.\n');
  await placeCaret(page.locator('.mu-paragraph-content').first(), 2);
  await page.keyboard.press('Meta+a');
  await page.evaluate(() => {
    // Exercise both native field types under the plugin's own event root.
    for (const tag of ['input', 'textarea'] as const) {
      const field = document.createElement(tag);
      field.id = `selection-native-${tag}`;
      field.value = 'Metadata tiếng Việt';
      document.querySelector('#editor')?.append(field);
    }
  });
  for (const tag of ['input', 'textarea']) {
    const field = page.locator(`#selection-native-${tag}`);
    await field.focus();
    await page.keyboard.press('Meta+a');
    await expect.poll(() => field.evaluate((element) => {
      const input = element as HTMLInputElement | HTMLTextAreaElement;
      return input.value.slice(input.selectionStart ?? 0, input.selectionEnd ?? 0);
    })).toBe('Metadata tiếng Việt');
  }
  await expect.poll(() => markdown(page)).toBe('Đoạn một.\n\nĐoạn hai.\n');
});

test('block selection preserves copy, paste, replacement, undo and redo', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Clipboard permission support is Chromium-only.');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const source = 'Tiếng Việt.\n\nĐích.\n';
  await loadMarkdown(page, source);
  const first = page.locator('.mu-paragraph .mu-content').filter({ hasText: 'Tiếng Việt.' }).first();
  await placeCaret(first, 3);
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Meta+c');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('Tiếng Việt.');
  await page.keyboard.type('Replacement.');
  await expect.poll(() => markdown(page)).toBe('Replacement.\n\nĐích.\n');
  await page.keyboard.press('Meta+z');
  await expect.poll(() => markdown(page)).toBe(source);
  await page.keyboard.press('Meta+Shift+z');
  await expect.poll(() => markdown(page)).toBe('Replacement.\n\nĐích.\n');
  const destination = page.locator('.mu-paragraph .mu-content').filter({ hasText: 'Đích.' }).first();
  await placeCaret(destination, 2);
  await page.keyboard.press('Meta+a');
  await page.keyboard.press('Meta+v');
  await expect.poll(() => markdown(page)).toBe('Replacement.\n\nTiếng Việt.\n');
  await page.keyboard.press('Meta+z');
  await expect.poll(() => markdown(page)).toBe('Replacement.\n\nĐích.\n');
});

for (const modifier of ['Control', 'Meta']) test(`Source mode keeps standard ${modifier}+A behavior`, async ({ page }) => {
  const source = 'Đoạn đầu.\n\nĐoạn cuối.\n';
  await loadMarkdown(page, source);
  await page.evaluate(() => window.markdownEditor?.setMode('source'));
  await page.locator('#source-editor .cm-line').filter({ hasText: 'Đoạn đầu.' }).click();
  await page.keyboard.press('End');
  await page.keyboard.press(`${modifier}+a`);
  if (modifier === 'Control') {
    // On macOS, Control+A is the native beginning-of-line binding; Visual
    // must not claim it, while CodeMirror keeps its platform-native behavior.
    await page.keyboard.insertText('prefix ');
    await expect.poll(() => markdown(page)).toBe('prefix Đoạn đầu.\n\nĐoạn cuối.\n');
    await page.keyboard.press('Meta+z');
    await expect.poll(() => markdown(page)).toBe(source);
    return;
  }
  await page.keyboard.insertText('Nguồn thay thế.\n');
  await expect.poll(() => markdown(page)).toBe('Nguồn thay thế.\n');
  await page.keyboard.press('Meta+z');
  await expect.poll(() => markdown(page)).toBe(source);
});

async function loadMarkdown(page: Page, source: string): Promise<void> {
  await page.evaluate((value) => window.markdownEditor?.loadMarkdown(value), source);
  await expect.poll(() => markdown(page)).toBe(source);
}

let requestSequence = 0;
async function markdown(page: Page): Promise<string | null> {
  const requestId = `math-selection-${requestSequence += 1}`;
  await page.evaluate((id) => window.markdownEditor?.requestMarkdown(id), requestId);
  return page.evaluate((id) => {
    const messages = (window as Window & { __selectionMessages?: HostMessage[] }).__selectionMessages ?? [];
    const result = messages.find((message) => message.type === 'document.markdown' && message.requestId === id);
    return typeof result?.payload.markdown === 'string' ? result.payload.markdown : null;
  }, requestId);
}

async function selectedText(page: Page): Promise<string> {
  // Range text includes source markers hidden by Visual styling, so this also
  // proves the heading's "#" is inside the selected content, not left behind.
  return page.evaluate(() => {
    const selection = document.getSelection();
    return selection?.rangeCount ? selection.getRangeAt(0).toString() : '';
  });
}

async function selectionEndpoints(page: Page): Promise<{ first: boolean; last: boolean; start: number | undefined }> {
  return page.evaluate(() => {
    const selection = document.getSelection();
    const contents = [...document.querySelectorAll('#editor .mu-content')];
    return {
      first: contents[0]?.contains(selection?.anchorNode ?? null) ?? false,
      last: contents.at(-1)?.contains(selection?.focusNode ?? null) ?? false,
      start: selection?.anchorOffset,
    };
  });
}

async function placeCaret(element: Locator, offset: number): Promise<void> {
  await element.click();
  await element.evaluate((container, at) => {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    let remaining = at;
    while (node) {
      const length = node.textContent?.length ?? 0;
      if (remaining <= length) {
        document.getSelection()?.setPosition(node, remaining);
        document.dispatchEvent(new Event('selectionchange'));
        return;
      }
      remaining -= length;
      node = walker.nextNode();
    }
    throw new Error(`Caret offset ${at} was not rendered`);
  }, offset);
}
