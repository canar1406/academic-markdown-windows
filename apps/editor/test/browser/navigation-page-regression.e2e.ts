import { existsSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { DocumentIndexSnapshot } from '@markdown/document-core';

const localReport = new URL(
  '../../../../output/exports/BAO_CAO_KY_THUAT_ACADEMIC_MARKDOWN_LAMMERKAS.md',
  import.meta.url,
);
// Exercise the user's actual report read-only when available; keep the suite
// runnable on a fresh checkout, where output/exports is intentionally ignored.
const realReport = readFileSync(existsSync(localReport) ? localReport : new URL(
  '../../../../examples/btl-hk232-de1-steepest-ascent.md', import.meta.url,
), 'utf8');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const host = window as Window & { __navigationMessages?: unknown[] };
    host.__navigationMessages = [];
    Object.defineProperty(window, 'webkit', {
      configurable: true,
      value: { messageHandlers: { bridge: {
        postMessage(message: unknown) { host.__navigationMessages?.push(message); },
      } } },
    });
  });
  await page.goto('/');
  await expect(page.locator('#editor.mu-editor')).toBeVisible();
});

async function markdown(page: Page): Promise<string> {
  return page.evaluate(() => {
    window.markdownEditor?.requestMarkdown('navigation-regression');
    const messages = (window as Window & {
      __navigationMessages?: Array<{ type: string; payload: { markdown?: string } }>;
    }).__navigationMessages ?? [];
    return messages.filter(message => message.type === 'document.markdown').at(-1)?.payload.markdown ?? '';
  });
}

async function settle(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}

test('Outline reveal reaches the requested real-report heading through the host bridge', async ({ page }) => {
  await page.evaluate(source => window.markdownEditor?.loadMarkdown(source), realReport);
  await settle(page);
  const beforeNavigation = await markdown(page);
  const lastEntry = await page.evaluate(() => {
    const messages = (window as Window & {
      __navigationMessages?: Array<{ type: string; payload: DocumentIndexSnapshot }>;
    }).__navigationMessages ?? [];
    return messages.filter(message => message.type === 'document.indexChanged').at(-1)?.payload.outline.at(-1);
  });
  expect(lastEntry).toBeTruthy();
  await page.evaluate(location => window.markdownEditor?.revealLocation(location), lastEntry!.sourceRange);
  const heading = page.locator('#editor .mu-atx-heading').last();
  await expect(heading).toBeInViewport();
  expect(await markdown(page)).toBe(beforeNavigation);
});

for (const prefix of [
  '---\ntitle: Báo cáo\n---\n\n',
  '---\n/{lmx: {schema: 1}, title: "Báo cáo"}\n---\n\n',
]) {
  test(`duplicate Outline titles resolve their own source occurrence (${prefix.includes('/{') ? 'legacy' : 'YAML'})`, async ({ page }) => {
    await page.evaluate(source => window.markdownEditor?.loadMarkdown(source),
      `${prefix}# **Cùng [tên](https://example.org)**\n\n:::pagebreak\n:::\n\n# **Cùng [tên](https://example.org)**\n`);
    await settle(page);
    const before = await markdown(page);
    const locations = await page.evaluate(() => {
      const messages = (window as Window & {
        __navigationMessages?: Array<{ type: string; payload: DocumentIndexSnapshot }>;
      }).__navigationMessages ?? [];
      return messages.filter(message => message.type === 'document.indexChanged').at(-1)!
        .payload.outline.map(entry => entry.sourceRange);
    });
    for (const index of [1, 0, 1]) {
      await page.evaluate(location => window.markdownEditor?.revealLocation(location), locations[index]);
      await expect(page.locator('#editor .mu-atx-heading').nth(index)).toBeInViewport();
      expect(await page.evaluate(() => {
        const headings = [...document.querySelectorAll('#editor .mu-atx-heading')];
        return headings.findIndex(heading => heading.contains(window.getSelection()?.anchorNode ?? null));
      })).toBe(index);
      await expect(page.locator('#editor')).toHaveAttribute('data-selected-page-index', String(index));
    }
    expect(await markdown(page)).toBe(before);
  });
}

