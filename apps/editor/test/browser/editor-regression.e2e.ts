import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';

interface HostMessage {
  type: string;
  requestId: string | null;
  payload: Record<string, unknown>;
}

const fixture = readFileSync(
  fileURLToPath(new URL('../fixtures/editor-regression.md', import.meta.url)),
  'utf8',
);
const physicsReportFixture = readFileSync(
  fileURLToPath(new URL('../../../../examples/btl-hk232-de1-steepest-ascent.md', import.meta.url)),
  'utf8',
);
const runtimeErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
  await page.addInitScript(() => {
    const host = window as Window & {
      __bridgeMessages?: HostMessage[];
      __securityPolicyViolations?: Array<{
        blockedURI: string;
        effectiveDirective: string;
        violatedDirective: string;
      }>;
      webkit?: unknown;
    };
    host.__bridgeMessages = [];
    host.__securityPolicyViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      host.__securityPolicyViolations?.push({
        blockedURI: event.blockedURI,
        effectiveDirective: event.effectiveDirective,
        violatedDirective: event.violatedDirective,
      });
    });
    Object.defineProperty(host, 'webkit', {
      configurable: true,
      value: {
        messageHandlers: {
          bridge: {
            postMessage(message: HostMessage): void {
              host.__bridgeMessages?.push(message);
            },
          },
        },
      },
    });
  });
  await page.goto('/');
  await expect(page.locator('#editor.mu-editor')).toBeVisible();
  await loadMarkdown(page, fixture);
});

test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page) ?? []).toEqual([]);
});

test('never stacks Visual and Markdown surfaces', async ({ page }) => {
  await expect.poll(() => surfaceVisibility(page)).toEqual({
    visualDisplay: 'block',
    visualHeightPositive: true,
    sourceDisplay: 'none',
    sourceHeightPositive: false,
  });
  await page.screenshot({ path: artifactPath('mode-visual-exclusive.png') });

  await page.evaluate(() => window.markdownEditor?.setMode('source'));

  await expect.poll(() => surfaceVisibility(page)).toEqual({
    visualDisplay: 'none',
    visualHeightPositive: false,
    sourceDisplay: 'block',
    sourceHeightPositive: true,
  });
  await page.screenshot({ path: artifactPath('mode-source-exclusive.png') });
});

test('renders Markdown source as plain dark text on a white surface', async ({ page }) => {
  await page.evaluate(() => window.markdownEditor?.setMode('source'));

  const sourceAppearance = () => page.evaluate(() => {
    const source = document.querySelector<HTMLElement>('#source-editor');
    const editor = document.querySelector<HTMLElement>('#source-editor .cm-editor');
    const content = document.querySelector<HTMLElement>('#source-editor .cm-content');
    const gutters = document.querySelector<HTMLElement>('#source-editor .cm-gutters');
    if (!source || !editor || !content || !gutters) throw new Error('Source editor was not mounted');
    return {
      surfaceBackground: getComputedStyle(source).backgroundColor,
      surfaceBackgroundImage: getComputedStyle(source).backgroundImage,
      contentBackground: getComputedStyle(editor).backgroundColor,
      contentBackgroundImage: getComputedStyle(editor).backgroundImage,
      contentColor: getComputedStyle(content).color,
      gutterBackground: getComputedStyle(gutters).backgroundColor,
      gutterBackgroundImage: getComputedStyle(gutters).backgroundImage,
    };
  });
  await expect.poll(sourceAppearance).toMatchObject({
    surfaceBackground: 'rgb(255, 254, 252)',
    contentBackground: 'rgb(255, 254, 252)',
    contentColor: 'rgb(40, 39, 36)',
    gutterBackground: 'rgb(255, 254, 252)',
  });
  const appearance = await sourceAppearance();
  expect(appearance.surfaceBackgroundImage).toContain('repeating-linear-gradient');
  expect(appearance.contentBackgroundImage).toContain('repeating-linear-gradient');
  expect(appearance.gutterBackgroundImage).toContain('repeating-linear-gradient');
});

test('keeps Markdown source on complete A4 sheets without a partial final page', async ({ page }) => {
  const source = Array.from({ length: 100 }, (_, index) => [
    `## Mục ${index + 1}`,
    '',
    `Nội dung source A4 số ${index + 1}.`,
    '',
  ].join('\n')).join('\n');
  await page.evaluate((markdown) => window.markdownEditor?.loadMarkdown(markdown), source);
  await page.evaluate(() => window.markdownEditor?.setMode('source'));

  const readMetrics = () => page.evaluate(() => {
    const sourceEditor = document.querySelector<HTMLElement>('#source-editor');
    if (!sourceEditor) throw new Error('Source editor did not render');
    const style = getComputedStyle(sourceEditor);
    const pageHeight = Number.parseFloat(style.getPropertyValue('--visual-page-height'));
    const pageGap = Number.parseFloat(style.getPropertyValue('--visual-page-gap'));
    const height = sourceEditor.getBoundingClientRect().height;
    const slotHeight = pageHeight + pageGap;
    const pageCount = Math.max(1, Math.round((height + pageGap) / slotHeight));
    return {
      pageCount,
      partialSheetHeight: Math.abs(height - (pageCount * slotHeight - pageGap)),
    };
  });
  await expect.poll(async () => (await readMetrics()).pageCount).toBeGreaterThan(1);

  const metrics = await readMetrics();
  expect(metrics.partialSheetHeight).toBeLessThan(2);
});

test('keeps Markdown source lines out of the A4 page gap', async ({ page }) => {
  const source = Array.from({ length: 100 }, (_, index) => [
    `## Mục ${index + 1}`,
    '',
    `Nội dung source A4 số ${index + 1}.`,
    '',
  ].join('\n')).join('\n');
  await page.evaluate((markdown) => window.markdownEditor?.loadMarkdown(markdown), source);
  await page.evaluate(() => window.markdownEditor?.setMode('source'));

  await expect.poll(() => page.evaluate(() => {
    const sourceEditor = document.querySelector<HTMLElement>('#source-editor');
    if (!sourceEditor) throw new Error('Source editor did not render');
    const style = getComputedStyle(sourceEditor);
    const pageHeight = Number.parseFloat(style.getPropertyValue('--visual-page-height'));
    const pageGap = Number.parseFloat(style.getPropertyValue('--visual-page-gap'));
    const slotHeight = pageHeight + pageGap;
    const editorTop = sourceEditor.getBoundingClientRect().top;
    return [...sourceEditor.querySelectorAll<HTMLElement>('.cm-line')].flatMap((line, index) => {
      const rect = line.getBoundingClientRect();
      const top = rect.top - editorTop;
      const pageOffset = ((top % slotHeight) + slotHeight) % slotHeight;
      const startsInGap = pageOffset >= pageHeight - 1;
      const crossesIntoGap = pageOffset + rect.height > pageHeight + 1;
      return startsInGap || crossesIntoGap ? [index] : [];
    });
  })).toEqual([]);
});

test('keeps Markdown source line numbers out of the A4 page gap', async ({ page }) => {
  const source = Array.from({ length: 100 }, (_, index) => [
    `## Mục ${index + 1}`,
    '',
    `Nội dung source A4 số ${index + 1}.`,
    '',
  ].join('\n')).join('\n');
  await page.evaluate((markdown) => window.markdownEditor?.loadMarkdown(markdown), source);
  await page.evaluate(() => window.markdownEditor?.setMode('source'));

  await expect.poll(() => page.evaluate(() => {
    const sourceEditor = document.querySelector<HTMLElement>('#source-editor');
    if (!sourceEditor) throw new Error('Source editor did not render');
    const style = getComputedStyle(sourceEditor);
    const pageHeight = Number.parseFloat(style.getPropertyValue('--visual-page-height'));
    const pageGap = Number.parseFloat(style.getPropertyValue('--visual-page-gap'));
    const slotHeight = pageHeight + pageGap;
    const editorTop = sourceEditor.getBoundingClientRect().top;
    return [...sourceEditor.querySelectorAll<HTMLElement>('.cm-lineNumbers .cm-gutterElement')]
      .flatMap((lineNumber) => {
        if (!(lineNumber.textContent ?? '').trim()) return [];
        const rect = lineNumber.getBoundingClientRect();
        const top = rect.top - editorTop;
        const pageOffset = ((top % slotHeight) + slotHeight) % slotHeight;
        const startsInGap = pageOffset >= pageHeight - 1;
        const crossesIntoGap = pageOffset + rect.height > pageHeight + 1;
        return startsInGap || crossesIntoGap ? [lineNumber.textContent?.trim()] : [];
      });
  })).toEqual([]);
});

test('recalculates Markdown source A4 geometry after its sheet width changes', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.evaluate(() => window.markdownEditor?.setMode('source'));

  const a4RatioError = () => page.evaluate(() => {
    const sourceEditor = document.querySelector<HTMLElement>('#source-editor');
    if (!sourceEditor) throw new Error('Source editor did not render');
    const pageHeight = Number.parseFloat(
      getComputedStyle(sourceEditor).getPropertyValue('--visual-page-height'),
    );
    return Math.abs(pageHeight / sourceEditor.getBoundingClientRect().width - (297 / 210));
  });
  await expect.poll(a4RatioError).toBeLessThan(0.001);

  await page.requestGC();
  await page.locator('#source-editor').evaluate((sourceEditor) => {
    if (!(sourceEditor instanceof HTMLElement)) throw new Error('Source editor did not render');
    sourceEditor.style.width = '600px';
  });

  await expect.poll(a4RatioError).toBeLessThan(0.001);
});

test('stabilizes Markdown A4 page gaps after switching from Visual', async ({ page }) => {
  await page.setViewportSize({ width: 1050, height: 900 });
  await page.evaluate((source) => window.markdownEditor?.loadMarkdown(source), physicsReportFixture);
  await page.evaluate(() => window.markdownEditor?.setMode('source'));
  await expect(page.locator('.source-page-gap').first()).toBeAttached();

  const samples = await page.evaluate(async () => {
    const values: Array<{ gapHeights: number[]; scrollHeight: number }> = [];
    for (let frame = 0; frame < 90; frame += 1) {
      await new Promise(requestAnimationFrame);
      const scroller = document.querySelector<HTMLElement>('#source-editor .cm-scroller');
      if (!scroller) throw new Error('Source editor scroller did not render');
      values.push({
        gapHeights: [...document.querySelectorAll<HTMLElement>('.source-page-gap')]
          .map((gap) => Math.round(gap.getBoundingClientRect().height * 100) / 100),
        scrollHeight: scroller.scrollHeight,
      });
    }
    return values;
  });

  expect(new Set(samples.map(({ gapHeights }) => JSON.stringify(gapHeights))).size).toBe(1);
  expect(Math.max(...samples.map(({ scrollHeight }) => scrollHeight))
    - Math.min(...samples.map(({ scrollHeight }) => scrollHeight))).toBeLessThanOrEqual(1);
});

test('keeps one very long Markdown source line out of A4 page gaps', async ({ page }) => {
  const source = Array.from({ length: 3000 }, (_, index) => `từ-${index + 1}`).join(' ');
  await page.evaluate((markdown) => window.markdownEditor?.loadMarkdown(markdown), source);
  await page.evaluate(() => window.markdownEditor?.setMode('source'));

  await expect.poll(() => page.evaluate(() => {
    const sourceEditor = document.querySelector<HTMLElement>('#source-editor');
    const scroller = sourceEditor?.querySelector<HTMLElement>('.cm-scroller');
    if (!sourceEditor || !scroller) throw new Error('Source editor did not render');
    const style = getComputedStyle(sourceEditor);
    const pageHeight = Number.parseFloat(style.getPropertyValue('--visual-page-height'));
    const pageGap = Number.parseFloat(style.getPropertyValue('--visual-page-gap'));
    const slotHeight = pageHeight + pageGap;
    const editorTop = sourceEditor.getBoundingClientRect().top;
    const crossingRows = [...sourceEditor.querySelectorAll<HTMLElement>(
      '.cm-line, .cm-lineNumbers .cm-gutterElement',
    )].flatMap((row) => {
      if (!(row.textContent ?? '').trim()) return [];
      const rect = row.getBoundingClientRect();
      const top = rect.top - editorTop;
      const pageOffset = ((top % slotHeight) + slotHeight) % slotHeight;
      return pageOffset >= pageHeight - 1 || pageOffset + rect.height > pageHeight + 1
        ? [row.className]
        : [];
    });
    return {
      crossingRows,
      horizontalOverflow: scroller.scrollWidth > scroller.clientWidth + 1,
    };
  })).toEqual({ crossingRows: [], horizontalOverflow: true });
});

test('exposes semantic blocks and both editor modes to assistive technology', async ({ page }) => {
  await loadMarkdown(page, [
    ':::theorem {#thm-a11y}',
    'Nội dung định lý.',
    ':::',
    '',
    ':::pagebreak',
    ':::',
    '',
  ].join('\n'));

  await expect(page.locator('[data-lmx-name="theorem"]'))
    .toHaveAttribute('role', 'group');
  await expect(page.locator('[data-lmx-name="theorem"]'))
    .toHaveAttribute('aria-label', 'Định lý');
  await expect(page.locator('[data-lmx-name="pagebreak"]'))
    .toHaveAttribute('role', 'group');
  await expect(page.locator('[data-lmx-name="pagebreak"]'))
    .toHaveAttribute('aria-label', 'Page Break');
  await expect(page.locator('[data-lmx-name="pagebreak"]'))
    .toHaveAttribute('tabindex', '0');
  await page.locator('[data-lmx-name="pagebreak"]').focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => (
    (window as Window & { __bridgeMessages?: HostMessage[] }).__bridgeMessages ?? []
  ).some((message) => (
    message.type === 'editor.lmxBlockSelected'
    && message.payload.name === 'pagebreak'
  )))).toBe(true);

  await page.evaluate(() => window.markdownEditor?.setMode('source'));
  await expect(page.locator('#source-editor .cm-content[contenteditable="true"]'))
    .toBeVisible();
});

test('renders every registered academic block and keeps its source marker available', async ({ page }) => {
  const source = [
    ':::cover', ':::', '',
    ':::toc', ':::', '',
    ':::list-of-figures', ':::', '',
    ':::list-of-tables', ':::', '',
    ':::pagebreak', ':::', '',
    ':::theorem {#thm-fixture}', 'Nội dung định lý.', ':::', '',
    ':::property {#property-fixture}', 'Nội dung tính chất.', ':::', '',
    ':::proposition {#proposition-fixture}', 'Nội dung mệnh đề.', ':::', '',
    ':::corollary {#corollary-fixture}', 'Nội dung hệ quả.', ':::', '',
    ':::lemma {#lemma-fixture}', 'Nội dung bổ đề.', ':::', '',
    ':::exercise {#exercise-fixture}', 'Nội dung bài toán.', ':::', '',
    ':::figure {#fig-fixture caption="Hình minh họa"}', '![Hình](assets/missing.png)', ':::', '',
    ':::table {#tbl-fixture caption="Bảng minh họa"}', '| A | B |', '| --- | --- |', '| 1 | 2 |', ':::', '',
    ':::listing {#lst-fixture caption="Mã minh họa" language="text" lineNumbers=true}',
    '```text', 'code', '```', ':::', '',
    ':::front-section {kind="abstract" title="Tóm tắt" numbered=false}',
    'Nội dung tóm tắt.', ':::', '',
  ].join('\n');

  await page.evaluate((markdown) => window.markdownEditor?.loadMarkdown(markdown), source);
  await expect(page.locator('[data-lmx-name="cover"]')).toHaveCount(1);
  for (const name of [
    'cover', 'toc', 'list-of-figures', 'list-of-tables', 'pagebreak',
    'theorem', 'property', 'proposition', 'corollary', 'lemma', 'exercise',
    'figure', 'table', 'listing', 'front-section',
  ]) {
    await expect(page.locator(`[data-lmx-name="${name}"]`)).toHaveCount(1);
  }
  await expect(page.locator('[data-lmx-name="figure"] .mu-lmx-caption')).toHaveText('Hình minh họa');
  await expect(page.locator('[data-lmx-name="table"] .mu-lmx-caption')).toHaveText('Bảng minh họa');
  await expect(page.locator('[data-lmx-name="listing"] .mu-lmx-caption')).toHaveText('Mã minh họa');

  await page.evaluate(() => window.markdownEditor?.setMode('source'));
  const markdown = await requestMarkdown(page);
  expect(markdown).toContain(':::theorem {#thm-fixture}');
  expect(markdown).toContain(':::listing {#lst-fixture caption="Mã minh họa" language="text" lineNumbers=true}');
  expect(markdown).toContain(':::front-section {kind="abstract" numbered=false title="Tóm tắt"}');
});

