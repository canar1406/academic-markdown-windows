import { describe, expect, it } from 'vitest';
import { createDocumentIndex } from '../src/document-index.js';

describe('document index', () => {
  it('indexes headings, links and images with deterministic source ranges', () => {
    const source = [
      '# Chương một',
      '',
      'Xem [tài liệu](https://example.com) và ![Sơ đồ](assets/diagram.png).',
      '',
      '## Phần có `code`',
      '',
    ].join('\n');

    expect(createDocumentIndex(source, 7)).toEqual({
      documentRevision: 7,
      generation: 1,
      outline: [
        {
          id: 'heading-0',
          parentId: null,
          level: 1,
          title: 'Chương một',
          sourceRange: { from: 0, to: 12, startLine: 1, startColumn: 1, endLine: 1, endColumn: 13 },
          pageIndex: null,
        },
        {
          id: 'heading-1',
          parentId: 'heading-0',
          level: 2,
          title: 'Phần có code',
          sourceRange: { from: 84, to: 101, startLine: 5, startColumn: 1, endLine: 5, endColumn: 18 },
          pageIndex: null,
        },
      ],
      links: [
        {
          id: 'link-0', kind: 'link', text: 'tài liệu', destination: 'https://example.com',
          targetKind: 'external', sourceRange: { from: 18, to: 49, startLine: 3, startColumn: 5, endLine: 3, endColumn: 36 },
        },
      ],
      images: [
        {
          id: 'image-0', kind: 'image', text: 'Sơ đồ', destination: 'assets/diagram.png',
          targetKind: 'relative-file', sourceRange: { from: 53, to: 81, startLine: 3, startColumn: 40, endLine: 3, endColumn: 68 },
        },
      ],
      diagnostics: [],
    });
  });

  it('ignores headings and references inside fenced code and classifies targets', () => {
    const source = [
      '```md',
      '# Not a chapter',
      '[fake](javascript:alert(1))',
      '```',
      '',
      '[internal](#chapter) [missing](missing.md) ![bad](data:image/png;base64,x)',
    ].join('\n');

    const index = createDocumentIndex(source, 2);
    expect(index.outline).toEqual([]);
    expect(index.links.map((item) => item.targetKind)).toEqual(['fragment', 'relative-file']);
    expect(index.images[0]?.targetKind).toBe('invalid');
    expect(index.diagnostics).toEqual([]);
  });

  it('does not treat headings nested in list or blockquote as top-level outline entries', () => {
    const source = '- # list heading\n> ## quote heading\n\n### Real heading\n';
    expect(createDocumentIndex(source).outline.map((item) => item.title)).toEqual(['Real heading']);
  });
});
