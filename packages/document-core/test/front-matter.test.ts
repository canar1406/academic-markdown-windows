import { describe, expect, it } from 'vitest';
import {
  parseDocumentThemeSelection,
  parseFrontMatter,
  updateDocumentComponentTheme,
  updateFrontMatter,
} from '../src/index.js';

describe('Markdown front matter', () => {
  it('round-trips source without front matter byte-for-byte', () => {
    const source = '# Báo cáo\n\nNội dung tiếng Việt.\n';

    const parsed = parseFrontMatter(source);

    expect(parsed.valid).toBe(true);
    expect(parsed.body).toBe(source);
    expect(parsed.source).toBe(source);
    expect(parsed.data).toEqual({});
  });

  it('updates known metadata while preserving unknown keys and comments', () => {
    const source = [
      '---',
      '# keep this comment',
      'unknownTool:',
      '  enabled: true',
      'document:',
      '  title: Cũ',
      '---',
      '',
      '# Nội dung',
      '',
    ].join('\n');

    const result = updateFrontMatter(source, {
      document: { title: 'Đồ án mới' },
      theme: { id: 'hcmut-report', version: 1 },
    });

    expect(result.updated).toBe(true);
    expect(result.source).toContain('# keep this comment');
    expect(result.source).toContain('unknownTool:');
    expect(result.source).toContain('enabled: true');
    expect(result.source).toContain('title: Đồ án mới');
    expect(result.source).toContain('id: hcmut-report');
    expect(result.source.endsWith('# Nội dung\n')).toBe(true);
  });

  it('reads legacy multiline flow front matter without rewriting source', () => {
    const source = [
      '---',
      '/{',
      '  lmx:',
      '    {',
      '      cover:',
      '        {',
      '          title: Giải tích 1,',
      '          students:',
      '            [',
      '              { id: MSSV, name: LAMMERKAS 1 },',
      '              { id: MSSV, name: LAMMERKAS 2 }',
      '            ]',
      '        },',
      '      footer: { enabled: true, pageNumber: current-total }',
      '    }',
      '}',
      '---',
      '',
      '# Nội dung',
      '',
    ].join('\n');

    const parsed = parseFrontMatter(source);

    expect(parsed.valid).toBe(true);
    expect(parsed.source).toBe(source);
    expect(parsed.body).toBe('\n# Nội dung\n');
    expect(parsed.data).toMatchObject({
      lmx: {
        cover: {
          title: 'Giải tích 1',
          students: [
            { id: 'MSSV', name: 'LAMMERKAS 1' },
            { id: 'MSSV', name: 'LAMMERKAS 2' },
          ],
        },
        footer: { enabled: true, pageNumber: 'current-total' },
      },
    });
    expect(parsed.diagnostics).toContainEqual({
      code: 'front-matter.legacy-flow-format',
      message: 'Legacy multiline flow front matter was read without changing the Markdown source.',
      severity: 'warning',
    });
  });

  it('keeps malformed source intact and reports a recoverable diagnostic', () => {
    const source = '---\ndocument: [broken\n---\n\n# Không được mất\n';

    const parsed = parseFrontMatter(source);
    const update = updateFrontMatter(source, { document: { title: 'Không ghi đè' } });

    expect(parsed.valid).toBe(false);
    expect(parsed.source).toBe(source);
    expect(parsed.diagnostics[0]?.code).toBe('front-matter.invalid-yaml');
    expect(update.updated).toBe(false);
    expect(update.source).toBe(source);
  });

  it.each(['\n', '\r\n'])('updates legacy flow metadata losslessly with %j line endings', (eol) => {
    const source = [
      '---', '/{ # keep this comment',
      'lmx: { cover: { title: Giải tích 1, custom: { keep: true },',
      'students: [{ name: Nguyễn Văn An, id: "001", role: nhóm trưởng }] },',
      'footer: { left: Giữ nguyên } }, unknown: { sequence: [1, 2], text: "001" }',
      '}', '...', '# Nội dung', '', ':::cover', ':::', '',
    ].join(eol);
    const before = parseFrontMatter(source);
    const update = updateFrontMatter(source, { lmx: { cover: { title: 'Tên mới' } } });
    const after = parseFrontMatter(update.source);
    expect(update.updated).toBe(true);
    expect(after.valid).toBe(true);
    expect(after.data).toEqual({
      ...before.data,
      lmx: {
        cover: { title: 'Tên mới', custom: { keep: true },
          students: [{ name: 'Nguyễn Văn An', id: '001', role: 'nhóm trưởng' }] },
        footer: { left: 'Giữ nguyên' },
      },
    });
    expect(after.body).toBe(before.body);
    expect(update.source).toContain('# keep this comment');
    expect(update.source).toContain(`${eol}...${eol}`);
    expect(update.source.replaceAll(eol, '')).not.toContain('\n');
    expect(parseFrontMatter(source).source).toBe(source);
    expect(update.diagnostics.some(item => item.severity === 'error')).toBe(false);
  });

  it.each([
    '/{ lmx: { cover: { title: broken } }',
    '/{ a: one, a: two }',
    '/{ lmx: [unclosed }',
  ])('never repairs ambiguous legacy YAML or loses its original text: %s', (yaml) => {
    const source = `---\n${yaml}\n---\n# Không mất\n`;
    const update = updateFrontMatter(source, { lmx: { cover: { title: 'Mới' } } });
    expect(parseFrontMatter(source).valid).toBe(false);
    expect(update.updated).toBe(false);
    expect(update.source).toBe(source);
  });

  it('updates ten legacy students without changing their order or the Markdown body', () => {
    const students = Array.from({ length: 10 }, (_, index) => ({
      name: `Nguyễn Thị Ánh ${index + 1}`, id: `00${index + 1}`,
    }));
    const source = `---\n/${JSON.stringify({ lmx: { cover: { students } }, unknown: 'giữ' })}\n---\n:::cover\n:::\n`;
    const update = updateFrontMatter(source, { lmx: { cover: { title: 'Bìa mới', students } } });
    expect(update.updated).toBe(true);
    expect(parseFrontMatter(update.source).data).toEqual({
      lmx: { cover: { students, title: 'Bìa mới' } }, unknown: 'giữ',
    });
    expect(parseFrontMatter(update.source).body).toBe(':::cover\n:::\n');
  });

  it('parses schema-v2 theme aliases and component selections without paths', () => {
    const parsed = parseDocumentThemeSelection({
      schema: 2,
      themes: {
        base: { id: 'hcmut-report-v1', version: '1.0.0-beta.1', integrity: 'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
        formal: { id: 'formal-theme', version: '2.0.0' },
      },
      theme: {
        default: 'base',
        components: { theorem: 'formal' },
      },
    });

    expect(parsed.valid).toBe(true);
    expect(parsed.selection).toEqual({
      schemaVersion: 2,
      themes: {
        base: { id: 'hcmut-report-v1', version: '1.0.0-beta.1', integrity: 'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
        formal: { id: 'formal-theme', version: '2.0.0' },
      },
      theme: { default: 'base', components: { theorem: 'formal' } },
    });
    expect(parsed.diagnostics).toEqual([]);
  });

  it('writes Apply-to-all under lmx.theme.components and preserves existing instance source', () => {
    const source = [
      '---',
      '# keep metadata comments',
      'lmx:',
      '  schema: 2',
      '  themes:',
      '    base:',
      '      id: hcmut-report-v1',
      '      version: 1.0.0-beta.1',
      '    formal:',
      '      id: formal-theme',
      '      version: 2.0.0',
      '  theme:',
      '    default: base',
      '---',
      '',
      ':::theorem {theme="base"}',
      'Per-instance override.',
      ':::',
      '',
    ].join('\n');

    const result = updateDocumentComponentTheme(source, 'theorem', 'formal');

    expect(result.updated).toBe(true);
    expect(result.source).toContain('# keep metadata comments');
    expect(result.source).toContain('components:\n      theorem: formal');
    expect(result.source).toContain(':::theorem {theme="base"}');
    expect(parseDocumentThemeSelection(parseFrontMatter(result.source).data.lmx).valid).toBe(true);
  });

  it('keeps legacy source byte-stable until an explicit migration flow is confirmed', () => {
    const source = [
      '---',
      'lmx:',
      '  schema: 1',
      '  theme: hcmut-report-v1',
      '  cover:',
      '    title: Báo cáo cũ',
      '---',
      ':::theorem {theme="base"}',
      'Nội dung.',
      ':::',
    ].join('\n');

    const result = updateDocumentComponentTheme(source, 'theorem', 'base');

    expect(result.updated).toBe(false);
    expect(result.source).toBe(source);
    expect(result.diagnostics).toContainEqual({
      code: 'theme.unsupported-schema',
      message: 'Theme selection requires lmx.schema: 2.',
      severity: 'error',
    });
  });

  it('rejects a non-mapping component selection instead of silently replacing it', () => {
    const parsed = parseDocumentThemeSelection({
      schema: 2,
      themes: { base: { id: 'base-theme', version: '1.0.0' } },
      theme: { default: 'base', components: false },
    });

    expect(parsed.valid).toBe(false);
    expect(parsed.diagnostics).toContainEqual({
      code: 'theme.invalid-component-selection',
      message: 'Theme component selections must be a mapping.',
      severity: 'error',
    });
  });

  it('rejects undeclared aliases and path-bearing package references without changing source', () => {
    const parsed = parseDocumentThemeSelection({
      schema: 2,
      themes: { base: { id: '/tmp/theme', version: '1.0.0' } },
      theme: { default: 'missing', components: { theorem: 'missing' } },
    });

    expect(parsed.valid).toBe(false);
    expect(parsed.diagnostics.map((item) => item.code)).toEqual([
      'theme.invalid-package-id',
      'theme.undeclared-alias',
      'theme.undeclared-alias',
    ]);
  });
});