test('renders front sections as LaTeX-style headings instead of editor cards', async ({ page }) => {
  const source = ':::front-section {kind="acknowledgements" title="Lời cảm ơn" numbered=false}\nNội dung lời cảm ơn.\n:::\n';
  await page.evaluate((markdown) => window.markdownEditor?.loadMarkdown(markdown), source);
  await expect(page.locator('[data-lmx-name="front-section"]')).toBeVisible();

  const appearance = await page.evaluate(() => {
    const block = document.querySelector<HTMLElement>('[data-lmx-name="front-section"]');
    const header = block?.querySelector<HTMLElement>('.mu-lmx-header');
    const kind = block?.querySelector<HTMLElement>('.mu-lmx-kind');
    const title = block?.querySelector<HTMLElement>('.mu-lmx-title');
    if (!block || !header || !kind || !title) throw new Error('Front section did not render');
    const style = getComputedStyle(block);
    return {
      border: style.border,
      borderLeft: style.borderLeftWidth,
      background: style.backgroundColor,
      kindDisplay: getComputedStyle(kind).display,
      titleDisplay: getComputedStyle(title).display,
      titleText: title.textContent,
    };
  });

  expect(appearance.borderLeft).toBe('0px');
  expect(appearance.background).toBe('rgba(0, 0, 0, 0)');
  expect(appearance.kindDisplay).toBe('none');
  expect(appearance.titleDisplay).not.toBe('none');
  expect(appearance.titleText).toBe('Lời cảm ơn');
});

test('opens column actions from the bottom table handle and inserts a column', async ({ page }) => {
  await page.evaluate(() => window.markdownEditor?.loadMarkdown([
    '| A | B |',
    '| --- | --- |',
    '| 1 | 2 |',
  ].join('\n')));

  const firstCell = page.locator('.mu-table-cell').first();
  const cellBounds = await firstCell.boundingBox();
  if (!cellBounds) throw new Error('Table cell did not render');
  const tableBounds = await page.locator('.mu-table-inner').boundingBox();
  if (!tableBounds) throw new Error('Table did not render');

  await page.mouse.move(
    cellBounds.x + cellBounds.width / 2,
    tableBounds.y + tableBounds.height + 8,
  );
  const bottomHandle = page.locator('.mu-table-drag-bar[data-drag="bottom"]');
  await expect(bottomHandle).toBeVisible();
  await bottomHandle.click();

  const insertRight = page.getByText('Insert Column Right', { exact: true });
  await expect(insertRight).toBeVisible();
  await insertRight.click();

  await expect(page.locator('.mu-table-row').first().locator('.mu-table-cell')).toHaveCount(3);
  await expect.poll(() => requestMarkdown(page)).toMatch(/\|\s*A\s*\|\s*\|\s*B\s*\|/);
});

test('sends dropped image files to the native host and inserts the returned asset path', async ({ page }) => {
  await page.evaluate(() => window.markdownEditor?.loadMarkdown('Đặt ảnh tại đây.'));
  await page.locator('#editor .mu-paragraph').click();
  await page.evaluate(() => {
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'hình minh họa.png', {
      type: 'image/png',
    });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    document.querySelector('#editor')?.dispatchEvent(new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer: transfer,
    }));
  });

  await expect.poll(() => page.evaluate(() => (
    ((window as Window & { __bridgeMessages?: HostMessage[] }).__bridgeMessages ?? [])
      .find((message) => message.type === 'editor.imageDrop')
  ))).toMatchObject({
    type: 'editor.imageDrop',
    payload: { filename: 'hình minh họa.png', mimeType: 'image/png' },
  });
  const request = await page.evaluate(() => (
    ((window as Window & { __bridgeMessages?: HostMessage[] }).__bridgeMessages ?? [])
      .find((message) => message.type === 'editor.imageDrop')
  ));
  const requestId = (request as unknown as HostMessage).requestId;
  await page.evaluate((id) => window.markdownEditor?.handleEnvelope({
    protocolVersion: 1,
    type: 'editor.imageDrop.result',
    requestId: id,
    payload: { relativePath: 'assets/hinh-minh-hoa.png' },
  }), requestId);
  await expect.poll(() => requestMarkdown(page)).toContain('![hình minh họa](assets/hinh-minh-hoa.png)');
});

test('matches HCMUT amsthm typography across the theorem family', async ({ page }) => {
  const source = [
    ':::theorem {title="Định lý mẫu"}', 'Nội dung định lý.', ':::', '',
    ':::property {title="Tính chất mẫu"}', 'Nội dung tính chất.', ':::', '',
    ':::proposition {title="Mệnh đề mẫu"}', 'Nội dung mệnh đề.', ':::', '',
    ':::corollary {title="Hệ quả mẫu"}', 'Nội dung hệ quả.', ':::', '',
    ':::lemma {title="Bổ đề mẫu"}', 'Nội dung bổ đề.', ':::', '',
    ':::exercise {title="Bài toán mẫu"}', 'Nội dung bài toán.', ':::', '',
  ].join('\n');
  await page.evaluate((markdown) => window.markdownEditor?.loadMarkdown(markdown), source);

  await expect.poll(() => page.locator('#editor').evaluate((editor) => (
    getComputedStyle(editor).fontFamily
  ))).toMatch(/^"?Times New Roman"?/);

  const family = await page.locator('.mu-lmx-directive[data-lmx-name]').evaluateAll((blocks) => (
    blocks.map((block) => {
      if (!(block instanceof HTMLElement)) throw new Error('Theorem block did not render');
      const header = block.querySelector<HTMLElement>(':scope > .mu-lmx-header');
      const kind = block.querySelector<HTMLElement>('.mu-lmx-kind');
      const title = block.querySelector<HTMLElement>('.mu-lmx-title');
      const body = block.querySelector<HTMLElement>(':scope > .mu-paragraph:first-of-type');
      if (!header || !kind || !title || !body) throw new Error('Theorem typography is incomplete');
      return {
        name: block.dataset.lmxName,
        blockFontStyle: getComputedStyle(block).fontStyle,
        counterIncrement: getComputedStyle(block).counterIncrement,
        headerDisplay: getComputedStyle(header).display,
        kindWeight: getComputedStyle(kind).fontWeight,
        titleText: title.textContent,
        titleBefore: getComputedStyle(title, '::before').content,
        titleAfter: getComputedStyle(title, '::after').content,
        bodyDisplay: getComputedStyle(body).display,
      };
    })
  ));

  expect(family.map(({ name }) => name)).toEqual([
    'theorem', 'property', 'proposition', 'corollary', 'lemma', 'exercise',
  ]);
  expect(family.map(({ blockFontStyle }) => blockFontStyle)).toEqual([
    'italic', 'italic', 'italic', 'italic', 'italic', 'normal',
  ]);
  expect(family.map(({ counterIncrement }) => counterIncrement)).toEqual([
    'hcmut-theorem 1',
    'hcmut-property 1',
    'hcmut-proposition 1',
    'hcmut-proposition 1',
    'hcmut-proposition 1',
    'hcmut-exercise 1',
  ]);
  expect(family.every(({ headerDisplay, kindWeight, bodyDisplay }) => (
    headerDisplay === 'inline'
    && Number.parseInt(kindWeight, 10) >= 700
    && bodyDisplay === 'inline'
  ))).toBe(true);
  expect(family.map(({ titleBefore, titleAfter }) => [titleBefore, titleAfter])).toEqual(
    Array.from({ length: 6 }, () => ['"("', '")."']),
  );
  expect(family.map(({ titleText }) => titleText)).toEqual([
    'Định lý mẫu', 'Tính chất mẫu', 'Mệnh đề mẫu',
    'Hệ quả mẫu', 'Bổ đề mẫu', 'Bài toán mẫu',
  ]);
});

test('loads packaged Prism language components as local classic scripts', async ({ page }) => {
  await loadMarkdown(page, [
    '```swift',
    'let greeting = "Xin chào"',
    '```',
    '',
  ].join('\n'));

  await expect.poll(() => page.evaluate(() => Boolean(window.Prism?.languages.swift))).toBe(true);
  await expect(page.locator('script[data-prism-language="swift"]')).toHaveCount(1);
  await expect(page.locator('.mu-code-block .token.keyword')).toContainText('let');
});

test('places a cover on its own A4 page and starts following content at the next boundary', async ({ page }) => {
  const source = '# Phần trước\n\nNội dung trước.\n\n:::cover\n:::\n\n# Nội dung sau\n\nĐoạn sau.';
  await page.evaluate((markdown) => window.markdownEditor?.loadMarkdown(markdown), source);
  await expect.poll(() => page.locator('.hcmut-cover-logo').evaluate((logo) => (
    logo instanceof HTMLImageElement && logo.complete && logo.naturalWidth > 0
  ))).toBe(true);

  const coverLayout = () => page.evaluate(() => {
    const cover = document.querySelector<HTMLElement>('[data-lmx-name="cover"]');
    const border = document.querySelector<HTMLElement>('.hcmut-cover-border');
    const university = document.querySelector<HTMLElement>('.hcmut-cover-university');
    const location = document.querySelector<HTMLElement>('.hcmut-cover-location');
    const followingHeading = [...document.querySelectorAll<HTMLElement>('.mu-atx-heading')]
      .find((heading) => heading.textContent?.includes('Nội dung sau'));
    const editor = document.querySelector<HTMLElement>('#editor');
    if (!cover || !border || !university || !location || !followingHeading || !editor) {
      throw new Error('Cover fixture did not render');
    }
    const editorStyle = getComputedStyle(editor);
    const pageHeight = Number.parseFloat(editorStyle.getPropertyValue('--visual-page-height'));
    const pageGap = Number.parseFloat(editorStyle.getPropertyValue('--visual-page-gap'));
    const contentTop = Number.parseFloat(editorStyle.paddingTop);
    const slotHeight = pageHeight + pageGap;
    const editorTop = editor.getBoundingClientRect().top;
    const coverOffset = cover.getBoundingClientRect().top - editorTop - contentTop;
    // Measure the heading's margin box: HCMUT section typography keeps a
    // deliberate top skip, so the glyph box begins below the page boundary.
    const followingOffset = followingHeading.getBoundingClientRect().top
      - editorTop
      - contentTop
      - Number.parseFloat(getComputedStyle(followingHeading).marginTop);
    const boundaryDistance = (offset: number): number => {
      const remainder = offset % slotHeight;
      return Math.min(remainder, slotHeight - remainder);
    };
    return {
      coverHeight: Number.parseFloat(getComputedStyle(cover).height),
      slotHeight,
      coverBoundaryDistance: boundaryDistance(coverOffset),
      followingBoundaryDistance: boundaryDistance(followingOffset),
      topContentInset: university.getBoundingClientRect().top - border.getBoundingClientRect().top,
      bottomContentInset: border.getBoundingClientRect().bottom - location.getBoundingClientRect().bottom,
    };
  });

  await expect.poll(async () => (await coverLayout()).coverHeight).toBeGreaterThan(1000);
  const metrics = await coverLayout();
  expect(metrics.coverHeight).toBeCloseTo(metrics.slotHeight, 0);
  expect(metrics.coverBoundaryDistance).toBeLessThan(3);
  expect(metrics.followingBoundaryDistance).toBeLessThan(3);
  expect(metrics.topContentInset).toBeGreaterThan(16);
  expect(metrics.bottomContentInset).toBeGreaterThan(16);
});

test('wraps an unbroken long cover detail inside the A4 border', async ({ page }) => {
  const longSupervisor = 'x'.repeat(120);
  await page.evaluate((markdown) => window.markdownEditor?.loadMarkdown(markdown), [
    '---',
    'lmx:',
    '  cover:',
    '    title: Báo cáo',
    `    supervisor: ${longSupervisor}`,
    '---',
    '',
    ':::cover',
    ':::',
  ].join('\n'));

  const layout = await page.locator('.hcmut-cover-detail').filter({ hasText: 'GVHD' }).evaluate((row) => {
    const value = row.lastElementChild;
    const preview = row.closest('.mu-lmx-structure-preview');
    if (!(value instanceof HTMLElement) || !(preview instanceof HTMLElement)) {
      throw new Error('Cover detail preview did not render.');
    }
    const valueRect = value.getBoundingClientRect();
    const previewRect = preview.getBoundingClientRect();
    const style = getComputedStyle(value);
    return {
      valueRight: valueRect.right,
      previewRight: previewRect.right,
      valueHeight: valueRect.height,
      lineHeight: Number.parseFloat(style.lineHeight),
      overflowWrap: style.overflowWrap,
    };
  });

  expect(layout.valueRight).toBeLessThan(layout.previewRight - 30);
  expect(layout.valueHeight).toBeGreaterThan(layout.lineHeight * 2);
  expect(layout.overflowWrap).toBe('anywhere');
});

test('wraps long header and footer text inside the A4 text area', async ({ page }) => {
  const longHeader = 'H'.repeat(140);
  const longFooter = 'F'.repeat(200);
  await loadMarkdown(page, [
    '---',
    'lmx:',
    '  header:',
    `    institution: ${longHeader}`,
    '    faculty: KHOA',
    '  footer:',
    `    left: ${longFooter}`,
    '---',
    '',
    '# Nội dung',
    '',
    'Đoạn văn.',
  ].join('\n'));

  const layout = await page.evaluate(() => {
    const headerText = document.querySelector<HTMLElement>('.visual-page-header-institution');
    const footerText = document.querySelector<HTMLElement>('.visual-page-footer-left');
    const header = document.querySelector<HTMLElement>('.visual-page-header');
    const footer = document.querySelector<HTMLElement>('.visual-page-footer');
    if (!headerText || !footerText || !header || !footer) {
      throw new Error('Page chrome fixture did not render');
    }
    return {
      headerTextRight: headerText.getBoundingClientRect().right,
      headerRight: header.getBoundingClientRect().right,
      footerTextRight: footerText.getBoundingClientRect().right,
      footerRight: footer.getBoundingClientRect().right,
      headerOverflowWrap: getComputedStyle(headerText).overflowWrap,
      footerOverflowWrap: getComputedStyle(footerText).overflowWrap,
    };
  });

  expect(layout.headerTextRight).toBeLessThanOrEqual(layout.headerRight);
  expect(layout.footerTextRight).toBeLessThanOrEqual(layout.footerRight);
  expect(layout.headerOverflowWrap).toBe('anywhere');
  expect(layout.footerOverflowWrap).toBe('anywhere');
});

test('renders the entire Visual editor as a stack of A4 paper pages', async ({ page }) => {
  const source = '# Trang đầu\n\nTrường Đại học Bách khoa\n\n:::cover\n:::\n\n# Trang sau\n\nNội dung sau.';
  await page.evaluate((markdown) => window.markdownEditor?.loadMarkdown(markdown), source);

  const pageSurface = await page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('#editor');
    const coverPreview = document.querySelector<HTMLElement>('.mu-lmx-cover-preview');
    if (!editor || !coverPreview) throw new Error('A4 page fixture did not render');
    const style = getComputedStyle(editor);
    return {
      backgroundImage: style.backgroundImage,
      coverHeight: Number.parseFloat(getComputedStyle(coverPreview).height),
      pageHeight: Number.parseFloat(style.getPropertyValue('--visual-page-height')),
    };
  });

  expect(pageSurface.backgroundImage).toContain('repeating-linear-gradient');
  expect(pageSurface.coverHeight).toBeCloseTo(pageSurface.pageHeight, 0);
});

test('never leaves a partial final sheet in the Visual A4 page stack', async ({ page }) => {
  const source = Array.from({ length: 38 }, (_, index) => [
    `## Mục ${index + 1}`,
    '',
    `Nội dung kiểm tra trang A4 số ${index + 1}.`,
    '',
  ].join('\n')).join('\n');
  await page.evaluate((markdown) => window.markdownEditor?.loadMarkdown(markdown), source);

  const readMetrics = () => page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('#editor');
    if (!editor) throw new Error('Visual editor did not render');
    const style = getComputedStyle(editor);
    const pageHeight = Number.parseFloat(style.getPropertyValue('--visual-page-height'));
    const pageGap = Number.parseFloat(style.getPropertyValue('--visual-page-gap'));
    const height = editor.getBoundingClientRect().height;
    const slotHeight = pageHeight + pageGap;
    const pageCount = Math.max(1, Math.round((height + pageGap) / slotHeight));
    return {
      pageCount,
      partialSheetHeight: Math.abs(height - (pageCount * slotHeight - pageGap)),
    };
  });
  await expect.poll(async () => (await readMetrics()).pageCount).toBeGreaterThan(1);

  const metrics = await readMetrics();
  expect(metrics.pageCount).toBeGreaterThan(1);
  expect(metrics.partialSheetHeight).toBeLessThan(2);
});

