import { expect, test } from '@playwright/test';

const students = [
  'Nguyễn Thị Ánh Nguyệt', 'Trần Hoàng Minh Quân', 'Lê Phạm Thùy Dương',
  'Phạm Nguyễn Bảo Châu', 'Huỳnh Võ Quốc Khánh', 'Võ Đặng Thiên Phúc',
  'Đặng Trần Như Quỳnh', 'Bùi Nguyễn Đức Thịnh', 'Đỗ Lê Khánh Linh',
  'Dương Hoàng Tuấn Kiệt',
].map((name, index) => ({ name, id: `22100${String(index + 1).padStart(2, '0')}` }));

test('Properties updates legacy cover to ten students; Visual and TeX retain every member', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.addInitScript(() => {
    Object.assign(window, {
      __coverMessages: [],
      webkit: { messageHandlers: { bridge: { postMessage(message: unknown) {
        (window as unknown as { __coverMessages: unknown[] }).__coverMessages.push(message);
      } } } },
    });
  });
  await page.goto('/');
  await expect(page).toHaveTitle('Markdown Report Editor');
  await expect(page.locator('#editor.mu-editor')).toBeVisible();
  const cover = {
    title: 'NGHIÊN CỨU THIẾT KẾ VÀ TRIỂN KHAI HỆ THỐNG SOẠN THẢO BÁO CÁO HỌC THUẬT TIẾNG VIỆT VỚI KHẢ NĂNG BẢO TOÀN DỮ LIỆU',
    faculty: 'KHOA KHOA HỌC VÀ KỸ THUẬT MÁY TÍNH',
    supervisor: 'PGS. TS. Nguyễn Hoàng Minh Đức và TS. Trần Thị Thanh Hương hướng dẫn nghiên cứu ứng dụng',
    secretary: 'ThS. Nguyễn Phạm Hoàng Anh',
    major: 'Khoa học máy tính và kỹ thuật phần mềm phục vụ nghiên cứu học thuật',
    council: 'Hội đồng đánh giá đồ án liên ngành',
    locationDate: 'TP. HỒ CHÍ MINH, THÁNG 09 NĂM 2026',
    students: students.slice(0, 3),
  };
  const source = `---\n/${JSON.stringify({ lmx: { cover }, unknown: { keep: '001' } })}\n---\n\n:::cover\n:::\n\n# Nội dung\n`;
  await page.evaluate(markdown => window.markdownEditor?.loadMarkdown(markdown), source);
  await page.evaluate(members => window.markdownEditor?.updateMetadata({
    lmx: { cover: { students: members } },
  }, 'cover-update'), students);
  const messages = () => page.evaluate(() => (
    window as unknown as { __coverMessages: Array<{ type: string; requestId: string; payload: Record<string, unknown> }> }
  ).__coverMessages);
  await expect.poll(async () => (await messages()).find(m => m.requestId === 'cover-update')?.payload.updated).toBe(true);
  const preview = page.locator('.mu-lmx-cover-preview');
  for (const student of students) await expect(preview).toContainText(`${student.name} (${student.id})`);
  await expect(preview.locator('.hcmut-cover-students .hcmut-cover-detail')).toHaveCount(10);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => preview.locator('img').evaluate(logo => (logo as HTMLImageElement).complete)).toBe(true);

  for (const zoom of [1, 0.75, 1.5]) {
    await page.evaluate(value => window.markdownEditor?.setZoom(value), zoom);
    await expect.poll(() => preview.evaluate(element => {
      const border = element.querySelector('.hcmut-cover-border')!.getBoundingClientRect();
      const nodes = [...element.querySelectorAll<HTMLElement>('.hcmut-cover-content > *, .hcmut-cover-detail span')];
      return nodes.every(node => {
        const box = node.getBoundingClientRect();
        return box.left >= border.left + 5 && box.right <= border.right - 5
          && box.top >= border.top + 5 && box.bottom <= border.bottom - 5;
      });
    })).toBe(true);
  }
  await page.evaluate(() => window.markdownEditor?.setZoom(1));
  await preview.screenshot({ path: testInfo.outputPath('cover-ten-students.png') });
  // Reload via the real Markdown serialization/parse path, not transient DOM.
  await page.evaluate(() => window.markdownEditor?.requestMarkdown('cover-source'));
  const saved = (await messages()).find(m => m.requestId === 'cover-source')?.payload.markdown;
  expect(typeof saved).toBe('string');
  await page.evaluate(markdown => window.markdownEditor?.loadMarkdown(String(markdown)), saved);
  await page.evaluate(() => {
    window.markdownEditor?.requestMetadata('cover-metadata');
    window.markdownEditor?.requestLatex('cover-tex');
  });
  const metadata = (await messages()).find(m => m.requestId === 'cover-metadata')?.payload;
  expect(metadata).toMatchObject({ valid: true, data: { lmx: { cover: { students } }, unknown: { keep: '001' } } });
  const latex = (await messages()).find(m => m.requestId === 'cover-tex')?.payload.latex;
  for (const student of students) expect(latex).toContain(`${student.name} (${student.id})`);
  await preview.click();
  await expect.poll(async () => (await messages()).some(m => m.type === 'editor.lmxBlockSelected')).toBe(true);
  expect(errors).toEqual([]);
});

test('short three-student cover retains the golden landmarks', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#editor.mu-editor')).toBeVisible();
  await page.evaluate(markdown => window.markdownEditor?.loadMarkdown(markdown),
    `---\n${JSON.stringify({ lmx: { cover: { students: students.slice(0, 3) } } })}\n---\n:::cover\n:::\n`);
  const preview = page.locator('.mu-lmx-cover-preview');
  await expect(preview.locator('.hcmut-cover-compact')).toHaveCount(0);
  const landmarks = await preview.evaluate(element => {
    const top = element.getBoundingClientRect().top;
    return ['.hcmut-cover-university', '.hcmut-cover-title', '.hcmut-cover-details', '.hcmut-cover-location']
      .map(selector => element.querySelector(selector)!.getBoundingClientRect().top - top);
  });
  for (const [index, value] of [157, 500, 574, 1039].entries()) expect(landmarks[index]).toBeCloseTo(value, 0);
});
