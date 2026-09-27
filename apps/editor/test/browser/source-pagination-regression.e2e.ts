import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { EditorView } from '@codemirror/view';

// Optional read-only local report; CI still exercises the same long, Unicode source shape.
const report = process.env.SOURCE_PAGINATION_REPORT
  ? readFileSync(process.env.SOURCE_PAGINATION_REPORT, 'utf8')
  : Array.from({ length: 360 }, (_, index) => (
    `## Mục ${index + 1}\n\nNội dung tiếng Việt: đạo hàm ∂f/∂x, nghiệm x₀.\n`
  )).join('\n');

async function sampleFrames(page: Page, count = 45) {
  return page.evaluate(async (frameCount) => {
    const source = document.querySelector<HTMLElement>('#source-editor');
    const stage = document.querySelector<HTMLElement>('.editor-stage');
    const editor = document.querySelector<HTMLElement>('#source-editor .cm-content');
    if (!source || !stage || !editor) throw new Error('Missing Source editor');
    const view = (editor as HTMLElement & { cmTile: { root: { view: EditorView } } }).cmTile.root.view;
    const samples = [];
    for (let frame = 0; frame < frameCount; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const style = getComputedStyle(source);
      const rect = source.getBoundingClientRect();
      const scale = rect.width / source.offsetWidth;
      const pageHeight = Number.parseFloat(style.getPropertyValue('--visual-page-height'));
      const pageGap = Number.parseFloat(style.getPropertyValue('--visual-page-gap'));
      const slot = pageHeight + pageGap;
      samples.push({
        pageHeight,
        layoutWidth: source.offsetWidth,
        stackHeight: Number.parseFloat(style.getPropertyValue('--source-page-stack-height')),
        scrollHeight: stage.scrollHeight,
        scrollTop: stage.scrollTop,
        contentHeight: view.contentHeight / view.scaleY,
        selection: { anchor: view.state.selection.main.anchor, head: view.state.selection.main.head },
        gapHeights: [...source.querySelectorAll<HTMLElement>('.source-page-gap')]
          .map((gap) => Number.parseFloat(gap.style.height)),
        crossingRows: [...source.querySelectorAll<HTMLElement>(
          '.cm-line, .cm-lineNumbers .cm-gutterElement',
        )].filter((row) => {
          if (!row.textContent?.trim()) return false;
          const rowRect = row.getBoundingClientRect();
          const top = (rowRect.top - rect.top) / scale;
          const offset = ((top % slot) + slot) % slot;
          return offset > pageHeight + 1 || offset + rowRect.height / scale > pageHeight + 1;
        }).length,
      });
    }
    return samples;
  }, count);
}

test('keeps long Source A4 pagination stable over frames at 50% zoom', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page).toHaveTitle('Markdown Report Editor');
  await expect(page.locator('#editor.mu-editor')).toBeVisible();
  await page.evaluate(() => window.markdownEditor?.setMode('source'));
  await page.locator('#source-editor .cm-content').focus();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(report);
  await expect(page.locator('.source-page-gap').first()).toBeAttached();
  await page.evaluate(() => window.markdownEditor?.setZoom(0.5, 0, false));
  const samples = await sampleFrames(page);
  await testInfo.attach('initial-frame-geometry', {
    body: JSON.stringify(samples, null, 2), contentType: 'application/json',
  });
  await page.screenshot({ path: testInfo.outputPath('source-50-percent.png') });
  expect(samples.every((sample) => (
    Math.abs(sample.pageHeight - sample.layoutWidth * 297 / 210) < 0.1
  )), 'page geometry must use layout pixels, not scaled screen pixels').toBe(true);
  expect(new Set(samples.map((sample) => sample.stackHeight)).size).toBe(1);
  expect(new Set(samples.map((sample) => sample.scrollHeight)).size).toBe(1);
  expect(samples.every((sample) => sample.crossingRows === 0)).toBe(true);
  expect(errors).toEqual([]);
});