test('keeps ordinary Markdown blocks inside the printable body of every A4 page', async ({ page }) => {
  const source = Array.from({ length: 90 }, (_, index) => [
    `## Mục ${index + 1}`,
    '',
    `Đoạn nội dung ${index + 1} dùng để kiểm tra phân trang A4 trong Visual Editor.`,
    '',
  ].join('\n')).join('\n');
  await page.evaluate((markdown) => window.markdownEditor?.loadMarkdown(markdown), source);

  const invalidBlocks = await page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('#editor');
    if (!editor) throw new Error('Visual editor did not render');
    const style = getComputedStyle(editor);
    const pageHeight = Number.parseFloat(style.getPropertyValue('--visual-page-height'));
    const pageGap = Number.parseFloat(style.getPropertyValue('--visual-page-gap'));
    const contentTop = Number.parseFloat(style.getPropertyValue('--visual-page-content-top'));
    const contentBottom = Number.parseFloat(style.getPropertyValue('--visual-page-content-bottom'));
    const printableEnd = pageHeight - contentBottom;
    const slotHeight = pageHeight + pageGap;
    const editorTop = editor.getBoundingClientRect().top;
    const root = editor.querySelector<HTMLElement>(':scope > .mu-container');
    if (!root) throw new Error('Muya root did not render');

    return [...root.children].flatMap((element, index) => {
      if (!(element instanceof HTMLElement) || element.hidden) return [];
      const rect = element.getBoundingClientRect();
      const top = rect.top - editorTop;
      const pageOffset = ((top % slotHeight) + slotHeight) % slotHeight;
      const bottomOffset = pageOffset + rect.height;
      const outsidePrintableBody = pageOffset < contentTop - 3
        || pageOffset >= pageHeight - 3
        || bottomOffset > printableEnd + 3;
      return outsidePrintableBody ? [{
        index,
        className: element.className,
        pageOffset,
        bottomOffset,
        printableEnd,
      }] : [];
    });
  });

  expect(invalidBlocks).toEqual([]);
});

test('keeps structural page previews free of editable placeholder artifacts', async ({ page }) => {
  await page.evaluate((markdown) => window.markdownEditor?.loadMarkdown(markdown), [
    ':::cover',
    ':::',
    '',
    ':::toc',
    ':::',
  ].join('\n'));

  const previewState = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(
    '.mu-lmx-structure-preview',
  )].map((preview) => ({
    text: preview.textContent ?? '',
    editableDescendants: preview.querySelectorAll('[contenteditable="true"]').length,
    paragraphDescendants: preview.querySelectorAll('.mu-paragraph').length,
  })));
  expect(previewState).toHaveLength(2);
  for (const preview of previewState) {
    expect(preview.text).not.toContain('¶');
    expect(preview.editableDescendants).toBe(0);
    expect(preview.paragraphDescendants).toBe(0);
  }
});

test('does not overlay Muya paragraph controls on generated A4 previews', async ({ page }) => {
  await page.evaluate((markdown) => window.markdownEditor?.loadMarkdown(markdown), [
    ':::cover',
    ':::',
    '',
    ':::toc',
    ':::',
    '',
    '# Nội dung',
  ].join('\n'));

  const toc = page.locator('.mu-lmx-toc-preview');
  await toc.locator('.hcmut-generated-title').hover();
  await page.waitForTimeout(400);

  await expect.poll(() => page.locator('.mu-front-button-wrapper').evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.opacity === '0' || rect.right < 0 || rect.bottom < 0;
  })).toBe(true);
});

test('matches the HCMUT LaTeX TOC hierarchy and paginated page numbers', async ({ page }) => {
  await page.evaluate((markdown) => window.markdownEditor?.loadMarkdown(markdown), [
    '---',
    'lmx:',
    '  structure:',
    '    cover: true',
    '    toc: true',
    '    tocDepth: 3',
    '    listOfFigures: false',
    '    listOfTables: false',
    '---',
    '',
    ':::cover',
    ':::',
    '',
    ':::toc',
    ':::',
    '',
    '# Tóm tắt',
    '',
    'Nội dung.',
    '',
    '# Cơ sở lý thuyết',
    '',
    '## Đạo hàm theo hướng',
    '',
    'Nội dung.',
  ].join('\n'));

  await expect.poll(() => page.locator('.hcmut-generated-page').allTextContents())
    .toEqual(['1', '1', '1']);

  const toc = await page.evaluate(() => {
    const preview = document.querySelector<HTMLElement>('.mu-lmx-toc-preview');
    const title = preview?.querySelector<HTMLElement>('.hcmut-generated-title');
    if (!preview || !title) throw new Error('TOC preview did not render');
    const previewRect = preview.getBoundingClientRect();
    const titleRect = title.getBoundingClientRect();
    return {
      title: title.textContent,
      titleAlign: getComputedStyle(title).textAlign,
      titleFontSize: Number.parseFloat(getComputedStyle(title).fontSize),
      titleOffsetLeft: titleRect.left - previewRect.left,
      rows: [...preview.querySelectorAll<HTMLElement>('.hcmut-generated-row')].map((row) => ({
        level: row.dataset.tocLevel,
        number: row.querySelector('.hcmut-generated-number')?.textContent,
        label: row.querySelector('.hcmut-generated-label')?.textContent,
        page: row.querySelector('.hcmut-generated-page')?.textContent,
        fontWeight: getComputedStyle(row).fontWeight,
        leaderDisplay: getComputedStyle(
          row.querySelector<HTMLElement>('.hcmut-generated-leader')!,
        ).display,
      })),
    };
  });

  expect(toc.title).toBe('Mục lục');
  expect(toc.titleAlign).toBe('start');
  expect(toc.titleFontSize).toBeCloseTo(19.2, 1);
  expect(toc.titleOffsetLeft).toBeCloseTo(117, 1);
  expect(toc.rows).toEqual([
    { level: '1', number: '1', label: 'Tóm tắt', page: '1', fontWeight: '700', leaderDisplay: 'block' },
    { level: '1', number: '2', label: 'Cơ sở lý thuyết', page: '1', fontWeight: '700', leaderDisplay: 'block' },
    { level: '2', number: '2.1', label: 'Đạo hàm theo hướng', page: '1', fontWeight: '400', leaderDisplay: 'block' },
  ]);
});

test('allocates independent A4 slots for cover, TOC, and generated lists', async ({ page }) => {
  const source = [
    '---',
    'lmx:',
    '  header:',
    '    enabled: true',
    '  footer:',
    '    enabled: true',
    '---',
    '',
    ':::cover',
    ':::',
    '',
    ':::toc',
    ':::',
    '',
    ':::list-of-figures',
    ':::',
    '',
    ':::list-of-tables',
    ':::',
    '',
    '# Nội dung',
    '',
    'Đoạn nội dung.',
  ].join('\n');
  await page.evaluate((markdown) => window.markdownEditor?.loadMarkdown(markdown), source);

  const layout = await page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('#editor');
    if (!editor) throw new Error('Visual editor did not render');
    const style = getComputedStyle(editor);
    const pageHeight = Number.parseFloat(style.getPropertyValue('--visual-page-height'));
    const pageGap = Number.parseFloat(style.getPropertyValue('--visual-page-gap'));
    const contentTop = Number.parseFloat(style.paddingTop);
    const contentBottom = Number.parseFloat(style.getPropertyValue('--visual-page-content-bottom'));
    const slotHeight = pageHeight + pageGap;
    const editorTop = editor.getBoundingClientRect().top;
    const boundaryDistance = (offset: number): number => {
      const remainder = offset % slotHeight;
      return Math.min(remainder, slotHeight - remainder);
    };
    const pages = [...editor.querySelectorAll<HTMLElement>(
      '.mu-lmx-structure[data-lmx-name="cover"], .mu-lmx-structure[data-lmx-name="toc"], .mu-lmx-structure[data-lmx-name="list-of-figures"], .mu-lmx-structure[data-lmx-name="list-of-tables"]',
    )].map((page) => {
      const preview = page.querySelector<HTMLElement>('.mu-lmx-structure-preview');
      const offset = page.getBoundingClientRect().top - editorTop - contentTop;
      return {
        name: page.dataset.lmxName,
        offset,
        boundaryDistance: boundaryDistance(offset),
        height: page.getBoundingClientRect().height,
        previewHeight: preview?.getBoundingClientRect().height ?? 0,
      };
    });
    return {
      pageHeight,
      contentTop,
      contentBottom,
      slotHeight,
      pages,
      headerTops: [...document.querySelectorAll<HTMLElement>('.visual-page-header')]
        .map((header) => Number.parseFloat(header.style.top)),
      footerTops: [...document.querySelectorAll<HTMLElement>('.visual-page-footer')]
        .map((footer) => Number.parseFloat(footer.style.top)),
      footerTexts: [...document.querySelectorAll<HTMLElement>('.visual-page-footer')]
        .map((footer) => footer.textContent ?? ''),
    };
  });

  expect(layout.pages.map((page) => page.name)).toEqual([
    'cover', 'toc', 'list-of-figures', 'list-of-tables',
  ]);
  for (const page of layout.pages) {
    expect(page.boundaryDistance).toBeLessThan(3);
    expect(page.height).toBeCloseTo(layout.slotHeight, 0);
    expect(page.previewHeight).toBeCloseTo(layout.pageHeight, 0);
  }
  expect(layout.headerTops[0]).toBeCloseTo(layout.slotHeight * 4 + layout.contentTop, 1);
  expect(layout.footerTops[0]).toBeCloseTo(
    layout.slotHeight * 4 + layout.pageHeight - layout.contentBottom,
    1,
  );
  expect(layout.footerTexts[0]).toContain('Trang 1/1');
});

test('places generated-page gaps immediately after their A4 previews', async ({ page }) => {
  const source = [
    '---',
    'lmx:',
    '  structure:',
    '    cover: true',
    '    toc: true',
    '    listOfFigures: false',
    '    listOfTables: false',
    '  header:',
    '    enabled: true',
    '---',
    '',
    ':::cover',
    ':::',
    '',
    ':::toc',
    ':::',
    '',
    '# Giới thiệu',
    '',
    ':::theorem {title="Định lý mẫu"}',
    'Nội dung định lý tiếng Việt.',
    ':::',
  ].join('\n');
  await page.evaluate((markdown) => window.markdownEditor?.loadMarkdown(markdown), source);

  const gapOffsets = await page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('#editor');
    if (!editor) throw new Error('Visual editor did not render');
    const editorTop = editor.getBoundingClientRect().top;

    return [...editor.querySelectorAll<HTMLElement>(
      '.mu-lmx-structure[data-lmx-name="cover"], .mu-lmx-structure[data-lmx-name="toc"]',
    )].map((structure) => {
      const preview = structure.querySelector<HTMLElement>('.mu-lmx-structure-preview');
      if (!preview) throw new Error('Generated-page preview did not render');
      const gapStyle = getComputedStyle(structure, '::after');
      const gapTop = structure.getBoundingClientRect().top
        - editorTop
        + Number.parseFloat(gapStyle.top);
      const previewBottom = preview.getBoundingClientRect().bottom - editorTop;
      return {
        name: structure.dataset.lmxName,
        offsetFromPreviewBottom: gapTop - previewBottom,
      };
    });
  });

  expect(gapOffsets).toEqual([
    { name: 'cover', offsetFromPreviewBottom: expect.closeTo(0, 1) },
    { name: 'toc', offsetFromPreviewBottom: expect.closeTo(0, 1) },
  ]);
});

test('moves a cover down into each following writable A4 sheet', async ({ page }) => {
  await loadMarkdown(page, [
    ':::cover',
    ':::',
    '',
    ':::cover',
    ':::',
    '',
  ].join('\n'));

  const readCoverPages = () => page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('#editor');
    const covers = [...document.querySelectorAll<HTMLElement>('[data-lmx-name="cover"]')];
    if (!editor || covers.length !== 2) throw new Error('Cover move fixture did not render');
    const style = getComputedStyle(editor);
    const slotHeight = Number.parseFloat(style.getPropertyValue('--visual-page-height'))
      + Number.parseFloat(style.getPropertyValue('--visual-page-gap'));
    const editorTop = editor.getBoundingClientRect().top;
    return covers.map((cover) => Math.floor(
      Math.max(0, cover.getBoundingClientRect().top - editorTop + 2.5) / slotHeight,
    ));
  });

  await expect.poll(readCoverPages).toEqual([0, 1]);
  expect(await page.evaluate(() => window.markdownEditor?.movePage(1, 'down'))).toBe(true);
  await expect.poll(readCoverPages).toEqual([0, 2]);
  expect(await page.evaluate(() => window.markdownEditor?.movePage(2, 'down'))).toBe(true);
  await expect.poll(readCoverPages).toEqual([0, 3]);
  await expect.poll(() => page.locator('.visual-page-action-strip').count()).toBe(5);
});

test('keeps header and footer on an ordinary page before a moved-down cover', async ({ page }) => {
  await loadMarkdown(page, [
    '# Trang đầu',
    '',
    'Nội dung trang đầu.',
    '',
    ':::pagebreak',
    ':::',
    '',
    ':::cover',
    ':::',
    '',
  ].join('\n'));

  const chromePages = await page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('#editor');
    if (!editor) throw new Error('Visual editor did not render');
    const style = getComputedStyle(editor);
    const slotHeight = Number.parseFloat(style.getPropertyValue('--visual-page-height'))
      + Number.parseFloat(style.getPropertyValue('--visual-page-gap'));
    const editorTop = editor.getBoundingClientRect().top;
    const pageOf = (element: Element) => Math.floor(
      Math.max(0, element.getBoundingClientRect().top - editorTop + 2.5) / slotHeight,
    );
    return {
      headers: [...document.querySelectorAll('.visual-page-header')].map(pageOf),
      footers: [...document.querySelectorAll('.visual-page-footer')].map(pageOf),
      cover: pageOf(document.querySelector('[data-lmx-name="cover"]')!),
    };
  });

  expect(chromePages.cover).toBe(1);
  expect(chromePages.headers).toContain(0);
  expect(chromePages.footers).toContain(0);
});

test('renders enabled HCMUT headers on normal Visual pages', async ({ page }) => {
  const source = [
    '---',
    'lmx:',
    '  header:',
    '    enabled: true',
    '    institution: HCMUT Header',
    '    faculty: KHOA TEST',
    '  cover:',
    '    title: Báo cáo test',
    '---',
    '',
    ':::cover',
    ':::',
    '',
    '# Nội dung sau cover',
    '',
    'Đoạn nội dung.',
  ].join('\n');
  await page.evaluate((markdown) => window.markdownEditor?.loadMarkdown(markdown), source);

  await expect(page.locator('.visual-page-header')).toHaveCount(1);
  await expect(page.locator('.visual-page-header')).toContainText('HCMUT Header');
  await expect(page.locator('.visual-page-header')).toContainText('KHOA TEST');
  await expect(page.locator('.visual-page-header-logo')).toBeVisible();
  await expect.poll(() => page.locator('.visual-page-header-logo').evaluate((logo) => (
    logo instanceof HTMLImageElement && logo.complete && logo.naturalWidth > 0
  ))).toBe(true);
});

test('repaginates header and footer decorations while typing across A4 pages', async ({ page }) => {
  await loadMarkdown(page, [
    '---',
    'lmx:',
    '  header:',
    '    enabled: true',
    '  footer:',
    '    enabled: true',
    '---',
    '',
    'Nội dung đang nhập.',
  ].join('\n'));
  const paragraph = page.locator('#editor .mu-paragraph').last();
  await paragraph.click();
  await page.keyboard.insertText(` ${'nội dung phân trang '.repeat(450)}`);

  await expect.poll(() => page.locator('.visual-page-header').count()).toBeGreaterThan(1);
  await expect.poll(() => page.locator('.visual-page-footer').count()).toBeGreaterThan(1);
  await expect.poll(async () => {
    const headers = await page.locator('.visual-page-header').count();
    const footers = await page.locator('.visual-page-footer').count();
    return { headers, footers };
  }).toEqual(expect.objectContaining({
    headers: expect.any(Number),
    footers: expect.any(Number),
  }));
});

test('toggles Visual header and footer through Properties when cover metadata is unfinished', async ({ page }) => {
  const source = [
    '---',
    'lmx:',
    '  cover:',
    '    title: ""',
    '  header:',
    '    enabled: false',
    '  footer:',
    '    enabled: false',
    '---',
    '',
    '# Noi dung bao cao',
    '',
    'Phan noi dung van hop le khi trang bia chua du thong tin.',
  ].join('\n');
  await page.evaluate((markdown) => window.markdownEditor?.loadMarkdown(markdown), source);

  await expect(page.locator('.visual-page-header')).toHaveCount(0);
  await expect(page.locator('.visual-page-footer')).toHaveCount(0);

  await page.evaluate(() => window.markdownEditor?.updateMetadata({
    lmx: {
      header: { enabled: true, institution: 'HCMUT TU PROPERTIES' },
      footer: { enabled: true, left: 'FOOTER TU PROPERTIES' },
    },
  }));

  await expect(page.locator('.visual-page-header')).toContainText('HCMUT TU PROPERTIES');
  await expect(page.locator('.visual-page-footer')).toContainText('FOOTER TU PROPERTIES');
  await expect.poll(() => requestMarkdown(page)).toContain('title: ""');

  await page.evaluate(() => window.markdownEditor?.updateMetadata({
    lmx: {
      header: { enabled: false },
      footer: { enabled: false },
    },
  }));

  await expect(page.locator('.visual-page-header')).toHaveCount(0);
  await expect(page.locator('.visual-page-footer')).toHaveCount(0);
});

