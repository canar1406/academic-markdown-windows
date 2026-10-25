import { describe, expect, it } from 'vitest';
import { hcmutReportTheme } from '@markdown/theme-hcmut-report-v1';
import type { LatexTheme } from '@markdown/theme-engine';
import { escapeLatexText, exportMarkdownToLatex } from '../src/index.js';

describe('LaTeX exporter', () => {
  it('exports transparent Quick Edit wrappers with safe per-instance style', () => {
    const result = exportMarkdownToLatex([
      ':::style {component="paragraph" color="#1E4B8F" fontSizePt=12 align="center"}',
      'Nội dung.',
      ':::',
      '',
    ].join('\n'), hcmutReportTheme);

    expect(result.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
    expect(result.latex).toContain('\\color[HTML]{1E4B8F}');
    expect(result.latex).toContain('\\fontsize{12}{14.4}\\selectfont');
    expect(result.latex).toContain('\\begin{center}');
    expect(result.latex).toContain('Nội dung.');
  });

  it('accepts Muya HTML image serialization inside figure directives', () => {
    const result = exportMarkdownToLatex([
      ':::figure {#fig-muya caption="Muya image"}',
      '<img title="" src="lammerkas-report-assets/pert.png" alt="PERT..." data-align="center">',
      ':::',
      '',
    ].join('\n'), hcmutReportTheme);

    expect(result.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
    expect(result.assetPaths).toEqual(['lammerkas-report-assets/pert.png']);
    expect(result.latex).toContain(
      '\\includegraphics[width=0.8\\textwidth]{\\detokenize{lammerkas-report-assets/pert.png}}',
    );
  });

  it('decodes HTML image entities once and escapes Unicode alt text as a caption', () => {
    const result = exportMarkdownToLatex([
      ':::figure',
      '<IMG title="" SRC = \'assets/right_&amp;.png\' alt="Sơ đồ &copy; &gt; &quot;PERT&quot; &#x2B; &#37; &amp;amp;" data-align="center" />',
      ':::',
    ].join('\n'), hcmutReportTheme);

    expect(result.diagnostics).toEqual([]);
    expect(result.assetPaths).toEqual(['assets/right_&.png']);
    expect(result.latex).toContain('\\caption{Sơ đồ © > "PERT" + \\% \\&amp;}');
  });

  it.each([
    '../outside.png',
    '&#46;&#x2e;/outside.png',
    '/absolute.png',
    'https://example.com/a.png',
    'assets/a&#37;comment.png',
    'assets/a&bsol;input.png',
  ])('applies normal figure path safeguards to Muya HTML images: %s', (path) => {
    const result = exportMarkdownToLatex(
      `:::figure\n<img src="${path}" alt="Unsafe">\n:::\n`,
      hcmutReportTheme,
    );

    expect(result.latex).toBe('');
    expect(result.assetPaths).toEqual([]);
    expect(result.diagnostics.filter((item) => item.code === 'latex.unsafe-asset-path')).toHaveLength(1);
  });

  it.each([
    '<img data-src="assets/a.png">',
    '<img src="assets/a.png" data-src="assets/b.png">',
    '<img src="assets/a.png" onerror="alert(1)">',
    '<img src="assets/a.png" SRC="assets/b.png">',
    '<img src="assets/a.png"alt="missing separator">',
    '<img src="assets/a.png" alt="unterminated>',
    '<img src="assets/a.png"><img src="assets/b.png">',
    '<img src="assets/a.png"> trailing text',
  ])('rejects ambiguous or unsupported figure HTML: %s', (image) => {
    const result = exportMarkdownToLatex(`:::figure\n${image}\n:::`, hcmutReportTheme);
    expect(result.latex).toBe('');
    expect(result.assetPaths).toEqual([]);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'lmx.invalid-figure', severity: 'error',
    }));
  });

  it('parses Markdown figure escapes, entities, balanced paths and optional titles', () => {
    const result = exportMarkdownToLatex(
      ':::figure\n![Sơ đồ \\[PERT\\] &amp; 50%](assets/pert(1).png "Image title")\n:::',
      hcmutReportTheme,
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.assetPaths).toEqual(['assets/pert(1).png']);
    expect(result.latex).toContain('\\caption{Sơ đồ [PERT] \\& 50\\%}');
  });

  it('preserves per-instance theme aliases without an unsupported-directive error', () => {
    const result = exportMarkdownToLatex([
      ':::style {component="theorem" theme="modern"}',
      'Nội dung.',
      ':::',
      '',
    ].join('\n'), hcmutReportTheme);

    expect(result.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
    expect(result.latex).toContain('Nội dung.');
  });

  it('maps safe Quick Style Pro body typography, paint, box spacing, and alignment to TeX', () => {
    const result = exportMarkdownToLatex([
      ':::style {color="#1E4B8F" background="#F4F7FC" fontFamily="sans-serif" fontSizePt=12 fontWeight="700" fontStyle="italic" lineHeight=1.5 align="right" borderColor="#244A73" borderWidthPt=1.5 paddingMm=3 marginMm=6}',
      'Nội dung.',
      ':::',
      '',
    ].join('\n'), hcmutReportTheme);

    expect(result.diagnostics).toEqual([]);
    expect(result.latex).toContain('\\color[HTML]{1E4B8F}');
    expect(result.latex).toContain('\\sffamily');
    expect(result.latex).toContain('\\bfseries');
    expect(result.latex).toContain('\\itshape');
    expect(result.latex).toContain('\\fontsize{12}{18}\\selectfont');
    expect(result.latex).toContain('\\begin{flushright}');
    expect(result.latex).toContain('\\setlength{\\fboxrule}{1.5pt}');
    expect(result.latex).toContain('\\setlength{\\fboxsep}{3mm}');
    expect(result.latex).toContain('\\fcolorbox[HTML]{244A73}[HTML]{F4F7FC}');
    expect(result.latex).toContain('\\vspace{6mm}');
    expect(result.latex).toContain('\\hspace{6mm}');
  });

  it('applies body and title typography directly to semantic theorem directives', () => {
    const result = exportMarkdownToLatex([
      ':::theorem {title="Mẫu" color="#1E4B8F" fontWeight="700" titleColor="#A12424" titleFontFamily="sans-serif" titleFontSizePt=14 titleFontWeight="600" titleFontStyle="italic" titleLineHeight=1.25}',
      'Nội dung.',
      ':::',
      '',
    ].join('\n'), hcmutReportTheme);

    expect(result.diagnostics).toEqual([]);
    expect(result.latex).toContain('\\color[HTML]{1E4B8F}');
    expect(result.latex).toContain('\\bfseries');
    expect(result.latex).toContain('\\begin{theorem}[{\\color[HTML]{A12424}\\sffamily\\fontsize{14}{17.5}\\selectfont\\bfseries\\itshape Mẫu}]');
    expect(result.latex).toContain('Nội dung.');
  });

  it('warns for valid preview-only properties instead of silently ignoring them', () => {
    const result = exportMarkdownToLatex([
      ':::theorem {title="Mẫu" letterSpacingPt=0.5 titleLetterSpacingPt=0.25 borderRadiusPt=4}',
      'Nội dung.',
      ':::',
      '',
    ].join('\n'), hcmutReportTheme);

    expect(result.diagnostics).toEqual([
      {
        code: 'latex.quick-style-preview-only',
        message: 'Quick Edit borderRadiusPt on theorem line 1 is preview-only and was not exported to TeX.',
        severity: 'warning',
      },
      {
        code: 'latex.quick-style-preview-only',
        message: 'Quick Edit letterSpacingPt on theorem line 1 is preview-only and was not exported to TeX.',
        severity: 'warning',
      },
      {
        code: 'latex.quick-style-preview-only',
        message: 'Quick Edit titleLetterSpacingPt on theorem line 1 is preview-only and was not exported to TeX.',
        severity: 'warning',
      },
    ]);
    expect(result.latex).toContain('Nội dung.');
  });

  it('rejects invalid Quick Style values before they can reach TeX', () => {
    const result = exportMarkdownToLatex([
      ':::style {fontFamily="\\\\input{evil}" borderWidthPt=-1}',
      'Nội dung.',
      ':::',
      '',
    ].join('\n'), hcmutReportTheme);

    expect(result.latex).toBe('');
    expect(result.diagnostics).toEqual([
      {
        code: 'quick-style.invalid',
        message: 'Quick Edit borderWidthPt must be between 0 and 24 on style line 1.',
        severity: 'error',
      },
      {
        code: 'quick-style.invalid',
        message: 'Quick Edit fontFamily must be a safe font family name on style line 1.',
        severity: 'error',
      },
    ]);
  });

  it('warns when unknown style attributes are preserved but not exported', () => {
    const result = exportMarkdownToLatex([
      ':::style {component="paragraph" futureProperty="keep-me"}',
      'Nội dung.',
      ':::',
      '',
    ].join('\n'), hcmutReportTheme);

    expect(result.diagnostics).toContainEqual({
      code: 'quick-style.unknown-property',
      message: 'Unknown Quick Edit style property is preserved: futureProperty. (style line 1)',
      severity: 'warning',
    });
    expect(result.latex).toContain('Nội dung.');
  });

  it.each([
    ['figure', 'caption="Hình"', '![Hình](assets/example.png)'],
    ['table', 'caption="Bảng"', '| A |\n| - |\n| 1 |'],
    ['listing', 'language="text"', '```text\ncode\n```'],
    ['front-section', 'kind="abstract"', 'Nội dung.'],
  ])('applies direct body styles to the %s semantic directive', (name, metadata, body) => {
    const result = exportMarkdownToLatex([
      `:::${name} {${metadata} color="#1E4B8F" fontWeight="700"}`,
      body,
      ':::',
      '',
    ].join('\n'), hcmutReportTheme);

    expect(result.diagnostics).toEqual([]);
    expect(result.latex).toContain('\\color[HTML]{1E4B8F}');
    expect(result.latex).toContain('\\bfseries');
  });

  it('warns when a safe custom font family cannot be represented portably in TeX', () => {
    const result = exportMarkdownToLatex([
      ':::style {fontFamily="Aptos Display"}',
      'Nội dung.',
      ':::',
      '',
    ].join('\n'), hcmutReportTheme);

    expect(result.diagnostics).toContainEqual({
      code: 'latex.quick-style-preview-only',
      message: 'Quick Edit fontFamily on style line 1 is preview-only and was not exported to TeX.',
      severity: 'warning',
    });
    expect(result.latex).toContain('Nội dung.');
  });

  it('warns when theorem-title typography has no semantic title target', () => {
    const result = exportMarkdownToLatex([
      ':::theorem {titleColor="#A12424" titleFontSizePt=14}',
      'Nội dung.',
      ':::',
      '',
    ].join('\n'), hcmutReportTheme);

    expect(result.diagnostics).toEqual([
      {
        code: 'latex.quick-style-preview-only',
        message: 'Quick Edit titleColor on theorem line 1 is preview-only and was not exported to TeX.',
        severity: 'warning',
      },
      {
        code: 'latex.quick-style-preview-only',
        message: 'Quick Edit titleFontSizePt on theorem line 1 is preview-only and was not exported to TeX.',
        severity: 'warning',
      },
    ]);
  });

  it('warns when theorem-title typography targets a non-theorem semantic block', () => {
    const result = exportMarkdownToLatex([
      ':::figure {caption="Hình" titleFontSizePt=14}',
      '![Hình](assets/example.png)',
      ':::',
      '',
    ].join('\n'), hcmutReportTheme);

    expect(result.diagnostics).toContainEqual({
      code: 'latex.quick-style-preview-only',
      message: 'Quick Edit titleFontSizePt on figure line 1 is preview-only and was not exported to TeX.',
      severity: 'warning',
    });
  });

  it('renders border and background colors with valid xcolor models and a visible default rule', () => {
    const result = exportMarkdownToLatex([
      ':::style {component="paragraph" background="#F4F7FC" borderColor="#244A73"}',
      'Nội dung.',
      ':::',
      '',
    ].join('\n'), hcmutReportTheme);

    expect(result.diagnostics).toEqual([]);
    expect(result.latex).toContain('\\setlength{\\fboxrule}{0.4pt}');
    expect(result.latex).toContain('\\fcolorbox[HTML]{244A73}[HTML]{F4F7FC}');
  });

  it('exports the inspector boundary values for line height and border width', () => {
    const result = exportMarkdownToLatex([
      ':::style {fontSizePt=10 lineHeight=0.8 borderWidthPt=24}',
      'Nội dung.',
      ':::',
      '',
    ].join('\n'), hcmutReportTheme);

    expect(result.diagnostics).toEqual([]);
    expect(result.latex).toContain('\\fontsize{10}{8}\\selectfont');
    expect(result.latex).toContain('\\setlength{\\fboxrule}{24pt}');
  });

  it('warns instead of placing unsafe float content inside a Quick Style box', () => {
    const result = exportMarkdownToLatex([
      ':::figure {caption="Hình" background="#F4F7FC" paddingMm=3}',
      '![Hình](assets/example.png)',
      ':::',
      '',
    ].join('\n'), hcmutReportTheme);

    expect(result.diagnostics).toEqual([
      {
        code: 'latex.quick-style-preview-only',
        message: 'Quick Edit background on figure line 1 is preview-only and was not exported to TeX.',
        severity: 'warning',
      },
      {
        code: 'latex.quick-style-preview-only',
        message: 'Quick Edit paddingMm on figure line 1 is preview-only and was not exported to TeX.',
        severity: 'warning',
      },
    ]);
    expect(result.latex).not.toContain('\\colorbox');
    expect(result.latex).not.toContain('\\parbox');
  });

  it('warns when a placement-only directive cannot render body style properties', () => {
    const result = exportMarkdownToLatex([
      ':::pagebreak {color="#1E4B8F"}',
      ':::',
      '',
    ].join('\n'), hcmutReportTheme);

    expect(result.diagnostics).toContainEqual({
      code: 'latex.quick-style-preview-only',
      message: 'Quick Edit color on pagebreak line 1 is preview-only and was not exported to TeX.',
      severity: 'warning',
    });
  });

  it('warns instead of boxing a nested page break', () => {
    const result = exportMarkdownToLatex([
      ':::style {background="#F4F7FC" paddingMm=3}',
      'Trước.',
      ':::pagebreak',
      ':::',
      'Sau.',
      ':::',
      '',
    ].join('\n'), hcmutReportTheme);

    expect(result.diagnostics).toEqual([
      {
        code: 'latex.quick-style-preview-only',
        message: 'Quick Edit background on style line 1 is preview-only and was not exported to TeX.',
        severity: 'warning',
      },
      {
        code: 'latex.quick-style-preview-only',
        message: 'Quick Edit paddingMm on style line 1 is preview-only and was not exported to TeX.',
        severity: 'warning',
      },
    ]);
    expect(result.latex).not.toContain('\\parbox');
  });

  it('resolves default, component, and per-instance themes with explicit provenance', () => {
    const theme = (id: string, version: string, label: string): LatexTheme => ({
      ...hcmutReportTheme,
      manifest: { ...hcmutReportTheme.manifest, id, version },
      renderDocument(body) { return `${label}:DOCUMENT\n${body}`; },
      renderComponent(slot, values) {
        return `${label}:${slot}[${values.title ?? values.body ?? ''}]\n`;
      },
    });
    const base = theme('base-theme', '1.0.0', 'BASE');
    const formal = theme('formal-theme', '2.0.0', 'FORMAL');
    const accent = theme('accent-theme', '3.0.0', 'ACCENT');
    const source = [
      '---',
      'lmx:',
      '  schema: 2',
      '  themes:',
      '    base: {id: base-theme, version: 1.0.0}',
      '    formal: {id: formal-theme, version: 2.0.0}',
      '    accent: {id: accent-theme, version: 3.0.0}',
      '  theme:',
      '    default: base',
      '    components:',
      '      heading-1: formal',
      '      theorem: formal',
      '---',
      '# Tiêu đề',
      '',
      ':::theorem {title="Theo tài liệu"}',
      'Nội dung mặc định theo component.',
      ':::',
      '',
      ':::theorem {title="Riêng" theme="accent"}',
      'Nội dung riêng.',
      ':::',
      '',
    ].join('\n');

    const result = exportMarkdownToLatex(source, hcmutReportTheme, {
      themes: [base, formal, accent],
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.latex).toContain('BASE:DOCUMENT');
    expect(result.latex).toContain('FORMAL:heading-1[Tiêu đề]');
    expect(result.latex).toContain('FORMAL:theorem[Theo tài liệu]');
    expect(result.latex).toContain('ACCENT:theorem[Riêng]');
  });

  it('warns when a per-instance alias is not declared and uses the explicit fallback', () => {
    const source = [
      '---',
      'lmx:',
      '  schema: 2',
      '  themes:',
      '    base: {id: hcmut-report-v1, version: 1.0.0-beta.1}',
      '  theme: {default: base}',
      '---',
      ':::theorem {theme="undeclared"}',
      'Nội dung vẫn xuất được.',
      ':::',
    ].join('\n');

    const result = exportMarkdownToLatex(source, hcmutReportTheme);

    expect(result.latex).toContain('Nội dung vẫn xuất được.');
    expect(result.diagnostics).toContainEqual({
      code: 'theme.alias-undeclared',
      message: 'Theme alias is not declared: undeclared.',
      severity: 'warning',
    });
  });

  it('does not resolve a registered package whose integrity differs from the document', () => {
    const installed: LatexTheme = {
      ...hcmutReportTheme,
      manifest: { ...hcmutReportTheme.manifest, id: 'formal-theme', version: '2.0.0' },
      renderComponent(slot) { return `FORMAL:${slot}\n`; },
    };
    const source = [
      '---',
      'lmx:',
      '  schema: 2',
      '  themes:',
      '    base: {id: hcmut-report-v1, version: 1.0.0-beta.1}',
      '    formal: {id: formal-theme, version: 2.0.0, integrity: sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa}',
      '  theme: {default: base, components: {theorem: formal}}',
      '---',
      ':::theorem',
      'Nội dung.',
      ':::',
    ].join('\n');

    const result = exportMarkdownToLatex(source, hcmutReportTheme, {
      themes: [{
        theme: installed,
        integrity: 'sha256-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      }],
    });

    expect(result.latex).not.toContain('FORMAL:theorem');
    expect(result.diagnostics).toContainEqual({
      code: 'theme.integrity-mismatch',
      message: 'Theme package integrity does not match: formal-theme@2.0.0 (alias formal).',
      severity: 'warning',
    });
  });

  it('warns and uses the explicit fallback when a selected alias is unavailable', () => {
    const source = [
      '---',
      'lmx:',
      '  schema: 2',
      '  themes:',
      '    base: {id: missing-theme, version: 1.0.0}',
      '  theme: {default: base, components: {theorem: base}}',
      '---',
      ':::theorem',
      'Nội dung vẫn xuất được.',
      ':::',
    ].join('\n');

    const result = exportMarkdownToLatex(source, hcmutReportTheme, { themes: [] });

    expect(result.latex).toContain('Nội dung vẫn xuất được.');
    expect(result.diagnostics).toContainEqual({
      code: 'theme.package-unavailable',
      message: 'Theme package is unavailable: missing-theme@1.0.0 (alias base).',
      severity: 'warning',
    });
  });

  it('escapes normal user text without escaping math or code', () => {
    expect(escapeLatexText('# $ % & _ { } ~ ^ \\')).toBe(
      '\\# \\$ \\% \\& \\_ \\{ \\} \\textasciitilde{} \\textasciicircum{} \\textbackslash{}',
    );
  });

  it('uses theme component renderers for headings and semantic blocks', () => {
    const renderedSlots: string[] = [];
    const theme: LatexTheme = {
      ...hcmutReportTheme,
      renderComponent(slot, values) {
        renderedSlots.push(slot);
        return `THEME[${slot}](${values.title ?? values.body ?? ''})\n`;
      },
    };
    const source = [
      '# Tiêu đề',
      '',
      ':::theorem {title="Mẫu"}',
      'Nội dung.',
      ':::',
      '',
      ':::property', 'Nội dung.', ':::', '',
      ':::proposition', 'Nội dung.', ':::', '',
      ':::corollary', 'Nội dung.', ':::', '',
      ':::lemma', 'Nội dung.', ':::', '',
      ':::exercise', 'Nội dung.', ':::', '',
      ':::figure {caption="Hình"}', '![Hình](assets/example.png)', ':::', '',
      ':::table {caption="Bảng"}', '| A |', '| - |', '| 1 |', ':::', '',
      ':::listing {language="text"}',
      '```text',
      'code',
      '```',
      ':::',
      '',
      ':::front-section {title="Tóm tắt" numbered=false}',
      'Nội dung.',
      ':::',
      '',
      ':::pagebreak',
      ':::',
    ].join('\n');

    const result = exportMarkdownToLatex(source, theme);

    expect(result.diagnostics).toEqual([]);
    expect(renderedSlots).toEqual([
      'heading-1',
      'theorem',
      'property',
      'proposition',
      'corollary',
      'lemma',
      'exercise',
      'figure',
      'table',
      'listing',
      'front-section',
    ]);
    expect(result.latex).toContain('THEME[heading-1](Tiêu đề)');
    expect(result.latex).toContain('THEME[theorem](Mẫu)');
  });

  it('escapes custom titles for every HCMUT theorem environment', () => {
    const cases = [
      ['theorem', 'theorem'],
      ['property', 'property'],
      ['proposition', 'proposition'],
      ['corollary', 'corollary'],
      ['lemma', 'lemma'],
      ['exercise', 'exer'],
    ] as const;
    const source = cases.flatMap(([name]) => [
      `:::${name} {title="Mẫu & 50%"}`,
      `Nội dung ${name}.`,
      ':::',
      '',
    ]).join('\n');

    const result = exportMarkdownToLatex(source, hcmutReportTheme);

    expect(result.diagnostics).toEqual([]);
    for (const [, environment] of cases) {
      expect(result.latex).toContain(`\\begin{${environment}}[Mẫu \\& 50\\%]`);
    }
  });

  it('loads the HCMUT package required by GFM strikethrough output', () => {
    const result = exportMarkdownToLatex('Nội dung ~~đã xóa~~.\n', hcmutReportTheme);

    expect(result.diagnostics).toEqual([]);
    expect(result.latex).toContain('\\usepackage[normalem]{ulem}');
    expect(result.latex).toContain('Nội dung \\sout{đã xóa}.');
  });

  it('preserves checked and unchecked task-list state in LaTeX output', () => {
    const result = exportMarkdownToLatex([
      '- [x] Đã hoàn thành',
      '- [ ] Chưa hoàn thành',
      '',
    ].join('\n'), hcmutReportTheme);

    expect(result.diagnostics).toEqual([]);
    expect(result.latex).toContain('\\item[$\\boxtimes$] Đã hoàn thành');
    expect(result.latex).toContain('\\item[$\\square$] Chưa hoàn thành');
  });

  it('exports standard Markdown and all semantic directive families deterministically', () => {
    const source = `---
schemaVersion: 1
theme:
  id: hcmut-report
  version: 1.0.0
cover:
  title: "Báo cáo Việt Nam"
  faculty: "KHOA KHOA HỌC VÀ KỸ THUẬT MÁY TÍNH"
  reportType: "ĐỒ ÁN MÔN HỌC"
---
# Giới thiệu

Đoạn **đậm** có công thức $a_b$ và ký tự 50%.

:::theorem {#thm-bayes title="Định lý Bayes"}
Nội dung định lý.
:::

:::figure {#fig-system caption="Kiến trúc" width=0.8 placement="h!"}
![Kiến trúc](assets/system.png)
:::

:::table {#tbl-data caption="Dữ liệu" placement="h!"}
| A | B |
| - | - |
| 1 | 2 |
:::

:::listing {#lst-code caption="Mã Swift" language="swift" lineNumbers=true}
\`\`\`swift
print("Xin chào")
\`\`\`
:::

:::front-section {kind="abstract" title="Tóm tắt" numbered=false}
Tóm tắt báo cáo.
:::

:::pagebreak
:::
`;

    const first = exportMarkdownToLatex(source, hcmutReportTheme);
    const second = exportMarkdownToLatex(source, hcmutReportTheme);

    expect(first.diagnostics).toEqual([]);
    expect(second.latex).toBe(first.latex);
    expect(first.latex).toContain('\\section{Giới thiệu}');
    expect(first.latex).toContain('Đoạn \\textbf{đậm} có công thức $a_b$ và ký tự 50\\%.');
    expect(first.latex).toContain('\\begin{theorem}[Định lý Bayes]');
    expect(first.latex).toContain('\\label{thm-bayes}');
    expect(first.latex).toContain(
      '\\includegraphics[width=0.8\\textwidth]{\\detokenize{assets/system.png}}',
    );
    expect(first.latex).toContain('\\begin{tabular}');
    expect(first.latex).toContain('\\begin{lstlisting}[language=swift');
    expect(first.latex).toContain('\\section*{Tóm tắt}');
    expect(first.latex).toContain('\\clearpage');
    expect(first.latex).not.toContain('\\thispagestyle{empty}\n\\null');
  });

  it('returns source diagnostics instead of producing unsafe output', () => {
    const result = exportMarkdownToLatex(':::figure {#fig-a}\nmissing close\n', hcmutReportTheme);
    expect(result.latex).toBe('');
    expect(result.diagnostics[0]?.code).toBe('lmx.unterminated-directive');
  });

  it('encodes safe TeX metacharacters in asset paths without changing the filesystem path', () => {
    const source = [
      ':::figure {#fig-safe caption="Safe path"}',
      '![Safe path](assets/report_#1&final$.png)',
      ':::',
    ].join('\n');

    const result = exportMarkdownToLatex(source, hcmutReportTheme);

    expect(result.diagnostics).toEqual([]);
    expect(result.assetPaths).toEqual(['assets/report_#1&final$.png']);
    expect(result.latex).toContain(
      '\\includegraphics[width=0.8\\textwidth]{\\detokenize{assets/report_#1&final$.png}}',
    );
  });

  it.each([
    'assets/percent%comment.png',
    'assets/open{brace.png',
    'assets/close}brace.png',
    'assets/caret^escape.png',
    '../outside.png',
  ])('rejects unsafe figure asset path %s before generating TeX', (path) => {
    const source = [
      ':::figure {#fig-unsafe caption="Unsafe path"}',
      `![Unsafe path](${path})`,
      ':::',
    ].join('\n');

    const result = exportMarkdownToLatex(source, hcmutReportTheme);

    expect(result.latex).toBe('');
    expect(result.assetPaths).toEqual([]);
    expect(result.diagnostics.filter((item) => item.code === 'latex.unsafe-asset-path')).toHaveLength(1);
  });

  it('encodes ordinary Markdown image paths before passing them to includegraphics', () => {
    const result = exportMarkdownToLatex(
      '![Sơ đồ](assets/system_diagram.png)\n',
      hcmutReportTheme,
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.assetPaths).toEqual(['assets/system_diagram.png']);
    expect(result.latex).toContain('\\includegraphics{\\detokenize{assets/system_diagram.png}}');
  });

  it('falls back to plain listings for unsupported fenced-code languages', () => {
    const result = exportMarkdownToLatex([
      '```mermaid',
      'flowchart LR',
      '```',
      '',
      '```matlab',
      'disp("Xin chào")',
      '```',
      '',
    ].join('\n'), hcmutReportTheme);

    expect(result.diagnostics).toEqual([
      {
        code: 'latex.listing-language-unsupported',
        message: 'Code fence language mermaid is not supported by the offline PDF renderer; exported as plain code (line 1).',
        severity: 'warning',
      },
      {
        code: 'latex.listing-language-unsupported',
        message: 'Code fence language matlab is not supported by the offline PDF renderer; exported as plain code (line 5).',
        severity: 'warning',
      },
    ]);
    expect(result.latex).toContain('\\begin{lstlisting}[]\nflowchart LR');
    expect(result.latex).toContain('\\begin{lstlisting}[]\ndisp("Xin chào")');
    expect(result.latex).not.toContain('language=mermaid');
    expect(result.latex).not.toContain('language=matlab');
  });

  it('keeps an allowlisted listings language for syntax highlighting', () => {
    const result = exportMarkdownToLatex('```python\nprint("ok")\n```\n', hcmutReportTheme);

    expect(result.diagnostics).toEqual([]);
    expect(result.latex).toContain('\\begin{lstlisting}[language=python]');
  });

  it('rejects an lstlisting terminator inside an LMX listing', () => {
    const source = [
      ':::listing {#lst-unsafe language="text"}',
      '```text',
      'safe code',
      '\\end{lstlisting}',
      '\\input{outside.tex}',
      '```',
      ':::',
    ].join('\n');

    const result = exportMarkdownToLatex(source, hcmutReportTheme);

    expect(result.latex).toBe('');
    expect(result.diagnostics.filter(
      (item) => item.code === 'latex.unsafe-listing-terminator',
    )).toHaveLength(1);
  });

  it('rejects an lstlisting terminator inside a standard Markdown code fence', () => {
    const source = [
      '```text',
      '\\end { lstlisting }',
      '\\input{outside.tex}',
      '```',
    ].join('\n');

    const result = exportMarkdownToLatex(source, hcmutReportTheme);

    expect(result.latex).toBe('');
    expect(result.diagnostics.some((item) => item.code === 'latex.unsafe-listing-terminator')).toBe(true);
  });

  it('preserves the supplied front-section page behavior for all three intro blocks', () => {
    const source = [
      ':::front-section {kind="acknowledgements" title="Lời cảm ơn" numbered=false}',
      'Cảm ơn.',
      ':::',
      ':::front-section {kind="declaration" title="Lời cam đoan" numbered=false}',
      'Cam đoan.',
      ':::',
      ':::front-section {kind="abstract" title="Tóm tắt" numbered=false}',
      'Tóm tắt.',
      ':::',
    ].join('\n');

    const result = exportMarkdownToLatex(source, hcmutReportTheme);

    expect(result.diagnostics).toEqual([]);
    expect(result.latex.split('\n').filter((line) => line === '\\thispagestyle{empty}')).toHaveLength(3);
    expect(result.latex.match(/\\clearpage\n\\pagenumbering\{arabic\}/g)).toHaveLength(3);
    expect(result.latex.match(/\\pagenumbering\{arabic\}/g)).toHaveLength(3);
  });

  it('places cover and generated lists where their LMX markers appear', () => {
    const source = [
      '# Trang giới thiệu',
      '',
      ':::cover',
      ':::',
      '',
      '## Trước mục lục',
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
      '# Nội dung chính',
      '',
    ].join('\n');

    const result = exportMarkdownToLatex(source, hcmutReportTheme);

    expect(result.diagnostics).toEqual([]);
    expect(result.latex.indexOf('\\section{Trang giới thiệu}')).toBeLessThan(
      result.latex.indexOf('\\begin{titlepage}'),
    );
    expect(result.latex.indexOf('\\subsection{Trước mục lục}')).toBeLessThan(
      result.latex.indexOf('\\tableofcontents'),
    );
    expect(result.latex.indexOf('\\tableofcontents')).toBeLessThan(
      result.latex.indexOf('\\listoffigures'),
    );
    expect(result.latex.indexOf('\\listoffigures')).toBeLessThan(
      result.latex.indexOf('\\listoftables'),
    );
    expect(result.latex.indexOf('\\listoftables')).toBeLessThan(
      result.latex.indexOf('\\section{Nội dung chính}'),
    );
    expect(result.latex.match(/\\begin\{titlepage\}/g)).toHaveLength(1);
    expect(result.latex.match(/\\tableofcontents/g)).toHaveLength(1);
  });

  it('does not add a blank PDF sheet for a page break after a full-page structure', () => {
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

    const result = exportMarkdownToLatex(source, hcmutReportTheme);

    expect(result.diagnostics).toEqual([]);
    expect(result.latex).toMatch(
      /\\end\{titlepage\}\n\\newpage\n+\\begin\{titlepage\}/u,
    );
    expect(result.latex).not.toContain('\\thispagestyle{empty}\n\\null');
  });

  it('preserves each explicit blank PDF sheet represented by consecutive page breaks', () => {
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

    const result = exportMarkdownToLatex(source, hcmutReportTheme);

    expect(result.diagnostics).toEqual([]);
    expect(result.latex.match(/\\thispagestyle\{empty\}\n\\null\n\\newpage/g)).toHaveLength(1);
  });

  it('does not invent structure pages when Visual placement markers are absent', () => {
    const source = [
      '---',
      'lmx:',
      '  structure:',
      '    cover: true',
      '    toc: true',
      '    listOfFigures: true',
      '    listOfTables: true',
      '---',
      '',
      '# Nội dung duy nhất',
      '',
    ].join('\n');

    const result = exportMarkdownToLatex(source, hcmutReportTheme);

    expect(result.diagnostics).toEqual([]);
    expect(result.latex).not.toContain('\\begin{titlepage}');
    expect(result.latex).not.toContain('\\tableofcontents');
    expect(result.latex).not.toContain('\\listoffigures');
    expect(result.latex).not.toContain('\\listoftables');
  });

  it('reads the versioned lmx settings used by the native Properties inspector', () => {
    const source = `---
lmx:
  schema: 1
  theme: hcmut-report-v1
  structure:
    cover: false
    toc: true
    tocDepth: 2
    listOfFigures: false
    listOfTables: false
  cover:
    university: CUSTOM UNIVERSITY
    school: CUSTOM SCHOOL
    faculty: CUSTOM FACULTY
    reportType: CUSTOM REPORT
    title: CUSTOM TITLE
    heading: CUSTOM HEADING
    logoEnabled: false
    logoWidthCm: 3.5
    borderEnabled: false
    outerBorderWidthPt: 3
    innerBorderWidthPt: 1
    students:
      - name: Nguyễn Văn A
        id: "2212345"
  header:
    enabled: false
    institution: CUSTOM HEADER
    faculty: CUSTOM HEADER FACULTY
    logoEnabled: false
    logoSizeMm: 8
    fontSizePt: 8.5
    bold: false
    ruleEnabled: false
    ruleWidthPt: 0.6
  footer:
    enabled: true
    left: CUSTOM FOOTER
    pageNumber: current
    fontSizePt: 9
    ruleEnabled: false
    ruleWidthPt: 0.5
---
# Nội dung
`;

    const result = exportMarkdownToLatex(source, hcmutReportTheme);

    expect(result.settings.title).toBe('CUSTOM TITLE');
    expect(result.settings.students).toEqual([{ name: 'Nguyễn Văn A', id: '2212345' }]);
    expect(result.settings.tocDepth).toBe(2);
    expect(result.settings.headerEnabled).toBe(false);
    expect(result.settings.footerPageNumber).toBe('current');
    expect(result.settings.coverHeading).toBe('CUSTOM HEADING');
    expect(result.settings.coverLogoEnabled).toBe(false);
    expect(result.settings.headerLogoEnabled).toBe(false);
    expect(result.settings.headerFontSizePt).toBe(8.5);
    expect(result.settings.footerRuleEnabled).toBe(false);
    expect(result.latex).not.toContain('\\begin{titlepage}');
    expect(result.latex).toContain('\\setcounter{tocdepth}{2}');
    expect(result.latex).toContain('CUSTOM FOOTER');
  });

  it('preserves legacy top-level sections when lmx only overrides one section', () => {
    const result = exportMarkdownToLatex(`---
cover:
  title: LEGACY COVER
  faculty: LEGACY FACULTY
footer:
  left: LEGACY FOOTER
lmx:
  header:
    enabled: false
---
# Nội dung
`, hcmutReportTheme);

    expect(result.settings.title).toBe('LEGACY COVER');
    expect(result.settings.faculty).toBe('LEGACY FACULTY');
    expect(result.settings.headerEnabled).toBe(false);
    expect(result.settings.footerLeft).toBe('LEGACY FOOTER');
  });

  it('omits fully blank student placeholders from exported cover rows', () => {
    const result = exportMarkdownToLatex(`---
lmx:
  cover:
    title: Báo cáo
    students:
      - name: ""
        id: ""
---
`, hcmutReportTheme);

    expect(result.settings.students).toEqual([]);
    expect(result.latex).not.toContain('SVTH1:');
  });

  it('falls back from a header logo size that cannot fit the fixed TeX headheight', () => {
    const result = exportMarkdownToLatex(`---
lmx:
  header:
    logoSizeMm: 15
---
`, hcmutReportTheme);

    expect(result.settings.headerLogoSizeMm).toBe(10);
  });

  it('exports IEEE citations, cross-references, equations, definitions, proofs, algorithms, and bibliography', () => {
    const source = [
      '---',
      'lmx:',
      '  citationStyle: ieee',
      '  references:',
      '    - id: vaswani2017',
      '      author: Vaswani, Ashish and Shazeer, Noam',
      '      title: Attention Is All You Need',
      '      venue: NeurIPS',
      '      year: "2017"',
      '      pages: "5998-6008"',
      '    - id: knuth1997',
      '      author: Donald E. Knuth',
      '      title: The Art of Computer Programming',
      '      venue: Addison-Wesley',
      '      year: "1997"',
      '---',
      '',
      'Theo nghiên cứu [@vaswani2017; @knuth1997], xem @fig-arch, @tbl-perf và @eq-loss.',
      '',
      ':::equation {#eq-loss}',
      '$$',
      '\\mathcal{L}(\\theta) = \\sum_{i=1}^n (y_i - \\hat{y}_i)^2',
      '$$',
      ':::',
      '',
      ':::definition {#def-metric title="Không gian Metric"}',
      'Cho tập hợp $X$ khác rỗng.',
      ':::',
      '',
      ':::proof {title="Chứng minh bổ đề"}',
      'Ta có điều phải chứng minh.',
      ':::',
      '',
      ':::remark {#rem-note title="Chú ý"}',
      'Kết quả hội tụ nhanh.',
      ':::',
      '',
      ':::algorithm {#alg-train caption="Thuật toán huấn luyện"}',
      '1. Khởi tạo tham số',
      ':::',
      '',
      ':::references',
      ':::',
      '',
      ':::appendix {title="Phụ lục A: Dữ liệu thực nghiệm"}',
      'Chi tiết bảng số liệu.',
      ':::',
      '',
    ].join('\n');

    const result = exportMarkdownToLatex(source, hcmutReportTheme);

    expect(result.diagnostics).toEqual([]);
    expect(result.latex).toContain('\\cite{vaswani2017,knuth1997}');
    expect(result.latex).toContain('Hình~\\ref{fig-arch}');
    expect(result.latex).toContain('Bảng~\\ref{tbl-perf}');
    expect(result.latex).toContain('Phương trình~(\\ref{eq-loss})');
    expect(result.latex).toContain('\\begin{equation}\n\\label{eq-loss}\n\\mathcal{L}(\\theta)');
    expect(result.latex).toContain('\\textbf{Định nghĩa \\thehcmutdef (Không gian Metric).} \\label{def-metric}');
    expect(result.latex).toContain('\\begin{proof}[Chứng minh bổ đề]');
    expect(result.latex).toContain('\\textit{Nhận xét \\thehcmutrem (Chú ý).} \\label{rem-note}');
    expect(result.latex).toContain('\\textbf{Thuật toán \\thehcmutalg: Thuật toán huấn luyện}');
    expect(result.latex).toContain('\\begin{thebibliography}{9}');
    expect(result.latex).toContain('\\bibitem{vaswani2017} A. Vaswani and N. Shazeer, ``Attention Is All You Need,\'\' \\emph{NeurIPS}, pp. 5998-6008, 2017.');
    expect(result.latex).toContain('\\appendix\n\\section{Phụ lục A: Dữ liệu thực nghiệm}');
  });

  it('exports APA author-year inline citations and alphabetical hanging-indent bibliography', () => {
    const source = [
      '---',
      'lmx:',
      '  citationStyle: apa',
      '  references:',
      '    - id: zeta2022',
      '      author: Zeta, Alice and Beta, Bob',
      '      title: Modern Systems',
      '      venue: IEEE Access',
      '      year: "2022"',
      '    - id: alpha2020',
      '      author: Alpha, John and Gamma, Carol and Delta, Eve',
      '      title: Foundations of Computing',
      '      venue: ACM Surveys',
      '      year: "2020"',
      '---',
      '',
      'Kết quả trước đây [@zeta2022; @alpha2020].',
      '',
      ':::references',
      ':::',
      '',
    ].join('\n');

    const result = exportMarkdownToLatex(source, hcmutReportTheme);

    expect(result.diagnostics).toEqual([]);
    expect(result.latex).toContain('(\\hyperlink{cite.zeta2022}{Zeta \\& Beta, 2022}; \\hyperlink{cite.alpha2020}{Alpha et al., 2020})');
    expect(result.latex.indexOf('\\hypertarget{cite.alpha2020}{}')).toBeLessThan(
      result.latex.indexOf('\\hypertarget{cite.zeta2022}{}'),
    );
  });
});
