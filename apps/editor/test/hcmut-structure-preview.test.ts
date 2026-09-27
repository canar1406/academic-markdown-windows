// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { updateFrontMatter } from '@markdown/document-core';
import type { ThemeSceneNode } from '@markdown/theme-engine';
import { projectThemeSceneToMarkdown } from '../src/studio-preview';
import {
  createHcmutStructurePreviewRenderer,
  readVisualPageDecorationSettings,
  refreshHcmutStructurePreviews,
} from '../src/hcmut-structure-preview.js';

describe('HCMUT structure preview renderer', () => {
  it('renders authored cover literals/styles, suppresses inherited decorations, and rejects invalid snapshots', () => {
    const cover: ThemeSceneNode = {
      id: 'cover', widget: 'cover', version: 1,
      properties: { title: 'Bìa riêng <img src=x>', university: 'Đại học của tôi', supervisor: 'Nguyễn Ánh' },
      style: { fontSizePt: 14, color: '#8A2145', fontStyle: 'italic' }, children: [],
    };
    const scene = {
      schemaVersion: 2, page: { size: 'A4', widthMm: 210, heightMm: 297 },
      tokens: {}, variants: {}, bindings: [],
      root: { id: 'page', widget: 'page', version: 1, properties: {}, style: {}, children: [cover] },
    };
    let markdown = projectThemeSceneToMarkdown(scene).markdown;
    const container = document.createElement('div');
    const renderer = createHcmutStructurePreviewRenderer(() => markdown);
    renderer({ name: 'cover', title: 'Cover', container });
    expect(container.textContent).toContain('Bìa riêng <img src=x>');
    expect(container.textContent).toContain('Đại học của tôi');
    expect(container.textContent).toContain('Nguyễn Ánh');
    expect(container.textContent).not.toMatch(/BÁCH KHOA|BÁO CÁO|SVTH|GVHD|TP\. HỒ CHÍ MINH/);
    expect(container.querySelector('img, .hcmut-cover-border, .hcmut-cover-content')).toBeNull();
    const content = container.querySelector<HTMLElement>('.authored-cover-content');
    expect(content?.style.fontSize).toBe('14pt');
    expect(content?.style.fontStyle).toBe('italic');
    expect(content?.style.textAlign).toBe('center');
    expect(readVisualPageDecorationSettings(markdown)).toMatchObject({
      cover: { logoEnabled: false, borderEnabled: false },
      header: { enabled: false, institution: '', faculty: '', logoEnabled: false },
      footer: { enabled: false, left: '', pageNumber: 'none' },
    });

    cover.properties.title = 'Tiêu đề đã sửa';
    markdown = projectThemeSceneToMarkdown(scene).markdown;
    container.replaceChildren();
    renderer({ name: 'cover', title: 'Cover', container });
    expect(container.textContent).toContain('Tiêu đề đã sửa');
    expect(container.textContent).not.toContain('Bìa riêng');

    markdown = updateFrontMatter(':::cover\n:::\n', { lmx: { authoredTheme: { schemaVersion: 9 } } }).source;
    container.replaceChildren();
    renderer({ name: 'cover', title: 'Cover', container });
    expect(container.dataset.structureEnabled).toBe('false');
    expect(container.textContent).toContain('Invalid authored theme');
    expect(container.querySelector('.hcmut-cover-content')).toBeNull();
    expect(readVisualPageDecorationSettings(markdown).header.enabled).toBe(false);
  });
  it('renders all ten students in a compact cover without rewriting Markdown', () => {
    const students = Array.from({ length: 10 }, (_, index) => ({
      name: `Nguyễn Thị Ánh ${index + 1}`, id: `00${index + 1}`,
    }));
    const markdown = `---\n/${JSON.stringify({ lmx: { cover: { students } } })}\n---\n:::cover\n:::\n`;
    const container = document.createElement('div');
    createHcmutStructurePreviewRenderer(() => markdown)({ name: 'cover', title: 'Trang bìa', container });
    for (const student of students) expect(container.textContent).toContain(`${student.name} (${student.id})`);
    expect(container.textContent).toContain('SVTH10');
    expect(container.querySelector('.hcmut-cover-content')?.classList.contains('hcmut-cover-compact')).toBe(true);
  });

  it('renders cover metadata as a page preview owned by the editor app', () => {
    const container = document.createElement('div');
    const renderer = createHcmutStructurePreviewRenderer(() => [
      '---',
      'lmx:',
      '  schema: 1',
      '  theme: hcmut-report-v1',
      '  cover:',
      '    university: "ĐẠI HỌC QUỐC GIA THÀNH PHỐ HỒ CHÍ MINH"',
      '    title: "HỆ THỐNG SOẠN THẢO HỌC THUẬT"',
      '    students:',
      '      - name: "Nguyễn Văn A"',
      '        id: "2212345"',
      '---',
      '',
      ':::cover',
      ':::',
    ].join('\n'));

    renderer({ name: 'cover', title: 'Trang bìa', container });

    expect(container.classList.contains('visual-page-preview')).toBe(true);
    expect(container.textContent).toContain('ĐẠI HỌC QUỐC GIA THÀNH PHỐ HỒ CHÍ MINH');
    expect(container.textContent).toContain('BÁO CÁO');
    expect(container.textContent).toContain('HỆ THỐNG SOẠN THẢO HỌC THUẬT');
    expect(container.textContent).toContain('Nguyễn Văn A');
    expect(container.querySelector('.hcmut-cover-border')).not.toBeNull();
  });

  it('reads detailed cover, header, and footer appearance settings from front matter', () => {
    const settings = readVisualPageDecorationSettings(`---
lmx:
  cover:
    heading: BÁO CÁO THÍ NGHIỆM
    logoEnabled: false
    logoWidthCm: 3.5
    borderEnabled: false
    outerBorderWidthPt: 3
    innerBorderWidthPt: 1
  header:
    logoEnabled: false
    logoSizeMm: 8
    fontSizePt: 8.5
    bold: false
    ruleEnabled: false
    ruleWidthPt: 0.6
  footer:
    fontSizePt: 9
    ruleEnabled: false
    ruleWidthPt: 0.5
---
`);

    expect(settings.cover).toEqual({
      heading: 'BÁO CÁO THÍ NGHIỆM', logoEnabled: false, logoWidthCm: 3.5,
      borderEnabled: false, outerBorderWidthPt: 3, innerBorderWidthPt: 1,
    });
    expect(settings.header).toMatchObject({
      logoEnabled: false, logoSizeMm: 8, fontSizePt: 8.5, bold: false,
      ruleEnabled: false, ruleWidthPt: 0.6,
    });
    expect(settings.footer).toMatchObject({ fontSizePt: 9, ruleEnabled: false, ruleWidthPt: 0.5 });
  });

  it('keeps legacy top-level sections when lmx only overrides header metadata', () => {
    const markdown = `---
cover:
  title: LEGACY COVER
  heading: LEGACY HEADING
  logoEnabled: false
structure:
  cover: true
footer:
  left: LEGACY FOOTER
lmx:
  header:
    enabled: false
---

:::cover
:::
`;
    const settings = readVisualPageDecorationSettings(markdown);
    const container = document.createElement('div');

    createHcmutStructurePreviewRenderer(() => markdown)({
      name: 'cover', title: 'Trang bìa', container,
    });

    expect(settings.structure.cover).toBe(true);
    expect(settings.header.enabled).toBe(false);
    expect(settings.footer.left).toBe('LEGACY FOOTER');
    expect(settings.cover.heading).toBe('LEGACY HEADING');
    expect(container.textContent).toContain('LEGACY COVER');
    expect(container.querySelector('.hcmut-cover-logo')).toBeNull();
  });

  it('falls back from a header logo size that cannot fit the fixed TeX headheight', () => {
    const settings = readVisualPageDecorationSettings(`---
lmx:
  header:
    logoSizeMm: 15
---
`);

    expect(settings.header.logoSizeMm).toBe(10);
  });

  it('applies cover appearance settings without leaving hidden logo or border elements', () => {
    const container = document.createElement('div');
    const renderer = createHcmutStructurePreviewRenderer(() => `---
lmx:
  cover:
    title: THÍ NGHIỆM
    heading: BÁO CÁO TÙY CHỈNH
    logoEnabled: false
    borderEnabled: false
---

:::cover
:::
`);

    renderer({ name: 'cover', title: 'Trang bìa', container });

    expect(container.textContent).toContain('BÁO CÁO TÙY CHỈNH');
    expect(container.querySelector('.hcmut-cover-logo')).toBeNull();
    expect(container.querySelector('.hcmut-cover-border')).toBeNull();
  });

  it('renders TOC headings only through the depth configured in Properties', () => {
    const container = document.createElement('div');
    const renderer = createHcmutStructurePreviewRenderer(() => [
      '---',
      'lmx:',
      '  structure:',
      '    toc: true',
      '    tocDepth: 2',
      '---',
      '',
      '# Chương một',
      '## Mục cấp hai',
      '### Mục cấp ba',
      '',
      ':::toc',
      ':::',
    ].join('\n'));

    renderer({ name: 'toc', title: 'Mục lục', container });

    expect(container.textContent).toContain('Chương một');
    expect(container.textContent).toContain('Mục cấp hai');
    expect(container.textContent).not.toContain('Mục cấp ba');
  });

  it('renders the HCMUT TOC hierarchy with LaTeX numbering instead of placeholders', () => {
    const container = document.createElement('div');
    const renderer = createHcmutStructurePreviewRenderer(() => [
      '# Tóm tắt',
      '# Cơ sở lý thuyết',
      '## Đạo hàm theo hướng',
      '### Công thức',
      '#### Trường hợp đặc biệt',
      '##### Heading vượt mức hỗ trợ',
      '# Kết luận',
      '',
      ':::toc',
      ':::',
    ].join('\n'));

    renderer({ name: 'toc', title: 'Mục lục', container });

    expect(container.querySelector('.hcmut-generated-title')?.textContent).toBe('Mục lục');
    expect([...container.querySelectorAll('.hcmut-generated-row')].map((row) => ({
      level: row.getAttribute('data-toc-level'),
      number: row.querySelector('.hcmut-generated-number')?.textContent,
      label: row.querySelector('.hcmut-generated-label')?.textContent,
      page: row.querySelector('.hcmut-generated-page')?.textContent,
    }))).toEqual([
      { level: '1', number: '1', label: 'Tóm tắt', page: '' },
      { level: '1', number: '2', label: 'Cơ sở lý thuyết', page: '' },
      { level: '2', number: '2.1', label: 'Đạo hàm theo hướng', page: '' },
      { level: '3', number: '2.1.1', label: 'Công thức', page: '' },
      { level: '4', number: '2.1.1.a', label: 'Trường hợp đặc biệt', page: '' },
      { level: '4', number: '2.1.1.b', label: 'Heading vượt mức hỗ trợ', page: '' },
      { level: '1', number: '3', label: 'Kết luận', page: '' },
    ]);
  });

  it('does not treat headings inside fenced code as TOC entries', () => {
    const container = document.createElement('div');
    const renderer = createHcmutStructurePreviewRenderer(() => [
      '# Chương thật',
      '',
      '```markdown',
      '# Không phải heading',
      '```',
      '',
      '~~~text',
      '## Cũng không phải heading',
      '~~~',
      '',
      ':::toc',
      ':::',
    ].join('\n'));

    renderer({ name: 'toc', title: 'Mục lục', container });

    expect(container.textContent).toContain('Chương thật');
    expect(container.textContent).not.toContain('Không phải heading');
    expect(container.textContent).not.toContain('Cũng không phải heading');
  });

  it('keeps a disabled structure marker compact instead of reserving an A4 page', () => {
    const container = document.createElement('div');
    const renderer = createHcmutStructurePreviewRenderer(() => [
      '---',
      'lmx:',
      '  structure:',
      '    toc: false',
      '---',
      '',
      ':::toc',
      ':::',
    ].join('\n'));

    renderer({ name: 'toc', title: 'Mục lục', container });

    expect(container.dataset.structureEnabled).toBe('false');
    expect(container.classList.contains('visual-page-preview')).toBe(false);
    expect(container.textContent).toContain('Mục lục đang tắt trong Properties');
  });

  it('renders figure and table captions in their generated-list page previews', () => {
    const markdown = [
      ':::figure {#fig-a caption="Kiến trúc hệ thống"}',
      '![Kiến trúc](assets/system.png)',
      ':::',
      '',
      ':::table {#tbl-a caption="Kết quả đánh giá"}',
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |',
      ':::',
      '',
    ].join('\n');
    const renderer = createHcmutStructurePreviewRenderer(() => markdown);
    const figures = document.createElement('div');
    const tables = document.createElement('div');

    renderer({ name: 'list-of-figures', title: 'Danh sách hình', container: figures });
    renderer({ name: 'list-of-tables', title: 'Danh sách bảng', container: tables });

    expect(figures.textContent).toContain('Kiến trúc hệ thống');
    expect(tables.textContent).toContain('Kết quả đánh giá');
  });

  it('refreshes generated lists when a new figure or table is added', () => {
    let markdown = [
      ':::figure {#fig-a caption="Hình đầu tiên"}',
      ':::',
      ':::table {#tbl-a caption="Bảng đầu tiên"}',
      ':::',
    ].join('\n');
    const editor = document.createElement('div');
    const figureList = document.createElement('section');
    figureList.dataset.lmxName = 'list-of-figures';
    const figurePreview = document.createElement('div');
    figurePreview.className = 'mu-lmx-structure-preview';
    figureList.append(figurePreview);
    editor.append(figureList);
    const renderer = createHcmutStructurePreviewRenderer(() => markdown);
    renderer({ name: 'list-of-figures', title: 'Danh sách hình', container: figurePreview });

    markdown += '\n:::figure {#fig-b caption="Hình thứ hai"}\n:::\n';
    refreshHcmutStructurePreviews(editor, () => markdown);

    expect(figurePreview.querySelectorAll('.hcmut-generated-row')).toHaveLength(2);
    expect(figurePreview.textContent).toContain('Hình thứ hai');
  });
});