test('applies detailed Properties appearance settings to Visual page chrome', async ({ page }) => {
  const source = [
    '---',
    'lmx:',
    '  header:',
    '    enabled: false',
    '  footer:',
    '    enabled: false',
    '---',
    '',
    '# Noi dung',
    '',
    'Doan noi dung.',
  ].join('\n');
  await page.evaluate((markdown) => window.markdownEditor?.loadMarkdown(markdown), source);

  await page.evaluate(() => window.markdownEditor?.updateMetadata({
    lmx: {
      header: {
        enabled: true,
        institution: 'DAI HOC TUY CHINH',
        faculty: 'KHOA TUY CHINH',
        logoEnabled: false,
        logoSizeMm: 8,
        fontSizePt: 8.5,
        bold: false,
        ruleEnabled: true,
        ruleWidthPt: 0.6,
      },
      footer: {
        enabled: true,
        left: 'CHAN TRANG TUY CHINH',
        pageNumber: 'current',
        fontSizePt: 9,
        ruleEnabled: true,
        ruleWidthPt: 0.5,
      },
    },
  }));

  await expect(page.locator('.visual-page-header-logo')).toHaveCount(0);
  await expect(page.locator('.visual-page-header'))
    .toHaveClass(/visual-page-header-without-logo/);
  await expect(page.locator('.visual-page-header')).toContainText('DAI HOC TUY CHINH');
  await expect(page.locator('.visual-page-header')).toContainText('KHOA TUY CHINH');
  await expect(page.locator('.visual-page-footer')).toContainText('CHAN TRANG TUY CHINH');
  await expect(page.locator('.visual-page-footer-number')).toHaveText('Trang 1');

  const appearance = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>('.visual-page-header');
    const footer = document.querySelector<HTMLElement>('.visual-page-footer');
    if (!header || !footer) throw new Error('Detailed page chrome did not render');
    const headerStyle = getComputedStyle(header);
    const footerStyle = getComputedStyle(footer);
    return {
      headerFontSize: Number.parseFloat(headerStyle.fontSize),
      headerFontWeight: headerStyle.fontWeight,
      headerRuleStyle: headerStyle.borderBottomStyle,
      headerConfiguredRuleWidth: Number.parseFloat(header.style.borderBottomWidth),
      headerRenderedRuleWidth: Number.parseFloat(headerStyle.borderBottomWidth),
      footerFontSize: Number.parseFloat(footerStyle.fontSize),
      footerRuleStyle: footerStyle.borderTopStyle,
      footerConfiguredRuleWidth: Number.parseFloat(footer.style.borderTopWidth),
      footerRenderedRuleWidth: Number.parseFloat(footerStyle.borderTopWidth),
    };
  });

  expect(appearance.headerFontSize).toBeCloseTo(8.5 * 96 / 72, 2);
  expect(appearance.headerFontWeight).toBe('400');
  expect(appearance.headerRuleStyle).toBe('solid');
  expect(appearance.headerConfiguredRuleWidth).toBeCloseTo(0.6 * 96 / 72, 2);
  expect(appearance.headerRenderedRuleWidth).toBeGreaterThan(0);
  expect(appearance.footerFontSize).toBeCloseTo(9 * 96 / 72, 2);
  expect(appearance.footerRuleStyle).toBe('solid');
  expect(appearance.footerConfiguredRuleWidth).toBeCloseTo(0.5 * 96 / 72, 2);
  expect(appearance.footerRenderedRuleWidth).toBeGreaterThan(0);
});

test('loads the BTL HK232 steepest-ascent report as a complete Visual document', async ({ page }) => {
  await page.evaluate((source) => window.markdownEditor?.loadMarkdown(source), physicsReportFixture);

  await expect(page.locator('[data-lmx-name="cover"] .hcmut-cover-title'))
    .toContainText('TÌM ĐƯỜNG ĐI CÓ ĐỘ DỐC LỚN NHẤT');
  await expect(page.locator('[data-lmx-name="toc"]')).toBeVisible();
  await expect(page.locator('[data-lmx-name="theorem"]')).toHaveCount(2);
  await expect(page.locator('[data-lmx-name="property"]')).toHaveCount(1);
  await expect(page.locator('[data-lmx-name="proposition"]')).toHaveCount(1);
  await expect(page.locator('[data-lmx-name="exercise"]')).toHaveCount(1);
  await expect(page.locator('[data-lmx-name="figure"]')).toHaveCount(2);
  await expect(page.locator('[data-lmx-name="table"]')).toHaveCount(1);
  await expect(page.locator('[data-lmx-name="listing"]')).toHaveCount(1);
  await expect(page.locator('.visual-page-header').first()).toContainText('Trường Đại Học Bách Khoa');
  await expect(page.locator('.visual-page-footer').first()).toContainText('Bài tập lớn Giải tích 2 - HK232');
  await expect.poll(() => requestMarkdown(page)).toContain(':::theorem {#thm-gradient-direction');
  await expect.poll(() => requestMarkdown(page)).toContain(':::listing {#lst-steepest-code');
});

test('matches the HCMUT PDF header and footer rules to the 160 mm text area', async ({ page }) => {
  const source = [
    '---',
    'lmx:',
    '  header:',
    '    enabled: true',
    '  footer:',
    '    enabled: true',
    '    left: Text-area footer',
    '---',
    '',
    '# Nội dung',
    '',
    'Đoạn nội dung.',
  ].join('\n');
  await page.evaluate((markdown) => window.markdownEditor?.loadMarkdown(markdown), source);

  const layout = await page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('#editor');
    const header = document.querySelector<HTMLElement>('.visual-page-header');
    const footer = document.querySelector<HTMLElement>('.visual-page-footer');
    if (!editor || !header || !footer) throw new Error('Page chrome fixture did not render');
    const page = editor.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    const footerRect = footer.getBoundingClientRect();
    return {
      pageWidth: page.width,
      contentLeft: Number.parseFloat(getComputedStyle(editor).getPropertyValue('--visual-page-content-left')),
      contentRight: Number.parseFloat(getComputedStyle(editor).getPropertyValue('--visual-page-content-right')),
      contentTop: Number.parseFloat(getComputedStyle(editor).getPropertyValue('--visual-page-content-top')),
      contentBottom: Number.parseFloat(getComputedStyle(editor).getPropertyValue('--visual-page-content-bottom')),
      headerWidth: headerRect.width,
      footerWidth: footerRect.width,
      headerLeftInset: headerRect.left - page.left,
      headerRightInset: page.right - headerRect.right,
      headerBottom: headerRect.bottom - page.top,
      footerLeftInset: footerRect.left - page.left,
      footerRightInset: page.right - footerRect.right,
      footerTopInset: page.bottom - footerRect.top,
      footerBottomInset: page.bottom - footerRect.bottom,
    };
  });

  const textWidth = layout.pageWidth - layout.contentLeft - layout.contentRight;
  expect(layout.headerWidth).toBeCloseTo(textWidth, 0);
  expect(layout.footerWidth).toBeCloseTo(textWidth, 0);
  expect(layout.headerLeftInset).toBeCloseTo(layout.contentLeft, 0);
  expect(layout.headerRightInset).toBeCloseTo(layout.contentRight, 0);
  expect(layout.headerBottom).toBeCloseTo(layout.contentTop, 0);
  expect(layout.footerLeftInset).toBeCloseTo(layout.contentLeft, 0);
  expect(layout.footerRightInset).toBeCloseTo(layout.contentRight, 0);
  // The footer begins AFTER the printable body, not above its last baseline.
  // Anchoring its bottom at the body boundary was the reported overlap bug.
  expect(layout.footerTopInset).toBeCloseTo(layout.contentBottom, 0);
  expect(layout.footerBottomInset).toBeGreaterThan(48);
});

test('uses the LaTeX article typography scale and section numbering in Visual mode', async ({ page }) => {
  const source = [
    '# Tiêu đề cấp một',
    '',
    'Đoạn văn chuẩn 10pt.',
    '',
    '## Tiêu đề cấp hai',
    '',
    '### Tiêu đề cấp ba',
    '',
    '#### Tiêu đề cấp bốn',
  ].join('\n');
  await page.evaluate((markdown) => window.markdownEditor?.loadMarkdown(markdown), source);

  const typography = await page.evaluate(() => {
    const headings = [...document.querySelectorAll<HTMLElement>('.mu-atx-heading')];
    const paragraph = document.querySelector<HTMLElement>('.mu-paragraph');
    if (headings.length !== 4 || !paragraph) throw new Error('Typography fixture did not render');
    return {
      headingSizes: headings.map((heading) => Number.parseFloat(getComputedStyle(heading).fontSize)),
      headingNumbers: headings.map((heading) => heading.dataset.hcmutHeadingNumber),
      paragraphSize: Number.parseFloat(getComputedStyle(paragraph).fontSize),
      paragraphColor: getComputedStyle(paragraph).color,
    };
  });

  expect(typography.headingSizes[0]).toBeCloseTo(19.2, 1);
  expect(typography.headingSizes[1]).toBeCloseTo(16, 1);
  expect(typography.headingSizes[2]).toBeCloseTo(13.3333, 1);
  expect(typography.headingSizes[3]).toBeCloseTo(13.3333, 1);
  expect(typography.headingNumbers).toEqual(['1', '1.1', '1.1.1', '1.1.1.a']);
  expect(typography.paragraphSize).toBeCloseTo(13.3333, 1);
  expect(typography.paragraphColor).toBe('rgb(0, 0, 0)');
});

test('aligns the Visual cover landmarks to the TeX A4 golden geometry', async ({ page }) => {
  const source = [
    '---',
    'lmx:',
    '  cover:',
    '    university: ĐẠI HỌC QUỐC GIA THÀNH PHỐ HỒ CHÍ MINH',
    '    school: TRƯỜNG ĐẠI HỌC BÁCH KHOA',
    '    faculty: KHOA KHOA HỌC ỨNG DỤNG',
    '    reportType: BÁO CÁO KIỂM THỬ THỊ GIÁC',
    '    title: ĐỐI CHIẾU TỪNG KHỐI MARKDOWN VÀ LATEX',
    '    major: TOÁN ỨNG DỤNG',
    '    council: GIẢI TÍCH 2',
    '    supervisor: TS. NGUYỄN VĂN A',
    '    secretary: TS. TRẦN THỊ B',
    '    locationDate: TP. HỒ CHÍ MINH, 2026',
    '    students:',
    '      - name: Nguyễn Văn An',
    '        id: "2210001"',
    '---',
    '',
    ':::cover',
    ':::',
  ].join('\n');
  await page.evaluate((markdown) => window.markdownEditor?.loadMarkdown(markdown), source);

  const landmarks = await page.evaluate(() => {
    const preview = document.querySelector<HTMLElement>('.mu-lmx-cover-preview');
    if (!preview) throw new Error('Cover preview did not render');
    const top = preview.getBoundingClientRect().top;
    const read = (selector: string) => {
      const element = preview.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`Missing cover landmark: ${selector}`);
      const rect = element.getBoundingClientRect();
      return { top: rect.top - top, height: rect.height, width: rect.width };
    };
    return {
      university: read('.hcmut-cover-university'),
      school: read('.hcmut-cover-school'),
      faculty: read('.hcmut-cover-faculty'),
      logo: read('.hcmut-cover-logo'),
      heading: read('.hcmut-cover-report-heading'),
      title: read('.hcmut-cover-title'),
      details: read('.hcmut-cover-details'),
      location: read('.hcmut-cover-location'),
    };
  });

  expect(landmarks.university.top).toBeCloseTo(157, 0);
  expect(landmarks.school.top).toBeCloseTo(192, 0);
  expect(landmarks.faculty.top).toBeCloseTo(227, 0);
  expect(landmarks.logo.top).toBeCloseTo(264, 0);
  expect(landmarks.logo.width).toBeCloseTo(151, 0);
  expect(landmarks.heading.top).toBeCloseTo(423, 0);
  expect(landmarks.title.top).toBeCloseTo(500, 0);
  expect(landmarks.title.width).toBeGreaterThan(540);
  expect(landmarks.details.top).toBeCloseTo(574, 0);
  expect(landmarks.location.top).toBeCloseTo(1039, 0);
});

test('renders LOF and LOT with the same TeX list typography, leaders, and page numbers', async ({ page }) => {
  const source = [
    '---',
    'lmx:',
    '  structure:',
    '    cover: false',
    '    toc: false',
    '    listOfFigures: true',
    '    listOfTables: true',
    '---',
    '',
    ':::list-of-figures',
    ':::',
    '',
    ':::list-of-tables',
    ':::',
    '',
    ':::figure {#fig-list caption="Đồ thị minh họa miền tích phân"}',
    'Nội dung hình.',
    ':::',
    '',
    ':::pagebreak',
    ':::',
    '',
    ':::table {#tbl-list caption="Giá trị gần đúng của tích phân"}',
    '| n | I |',
    '| ---: | ---: |',
    '| 4 | 0.328 |',
    ':::',
  ].join('\n');
  await page.evaluate((markdown) => window.markdownEditor?.loadMarkdown(markdown), source);

  await expect(page.locator('.mu-lmx-list-of-figures-preview .hcmut-generated-title'))
    .toHaveText('Danh sách hình vẽ');
  await expect(page.locator('.mu-lmx-list-of-tables-preview .hcmut-generated-title'))
    .toHaveText('Danh sách bảng');
  await expect(page.locator('.mu-lmx-list-of-figures-preview .hcmut-generated-page'))
    .toHaveText('1');
  await expect(page.locator('.mu-lmx-list-of-tables-preview .hcmut-generated-page'))
    .toHaveText('2');
  await expect(page.locator('.mu-lmx-list-of-figures-preview .hcmut-generated-leader')).toBeVisible();
  await expect(page.locator('.mu-lmx-list-of-tables-preview .hcmut-generated-leader')).toBeVisible();

  const geometry = await page.evaluate(() => {
    const preview = document.querySelector<HTMLElement>('.mu-lmx-list-of-figures-preview');
    const title = preview?.querySelector<HTMLElement>('.hcmut-generated-title');
    const row = preview?.querySelector<HTMLElement>('.hcmut-generated-row');
    if (!preview || !title || !row) throw new Error('LOF geometry did not render');
    const page = preview.getBoundingClientRect();
    const titleRect = title.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    return {
      titleTop: titleRect.top - page.top,
      titleLeft: titleRect.left - page.left,
      titleSize: Number.parseFloat(getComputedStyle(title).fontSize),
      rowLeft: rowRect.left - page.left,
      rowSize: Number.parseFloat(getComputedStyle(row).fontSize),
    };
  });
  expect(geometry.titleTop).toBeCloseTo(123, 0);
  expect(geometry.titleLeft).toBeCloseTo(117, 0);
  expect(geometry.titleSize).toBeCloseTo(19.2, 1);
  expect(geometry.rowLeft).toBeCloseTo(117, 0);
  expect(geometry.rowSize).toBeCloseTo(13.3333, 1);
});

test('anchors page chrome to the first actual body sheet after generated pages', async ({ page }) => {
  const source = [
    '---',
    'lmx:',
    '  structure:',
    '    cover: true',
    '    toc: true',
    '  header:',
    '    enabled: true',
    '  footer:',
    '    enabled: true',
    '---',
    '',
    ':::cover',
    ':::',
    '',
    ':::toc',
    ':::',
    '',
    ':::pagebreak',
    ':::',
    '',
    '# Giới thiệu',
    '',
    'Nội dung định lý tiếng Việt.',
  ].join('\n');
  await page.evaluate((markdown) => window.markdownEditor?.loadMarkdown(markdown), source);

  const layout = await page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('#editor');
    const heading = document.querySelector<HTMLElement>('.mu-atx-heading');
    const header = document.querySelector<HTMLElement>('.visual-page-header');
    if (!editor || !heading || !header) throw new Error('Page chrome fixture did not render');
    const style = getComputedStyle(editor);
    const slotHeight = Number.parseFloat(style.getPropertyValue('--visual-page-height'))
      + Number.parseFloat(style.getPropertyValue('--visual-page-gap'));
    const editorTop = editor.getBoundingClientRect().top;
    const pageIndex = (element: HTMLElement): number => Math.round(
      Math.max(0, element.getBoundingClientRect().top - editorTop) / slotHeight,
    );
    return {
      headingPage: pageIndex(heading),
      headerPages: [...editor.querySelectorAll<HTMLElement>('.visual-page-header')]
        .map(pageIndex),
    };
  });

  expect(layout.headerPages).toContain(layout.headingPage);
  expect(layout.headerPages[0]).toBeLessThanOrEqual(layout.headingPage);
});

