import { expect, test } from '@playwright/test';

test('heading stays with its table at a page boundary without cumulative reflow', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#editor.mu-editor')).toBeVisible();
  const source = `${Array.from({length: 11}, (_, i) => `Đoạn văn ${i+1}: Nội dung trước bảng.`).join('\n\n')}\n\n## Nhân sự và vai trò\n\n| Thành viên | Vai trò | Trách nhiệm |\n| --- | --- | --- |\n${Array.from({length: 6}, (_, i) => `| Người ${i+1} | Kỹ sư | Phát triển, kiểm tra nội dung tiếng Việt, phối hợp triển khai và nghiệm thu sản phẩm. |`).join('\n')}\n`;
  await page.evaluate(s => window.markdownEditor?.loadMarkdown(s), source);
  const heading = page.locator('#editor .mu-atx-heading').last();
  const table = page.locator('#editor table').last();
  await expect(heading).toBeAttached();
  await expect(table).toBeAttached();
  const geometry = () => page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('#editor')!;
    const heading = [...editor.querySelectorAll<HTMLElement>('.mu-atx-heading')].at(-1)!;
    const table = [...editor.querySelectorAll<HTMLElement>('table')].at(-1)!;
    const css = getComputedStyle(editor);
    const scale = editor.getBoundingClientRect().width / editor.offsetWidth;
    const top = editor.getBoundingClientRect().top;
    const slot = parseFloat(css.getPropertyValue('--visual-page-height')) + parseFloat(css.getPropertyValue('--visual-page-gap'));
    const h = (heading.getBoundingClientRect().top - top) / scale;
    const t = (table.getBoundingClientRect().top - top) / scale;
    return { headingPage: Math.floor((h+2)/slot), tablePage: Math.floor((t+2)/slot), gap: t-h };
  });
  await expect.poll(async () => { const g = await geometry(); return g.headingPage === g.tablePage; }).toBe(true);
  const initial = await geometry();
  for (const zoom of [0.5, 1, 1.25, 1]) {
    await page.evaluate(z => window.markdownEditor?.setZoom(z), zoom);
    await expect.poll(async () => { const g = await geometry(); return g.headingPage === g.tablePage; }).toBe(true);
  }
  expect((await geometry()).gap).toBeCloseTo(initial.gap, 0);
});