test('preserves Source text, caret and scroll after boundary typing and zoom changes', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const source = Array.from({ length: 260 }, (_, i) => (
    `## Mục ${i + 1}\n\nĐoạn văn tiếng Việt ${i + 1}.\n\n- Mục danh sách\n\n\`\`\`text\ncode ${i}\n\`\`\`\n\n`
  )).join('');
  await page.goto('/');
  await expect(page.locator('#editor.mu-editor')).toBeVisible();
  await page.evaluate(() => window.markdownEditor?.setMode('source'));
  const content = page.locator('#source-editor .cm-content');
  // Enter source directly so this test isolates Source pagination, not Muya's
  // serialization of trailing blank lines during a Visual → Source transition.
  await content.focus();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(source);
  const target = source.indexOf('Đoạn văn tiếng Việt 130.');
  await page.evaluate(from => window.markdownEditor?.revealLocation({
    from, to: from, startLine: 1, startColumn: 1, endLine: 1, endColumn: 1,
  }), target);
  await expect(content).toBeFocused();
  const inserted = 'Gõ qua ranh giới trang.\n'.repeat(8);
  await page.keyboard.insertText(inserted);
  const expected = source.slice(0, target) + inserted + source.slice(target);
  const expectedCaret = target + inserted.length;

  for (const zoom of [0.5, 1, 1.25]) {
    await page.evaluate(value => window.markdownEditor?.setZoom(value), zoom);
    const samples = await sampleFrames(page, 35);
    await testInfo.attach(`typing-zoom-${zoom}`, {
      body: JSON.stringify(samples), contentType: 'application/json',
    });
    if (samples.slice(8).some(sample => sample.crossingRows > 0)) {
      const geometry = await page.locator('#source-editor').evaluate(source => {
        const rect = source.getBoundingClientRect();
        const scale = rect.width / (source as HTMLElement).offsetWidth;
        const style = getComputedStyle(source);
        const pageHeight = Number.parseFloat(style.getPropertyValue('--visual-page-height'));
        const slot = pageHeight + Number.parseFloat(style.getPropertyValue('--visual-page-gap'));
        const content = source.querySelector<HTMLElement>('.cm-content')!;
        const view = (content as HTMLElement & { cmTile: { root: { view: EditorView } } }).cmTile.root.view;
        return [...source.querySelectorAll('.cm-line, .cm-lineNumbers .cm-gutterElement')]
          .map(row => {
            const r = row.getBoundingClientRect();
            const top = (r.top - rect.top) / scale;
            return { text: row.textContent?.slice(0,80), className: row.className, top, height: r.height / scale, offset: top % slot };
          }).filter(row => row.text?.trim() && (row.offset > pageHeight + 1 || row.offset + row.height > pageHeight + 1))
          .map(row => {
            const number = Number(row.text);
            if (!Number.isInteger(number) || number < 1 || number > view.state.doc.lines) return row;
            const line = view.state.doc.line(number);
            const point = view.domAtPos(line.from);
            const lineDOM = (point.node.nodeType === Node.ELEMENT_NODE
              ? point.node as Element : point.node.parentElement)?.closest('.cm-line');
            const lineRect = lineDOM?.getBoundingClientRect();
            const block = view.lineBlockAt(line.from);
            return {
              ...row, lineText: line.text, viewScale: view.scaleY, defaultLineHeight: view.defaultLineHeight,
              actualLineTop: lineRect ? (lineRect.top - rect.top) / scale : null,
              modelLineTop: (view.documentTop + block.top - rect.top) / scale,
              contentPadding: getComputedStyle(content).paddingTop,
            };
          });
      });
      await testInfo.attach(`crossing-rows-${zoom}`, {
        body: JSON.stringify(geometry), contentType: 'application/json',
      });
      await page.screenshot({ path: testInfo.outputPath(`crossing-${zoom}.png`) });
    }
    const settled = samples.slice(8);
    expect(settled.every(sample => sample.selection.anchor === expectedCaret
      && sample.selection.head === expectedCaret)).toBe(true);
    expect(new Set(settled.map(sample => sample.stackHeight)).size).toBe(1);
    expect(Math.max(...settled.map(sample => sample.scrollTop))
      - Math.min(...settled.map(sample => sample.scrollTop))).toBeLessThanOrEqual(1);
    expect(settled.every(sample => sample.crossingRows === 0)).toBe(true);
  }

  // Scroll independently of the caret: the page-height map must not oscillate
  // as CodeMirror materializes a different set of source lines.
  for (const fraction of [0.1, 0.85, 0.4]) {
    await page.evaluate(value => {
      const stage = document.querySelector<HTMLElement>('.editor-stage');
      if (stage) stage.scrollTop = (stage.scrollHeight - stage.clientHeight) * value;
    }, fraction);
    const samples = (await sampleFrames(page, 30)).slice(8);
    expect(new Set(samples.map(sample => sample.scrollHeight)).size).toBe(1);
    expect(Math.max(...samples.map(sample => sample.scrollTop))
      - Math.min(...samples.map(sample => sample.scrollTop))).toBeLessThanOrEqual(1);
    expect(samples.every(sample => sample.crossingRows === 0)).toBe(true);
    expect(samples.every(sample => sample.selection.head === expectedCaret)).toBe(true);
  }
  const actual = await content.evaluate(element => (
    element as HTMLElement & { cmTile: { root: { view: EditorView } } }
  ).cmTile.root.view.state.doc.toString());
  expect(actual).toBe(expected);
  expect(errors).toEqual([]);
});