test('keeps the first body block clear of the header rule after a page break', async ({ page }) => {
  const source = [
    '# Trang trước',
    '',
    'Nội dung trước.',
    '',
    ':::pagebreak',
    ':::',
    '',
    ':::theorem {#thm-header-gap}',
    'Nội dung định lý ở đầu trang mới.',
    ':::',
  ].join('\n');
  await page.evaluate((markdown) => window.markdownEditor?.loadMarkdown(markdown), source);

  const gap = await page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('#editor');
    const header = [...document.querySelectorAll<HTMLElement>('.visual-page-header')].at(-1);
    const theorem = document.querySelector<HTMLElement>('[data-lmx-name="theorem"]');
    if (!editor || !header || !theorem) throw new Error('Header-gap fixture did not render');
    const style = getComputedStyle(editor);
    const slot = Number.parseFloat(style.getPropertyValue('--visual-page-height'))
      + Number.parseFloat(style.getPropertyValue('--visual-page-gap'));
    const pageOf = (element: HTMLElement) => Math.floor(
      (element.getBoundingClientRect().top - editor.getBoundingClientRect().top) / slot,
    );
    if (pageOf(header) !== pageOf(theorem)) throw new Error('Header and theorem are on different pages');
    return theorem.getBoundingClientRect().top - header.getBoundingClientRect().bottom;
  });

  expect(gap).toBeGreaterThanOrEqual(16);
});

test('makes page breaks visible as an A4 page boundary in Visual mode', async ({ page }) => {
  const source = '# Trang trước\n\nNội dung trước.\n\n:::pagebreak\n:::\n\n# Trang sau\n\nNội dung sau.';
  await page.evaluate((markdown) => window.markdownEditor?.loadMarkdown(markdown), source);

  const marker = page.locator('[data-lmx-name="pagebreak"]');
  await expect(marker).toBeVisible();
  await expect(marker.locator('.hcmut-pagebreak-preview')).toHaveText('');
  const pagebreakLayout = () => page.evaluate(() => {
    const pageBreak = document.querySelector<HTMLElement>('[data-lmx-name="pagebreak"]');
    const followingHeading = [...document.querySelectorAll<HTMLElement>('.mu-atx-heading')]
      .find((heading) => heading.textContent?.includes('Trang sau'));
    const editor = document.querySelector<HTMLElement>('#editor');
    if (!pageBreak || !followingHeading || !editor) throw new Error('Pagebreak fixture did not render');
    const editorStyle = getComputedStyle(editor);
    const pageHeight = Number.parseFloat(editorStyle.getPropertyValue('--visual-page-height'));
    const pageGap = Number.parseFloat(editorStyle.getPropertyValue('--visual-page-gap'));
    const contentTop = Number.parseFloat(editorStyle.paddingTop);
    const slotHeight = pageHeight + pageGap;
    const editorTop = editor.getBoundingClientRect().top;
    const marker = pageBreak.querySelector<HTMLElement>('.hcmut-pagebreak-preview');
    if (!marker) throw new Error('Pagebreak marker did not render');
    const markerRect = marker.getBoundingClientRect();
    const nextOffset = followingHeading.getBoundingClientRect().top
      - editorTop
      - contentTop
      - Number.parseFloat(getComputedStyle(followingHeading).marginTop);
    const followingPageTop = editorTop + Math.round(nextOffset / slotHeight) * slotHeight;
    return {
      pagebreakHeight: Number.parseFloat(getComputedStyle(pageBreak).height),
      nextPageBoundaryDistance: Math.min(nextOffset % slotHeight, slotHeight - (nextOffset % slotHeight)),
      markerTopFromGap: markerRect.top - (followingPageTop - pageGap),
      markerBottomFromPage: markerRect.bottom - followingPageTop,
      nextOffset,
      pageHeight,
      pageGap,
      contentTop,
      slotHeight,
    };
  });
  await expect.poll(async () => (await pagebreakLayout()).pagebreakHeight).toBeGreaterThan(100);
  const pagebreakMetrics = await pagebreakLayout();
  expect(pagebreakMetrics.nextPageBoundaryDistance, JSON.stringify(pagebreakMetrics)).toBeLessThan(3);
  expect(pagebreakMetrics.markerTopFromGap, JSON.stringify(pagebreakMetrics)).toBeGreaterThanOrEqual(-1);
  expect(pagebreakMetrics.markerBottomFromPage, JSON.stringify(pagebreakMetrics)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: artifactPath('pagebreak-boundary.png'), fullPage: true });
});

test('creates a dedicated blank A4 sheet for a boundary-aligned page break', async ({ page }) => {
  await loadMarkdown(page, ':::pagebreak\n:::\n\n# Trang đầu');

  const marker = page.locator('[data-lmx-name="pagebreak"]');
  await expect.poll(() => marker.evaluate((element) => Number.parseFloat(
    element.style.getPropertyValue('--visual-pagebreak-height'),
  ))).toBeGreaterThan(1000);
  await expect(marker.locator('.hcmut-pagebreak-preview')).toBeVisible();

  const headingPage = await page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('#editor');
    const heading = document.querySelector<HTMLElement>('.mu-atx-heading');
    if (!editor || !heading) throw new Error('Boundary pagebreak fixture did not render');
    const style = getComputedStyle(editor);
    const slotHeight = Number.parseFloat(style.getPropertyValue('--visual-page-height'))
      + Number.parseFloat(style.getPropertyValue('--visual-page-gap'));
    return Math.floor(Math.max(0, heading.getBoundingClientRect().top
      - editor.getBoundingClientRect().top) / slotHeight);
  });
  expect(headingPage).toBe(1);

  const stackHeight = await page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('#editor');
    if (!editor) throw new Error('Boundary pagebreak editor did not render');
    return Number.parseFloat(getComputedStyle(editor).getPropertyValue('--visual-page-stack-height'));
  });
  const pageSlot = await page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('#editor');
    if (!editor) throw new Error('Boundary pagebreak editor did not render');
    const style = getComputedStyle(editor);
    return Number.parseFloat(style.getPropertyValue('--visual-page-height'))
      + Number.parseFloat(style.getPropertyValue('--visual-page-gap'));
  });
  const pageGap = await page.evaluate(() => Number.parseFloat(
    getComputedStyle(document.querySelector<HTMLElement>('#editor')!).getPropertyValue('--visual-page-gap'),
  ));
  expect(stackHeight).toBeGreaterThanOrEqual(pageSlot * 2 - pageGap - 1);
});

test('keeps the writable sheet after a cover when inserting an earlier page break', async ({ page }) => {
  await loadMarkdown(page, [
    '# Trang đầu',
    '',
    'Nội dung trang đầu.',
    '',
    ':::pagebreak',
    ':::',
    '',
    ':::cover',
    ':::',
    '',
  ].join('\n'));

  const cover = page.locator('[data-lmx-name="cover"]');
  await cover.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');

  const pageCount = () => page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('#editor');
    if (!editor) throw new Error('Visual editor did not render');
    const style = getComputedStyle(editor);
    const pageHeight = Number.parseFloat(style.getPropertyValue('--visual-page-height'));
    const pageGap = Number.parseFloat(style.getPropertyValue('--visual-page-gap'));
    return Math.round((editor.getBoundingClientRect().height + pageGap) / (pageHeight + pageGap));
  });
  await expect.poll(pageCount).toBeGreaterThanOrEqual(3);
  const pagesBeforeInsertion = await pageCount();

  await page.evaluate(() => {
    const paragraph = [...document.querySelectorAll<HTMLElement>('.mu-paragraph-content')]
      .find((element) => element.textContent === 'Nội dung trang đầu.');
    if (!paragraph) throw new Error('The earlier body paragraph did not render');
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.execCommand('insertText', false, '/pagebreak');
  });
  await page.locator('[data-label="lmx:pagebreak"]').dispatchEvent('click');

  await expect.poll(() => page.locator('[data-lmx-name="pagebreak"]').count()).toBe(2);
  await expect.poll(pageCount).toBeGreaterThanOrEqual(pagesBeforeInsertion);
});

test('uses one shared page boundary between covers separated by a page break', async ({ page }) => {
  await loadMarkdown(page, [
    ':::cover',
    ':::',
    '',
    ':::cover',
    ':::',
  ].join('\n'));

  const covers = page.locator('[data-lmx-name="cover"]');
  await covers.first().focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');

  const readCoverPages = () => page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('#editor');
    const coverBlocks = [...document.querySelectorAll<HTMLElement>('[data-lmx-name="cover"]')];
    if (!editor || coverBlocks.length !== 2) throw new Error('Two-cover fixture did not render');
    const style = getComputedStyle(editor);
    const slotHeight = Number.parseFloat(style.getPropertyValue('--visual-page-height'))
      + Number.parseFloat(style.getPropertyValue('--visual-page-gap'));
    const editorTop = editor.getBoundingClientRect().top;
    return coverBlocks.map((cover) => Math.floor(
      Math.max(0, cover.getBoundingClientRect().top - editorTop + 2.5) / slotHeight,
    ));
  });

  await expect.poll(readCoverPages).toEqual([0, 2]);

  await page.keyboard.type('/pagebreak');
  await page.locator('[data-label="lmx:pagebreak"]').dispatchEvent('click');

  await expect.poll(() => page.locator('[data-lmx-name="pagebreak"]').count()).toBe(1);
  await expect.poll(readCoverPages).toEqual([0, 1]);
  await expect.poll(() => requestMarkdown(page)).toBe([
    ':::cover',
    ':::',
    '',
    ':::pagebreak',
    ':::',
    '',
    ':::cover',
    ':::',
    '',
  ].join('\n'));
});

test('keeps every explicit A4 page when consecutive page breaks appear between covers', async ({ page }) => {
  const source = [
    '# Báo cáo Markdown',
    '',
    'Trường Đại học Bách khoa',
    '',
    ':::cover',
    ':::',
    '',
    ':::pagebreak',
    ':::',
    '',
    ':::cover',
    ':::',
    '',
    ':::pagebreak',
    ':::',
    '',
    ':::pagebreak',
    ':::',
    '',
    ':::cover',
    ':::',
    '',
  ].join('\n');
  await loadMarkdown(page, source);

  const coverPages = () => page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('#editor');
    const covers = [...document.querySelectorAll<HTMLElement>('[data-lmx-name="cover"]')];
    if (!editor || covers.length !== 3) throw new Error('Three-cover fixture did not render');
    const style = getComputedStyle(editor);
    const slotHeight = Number.parseFloat(style.getPropertyValue('--visual-page-height'))
      + Number.parseFloat(style.getPropertyValue('--visual-page-gap'));
    const editorTop = editor.getBoundingClientRect().top;
    return covers.map((cover) => Math.floor(
      Math.max(0, cover.getBoundingClientRect().top - editorTop + 2.5) / slotHeight,
    ));
  });

  await expect.poll(coverPages).toEqual([1, 2, 4]);
  await expect.poll(() => requestMarkdown(page)).toBe(source);
});

test('navigates and adds stable A4 pages through the native page sidebar bridge', async ({ page }) => {
  const source = [
    ':::cover',
    ':::',
    '',
    '# Nội dung',
    '',
  ].join('\n');
  await loadMarkdown(page, source);

  await expect.poll(() => page.evaluate(() => {
    const messages = (window as Window & { __bridgeMessages?: HostMessage[] }).__bridgeMessages ?? [];
    return messages.filter((message) => message.type === 'editor.pageInventoryChanged').at(-1)
      ?.payload.pages;
  })).toEqual(expect.arrayContaining([
    expect.objectContaining({ pageIndex: 0, kind: 'semantic', semanticName: 'cover' }),
    expect.objectContaining({ pageIndex: 1 }),
  ]));

  await page.evaluate(() => window.markdownEditor?.handleEnvelope({
    protocolVersion: 1,
    type: 'editor.selectPage',
    requestId: null,
    payload: { pageIndex: 1 },
  }));
  await expect.poll(() => page.evaluate(() => (
    document.querySelector<HTMLElement>('#editor')?.dataset.selectedPageIndex
  ))).toBe('1');

  await page.evaluate(() => window.markdownEditor?.handleEnvelope({
    protocolVersion: 1,
    type: 'editor.addPage',
    requestId: null,
    payload: { afterPageIndex: 1 },
  }));
  await expect(page.locator('#editor')).toHaveAttribute('data-visual-motion', 'insert');

  await expect.poll(() => requestMarkdown(page)).toBe([
    ':::cover',
    ':::',
    '',
    '# Nội dung',
    '',
    ':::pagebreak',
    ':::',
    '',
    '',
    '',
  ].join('\n'));
  await expect.poll(() => page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('#editor');
    if (!editor) return 0;
    const style = getComputedStyle(editor);
    const pageHeight = Number.parseFloat(style.getPropertyValue('--visual-page-height'));
    const pageGap = Number.parseFloat(style.getPropertyValue('--visual-page-gap'));
    return Math.round((editor.getBoundingClientRect().height + pageGap) / (pageHeight + pageGap));
  })).toBeGreaterThanOrEqual(3);
});

test('adds a distinct sheet after the generated blank sheet following a cover', async ({ page }) => {
  await loadMarkdown(page, ':::cover\n:::\n');
  await expect.poll(() => page.locator('.visual-page-action-strip').count()).toBe(2);

  await page.evaluate(() => window.markdownEditor?.addPage(1));
  await expect.poll(() => requestMarkdown(page)).toBe([
    ':::cover',
    ':::',
    '',
    ':::pagebreak',
    ':::',
    '',
    ':::pagebreak',
    ':::',
    '',
    '',
    '',
  ].join('\n'));
  await expect.poll(() => page.locator('.visual-page-action-strip').count()).toBe(3);
});

test('creates a writable A4 page and places the caret in its new paragraph', async ({ page }) => {
  await loadMarkdown(page, '# Nội dung\n\nĐoạn đầu.\n');

  await page.evaluate(() => window.markdownEditor?.handleEnvelope({
    protocolVersion: 1,
    type: 'editor.addPage',
    requestId: null,
    payload: { afterPageIndex: 0 },
  }));
  await expect(page.locator('#editor')).toHaveAttribute('data-visual-motion', 'insert');
  await page.keyboard.type('Nội dung trang mới');

  await expect.poll(() => requestMarkdown(page)).toBe([
    '# Nội dung',
    '',
    'Đoạn đầu.',
    '',
    ':::pagebreak',
    ':::',
    '',
    'Nội dung trang mới',
    '',
  ].join('\n'));
  const pageIndex = await page.locator('.mu-paragraph-content', {
    hasText: 'Nội dung trang mới',
  }).evaluate((paragraph) => {
    const editor = document.querySelector<HTMLElement>('#editor');
    if (!editor) throw new Error('Writable-page editor did not render');
    const style = getComputedStyle(editor);
    const slotHeight = Number.parseFloat(style.getPropertyValue('--visual-page-height'))
      + Number.parseFloat(style.getPropertyValue('--visual-page-gap'));
    return Math.floor((paragraph.getBoundingClientRect().top
      - editor.getBoundingClientRect().top + 2.5) / slotHeight);
  });
  expect(pageIndex).toBe(1);
});