for (const zoom of [1, 0.5, 1.5]) {
  test(`blank first-page selection keeps typing before its break at zoom ${zoom}`, async ({ page }) => {
    const source = ':::pagebreak\n:::\n\n# Trang tiếp theo\n';
    await page.evaluate(value => window.markdownEditor?.loadMarkdown(value), source);
    await settle(page);
    await page.locator('#editor .mu-atxheading-content').click();
    await page.evaluate(value => {
      window.markdownEditor?.setZoom(value, 0);
      window.markdownEditor?.selectPage(0);
    }, zoom);
    await settle(page);
    expect(await markdown(page)).toBe(source);
    await expect(page.getByRole('textbox', { name: 'Nội dung trang 1' })).toBeFocused();
    await page.keyboard.insertText('Viết đúng trang trống');
    await expect.poll(() => markdown(page)).toBe(`Viết đúng trang trống\n\n${source}`);
    const first = page.locator('#editor > .mu-container > .mu-paragraph').first();
    const pageIndex = await first.evaluate(element => {
      const editor = document.querySelector<HTMLElement>('#editor')!;
      const style = getComputedStyle(editor);
      const slot = Number.parseFloat(style.getPropertyValue('--visual-page-height'))
        + Number.parseFloat(style.getPropertyValue('--visual-page-gap'));
      const scale = editor.getBoundingClientRect().width / editor.offsetWidth;
      return Math.floor((element.getBoundingClientRect().top - editor.getBoundingClientRect().top) / scale / slot);
    });
    expect(pageIndex).toBe(0);
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => markdown(page)).toBe(source);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect.poll(() => markdown(page)).toBe(`Viết đúng trang trống\n\n${source}`);
  });

  test(`real-report text avoids header/footer at zoom ${zoom}`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.evaluate(source => window.markdownEditor?.loadMarkdown(source), realReport);
    await page.evaluate(value => window.markdownEditor?.setZoom(value, 0), zoom);
    await settle(page);
    const overlaps = await page.evaluate(() => {
      const editor = document.querySelector<HTMLElement>('#editor')!;
      const scale = editor.getBoundingClientRect().width / editor.offsetWidth;
      const chrome = [...editor.querySelectorAll<HTMLElement>('.visual-page-header, .visual-page-footer')];
      const text = [...editor.querySelectorAll<HTMLElement>('.mu-content')]
        .filter(element => !element.closest('.mu-hide, [hidden]') && element.textContent?.trim());
      return text.flatMap(element => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        const ranges: DOMRect[] = [];
        let node: Node | null;
        while ((node = walker.nextNode())) {
          if (!node.textContent?.trim() || (node.parentElement?.closest('.mu-hide, [hidden]'))) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          ranges.push(...range.getClientRects());
        }
        return ranges.flatMap(rect => chrome.flatMap(decoration => {
          const bounds = decoration.getBoundingClientRect();
          const overlap = Math.min(rect.bottom, bounds.bottom) - Math.max(rect.top, bounds.top);
          return overlap > scale * 2 && rect.left < bounds.right && rect.right > bounds.left
            ? [{ text: element.textContent?.slice(0, 70), chrome: decoration.className, overlap: overlap / scale }]
            : [];
        }));
      });
    });
    await page.screenshot({ path: testInfo.outputPath(`report-${zoom}.png`) });
    expect(errors).toEqual([]);
    expect(overlaps).toEqual([]);
  });
}

test('selecting generated contents clears a body caret without rewriting the document', async ({ page }) => {
  const source = ':::toc\n:::\n\n# Nội dung\n';
  await page.evaluate(value => window.markdownEditor?.loadMarkdown(value), source);
  await settle(page);
  await page.locator('#editor .mu-atxheading-content').click();
  await page.evaluate(() => window.markdownEditor?.selectPage(0));
  expect(await page.evaluate(() => window.getSelection()?.rangeCount)).toBe(0);
  await page.keyboard.insertText('Không chèn vào trang khác');
  expect(await markdown(page)).toBe(source);
});
