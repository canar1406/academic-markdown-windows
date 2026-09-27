import { describe, expect, it } from 'vitest';
import {
  insertLmxTemplate,
  insertLmxTemplateAtTrigger,
  updateLmxDirectiveMetadata,
} from '../src/semantic-blocks.js';

describe('semantic block editing', () => {
  it('inserts a registered block without hidden state', () => {
    expect(insertLmxTemplate('# Báo cáo\n', 'pagebreak')).toBe('# Báo cáo\n\n:::pagebreak\n:::\n');
  });

  it('updates visible directive metadata and preserves the body', () => {
    const source = ':::theorem {#thm-old title="Cũ"}\nNội dung tiếng Việt.\n:::\n';
    expect(updateLmxDirectiveMetadata(source, 0, {
      identifier: 'thm-new',
      attributes: { title: 'Mới' },
    })).toBe(':::theorem {#thm-new title="Mới"}\nNội dung tiếng Việt.\n:::\n');
  });

  it('replaces the active slash command without moving the block to the document end', () => {
    const source = '# Báo cáo\n\n/abstract\n\n## Chương một\n';

    expect(insertLmxTemplateAtTrigger(source, 'abstract', '/abstract')).toBe(
      '# Báo cáo\n\n:::front-section {kind="abstract" title="Tóm tắt" numbered=false}\n'
      + 'Nội dung tóm tắt.\n:::\n\n## Chương một\n',
    );
  });

  it('keeps a page break selected inside a front section at the document level', () => {
    const source = [
      ':::front-section {kind="acknowledgements" title="Lời cảm ơn" numbered=false}',
      'Nội dung lời cảm ơn.',
      '/pagebreak',
      ':::',
      '',
      '# Chương một',
      '',
    ].join('\n');

    expect(insertLmxTemplateAtTrigger(source, 'pagebreak', '/pagebreak')).toBe([
      ':::front-section {kind="acknowledgements" title="Lời cảm ơn" numbered=false}',
      'Nội dung lời cảm ơn.',
      ':::',
      '',
      ':::pagebreak',
      ':::',
      '',
      '# Chương một',
      '',
    ].join('\n'));
  });
});