test('keeps the page after a moved cover writable without inserting an extra blank A4', async ({ page }) => {
  await loadMarkdown(page, [
    ':::cover',
    ':::',
    '',
  ].join('\n'));

  await page.evaluate(() => window.markdownEditor?.addPage(0));
  await page.keyboard.type('/cover');
  await page.locator('[data-label="lmx:cover"]').dispatchEvent('click');
  await expect(page.locator('[data-lmx-name="cover"]')).toHaveCount(2);
  await expect.poll(() => page.locator('#editor').getAttribute('data-page-transaction')).toBeNull();

  await expect.poll(() => page.locator('[data-lmx-name="pagebreak"]').evaluate((element) => (
    Number.parseFloat(element.style.getPropertyValue('--visual-pagebreak-height'))
  ))).toBe(0);

  const moved = await page.evaluate(() => window.markdownEditor?.movePage(1, 'up'));
  expect(moved).toBe(true);
  await expect.poll(() => page.locator('#editor').getAttribute('data-page-transaction')).toBeNull();
  await expect.poll(() => page.locator('[data-lmx-name="pagebreak"]').evaluate((element) => (
    Number.parseFloat(element.style.getPropertyValue('--visual-pagebreak-height'))
  ))).toBe(0);

  const coverPages = () => page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('#editor');
    const covers = [...document.querySelectorAll<HTMLElement>('[data-lmx-name="cover"]')];
    if (!editor || covers.length !== 2) throw new Error('Moved-cover fixture did not render');
    const style = getComputedStyle(editor);
    const slotHeight = Number.parseFloat(style.getPropertyValue('--visual-page-height'))
      + Number.parseFloat(style.getPropertyValue('--visual-page-gap'));
    const editorTop = editor.getBoundingClientRect().top;
    return covers.map((cover) => Math.floor(
      Math.max(0, cover.getBoundingClientRect().top - editorTop + 2.5) / slotHeight,
    ));
  });
  await expect.poll(coverPages).toEqual([0, 1]);

  await page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('#editor');
    const contentRoot = editor?.querySelector<HTMLElement>(':scope > .mu-container');
    if (!editor || !contentRoot) throw new Error('Writable page root is missing');
    const style = getComputedStyle(editor);
    const pageHeight = Number.parseFloat(style.getPropertyValue('--visual-page-height'));
    const pageGap = Number.parseFloat(style.getPropertyValue('--visual-page-gap'));
    const contentTop = Number.parseFloat(style.getPropertyValue('--visual-page-content-top'));
    const editorRect = editor.getBoundingClientRect();
    const scale = editor.offsetWidth > 0 ? editorRect.width / editor.offsetWidth : 1;
    contentRoot.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      clientX: editorRect.left + editorRect.width / 2,
      clientY: editorRect.top + (2 * (pageHeight + pageGap) + contentTop + 24) * scale,
    }));
  });
  await page.keyboard.type('/theorem');

  await expect.poll(() => requestMarkdown(page)).toContain('/theorem');
  const activeCaret = await page.evaluate(() => {
    const selection = window.getSelection();
    const node = selection?.anchorNode;
    const element = node instanceof Element ? node : node?.parentElement;
    return {
      editable: element?.closest('[contenteditable="true"]') !== null,
      insideStructure: element?.closest('[contenteditable="false"]') !== null,
    };
  });
  expect(activeCaret).toEqual({ editable: true, insideStructure: false });
});

test('moves adjacent A4 pages up and down without losing their Markdown blocks', async ({ page }) => {
  const original = [
    '# Trang A',
    '',
    'Nội dung A.',
    '',
    ':::pagebreak',
    ':::',
    '',
    '# Trang B',
    '',
    'Nội dung B.',
    '',
  ].join('\n');
  const moved = [
    '# Trang B',
    '',
    'Nội dung B.',
    '',
    ':::pagebreak',
    ':::',
    '',
    '# Trang A',
    '',
    'Nội dung A.',
    '',
  ].join('\n');
  await loadMarkdown(page, original);

  await page.evaluate(() => window.markdownEditor?.handleEnvelope({
    protocolVersion: 1,
    type: 'editor.movePage',
    requestId: null,
    payload: { pageIndex: 1, direction: 'up' },
  }));
  await expect(page.locator('#editor')).toHaveAttribute('data-visual-motion', 'move');
  await expect.poll(() => requestMarkdown(page)).toBe(moved);
  await expect.poll(() => page.locator('#editor').getAttribute('data-selected-page-index')).toBe('0');
  await expect.poll(() => page.locator('#editor').getAttribute('data-page-transaction')).toBeNull();

  const revisionBeforeMoveDown = await page.locator('#editor').getAttribute('data-page-layout-revision');
  expect(await page.evaluate(() => window.markdownEditor?.movePage(0, 'down'))).toBe(true);
  await expect.poll(() => page.locator('#editor').getAttribute('data-page-transaction')).toBeNull();
  await expect.poll(() => page.locator('#editor').getAttribute('data-page-layout-revision'))
    .not.toBe(revisionBeforeMoveDown);
  await expect.poll(() => requestMarkdown(page)).toBe(original);
  await expect.poll(() => page.locator('#editor').getAttribute('data-selected-page-index')).toBe('1');

  await page.keyboard.press('Meta+z');
  await expect.poll(() => requestMarkdown(page)).toBe(moved);
  await page.keyboard.press('Meta+z');
  await expect.poll(() => requestMarkdown(page)).toBe(original);
});

test('preserves same-frame typing when a page is moved and keeps history separated', async ({ page }) => {
  const original = [
    '# Trang A',
    '',
    ':::pagebreak',
    ':::',
    '',
    '# Trang B',
    '',
  ].join('\n');
  await loadMarkdown(page, original);

  const moved = await page.evaluate(() => {
    const heading = [...document.querySelectorAll<HTMLElement>('.mu-atx-heading')]
      .find((element) => element.textContent?.includes('Trang B'));
    const content = heading?.querySelector<HTMLElement>('[contenteditable="true"]');
    if (!content) throw new Error('Page B heading is not editable');
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(content);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.execCommand('insertText', false, ' mới');
    return window.markdownEditor?.movePage(1, 'up');
  });
  expect(moved).toBe(true);
  await expect.poll(() => requestMarkdown(page)).toBe([
    '# Trang B mới',
    '',
    ':::pagebreak',
    ':::',
    '',
    '# Trang A',
    '',
  ].join('\n'));

  await page.keyboard.press('Meta+z');
  await expect.poll(() => requestMarkdown(page)).toBe([
    '# Trang A',
    '',
    ':::pagebreak',
    ':::',
    '',
    '# Trang B mới',
    '',
  ].join('\n'));
  await expect.poll(() => page.locator('#editor').getAttribute('data-page-transaction')).toBeNull();
  await page.keyboard.press('Meta+z');
  await expect.poll(() => requestMarkdown(page)).toBe(original);
});

test('does not rasterize page thumbnails until a navigator requests them', async ({ page }) => {
  await page.evaluate(() => {
    const host = window as Window & { __bridgeMessages?: HostMessage[] };
    host.__bridgeMessages = [];
    window.markdownEditor?.loadMarkdown('# Trang không cần thumbnail\n');
  });
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (
    (window as Window & { __bridgeMessages?: HostMessage[] }).__bridgeMessages
      ?.filter((message) => message.type === 'editor.pageThumbnailChanged').length ?? 0
  ))).toBe(0);
});

test('publishes real A4 page thumbnails for the native page navigator', async ({ page }) => {
  await page.evaluate(() => document.querySelector('#editor')?.dispatchEvent(
    new CustomEvent('visual-page-thumbnails-enabled', { detail: { enabled: true } }),
  ));
  await loadMarkdown(page, [
    '# Trang có nội dung',
    '',
    'Dòng chữ này phải xuất hiện trong ảnh thu nhỏ của trang.',
    '',
    ':::pagebreak',
    ':::',
    '',
  ].join('\n'));

  const thumbnail = await expect.poll(() => page.evaluate(() => {
    const messages = (window as Window & { __bridgeMessages?: HostMessage[] }).__bridgeMessages ?? [];
    return messages.filter((message) => (
      message.type === 'editor.pageThumbnailChanged'
      && message.payload.pageIndex === 0
    )).at(-1)?.payload;
  }), { timeout: 15_000 }).toMatchObject({
    pageIndex: 0,
    mimeType: expect.stringMatching(/^image\/(?:png|jpeg)$/),
    dataBase64: expect.any(String),
  });

  void thumbnail;
  const dimensions = await page.evaluate(async () => {
    const messages = (window as Window & { __bridgeMessages?: HostMessage[] }).__bridgeMessages ?? [];
    const payload = messages.filter((message) => (
      message.type === 'editor.pageThumbnailChanged'
      && message.payload.pageIndex === 0
    )).at(-1)?.payload;
    if (typeof payload?.mimeType !== 'string' || typeof payload.dataBase64 !== 'string') {
      throw new Error('Thumbnail payload was not published');
    }
    const image = new Image();
    image.src = `data:${payload.mimeType};base64,${payload.dataBase64}`;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  });
  expect(dimensions.width).toBeGreaterThanOrEqual(120);
  expect(dimensions.height / dimensions.width).toBeCloseTo(297 / 210, 1);
});

test('keeps the HCMUT logo in thumbnails without relaxing connect-src', async ({ page }) => {
  await page.evaluate(() => {
    const host = window as Window & {
      __bridgeMessages?: HostMessage[];
      __securityPolicyViolations?: unknown[];
    };
    host.__bridgeMessages = [];
    host.__securityPolicyViolations = [];
    document.querySelector('#editor')?.dispatchEvent(
      new CustomEvent('visual-page-thumbnails-enabled', { detail: { enabled: true } }),
    );
  });
  await loadMarkdown(page, [':::cover', ':::', ''].join('\n'));
  await expect.poll(() => page.locator('.hcmut-cover-logo').evaluate((logo) => (
    logo instanceof HTMLImageElement && logo.complete && logo.naturalWidth > 0
  ))).toBe(true);

  await expect.poll(() => page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('#editor');
    const messages = (window as Window & { __bridgeMessages?: HostMessage[] }).__bridgeMessages ?? [];
    const layoutRevision = Number(editor?.dataset.pageLayoutRevision ?? '-1');
    return messages.some((message) => (
      message.type === 'editor.pageThumbnailChanged'
      && message.payload.pageIndex === 0
      && message.payload.layoutRevision === layoutRevision
      && typeof message.payload.dataBase64 === 'string'
    ));
  }), { timeout: 15_000 }).toBe(true);

  const result = await page.evaluate(async () => {
    const editor = document.querySelector<HTMLElement>('#editor');
    const logo = document.querySelector<HTMLImageElement>('.hcmut-cover-logo');
    if (!editor || !logo) throw new Error('Cover logo did not render');
    const layoutRevision = Number(editor.dataset.pageLayoutRevision ?? '-1');
    const host = window as Window & {
      __bridgeMessages?: HostMessage[];
      __securityPolicyViolations?: Array<{
        blockedURI: string;
        effectiveDirective: string;
        violatedDirective: string;
      }>;
    };
    const payload = (host.__bridgeMessages ?? []).filter((message) => (
      message.type === 'editor.pageThumbnailChanged'
      && message.payload.pageIndex === 0
      && message.payload.layoutRevision === layoutRevision
    )).at(-1)?.payload;
    if (typeof payload?.mimeType !== 'string' || typeof payload.dataBase64 !== 'string') {
      throw new Error('Current cover thumbnail was not published');
    }

    const image = new Image();
    image.src = `data:${payload.mimeType};base64,${payload.dataBase64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Thumbnail canvas context is unavailable');
    context.drawImage(image, 0, 0);

    const editorRect = editor.getBoundingClientRect();
    const logoRect = logo.getBoundingClientRect();
    const pageHeight = Number.parseFloat(
      getComputedStyle(editor).getPropertyValue('--visual-page-height'),
    );
    const scaleX = image.naturalWidth / editorRect.width;
    const scaleY = image.naturalHeight / pageHeight;
    const x = Math.max(0, Math.floor((logoRect.left - editorRect.left) * scaleX));
    const y = Math.max(0, Math.floor((logoRect.top - editorRect.top) * scaleY));
    const width = Math.min(image.naturalWidth - x, Math.max(1, Math.ceil(logoRect.width * scaleX)));
    const height = Math.min(image.naturalHeight - y, Math.max(1, Math.ceil(logoRect.height * scaleY)));
    const pixels = context.getImageData(x, y, width, height).data;
    let chromaticPixels = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index] ?? 0;
      const green = pixels[index + 1] ?? 0;
      const blue = pixels[index + 2] ?? 0;
      if (Math.max(red, green, blue) - Math.min(red, green, blue) >= 25) {
        chromaticPixels += 1;
      }
    }

    return {
      chromaticPixels,
      csp: document.querySelector<HTMLMetaElement>(
        'meta[http-equiv="Content-Security-Policy"]',
      )?.content ?? '',
      connectViolations: (host.__securityPolicyViolations ?? []).filter((violation) => (
        violation.effectiveDirective === 'connect-src'
        || violation.violatedDirective.startsWith('connect-src')
      )),
    };
  });

  expect(result.csp).toContain("connect-src 'none'");
  expect(result.connectViolations).toEqual([]);
  expect(result.chromaticPixels).toBeGreaterThan(20);
});

test('deletes the selected semantic A4 page and keeps the edit undoable', async ({ page }) => {
  const source = [
    ':::cover',
    ':::',
    '',
    ':::pagebreak',
    ':::',
    '',
    ':::cover',
    ':::',
    '',
  ].join('\n');
  await loadMarkdown(page, source);
  await page.locator('[data-lmx-name="cover"]').last().click();

  await expect.poll(() => page.evaluate(() => {
    const messages = (window as Window & { __bridgeMessages?: HostMessage[] }).__bridgeMessages ?? [];
    return messages.filter((message) => message.type === 'editor.pageSelectionChanged').at(-1);
  })).toMatchObject({
    payload: { pageIndex: 1, kind: 'semantic', blockCount: 1, semanticName: 'cover', deletable: true },
  });
  await expect(page.locator('.visual-page-selection')).toBeVisible();

  await page.evaluate(() => window.markdownEditor?.handleEnvelope({
    protocolVersion: 1,
    type: 'editor.deleteSelectedPage',
    requestId: null,
    payload: {},
  }));
  await expect.poll(() => requestMarkdown(page)).toBe([
    ':::cover',
    ':::',
    '',
  ].join('\n'));

  await page.evaluate(() => document.querySelector<HTMLElement>('#editor')?.focus());
  await page.keyboard.press('Meta+z');
  await expect.poll(() => requestMarkdown(page)).toBe(source);
});

test('deletes ordinary Markdown blocks laid out on the selected A4 page', async ({ page }) => {
  const source = [
    '# Trang cần xóa',
    '',
    'Nội dung cần xóa.',
    '',
    ':::pagebreak',
    ':::',
    '',
    '# Trang giữ lại',
    '',
    'Nội dung giữ lại.',
    '',
  ].join('\n');
  await loadMarkdown(page, source);
  await page.getByRole('heading', { name: /Trang cần xóa/ }).click();

  await page.evaluate(() => window.markdownEditor?.handleEnvelope({
    protocolVersion: 1,
    type: 'editor.deleteSelectedPage',
    requestId: null,
    payload: {},
  }));

  await expect.poll(() => requestMarkdown(page)).toBe([
    '# Trang giữ lại',
    '',
    'Nội dung giữ lại.',
    '',
  ].join('\n'));
});

test('clears a selected page after editing so Delete Page cannot use stale block positions', async ({ page }) => {
  const source = [
    '# Trang đang sửa',
    '',
    'Nội dung.',
    '',
    ':::pagebreak',
    ':::',
    '',
    '# Trang giữ lại',
    '',
  ].join('\n');
  await loadMarkdown(page, source);
  const heading = page.getByRole('heading', { name: /Trang đang sửa/ });
  await heading.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' mới');

  await expect.poll(() => page.evaluate(() => {
    const messages = (window as Window & { __bridgeMessages?: HostMessage[] }).__bridgeMessages ?? [];
    return messages.filter((message) => message.type === 'editor.pageSelectionChanged').at(-1);
  })).toMatchObject({ payload: { selected: false } });

  await page.evaluate(() => window.markdownEditor?.handleEnvelope({
    protocolVersion: 1,
    type: 'editor.deleteSelectedPage',
    requestId: null,
    payload: {},
  }));
  await expect.poll(() => requestMarkdown(page)).toContain('# Trang đang sửa mới');
  await expect.poll(() => requestMarkdown(page)).toContain('# Trang giữ lại');
});

test('anchors a page break nested in a front section to the A4 page boundary', async ({ page }) => {
  const source = [
    '# Báo cáo Markdown',
    '',
    ':::front-section {kind="acknowledgements" title="Lời cảm ơn" numbered=false}',
    'Nội dung lời cảm ơn.',
    ':::pagebreak',
    ':::',
    ':::',
    '',
    '# Trang sau',
  ].join('\n');
  await page.evaluate((markdown) => window.markdownEditor?.loadMarkdown(markdown), source);

  const metrics = await page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('#editor');
    const front = document.querySelector<HTMLElement>('[data-lmx-name="front-section"]');
    const pageBreak = front?.querySelector<HTMLElement>('[data-lmx-name="pagebreak"]');
    const marker = pageBreak?.querySelector<HTMLElement>('.hcmut-pagebreak-preview');
    if (!editor || !front || !pageBreak || !marker) throw new Error('Nested pagebreak fixture did not render');
    const pageHeight = Number.parseFloat(getComputedStyle(editor).getPropertyValue('--visual-page-height'));
    const frontTop = front.getBoundingClientRect().top;
    const markerRect = marker.getBoundingClientRect();
    return {
      frontHeight: front.getBoundingClientRect().height,
      pagebreakHeight: pageBreak.getBoundingClientRect().height,
      markerTopFromFront: markerRect.top - frontTop,
      markerBottomFromPage: markerRect.bottom - (frontTop + pageHeight),
    };
  });

  expect(metrics.frontHeight).toBeGreaterThan(1000);
  expect(metrics.pagebreakHeight).toBeLessThanOrEqual(24);
  expect(metrics.markerTopFromFront).toBeGreaterThan(900);
  expect(metrics.markerBottomFromPage).toBeLessThanOrEqual(2);
});

test('keeps the active page stable while typing below the first A4 page', async ({ page }) => {
  const source = Array.from({ length: 48 }, (_, index) => `### Mục ${index + 1}\n\nNội dung trang ${index + 1}.`).join('\n\n');
  await page.evaluate((markdown) => window.markdownEditor?.loadMarkdown(markdown), source);

  const target = page.locator('.mu-paragraph-content').nth(20);
  await target.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  const before = await page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>('.editor-stage');
    const targetElement = document.querySelectorAll<HTMLElement>('.mu-paragraph-content')[20];
    if (!stage || !targetElement) throw new Error('Scrollable editor fixture did not render');
    return {
      scrollTop: stage.scrollTop,
      targetTop: targetElement.getBoundingClientRect().top,
    };
  });

  await target.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.insertText(' thêm');
  // Allow the visual page-flow recalculation and browser layout anchoring to settle.
  await page.waitForTimeout(350);

  const after = await page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>('.editor-stage');
    const targetElement = document.querySelectorAll<HTMLElement>('.mu-paragraph-content')[20];
    if (!stage || !targetElement) throw new Error('Scrollable editor fixture did not render');
    return {
      scrollTop: stage.scrollTop,
      targetTop: targetElement.getBoundingClientRect().top,
    };
  });
  expect(Math.abs(after.scrollTop - before.scrollTop)).toBeLessThan(48);
  expect(Math.abs(after.targetTop - before.targetTop)).toBeLessThan(48);
  await expect.poll(() => requestMarkdown(page)).toContain('Nội dung trang 21. thêm');
});

test('persists exact Vietnamese Unicode typed in Visual mode', async ({ page }) => {
  const paragraph = page.locator('.mu-paragraph-content').first();
  await paragraph.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' Tiếng Việt: Trường Đại học Bách khoa — Nguyễn Thị Ánh.');

  await expect.poll(() => requestMarkdown(page)).toContain(
    'Nội dung ban đầu. Tiếng Việt: Trường Đại học Bách khoa — Nguyễn Thị Ánh.',
  );
});

test('undo and redo restore the exact Unicode edit', async ({ page }) => {
  const paragraph = page.locator('.mu-paragraph-content').first();
  await paragraph.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' tiếng Việt');
  await expect.poll(() => requestMarkdown(page)).toContain('Nội dung ban đầu. tiếng Việt');

  await page.keyboard.press('Meta+z');
  await expect.poll(() => requestMarkdown(page)).not.toContain(' tiếng Việt');

  await page.keyboard.press('Meta+Shift+z');
  await expect.poll(() => requestMarkdown(page)).toContain('Nội dung ban đầu. tiếng Việt');
});

test('copies and pastes a Vietnamese selection without losing focus', async ({ page }) => {
  await page.evaluate(() => {
    const text = document.querySelector('.mu-paragraph-content .mu-plain-text')?.firstChild;
    if (!text) throw new Error('Paragraph text was not rendered');
    const value = text.textContent ?? '';
    const start = value.indexOf('ban đầu');
    const range = document.createRange();
    range.setStart(text, start);
    range.setEnd(text, start + 'ban đầu'.length);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await page.keyboard.press('Meta+c');

  const target = page.locator('.mu-paragraph-content').nth(1);
  await target.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' ');
  await page.keyboard.press('Meta+v');

  await expect.poll(() => requestMarkdown(page)).toContain('Đích: ban đầu');
  await expect(page.locator('#editor')).toBeFocused();
});

test('routes undo to focused Source mode instead of the hidden Visual editor', async ({ page }) => {
  await page.evaluate(() => window.markdownEditor?.setMode('source'));
  const source = page.locator('.cm-content');
  await expect(source).toBeFocused();
  await page.keyboard.insertText(' thay đổi nguồn');
  await expect.poll(() => requestMarkdown(page)).toContain('thay đổi nguồn');

  await page.keyboard.press('Meta+z');

  await expect.poll(() => requestMarkdown(page)).not.toContain('thay đổi nguồn');
  await expect(page.locator('#source-editor')).toBeVisible();
  await expect(page.locator('#editor.mu-editor')).toBeHidden();
});

test('keeps the caret inside a newly inserted LMX theorem', async ({ page }) => {
  const target = page.locator('.mu-paragraph-content').nth(1);
  await target.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/theorem');
  await page.getByText('Định lý', { exact: true }).dispatchEvent('click');

  await expect(page.locator('[data-lmx-name="theorem"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const anchor = window.getSelection()?.anchorNode;
    const element = anchor instanceof Element ? anchor : anchor?.parentElement;
    return element?.closest<HTMLElement>('[data-lmx-name]')?.dataset.lmxName ?? null;
  })).toBe('theorem');
});

test('moves the caret outside an LMX theorem with ArrowDown from its last line', async ({ page }) => {
  await loadMarkdown(page, ':::theorem\nNội dung định lý.\n:::\n');

  const theoremContent = page.locator('[data-lmx-name="theorem"] .mu-paragraph-content');
  await theoremContent.click();
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowDown');

  await expect.poll(() => page.evaluate(() => {
    const anchor = window.getSelection()?.anchorNode;
    const element = anchor instanceof Element ? anchor : anchor?.parentElement;
    return element?.closest<HTMLElement>('[data-lmx-name]')?.dataset.lmxName ?? null;
  })).toBeNull();

  await page.keyboard.insertText('Đoạn ngoài định lý.');
  await expect.poll(() => requestMarkdown(page)).toBe(
    ':::theorem\nNội dung định lý.\n:::\n\nĐoạn ngoài định lý.\n',
  );
});

test('exits an LMX block after pressing Enter twice in its empty trailing paragraph', async ({ page }) => {
  await loadMarkdown(page, ':::theorem\nA\n:::\n');

  await page.evaluate(() => {
    const content = document.querySelector<HTMLElement>(
      '[data-lmx-name="theorem"] .mu-paragraph-content:last-of-type',
    ) ?? document.querySelector<HTMLElement>('[data-lmx-name="theorem"] .mu-paragraph-content');
    if (!content) throw new Error('Theorem content did not render');
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(content);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
    content.focus();
  });
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');

  await expect.poll(() => page.evaluate(() => {
    const anchor = window.getSelection()?.anchorNode;
    const element = anchor instanceof Element ? anchor : anchor?.parentElement;
    return element?.closest<HTMLElement>('[data-lmx-name]')?.dataset.lmxName ?? null;
  })).toBeNull();

  await page.keyboard.insertText('Đoạn ngoài block.');
  await expect.poll(() => requestMarkdown(page)).toBe(
    ':::theorem\nA\n:::\n\nĐoạn ngoài block.\n',
  );
});

test('exits a structural block inserted from the slash menu after pressing Enter twice', async ({ page }) => {
  await loadMarkdown(page, '');

  await page.locator('.mu-paragraph-content').click();
  await page.keyboard.type('/toc');
  await page.getByText('Mục lục', { exact: true }).last().dispatchEvent('click');
  await expect(page.locator('[data-lmx-name="toc"]')).toBeAttached();
  await expect.poll(() => page.evaluate(() => (
    (document.activeElement as HTMLElement | null)?.dataset.lmxName ?? null
  ))).toBe('toc');

  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('Nội dung sau mục lục.');

  await expect.poll(() => requestMarkdown(page)).toBe(
    ':::toc\n:::\n\nNội dung sau mục lục.\n',
  );
});

test('does not draw a focus frame around the A4 editor after exiting a structural block', async ({ page }) => {
  await loadMarkdown(page, ':::cover\n:::\n');

  const cover = page.locator('[data-lmx-name="cover"]');
  await cover.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');

  await expect(page.locator('#editor')).toBeFocused();
  const outlineStyle = await page.locator('#editor').evaluate((editor) => (
    getComputedStyle(editor).outlineStyle
  ));
  expect(outlineStyle).toBe('none');
});

test('does not draw a page-sized focus frame around a structural block', async ({ page }) => {
  await loadMarkdown(page, ':::cover\n:::\n');

  const cover = page.locator('[data-lmx-name="cover"]');
  await cover.focus();
  await expect(cover).toBeFocused();

  const outlineStyle = await cover.evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(outlineStyle).toBe('none');
});

test('exits a code or preview block after pressing Enter twice at its end', async ({ page }) => {
  await loadMarkdown(page, '```text\nA\n```\n');

  const codeContent = page.locator('.mu-codeblock-content');
  await codeContent.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');

  await expect.poll(() => page.evaluate(() => {
    const anchor = window.getSelection()?.anchorNode;
    const element = anchor instanceof Element ? anchor : anchor?.parentElement;
    return element?.closest<HTMLElement>('.mu-code-block, .mu-math-block, .mu-diagram-block')?.className ?? null;
  })).toBeNull();

  await page.keyboard.insertText('Đoạn ngoài code.');
  await expect.poll(() => requestMarkdown(page)).toBe(
    '```text\nA\n```\n\nĐoạn ngoài code.\n',
  );
});

test('inserts every Beta 1 semantic block from the slash menu', async ({ page }) => {
  const commands = [
    ['cover', 'Trang bìa', 'cover'],
    ['toc', 'Mục lục', 'toc'],
    ['list-of-figures', 'Danh sách hình', 'list-of-figures'],
    ['list-of-tables', 'Danh sách bảng', 'list-of-tables'],
    ['figure', 'Figure', 'figure'],
    ['table', 'Table', 'table'],
    ['listing', 'Code Listing', 'listing'],
    ['theorem', 'Định lý', 'theorem'],
    ['property', 'Tính chất', 'property'],
    ['proposition', 'Mệnh đề', 'proposition'],
    ['corollary', 'Hệ quả', 'corollary'],
    ['lemma', 'Bổ đề', 'lemma'],
    ['exercise', 'Bài toán', 'exercise'],
    ['pagebreak', 'Page Break', 'pagebreak'],
    ['acknowledgements', 'Lời cảm ơn', 'front-section'],
    ['declaration', 'Lời cam đoan', 'front-section'],
    ['abstract', 'Tóm tắt', 'front-section'],
  ] as const;

  for (const [command, title, blockName] of commands) {
    await loadMarkdown(page, '');
    await page.locator('.mu-paragraph-content').click();
    await page.keyboard.type(`/${command}`);
    await page.getByText(title, { exact: true }).last().dispatchEvent('click');
    const insertedBlock = page.locator(`[data-lmx-name="${blockName}"]`);
    await expect(insertedBlock).toBeAttached();
    await expect(page.locator('#editor')).toHaveAttribute('data-visual-motion', 'insert');
    if (blockName === 'pagebreak') {
      await expect.poll(() => insertedBlock.evaluate((element) => (
        element.style.getPropertyValue('--visual-pagebreak-height')
      ))).not.toBe('');
      await expect(insertedBlock.locator('.hcmut-pagebreak-preview')).toBeVisible();
    } else {
      await expect(insertedBlock).toBeVisible();
    }
    await expect.poll(() => requestMarkdown(page)).toContain(
      blockName === 'front-section' ? `kind="${command}"` : `:::${command}`,
    );
  }
});

test('opens a table-size grid before creating a Table Block', async ({ page }) => {
  await loadMarkdown(page, '');
  await page.locator('.mu-paragraph-content').click();
  await page.keyboard.type('/table');
  await page.getByText('Table Block', { exact: true }).click();

  await expect(page.locator('.mu-table-picker')).toBeVisible();
  await page.locator('.mu-table-picker-cell[data-row="2"][data-column="3"]').click();

  const table = page.locator('.mu-table');
  await expect(table).toBeVisible();
  await expect(table.locator('.mu-table-row')).toHaveCount(3);
  await expect(table.locator('.mu-table-row').first().locator('.mu-table-cell')).toHaveCount(4);
});

test('wraps wide tables inside the printable A4 text area', async ({ page }) => {
  const wideTable = [
    '| C1 | C2 | C3 | C4 | C5 | C6 |',
    '| --- | --- | --- | --- | --- | --- |',
    '| Một | Hai | Ba | Bốn | Năm | Sáu |',
    '',
  ].join('\n');
  await page.evaluate((source) => window.markdownEditor?.loadMarkdown(source), wideTable);
  await expect(page.locator('.mu-table-inner')).toBeVisible();

  const bounds = await page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('#editor');
    const table = document.querySelector<HTMLElement>('.mu-table-inner');
    if (!editor || !table) throw new Error('Wide table did not render');
    const editorRect = editor.getBoundingClientRect();
    const tableRect = table.getBoundingClientRect();
    const contentRight = Number.parseFloat(
      getComputedStyle(editor).getPropertyValue('--visual-page-content-right'),
    );
    return { tableRight: tableRect.right, printableRight: editorRect.right - contentRight };
  });

  expect(bounds.tableRight).toBeLessThanOrEqual(bounds.printableRight + 1);
});

test('supports the exact heading and equation slash aliases from the product contract', async ({ page }) => {
  await loadMarkdown(page, '');
  const paragraph = page.locator('.mu-paragraph-content');
  await paragraph.click();
  await page.keyboard.type('/heading4');
  await page.getByText('Heading 4', { exact: true }).dispatchEvent('click');
  await page.keyboard.type('Tiêu đề cấp bốn');

  await expect.poll(() => requestMarkdown(page)).toContain('#### Tiêu đề cấp bốn');

  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/equation');
  await page.getByText('Equation', { exact: true }).dispatchEvent('click');

  await expect(page.locator('.mu-math-block')).toBeVisible();
});

test('opens an accessible contextual template menu inside a Math Block', async ({ page }) => {
  await loadMarkdown(page, ['$$', 'x + 1', '$$', ''].join('\n'));
  const mathContent = page.locator('.mu-math-block .mu-codeblock-content');
  await mathContent.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' /f');

  const menu = page.locator('.mu-math-quick-insert > div');
  await expect(page.locator('.mu-math-quick-insert')).toBeVisible();
  await expect(menu).toHaveAttribute('role', 'listbox');
  const fractionButton = page.getByRole('option', { name: 'Phân số /fraction', exact: true });
  await expect(fractionButton).toBeVisible();
  await expect(fractionButton).toHaveAttribute('aria-selected', 'true');
  await expect(menu).toHaveAttribute('aria-activedescendant', await fractionButton.getAttribute('id') ?? '');
  await page.keyboard.press('Enter');

  await expect.poll(() => requestMarkdown(page)).toContain('x + 1 \\frac{}{}');
  await expect.poll(() => mathContent.evaluate(() => {
    const selection = document.getSelection();
    return selection?.isCollapsed === true && selection.anchorOffset;
  })).toBe(12);

  await page.keyboard.type('a');
  await page.keyboard.press('Tab');
  await page.keyboard.type('b');
  await expect.poll(() => requestMarkdown(page)).toContain('\\frac{a}{b}');
});

for (const command of ['Delta', 'delta']) {
  test(`inserts the exact ${command} from the math slash menu`, async ({ page }) => {
    await loadMarkdown(page, '$$\nx =\n$$\n');
    await page.locator('.mu-math-block .mu-codeblock-content').click();
    await page.keyboard.press('End');
    await page.keyboard.type(` /${command}`);
    await expect(page.locator('.mu-math-quick-insert')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect.poll(() => requestMarkdown(page)).toBe(`$$\nx = \\${command}\n$$\n`);
    await expect(page.locator('.mu-math-preview .katex')).toBeVisible();
  });
}

for (const sample of [
  { id: 'derivative', values: ['t'], latex: '\\frac{d}{dt}' },
  { id: 'partial-derivative', values: ['f(x)', 't'], latex: '\\frac{\\partial f(x)}{\\partial t}' },
  { id: 'nth-derivative', values: ['2', 't', '2'], latex: '\\frac{d^2}{dt^2}' },
]) {
  test(`fills ${sample.id} using slash and Tab without damaging TeX`, async ({ page }) => {
    await loadMarkdown(page, '$$\nx =\n$$\n');
    const mathContent = page.locator('.mu-math-block .mu-codeblock-content');
    await mathContent.click();
    await page.keyboard.press('End');
    await page.keyboard.type(` /${sample.id}`);
    await expect(page.locator(
      `.mu-math-quick-insert [data-label="${sample.id}"]`,
    )).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Enter');
    for (const [index, value] of sample.values.entries()) {
      if (index > 0) await page.keyboard.press('Tab');
      await page.keyboard.type(value);
    }
    await expect.poll(() => requestMarkdown(page)).toBe(`$$\nx = ${sample.latex}\n$$\n`);
    await expect(page.locator('.mu-math-preview .katex')).toBeVisible();
    await expect(page.locator('.mu-math-error')).toHaveCount(0);

    // Loading saved source must not change either the expression or its rendering.
    await loadMarkdown(page, `$$\nx = ${sample.latex}\n$$\n`);
    await expect.poll(() => requestMarkdown(page)).toBe(`$$\nx = ${sample.latex}\n$$\n`);
    await expect(page.locator('.mu-math-preview .katex')).toBeVisible();
  });
}

test('wraps selected Vietnamese prose with the shared Text template', async ({ page }) => {
  await loadMarkdown(page, ['$$', 'x + hội tụ đều', '$$', ''].join('\n'));
  await page.evaluate(() => window.markdownEditor?.setMathTypeEnabled(true));

  const mathContent = page.locator('.mu-math-block .mu-codeblock-content');
  await selectTextInElement(mathContent, 'hội tụ đều');
  const textTemplate = page.locator(
    '.mu-math-template-palette button[data-label="text"]',
  );
  await expect(textTemplate).toHaveAccessibleName(/Văn bản/);
  await textTemplate.dispatchEvent('click');

  await expect.poll(() => requestMarkdown(page)).toContain('x + \\text{hội tụ đều}');
  const preview = page.locator('.mu-math-block .mu-math-preview');
  await expect(preview.locator('.katex')).toBeVisible();
  await expect(preview).toContainText('hội tụ đều');

  await page.keyboard.press('Tab');
  await page.keyboard.insertText(' liên tục');
  await expect.poll(() => requestMarkdown(page)).toContain('\\text{hội tụ đều liên tục}');

  await page.keyboard.press('Meta+z');
  await expect.poll(() => requestMarkdown(page)).toContain('x + hội tụ đều');
  await expect.poll(() => requestMarkdown(page)).not.toContain('\\text{');
  await page.keyboard.press('Meta+Shift+z');
  await expect.poll(() => requestMarkdown(page)).toContain('\\text{hội tụ đều liên tục}');
});

test('inserts less-than-or-equal as one LaTeX relation from the OFF slash menu', async ({ page }) => {
  await loadMarkdown(page, ['$$', 'x', '$$', ''].join('\n'));
  await expect(page.locator('.mu-math-template-palette')).toHaveCount(0);

  const mathContent = page.locator('.mu-math-block .mu-codeblock-content');
  await mathContent.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' /<=');

  const relation = page.getByRole('option', { name: /Bé hơn hoặc bằng/ });
  await expect(relation).toBeVisible();
  await page.keyboard.press('Enter');

  await expect.poll(() => requestMarkdown(page)).toContain('x \\le');
  await expect.poll(() => requestMarkdown(page)).not.toContain('<=');
  await expect(page.locator('.mu-math-block .mu-math-preview')).toContainText('≤');
});

test('preserves direct text LaTeX and arbitrary typed variables', async ({ page }) => {
  const source = ['$$', '\\text{đã cho} + text', '$$', ''].join('\n');
  await loadMarkdown(page, source);

  const mathContent = page.locator('.mu-math-block .mu-codeblock-content');
  await mathContent.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' + hoi');

  await expect.poll(() => requestMarkdown(page)).toContain('\\text{đã cho} + text + hoi');
  await expect(page.locator('.mu-math-block .mu-math-preview')).toContainText('đã cho');
});

test('keeps Enter and Tab safe when a Math Block query has no results', async ({ page }) => {
  const source = ['$$', 'x + 1', '$$', ''].join('\n');
  await loadMarkdown(page, source);
  const mathContent = page.locator('.mu-math-block .mu-codeblock-content');
  await mathContent.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' /no-such-template');

  await expect(page.locator('.mu-math-quick-insert .no-result')).toBeVisible();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect.poll(() => requestMarkdown(page)).toContain('x + 1 /no-such-template');
});

test('invalidates formula tab stops after selection leaves their Math Block', async ({ page }) => {
  await loadMarkdown(page, ['$$', 'x + 1', '$$', '', 'Outside', ''].join('\n'));
  const mathContent = page.locator('.mu-math-block .mu-codeblock-content');
  await mathContent.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' /f');
  await page.keyboard.press('Enter');
  await page.keyboard.type('a');

  await page.locator('.mu-paragraph-content').filter({ hasText: /^Outside$/ }).click();
  await page.locator('.mu-math-block .mu-math-preview').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Tab');

  await expect.poll(() => requestMarkdown(page)).toContain('    ');
  await expect.poll(() => requestMarkdown(page)).toContain('\\frac{a}{}');
  await expect.poll(() => requestMarkdown(page)).not.toContain('\\frac{a}{    }');
});

test('adapts MathType glass to dark appearance', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await loadMarkdown(page, ['$$', 'x + 1', '$$', ''].join('\n'));
  await page.evaluate(() => window.markdownEditor?.setMathTypeEnabled(true));

  const palette = page.locator('.mu-math-template-palette');
  await expect(palette).toBeVisible();
  await expect(palette).toHaveCSS('color', 'rgb(242, 242, 247)');
  await expect(palette.locator('button').first()).toHaveCSS('color', 'rgb(242, 242, 247)');
});

test('keeps the MathType palette off by default and toggles it without changing Markdown', async ({ page }) => {
  const source = ['$$', 'x + 1', '$$', ''].join('\n');
  await loadMarkdown(page, source);

  await expect(page.locator('.mu-math-template-palette')).toHaveCount(0);
  await page.evaluate(() => window.markdownEditor?.setMathTypeEnabled(true));
  const palette = page.locator('.mu-math-template-palette');
  await expect(palette).toBeVisible();
  expect(await palette.locator('button').count()).toBeLessThanOrEqual(16);
  await palette.evaluate((element) => { element.dataset.reconciliationIdentity = 'original'; });
  const paletteFraction = palette.locator('button[data-label="fraction"]');
  await expect(paletteFraction).toBeVisible();
  await expect(paletteFraction).toHaveCSS('min-height', '44px');
  await expect.poll(() => requestMarkdown(page)).toBe(source);
  await page.locator('.mu-math-block .mu-codeblock-content').click();
  await page.keyboard.press('End');
  await paletteFraction.dispatchEvent('click');
  await page.keyboard.type('a');
  await page.keyboard.press('Tab');
  await page.keyboard.type('b');
  await expect.poll(() => requestMarkdown(page)).toContain('x + 1\\frac{a}{b}');
  await expect(palette).toHaveAttribute('data-reconciliation-identity', 'original');

  const edited = await requestMarkdown(page);
  if (edited === null) throw new Error('MathType edit did not produce Markdown');
  const replacement = ['$$', 'y = 2', '$$', ''].join('\n');
  await page.evaluate((markdown) => window.markdownEditor?.loadMarkdown(markdown), replacement);
  await expect(page.locator('.mu-math-template-palette')).toBeVisible();
  await expect.poll(() => requestMarkdown(page)).toBe(replacement);

  await page.evaluate(() => window.markdownEditor?.setMathTypeEnabled(false));
  await expect(page.locator('.mu-math-template-palette')).toHaveCount(0);
  await page.evaluate((markdown) => window.markdownEditor?.loadMarkdown(markdown), edited);
  await expect(page.locator('.mu-math-template-palette')).toHaveCount(0);
});

test('renders every allowlisted Quick Edit block property and preserves Markdown', async ({ page }) => {
  const source = [
    ':::style {align="justify" background="#F0EAD6" borderColor="#654321" borderRadiusPt=4 borderWidthPt=1.5 color="#1E4B8F" component="paragraph" fontFamily="serif" fontSizePt=13 fontStyle="italic" fontWeight="700" letterSpacingPt=0.5 lineHeight=1.75 marginMm=5 paddingMm=3}',
    'Nội dung được chỉnh nhanh.',
    ':::',
    '',
  ].join('\n');
  await page.evaluate((markdown) => window.markdownEditor?.loadMarkdown(markdown), source);

  const wrapper = page.locator('[data-lmx-name="style"]');
  await expect(wrapper).toBeVisible();
  await expect(wrapper.locator('.mu-lmx-header')).toHaveCount(0);
  await expect(wrapper).toHaveClass(/mu-lmx-quick-style/);
  await expect(wrapper).toHaveCSS('color', 'rgb(30, 75, 143)');
  await expect(wrapper).toHaveCSS('background-color', 'rgb(240, 234, 214)');
  await expect(wrapper).toHaveCSS('font-weight', '700');
  await expect(wrapper).toHaveCSS('font-style', 'italic');
  await expect(wrapper).toHaveCSS('text-align', 'justify');
  await expect(wrapper).toHaveCSS('border-color', 'rgb(101, 67, 33)');
  const dimensions = await wrapper.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      fontFamily: style.fontFamily,
      fontSize: Number.parseFloat(style.fontSize),
      lineHeight: Number.parseFloat(style.lineHeight),
      letterSpacing: Number.parseFloat(style.letterSpacing),
      borderWidth: Number.parseFloat(style.borderTopWidth),
      borderRadius: Number.parseFloat(style.borderTopLeftRadius),
      padding: Number.parseFloat(style.paddingTop),
      margin: Number.parseFloat(style.marginTop),
    };
  });
  expect(dimensions.fontFamily).toContain('Georgia');
  expect(dimensions.fontSize).toBeCloseTo(17.3333, 3);
  expect(dimensions.lineHeight).toBeCloseTo(30.3333, 3);
  expect(dimensions.letterSpacing).toBeCloseTo(0.6667, 3);
  expect(dimensions.borderWidth).toBeCloseTo(2, 3);
  expect(dimensions.borderRadius).toBeCloseTo(5.3333, 3);
  expect(dimensions.padding).toBeCloseTo(11.3386, 3);
  // WebKit quantizes used margins to 1/64 CSS px. Verify the intended 5mm
  // geometry within that resolution, not its browser-specific string rounding.
  expect(Math.abs(dimensions.margin - 5 * 96 / 25.4)).toBeLessThanOrEqual(1 / 64);
  await expect(wrapper.getByText('Nội dung được chỉnh nhanh.', { exact: true })).toBeVisible();
  await expect.poll(() => requestMarkdown(page)).toBe(source);
});

test('renders Quick Edit block and title properties on a selected semantic block', async ({ page }) => {
  const source = [
    ':::theorem {#thm-style background="#FFF4E5" color="#183153" fontSizePt=14 fontStyle="normal" fontWeight="700" title="Định lý có kiểu" titleColor="#A12424" titleFontFamily="sans-serif" titleFontSizePt=18 titleFontStyle="italic" titleFontWeight="600" titleLetterSpacingPt=0.25 titleLineHeight=1.25}',
    'Nội dung định lý.',
    ':::',
    '',
  ].join('\n');
  await page.evaluate((markdown) => window.markdownEditor?.loadMarkdown(markdown), source);

  const theorem = page.locator('[data-lmx-name="theorem"]');
  const title = theorem.locator('.mu-lmx-title');
  await expect(theorem).toHaveClass(/mu-lmx-quick-style/);
  await expect(theorem).toHaveCSS('color', 'rgb(24, 49, 83)');
  await expect(theorem).toHaveCSS('background-color', 'rgb(255, 244, 229)');
  for (const element of [theorem, theorem.locator('.mu-paragraph')]) {
    const fontSize = await element.evaluate(node => Number.parseFloat(getComputedStyle(node).fontSize));
    expect(fontSize).toBeCloseTo(14 * 96 / 72, 3);
  }
  await expect(theorem).toHaveCSS('font-weight', '700');
  await expect(theorem).toHaveCSS('font-style', 'normal');
  await expect(title).toHaveCSS('color', 'rgb(161, 36, 36)');
  await expect(title).toHaveCSS('font-family', /Avenir Next/);
  await expect(title).toHaveCSS('font-size', '24px');
  await expect(title).toHaveCSS('font-style', 'italic');
  await expect(title).toHaveCSS('font-weight', '600');
  const titleMetrics = await title.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      letterSpacing: Number.parseFloat(style.letterSpacing),
      lineHeight: Number.parseFloat(style.lineHeight),
    };
  });
  expect(titleMetrics.letterSpacing).toBeCloseTo(0.3333, 3);
  expect(titleMetrics.lineHeight).toBeCloseTo(30, 3);
  await expect.poll(() => requestMarkdown(page)).toBe(source);
});

test('does not expose invalid or unknown Quick Edit values to CSS', async ({ page }) => {
  const source = [
    ':::style {color="#1E4B8F" fontFamily="url(https://invalid.test/font)" rawCss="position:fixed"}',
    'Nội dung an toàn.',
    ':::',
    '',
  ].join('\n');
  await page.evaluate((markdown) => window.markdownEditor?.loadMarkdown(markdown), source);

  const wrapper = page.locator('[data-lmx-name="style"]');
  await expect(wrapper).not.toHaveClass(/mu-lmx-quick-style/);
  await expect(wrapper).not.toHaveCSS('color', 'rgb(30, 75, 143)');
  const markup = await wrapper.evaluate((element) => element.outerHTML);
  expect(markup).not.toContain('invalid.test');
  expect(markup).not.toContain('position:fixed');
  await expect.poll(() => requestMarkdown(page)).toBe(source);
});

test('keeps Quick Edit decoration visible and bounded on print paper', async ({ page }) => {
  const source = [
    ':::style {background="#F0EAD6" borderColor="#654321" borderRadiusPt=4 borderWidthPt=1.5 paddingMm=3}',
    'Nội dung để in.',
    ':::',
    '',
  ].join('\n');
  await page.evaluate((markdown) => window.markdownEditor?.loadMarkdown(markdown), source);
  await page.emulateMedia({ media: 'print' });

  const wrapper = page.locator('[data-lmx-name="style"]');
  await expect(wrapper).toHaveCSS('background-color', 'rgb(240, 234, 214)');
  await expect(wrapper).toHaveCSS('border-color', 'rgb(101, 67, 33)');
  await expect(wrapper).toHaveCSS('position', 'relative');
  await expect(wrapper).toHaveCSS('overflow-x', 'visible');
  await expect.poll(() => requestMarkdown(page)).toBe(source);
});

test('commits Vietnamese text through Chromium composition events', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP composition injection is Chromium-only.');
  await loadMarkdown(page, '# IME\n\nBắt đầu:');
  await page.evaluate(() => {
    const host = window as Window & { __compositionEvents?: string[] };
    host.__compositionEvents = [];
    const editor = document.querySelector('.mu-editor');
    for (const type of ['compositionstart', 'compositionupdate', 'compositionend']) {
      editor?.addEventListener(type, () => host.__compositionEvents?.push(type), true);
    }
  });
  await page.locator('.mu-paragraph-content').click();
  await page.keyboard.press('End');

  const text = ' tiếng Việt';
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.imeSetComposition', {
    text,
    selectionStart: text.length,
    selectionEnd: text.length,
  });
  await cdp.send('Input.insertText', { text });

  await expect.poll(() => requestMarkdown(page)).toContain('Bắt đầu: tiếng Việt');
  await expect.poll(() => page.evaluate(() => (
    window as Window & { __compositionEvents?: string[] }
  ).__compositionEvents)).toEqual([
    'compositionstart',
    'compositionupdate',
    'compositionupdate',
    'compositionend',
  ]);
});

async function selectTextInElement(element: Locator, selectedText: string): Promise<void> {
  await element.evaluate((container, text) => {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const value = node.textContent ?? '';
      const start = value.indexOf(text);
      if (start >= 0) {
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, start + text.length);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        (container as HTMLElement).focus();
        document.dispatchEvent(new Event('selectionchange'));
        return;
      }
      node = walker.nextNode();
    }
    throw new Error(`Text was not rendered for selection: ${text}`);
  }, selectedText);
}

async function loadMarkdown(page: Page, markdown: string): Promise<void> {
  await page.evaluate((source) => window.markdownEditor?.loadMarkdown(source), markdown);
  await expect.poll(() => requestMarkdown(page)).toContain(markdown);
}

let requestSequence = 0;

async function requestMarkdown(page: Page): Promise<string | null> {
  const requestId = `browser-${requestSequence += 1}`;
  await page.evaluate((id) => window.markdownEditor?.requestMarkdown(id), requestId);
  return page.evaluate((id) => {
    const messages = (window as Window & { __bridgeMessages?: HostMessage[] }).__bridgeMessages ?? [];
    const message = messages.find((candidate) => (
      candidate.type === 'document.markdown' && candidate.requestId === id
    ));
    return typeof message?.payload.markdown === 'string' ? message.payload.markdown : null;
  }, requestId);
}

async function surfaceVisibility(page: Page): Promise<{
  visualDisplay: string;
  visualHeightPositive: boolean;
  sourceDisplay: string;
  sourceHeightPositive: boolean;
}> {
  return page.evaluate(() => {
    const visual = document.querySelector<HTMLElement>('#editor.mu-editor');
    const source = document.querySelector<HTMLElement>('#source-editor');
    if (!visual || !source) throw new Error('Editor surfaces were not mounted');
    return {
      visualDisplay: getComputedStyle(visual).display,
      visualHeightPositive: visual.getBoundingClientRect().height > 0,
      sourceDisplay: getComputedStyle(source).display,
      sourceHeightPositive: source.getBoundingClientRect().height > 0,
    };
  });
}

function artifactPath(filename: string): string {
  return resolve(process.cwd(), '../../output/playwright/editor-regression', filename);
}
